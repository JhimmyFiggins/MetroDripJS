from datetime import timedelta

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.renderers import JSONRenderer

from .models import OrdersOrder, OrdersPayment
from .serializers import OrderSerializer
from fulfillment.models import ShippingShipment
from identity.authentication import CustomerAuthentication


def _resolve_customer_id(request):
    if hasattr(request, 'user') and request.user and getattr(request.user, 'is_authenticated', False) and hasattr(request.user, 'id'):
        return request.user.id

    cid = (
        request.headers.get('X-Customer-ID')
        or request.headers.get('x-customer-id')
        or request.META.get('HTTP_X_CUSTOMER_ID')
        or (request.query_params.get('customer_id') if hasattr(request, 'query_params') else None)
        or (request.GET.get('customer_id') if hasattr(request, 'GET') else None)
    )
    if cid is not None:
        try:
            return int(cid)
        except (ValueError, TypeError):
            pass
    return None

class CreateOrderAPIView(APIView):
    authentication_classes = [CustomerAuthentication]
    renderer_classes = [JSONRenderer]

    def _resolve_customer_id(self, request):
        if hasattr(request, 'user') and request.user and getattr(request.user, 'is_authenticated', False) and hasattr(request.user, 'id'):
            return request.user.id

        cid = (
            request.headers.get('X-Customer-ID')
            or request.headers.get('x-customer-id')
            or request.META.get('HTTP_X_CUSTOMER_ID')
            or (request.query_params.get('customer_id') if hasattr(request, 'query_params') else None)
            or (request.GET.get('customer_id') if hasattr(request, 'GET') else None)
            or (request.data.get('customer_id') if hasattr(request, 'data') and isinstance(request.data, dict) else None)
        )
        if cid is not None:
            try:
                return int(cid)
            except (ValueError, TypeError):
                pass
        return None

    def get(self, request):
        cid = self._resolve_customer_id(request)
        if cid is not None:
            orders = OrdersOrder.objects.filter(customer_id=cid).order_by('-created_at')
        else:
            if hasattr(request, 'user') and request.user and getattr(request.user, 'is_staff', False):
                orders = OrdersOrder.objects.all().order_by('-created_at')
            else:
                orders = OrdersOrder.objects.none()

        serializer = OrderSerializer(orders, many=True)
        return Response(serializer.data)

    def post(self, request):
        cid = self._resolve_customer_id(request)

        data = request.data.copy() if hasattr(request.data, 'copy') else dict(request.data)
        if cid is not None and ('customer_id' not in data or data['customer_id'] is None):
            data['customer_id'] = cid

        serializer = OrderSerializer(data=data)

        if serializer.is_valid():
            order = serializer.save(customer_id=cid)
            return Response(
                OrderSerializer(order).data,
                status=status.HTTP_201_CREATED
            )

        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST
        )


class OrderDetailAPIView(APIView):
    authentication_classes = [CustomerAuthentication]
    renderer_classes = [JSONRenderer]

    def get(self, request, order_id):
        order = OrdersOrder.objects.filter(id=order_id).first()
        if not order:
            return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = OrderSerializer(order)
        return Response(serializer.data, status=status.HTTP_200_OK)


TRACKING_STAGES = [
    ('placed', 'Order placed'),
    ('payment_confirmed', 'Payment confirmed'),
    ('packed', 'Packed'),
    ('shipped', 'Shipped'),
    ('out_for_delivery', 'Out for delivery'),
    ('delivered', 'Delivered'),
]

PAID_PAYMENT_STATUSES = {'paid', 'captured', 'completed', 'confirmed', 'success', 'succeeded'}

# Furthest timeline stage implied by an order status (index into TRACKING_STAGES).
ORDER_STATUS_STAGE = {
    'pending': 0,
    'paid': 1,
    'processing': 2,
    'packed': 2,
    'shipped': 3,
    'out_for_delivery': 4,
    'delivered': 5,
    'completed': 5,
    'cancelled': 0,
}

# Furthest timeline stage implied by a shipment status.
SHIPMENT_STATUS_STAGE = {
    'booked': 2,
    'picked_up': 3,
    'shipped': 3,
    'in_transit': 3,
    'out_for_delivery': 4,
    'delivered': 5,
}

# Derived fallback timestamps relative to order placement when no real
# timestamp is stored for a stage.
DERIVED_STAGE_OFFSETS = [
    timedelta(minutes=0),
    timedelta(minutes=1),
    timedelta(hours=2),
    timedelta(hours=6),
    timedelta(days=1),
    timedelta(days=2),
]


class OrderTrackingAPIView(APIView):
    authentication_classes = [CustomerAuthentication]
    renderer_classes = [JSONRenderer]

    def get(self, request, order_id):
        cid = _resolve_customer_id(request)
        order = OrdersOrder.objects.filter(id=order_id, customer_id=cid).first()
        if not order:
            return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

        placed_at = order.created_at
        order_number = 'MD-{}-{:05d}'.format(placed_at.year, order.id)

        items = []
        for line in order.lines.select_related('product', 'variant', 'variant__color'):
            variant_label = None
            variant = line.variant
            if variant:
                attributes = variant.attributes or {}
                color = attributes.get('color') or (variant.color.name if variant.color else None)
                parts = [
                    str(part).upper()
                    for part in (color, attributes.get('size'), attributes.get('fit'))
                    if part
                ]
                variant_label = ' · '.join(parts) or None
            items.append({
                'name': line.product.name if line.product else None,
                'variant_label': variant_label,
                'quantity': line.quantity,
            })

        shipment = ShippingShipment.objects.filter(order_ref=order.id).order_by('counter').first()

        payment = OrdersPayment.objects.filter(
            order=order,
            status__in=PAID_PAYMENT_STATUSES,
        ).order_by('created_at').first()

        furthest = ORDER_STATUS_STAGE.get((order.status or '').lower(), 0)
        if payment:
            furthest = max(furthest, 1)
        if shipment:
            furthest = max(furthest, SHIPMENT_STATUS_STAGE.get((shipment.status or '').lower(), 2))

        real_timestamps = {0: placed_at}
        if payment:
            real_timestamps[1] = payment.created_at
        if shipment and shipment.booked_at:
            real_timestamps[3] = shipment.booked_at

        events = []
        for index, (key, title) in enumerate(TRACKING_STAGES):
            if index <= furthest:
                timestamp = real_timestamps.get(index) or (placed_at + DERIVED_STAGE_OFFSETS[index])
                events.append({
                    'key': key,
                    'title': title,
                    'timestamp': timestamp.isoformat(),
                    'state': 'done',
                })
            else:
                events.append({
                    'key': key,
                    'title': title,
                    'timestamp': None,
                    'state': 'pending',
                })

        shipment_data = None
        if shipment:
            shipment_status = (shipment.status or '').lower()
            if shipment_status == 'delivered':
                eta_label = 'Delivered'
            elif shipment.booked_at:
                eta_date = shipment.booked_at + timedelta(days=2)
                eta_label = eta_date.strftime('%b %-d') + ', 2–5 PM'
            else:
                eta_label = None
            shipment_data = {
                'courier': 'J&T Express',
                'tracking_number': shipment.tracking_no,
                'eta_label': eta_label,
                'status': shipment.status,
            }

        return Response({
            'order': {
                'id': order.id,
                'number': order_number,
                'placed_at': placed_at.isoformat(),
                'status': order.status,
                'total': str(order.total),
                'items': items,
            },
            'shipment': shipment_data,
            'events': events,
        }, status=status.HTTP_200_OK)