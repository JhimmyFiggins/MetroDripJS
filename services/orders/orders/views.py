import csv
from datetime import timedelta
from django.http import HttpResponse
from django.utils import timezone
from django.db.models import Sum, Count
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.renderers import JSONRenderer

from .models import (
    OrdersOrder,
    OrdersOrderLine,
    OrdersShippingAddress,
    OrdersPayment,
    ReviewsReview,
)
from .saga import execute_cod_checkout_saga, SagaExecutionError
from .permissions import IsCustomerAuthenticated, IsMerchantOrAdmin


class HealthCheckAPIView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        return Response({
            'status': 'ok',
            'service': 'orders',
            'timestamp': timezone.now().isoformat(),
        })


class OrdersListCreateAPIView(APIView):
    renderer_classes = [JSONRenderer]

    def get(self, request):
        """List orders for the authenticated customer."""
        customer_id = getattr(request.user, 'id', None)
        if not customer_id:
            # Check internal or header fallback if authenticated
            cust_hdr = request.headers.get('X-User-ID')
            if cust_hdr and cust_hdr.isdigit():
                customer_id = int(cust_hdr)

        if not customer_id:
            return Response({'error': 'Authentication required.'}, status=status.HTTP_401_UNAUTHORIZED)

        orders = OrdersOrder.objects.filter(customer_ref=customer_id).order_by('-created_at')[:50]
        data = []
        for o in orders:
            lines = [
                {
                    'product_ref': l.product_ref,
                    'variant_ref': l.variant_ref,
                    'product_name': l.product_name_snapshot,
                    'variant_desc': l.variant_desc_snapshot,
                    'sku': l.sku_snapshot,
                    'quantity': l.quantity,
                    'unit_price': l.unit_price,
                    'total_price': l.total_price,
                }
                for l in o.lines.all()
            ]
            pm = o.payments.first()
            data.append({
                'id': o.id,
                'order_no': o.order_no,
                'status': o.status,
                'subtotal': o.subtotal,
                'shipping': o.shipping,
                'total': o.total,
                'currency': o.currency,
                'payment_method': pm.method.upper() if pm else 'COD',
                'payment_status': pm.status if pm else 'pending_collection',
                'created_at': o.created_at.isoformat() if o.created_at else None,
                'items': lines,
            })
        return Response(data)

    def post(self, request):
        """Execute COD Checkout Saga."""
        customer_id = getattr(request.user, 'id', None)
        if not customer_id:
            cust_hdr = request.headers.get('X-User-ID') or request.headers.get('X-Customer-ID')
            if cust_hdr and cust_hdr.isdigit():
                customer_id = int(cust_hdr)

        payload = request.data
        lines_input = payload.get('lines') or payload.get('items', [])
        
        # Support format from mobile client
        items = []
        for line in lines_input:
            v_id = line.get('variant') or line.get('variant_id') or line.get('variantId')
            qty = line.get('quantity', 1)
            if v_id:
                items.append({'variant_id': v_id, 'quantity': qty})

        if not items:
            return Response({'error': 'Order items are required.'}, status=status.HTTP_400_BAD_REQUEST)

        shipping_address = payload.get('shipping_address') or {}
        if not shipping_address and 'fullName' in payload:
            shipping_address = {
                'name': payload.get('fullName'),
                'address_line1': payload.get('address'),
                'phone': payload.get('mobile'),
            }

        delivery_zone = payload.get('delivery_zone') or 'NCR (Metro Manila)'
        idempotency_key = request.headers.get('X-Idempotency-Key') or payload.get('idempotency_key')

        payment_method = (payload.get('payment_method') or 'COD').lower()
        if payment_method not in ('cod', 'cash_on_delivery'):
            return Response({
                'error': f'Payment method {payment_method} is currently unavailable. Real provider integration pending; please use COD.'
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            order, is_replay = execute_cod_checkout_saga(
                customer_id=customer_id,
                items=items,
                shipping_address_data=shipping_address,
                delivery_zone=delivery_zone,
                idempotency_key=idempotency_key,
            )
        except SagaExecutionError as e:
            return Response({'error': e.message}, status=e.status_code)

        lines = [
            {
                'product_ref': l.product_ref,
                'variant_ref': l.variant_ref,
                'product_name': l.product_name_snapshot,
                'variant_desc': l.variant_desc_snapshot,
                'sku': l.sku_snapshot,
                'quantity': l.quantity,
                'unit_price': l.unit_price,
                'total_price': l.total_price,
            }
            for l in order.lines.all()
        ]

        return Response({
            'id': order.id,
            'order_no': order.order_no,
            'status': order.status,
            'subtotal': order.subtotal,
            'shipping': order.shipping,
            'total': order.total,
            'currency': order.currency,
            'is_replay': is_replay,
            'payment_status': 'pending_collection',
            'created_at': order.created_at.isoformat() if order.created_at else None,
            'items': lines,
        }, status=status.HTTP_200_OK if is_replay else status.HTTP_201_CREATED)


class OrderDetailAPIView(APIView):
    def get(self, request, pk):
        order = OrdersOrder.objects.filter(pk=pk).first()
        if not order:
            return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Enforce customer ownership check if customer caller
        customer_id = getattr(request.user, 'id', None)
        user_role = getattr(request.user, 'role', '')
        if user_role == 'customer' and customer_id and order.customer_ref != customer_id:
            return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

        addr = getattr(order, 'shipping_address', None)
        pm = order.payments.first()

        return Response({
            'id': order.id,
            'order_no': order.order_no,
            'status': order.status,
            'subtotal': order.subtotal,
            'shipping': order.shipping,
            'total': order.total,
            'currency': order.currency,
            'payment_method': pm.method.upper() if pm else 'COD',
            'payment_status': pm.status if pm else 'pending_collection',
            'created_at': order.created_at.isoformat() if order.created_at else None,
            'shipping_address': {
                'name': addr.name if addr else '',
                'address_line1': addr.address_line1 if addr else '',
                'city': addr.city if addr else '',
                'state': addr.state if addr else '',
                'phone': addr.phone if addr else '',
            } if addr else None,
            'items': [
                {
                    'product_ref': l.product_ref,
                    'variant_ref': l.variant_ref,
                    'product_name': l.product_name_snapshot,
                    'sku': l.sku_snapshot,
                    'quantity': l.quantity,
                    'unit_price': l.unit_price,
                    'total_price': l.total_price,
                }
                for l in order.lines.all()
            ]
        })


class OrderTrackingAPIView(APIView):
    def get(self, request, pk):
        order = OrdersOrder.objects.filter(pk=pk).first()
        if not order:
            return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

        customer_id = getattr(request.user, 'id', None)
        user_role = getattr(request.user, 'role', '')
        if user_role == 'customer' and customer_id and order.customer_ref != customer_id:
            return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

        stages = ['placed', 'payment_confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered']
        current_status = order.status.lower()
        if current_status in ('pending', 'pending_stock_confirmation', 'pending_collection'):
            current_status = 'placed'

        current_idx = stages.index(current_status) if current_status in stages else 0

        timeline = [
            {'key': s, 'title': s.replace('_', ' ').capitalize(), 'state': 'done' if i <= current_idx else 'pending'}
            for i, s in enumerate(stages)
        ]

        return Response({
            'order': {
                'id': order.id,
                'number': order.order_no,
                'status': order.status,
                'total': order.total,
                'placed_at': order.created_at.isoformat() if order.created_at else None,
            },
            'shipment': {
                'courier': 'J&T Express',
                'tracking_number': f"JT-PH-{order.id:06d}",
                'status': order.status,
                'eta_label': '2–3 business days',
            },
            'events': timeline,
        })


# ==============================================================================
# MERCHANT ORDERS & ANALYTICS VIEWS (TRANSFERRED FROM CATALOG)
# ZERO FAKE DEMO ORDERS - TRULY DATABASE BACKED
# ==============================================================================

class MerchantOrdersAPIView(APIView):
    def get(self, request, pk=None):
        if pk is not None:
            order = OrdersOrder.objects.filter(pk=pk).first()
            if not order:
                return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

            addr = getattr(order, 'shipping_address', None)
            pm = order.payments.first()

            return Response({
                'id': order.id,
                'order_no': order.order_no,
                'status': order.status.capitalize(),
                'raw_status': order.status.lower(),
                'subtotal': order.subtotal,
                'shipping': order.shipping,
                'tax': order.tax,
                'total': order.total,
                'payment_method': pm.method.upper() if pm else 'COD',
                'created_at': order.created_at.strftime('%Y-%m-%d %H:%M') if order.created_at else None,
                'shipping_address': {
                    'name': addr.name if addr else '',
                    'line1': addr.address_line1 if addr else '',
                    'city': addr.city if addr else '',
                    'state': addr.state if addr else '',
                    'postal_code': addr.postal_code if addr else '',
                    'phone': addr.phone if addr else '',
                } if addr else None,
                'lines': [
                    {
                        'product_name': l.product_name_snapshot,
                        'variant_desc': l.variant_desc_snapshot,
                        'quantity': l.quantity,
                        'unit_price': l.unit_price,
                        'total_price': l.total_price,
                    }
                    for l in order.lines.all()
                ],
            })

        # List all real orders
        orders_qs = OrdersOrder.objects.all().prefetch_related('lines', 'payments').order_by('-created_at')[:50]
        data = []
        for o in orders_qs:
            pm = o.payments.first()
            pay_method = pm.method.upper() if pm else 'COD'
            pay_key = pm.method.lower() if pm else 'cod'
            is_cod = pay_key == 'cod'
            
            addr = getattr(o, 'shipping_address', None)
            cust_name = addr.name if addr else f"Customer #{o.customer_ref}"
            addr_text = f"{addr.address_line1}\n{addr.city}, {addr.state} {addr.postal_code}".strip() if addr else "Standard delivery address"

            f_key = o.status.lower()
            if f_key in ('pending', 'pending_stock_confirmation', 'placed'):
                fulfillment_label = 'Unfulfilled'
                f_key = 'unfulfilled'
            elif f_key == 'packed':
                fulfillment_label = 'Packed'
            elif f_key == 'shipped':
                fulfillment_label = 'Shipped'
            elif f_key == 'delivered':
                fulfillment_label = 'Delivered'
            elif f_key == 'cancelled':
                fulfillment_label = 'Cancelled'
            else:
                fulfillment_label = o.status.capitalize()

            pay_label = f"Pending · {pay_method}" if (is_cod or o.status == 'placed') else f"Paid · {pay_method}"

            items = [
                {
                    'name': f"{l.product_name_snapshot} · {l.variant_desc_snapshot}".strip(' ·'),
                    'price': f"{l.quantity} × ₱{l.unit_price:,}",
                }
                for l in o.lines.all()
            ]

            activity = [
                {'time': o.created_at.strftime('%H:%M') if o.created_at else '09:00', 'desc': 'Order placed'},
            ]
            if o.status in ('packed', 'shipped', 'delivered'):
                activity.insert(0, {'time': o.updated_at.strftime('%H:%M') if o.updated_at else '09:30', 'desc': f'Marked as {o.status}'})

            data.append({
                'id': o.order_no,
                'order_id': o.id,
                'order_no': o.order_no,
                'customer': cust_name,
                'total': f"₱{o.total:,}",
                'raw_total': o.total,
                'subtotal': f"₱{o.subtotal:,}",
                'shipping': f"₱{o.shipping:,} shipping" if o.shipping else 'Free shipping',
                'payment': pay_label,
                'paymentKey': pay_key,
                'pay': pay_method,
                'fulfillment': fulfillment_label,
                'fulfillmentKey': f_key,
                'placed': o.created_at.strftime('%Y-%m-%d %H:%M') if o.created_at else '',
                'status': o.status.capitalize(),
                'raw_status': o.status.lower(),
                'address': addr_text,
                'speed': 'Standard delivery · 2–3 business days',
                'items': items,
                'activity': activity,
            })
        # Honest response: empty list if no orders
        return Response(data)

    def patch(self, request, pk=None):
        new_status = (request.data.get('status') or request.data.get('fulfillment_status') or '').strip().lower()
        if not new_status:
            return Response({'error': 'Status is required.'}, status=status.HTTP_400_BAD_REQUEST)

        order = None
        if isinstance(pk, int) or (isinstance(pk, str) and pk.isdigit()):
            order = OrdersOrder.objects.filter(pk=int(pk)).first()
        if not order and pk:
            order = OrdersOrder.objects.filter(order_no=str(pk)).first()

        if not order:
            return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

        order.status = new_status
        order.updated_at = timezone.now()
        order.save(update_fields=['status', 'updated_at'])

        return Response({
            'id': order.order_no,
            'order_id': order.id,
            'order_no': order.order_no,
            'status': new_status.capitalize(),
            'raw_status': new_status,
            'message': f"Order {order.order_no} status updated to {new_status.capitalize()}.",
        })


class MerchantOrdersExportAPIView(APIView):
    def get(self, request):
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="metrodrip_orders_{timezone.now().strftime("%Y%m%d")}.csv"'
        writer = csv.writer(response)
        writer.writerow(['Order No', 'Customer', 'Status', 'Subtotal', 'Shipping', 'Total', 'Payment', 'Date'])

        for o in OrdersOrder.objects.all().order_by('-created_at'):
            addr = getattr(o, 'shipping_address', None)
            pm = o.payments.first()
            writer.writerow([
                o.order_no,
                addr.name if addr else '',
                o.status,
                o.subtotal,
                o.shipping,
                o.total,
                pm.method if pm else 'COD',
                o.created_at.strftime('%Y-%m-%d %H:%M') if o.created_at else '',
            ])
        return response


class MerchantAnalyticsAPIView(APIView):
    def get(self, request):
        now = timezone.now()
        start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)

        orders_today_qs = OrdersOrder.objects.filter(created_at__gte=start_of_day)
        orders_count = orders_today_qs.count()
        paid_orders_count = orders_today_qs.filter(status__in=['paid', 'placed', 'packed', 'shipped', 'delivered']).count()
        pending_orders_count = orders_today_qs.filter(status__in=['pending', 'pending_stock_confirmation', 'pending_collection']).count()

        sales_sum = orders_today_qs.filter(status__in=['paid', 'placed', 'packed', 'shipped', 'delivered']).aggregate(t=Sum('total'))['t'] or 0

        # Recent real orders
        recent_orders = []
        for o in OrdersOrder.objects.all().order_by('-created_at')[:6]:
            pm = o.payments.first()
            addr = getattr(o, 'shipping_address', None)
            recent_orders.append({
                'order_no': o.order_no,
                'customer': addr.name if addr else f"Customer #{o.customer_ref}",
                'total': f"₱{o.total:,}",
                'pay': pm.method.upper() if pm else 'COD',
                'status': o.status.capitalize(),
            })

        to_ship_count = OrdersOrder.objects.filter(status__in=['placed', 'packed']).count()

        return Response({
            'metrics': {
                'today_sales': f"₱{sales_sum:,}",
                'today_sales_raw': sales_sum,
                'orders_today': orders_count,
                'orders_today_breakdown': f"{paid_orders_count} placed · {pending_orders_count} pending",
                'to_ship': to_ship_count,
            },
            'recent_orders': recent_orders,
        })


class ReviewsAPIView(APIView):
    def get(self, request):
        product_ref = request.query_params.get('product')
        qs = ReviewsReview.objects.filter(status='approved')
        if product_ref and product_ref.isdigit():
            qs = qs.filter(product_ref=int(product_ref))
        return Response([
            {
                'id': r.id,
                'customer_name': r.customer_name,
                'product_name': r.product_name,
                'product_ref': r.product_ref,
                'rating': r.rating,
                'body': r.body,
                'merchant_reply': r.merchant_reply,
                'created_at': r.created_at.isoformat() if r.created_at else None,
            }
            for r in qs[:50]
        ])

    def post(self, request):
        customer_id = getattr(request.user, 'id', None)
        product_ref = request.data.get('product_ref')
        rating = request.data.get('rating', 5)
        body = request.data.get('body', '').strip()
        customer_name = request.data.get('customer_name', 'Verified Buyer')

        if not product_ref:
            return Response({'error': 'product_ref is required.'}, status=400)

        review = ReviewsReview.objects.create(
            customer_name=customer_name,
            product_name=request.data.get('product_name', 'Metro Apparel'),
            customer_ref=customer_id,
            product_ref=int(product_ref),
            rating=int(rating),
            body=body,
            status='approved',
        )
        return Response({'id': review.id, 'status': review.status}, status=201)
