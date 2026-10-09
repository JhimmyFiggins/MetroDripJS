from django.conf import settings
from django.http import HttpResponse
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.renderers import JSONRenderer
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle

from .models import OrdersOrder, OrdersPayment
from fulfillment.models import ShippingShipment
from identity.authentication import CustomerTokenAuthentication
from .checkout import (
    CheckoutError,
    cancel_checkout,
    execute_checkout,
    expire_one_stale_checkout,
    reconcile_payment,
    serialize_checkout,
)
from .paymongo import PayMongoError
from .webhooks import WebhookError, process_paymongo_webhook, verify_paymongo_signature


class HealthAPIView(APIView):
    authentication_classes = []
    permission_classes = []
    renderer_classes = [JSONRenderer]

    def get(self, request):
        return Response({'status': 'ok'}, status=status.HTTP_200_OK)

class PaymentCapabilitiesAPIView(APIView):
    authentication_classes = []
    permission_classes = []
    renderer_classes = [JSONRenderer]

    def get(self, request):
        mode = getattr(settings, 'PAYMONGO_MODE', 'test').lower()
        has_secret = bool(getattr(settings, 'PAYMONGO_SECRET_KEY', ''))
        has_webhook = bool(getattr(settings, 'PAYMONGO_WEBHOOK_SECRET', ''))
        provider_ready = has_secret and has_webhook

        methods = [
            {
                'id': 'cod',
                'name': 'Cash on Delivery',
                'description': 'Pay in cash upon delivery to your doorstep.',
                'type': 'offline',
                'available': True,
                'min_amount': '1.00',
                'max_amount': '50000.00',
                'currencies': ['PHP'],
            },
            {
                'id': 'gcash',
                'name': 'GCash',
                'description': 'Instant e-wallet payment via PayMongo Hosted Checkout.',
                'type': 'hosted',
                'available': provider_ready,
                'min_amount': '100.00',
                'max_amount': '50000.00',
                'currencies': ['PHP'],
            },
            {
                'id': 'maya',
                'name': 'Maya',
                'description': 'Pay via Maya wallet or QR via PayMongo Hosted Checkout.',
                'type': 'hosted',
                'available': provider_ready,
                'min_amount': '100.00',
                'max_amount': '50000.00',
                'currencies': ['PHP'],
            },
            {
                'id': 'card',
                'name': 'Credit / Debit Card',
                'description': 'Visa, Mastercard, JCB via PayMongo Hosted Checkout.',
                'type': 'hosted',
                'available': provider_ready,
                'min_amount': '100.00',
                'max_amount': '100000.00',
                'currencies': ['PHP'],
            },
        ]

        return Response({
            'currency': 'PHP',
            'provider': 'paymongo',
            'mode': mode,
            'provider_ready': provider_ready,
            'methods': methods,
            'ttl_seconds': 1800,
        }, status=status.HTTP_200_OK)



class CreateOrderAPIView(APIView):
    authentication_classes = [CustomerTokenAuthentication]
    permission_classes = [IsAuthenticated]
    renderer_classes = [JSONRenderer]

    def get(self, request):
        orders = OrdersOrder.objects.filter(customer_id=request.user.id).order_by('-created_at')[:50]
        response = []
        for order in orders:
            payment = order.payments.order_by('-created_at').first()
            if payment:
                response.append(serialize_checkout(order, payment))
        return Response(response)

    def post(self, request):
        return Response(
            {
                'error': 'This order-creation route has been retired because it accepted client prices. Use /api/orders/checkout/.',
                'code': 'legacy_checkout_retired',
            },
            status=status.HTTP_410_GONE,
        )


class CheckoutAPIView(APIView):
    authentication_classes = [CustomerTokenAuthentication]
    permission_classes = [IsAuthenticated]
    renderer_classes = [JSONRenderer]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'checkout'

    def post(self, request):
        try:
            # One bounded cleanup per checkout avoids a paid worker/cron while
            # keeping the free-tier deployment from accumulating stale holds.
            expire_one_stale_checkout()
            order, payment, is_replay = execute_checkout(request.user, request.data)
        except CheckoutError as error:
            return Response(
                {'error': error.message, 'code': error.code},
                status=error.status_code,
            )
        return Response(
            serialize_checkout(order, payment, is_replay=is_replay),
            status=status.HTTP_200_OK if is_replay else status.HTTP_201_CREATED,
        )


class OrderDetailAPIView(APIView):
    authentication_classes = [CustomerTokenAuthentication]
    permission_classes = [IsAuthenticated]
    renderer_classes = [JSONRenderer]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'payment_status'

    def get(self, request, order_id):
        order = OrdersOrder.objects.filter(id=order_id, customer_id=request.user.id).first()
        if not order:
            return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

        payment = order.payments.order_by('-created_at').first()
        if not payment:
            return Response({'error': 'Order payment not found.'}, status=status.HTTP_409_CONFLICT)
        reconciliation = 'not_required'
        if payment.status in {'awaiting_payment', 'setup_failed'}:
            try:
                reconciliation = reconcile_payment(payment)
                order.refresh_from_db()
                payment.refresh_from_db()
            except PayMongoError:
                reconciliation = 'deferred'
        response = serialize_checkout(order, payment)
        response['reconciliation_status'] = reconciliation
        return Response(response, status=status.HTTP_200_OK)


class CancelCheckoutAPIView(APIView):
    authentication_classes = [CustomerTokenAuthentication]
    permission_classes = [IsAuthenticated]
    renderer_classes = [JSONRenderer]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'payment_status'

    def post(self, request, order_id):
        order = OrdersOrder.objects.filter(id=order_id, customer_id=request.user.id).first()
        if not order:
            return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            order, payment = cancel_checkout(order)
        except CheckoutError as error:
            return Response({'error': error.message, 'code': error.code}, status=error.status_code)
        except PayMongoError:
            return Response(
                {
                    'error': 'Cancellation could not be confirmed. The checkout remains pending.',
                    'code': 'provider_unavailable',
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(serialize_checkout(order, payment), status=status.HTTP_200_OK)


class PayMongoWebhookAPIView(APIView):
    authentication_classes = []
    permission_classes = []
    renderer_classes = [JSONRenderer]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'payment_webhook'

    def post(self, request):
        raw_body = request.body
        if len(raw_body) > settings.PAYMONGO_WEBHOOK_MAX_BYTES:
            return Response(
                {'error': 'Webhook payload is too large.', 'code': 'payload_too_large'},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )
        signature = (
            request.headers.get('Paymongo-Signature')
            or request.headers.get('X-Paymongo-Signature')
            or ''
        )
        try:
            verify_paymongo_signature(raw_body, signature)
            result = process_paymongo_webhook(raw_body)
        except WebhookError as error:
            return Response({'error': error.message, 'code': error.code}, status=error.status_code)
        return Response({'received': True, 'result': result}, status=status.HTTP_200_OK)


class PaymentReturnAPIView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        cancelled = request.query_params.get('result') == 'cancelled'
        heading = 'Checkout not completed' if cancelled else 'We are checking your payment'
        message = (
            'No charge confirmation was received from this redirect.'
            if cancelled
            else 'Return to MetroDrip. Your order will update after secure provider confirmation.'
        )
        response = HttpResponse(
            '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>MetroDrip payment</title><body><main><h1>{heading}</h1><p>{message}</p>'
            '<p>You can safely close this tab.</p></main></body></html>',
            content_type='text/html; charset=utf-8',
        )
        response['Cache-Control'] = 'no-store'
        response['Content-Security-Policy'] = "default-src 'none'; base-uri 'none'; frame-ancestors 'none'"
        return response


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

class OrderTrackingAPIView(APIView):
    authentication_classes = [CustomerTokenAuthentication]
    permission_classes = [IsAuthenticated]
    renderer_classes = [JSONRenderer]

    def get(self, request, order_id):
        order = OrdersOrder.objects.filter(id=order_id, customer_id=request.user.id).first()
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

        observed_timestamps = {0: (placed_at, 'orders_order.created_at')}
        if payment and payment.paid_at:
            observed_timestamps[1] = (payment.paid_at, 'orders_payment.paid_at')

        events = []
        for index, (key, title) in enumerate(TRACKING_STAGES):
            if index <= furthest:
                observed = observed_timestamps.get(index)
                events.append({
                    'key': key,
                    'title': title,
                    'timestamp': observed[0].isoformat() if observed else None,
                    'timestamp_source': observed[1] if observed else 'unavailable',
                    'state': 'done',
                })
            else:
                events.append({
                    'key': key,
                    'title': title,
                    'timestamp': None,
                    'timestamp_source': 'unavailable',
                    'state': 'pending',
                })

        shipment_data = None
        if shipment:
            shipment_data = {
                'courier': None,
                'courier_source': 'unavailable',
                'tracking_number': shipment.tracking_no,
                'eta_label': None,
                'eta_source': 'unavailable',
                'status': shipment.status,
                'booked_at': shipment.booked_at.isoformat() if shipment.booked_at else None,
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
