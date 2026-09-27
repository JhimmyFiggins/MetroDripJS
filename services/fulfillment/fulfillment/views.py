from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.renderers import JSONRenderer

from .models import (
    ShippingShippingZone,
    ShippingShipment,
    NotificationsNotification,
    NotificationsDeviceToken,
)


class HealthCheckAPIView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        return Response({
            'status': 'ok',
            'service': 'fulfillment',
            'timestamp': timezone.now().isoformat(),
        })


class ShippingQuoteAPIView(APIView):
    """Authoritative shipping fee quote contract for Orders checkout saga."""
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        zone_name = request.data.get('zone_name') or ''
        address = request.data.get('address') or {}
        state = address.get('state', '')

        # Lookup by zone name or state matching
        zone = None
        if zone_name:
            zone = ShippingShippingZone.objects.filter(name__icontains=zone_name, is_active=True).first()

        if not zone and state:
            zone = ShippingShippingZone.objects.filter(name__icontains=state, is_active=True).first()

        if not zone:
            # Fallback based on zone keyword matching
            z_low = (zone_name + ' ' + state).lower()
            if 'luzon' in z_low:
                zone = ShippingShippingZone.objects.filter(name__icontains='Luzon', is_active=True).first()
            elif 'vis' in z_low or 'min' in z_low:
                zone = ShippingShippingZone.objects.filter(name__icontains='VisMin', is_active=True).first()
            else:
                zone = ShippingShippingZone.objects.filter(name__icontains='NCR', is_active=True).first()

        fee = zone.fee if zone else 85
        name = zone.name if zone else 'NCR (Metro Manila)'

        return Response({
            'fee': fee,
            'zone_name': name,
            'currency': 'PHP',
        })


class ShippingZonesAPIView(APIView):
    def get(self, request):
        zones = ShippingShippingZone.objects.all().order_by('id')
        data = [
            {
                'id': z.id,
                'name': z.name,
                'fee': z.fee,
                'formatted_fee': f"₱{z.fee:,}",
                'is_active': z.is_active,
            }
            for z in zones
        ]
        return Response(data)

    def patch(self, request, pk):
        zone = ShippingShippingZone.objects.filter(pk=pk).first()
        if not zone:
            return Response({'error': 'Shipping zone not found.'}, status=404)

        new_fee = request.data.get('fee')
        is_active = request.data.get('is_active')

        if new_fee is not None:
            zone.fee = int(new_fee)
        if is_active is not None:
            zone.is_active = bool(is_active)

        zone.save()
        return Response({
            'id': zone.id,
            'name': zone.name,
            'fee': zone.fee,
            'formatted_fee': f"₱{zone.fee:,}",
            'is_active': zone.is_active,
            'message': f"Updated {zone.name} shipping fee to ₱{zone.fee}.",
        })


class ShipmentsAPIView(APIView):
    def get(self, request):
        shipments = ShippingShipment.objects.all().order_by('-id')[:50]
        data = [
            {
                'id': s.id,
                'order_ref': s.order_ref,
                'courier': s.courier,
                'waybill_no': s.waybill_no,
                'tracking_no': s.tracking_no,
                'status': s.status,
                'booked_at': s.booked_at.isoformat() if s.booked_at else None,
            }
            for s in shipments
        ]
        return Response(data)

    def post(self, request):
        order_ref = request.data.get('order_ref')
        courier = request.data.get('courier', 'J&T Express')
        if not order_ref:
            return Response({'error': 'order_ref is required.'}, status=400)

        shipment, created = ShippingShipment.objects.get_or_create(
            order_ref=int(order_ref),
            defaults={
                'courier': courier,
                'waybill_no': f"WB-{order_ref}-{int(timezone.now().timestamp())}",
                'tracking_no': f"JT-PH-{order_ref:06d}",
                'status': 'booked',
                'booked_at': timezone.now(),
            }
        )
        return Response({
            'id': shipment.id,
            'order_ref': shipment.order_ref,
            'courier': shipment.courier,
            'waybill_no': shipment.waybill_no,
            'tracking_no': shipment.tracking_no,
            'status': shipment.status,
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class NotificationsAPIView(APIView):
    renderer_classes = [JSONRenderer]

    def get(self, request):
        customer_id = request.headers.get('X-User-ID') or request.headers.get('X-Customer-ID')
        if not customer_id or not customer_id.isdigit():
            return Response({'error': 'Authentication required.'}, status=401)

        notes = NotificationsNotification.objects.filter(customer_ref=int(customer_id)).order_by('-created_at')[:30]
        data = [
            {
                'id': n.id,
                'title': n.title,
                'body': n.body,
                'type': n.category,
                'category': n.category,
                'order_id': n.order_ref,
                'is_read': n.is_read,
                'created_at': n.created_at.isoformat() if n.created_at else None,
            }
            for n in notes
        ]
        return Response(data)


class NotificationMarkReadAPIView(APIView):
    def post(self, request, pk):
        customer_id = request.headers.get('X-User-ID') or request.headers.get('X-Customer-ID')
        qs = NotificationsNotification.objects.filter(pk=pk)
        if customer_id and customer_id.isdigit():
            qs = qs.filter(customer_ref=int(customer_id))

        note = qs.first()
        if not note:
            return Response({'error': 'Notification not found.'}, status=404)

        note.is_read = True
        note.save(update_fields=['is_read'])
        return Response({'success': True, 'id': note.id, 'is_read': True})


class NotificationMarkAllReadAPIView(APIView):
    def post(self, request):
        customer_id = request.headers.get('X-User-ID') or request.headers.get('X-Customer-ID')
        if not customer_id or not customer_id.isdigit():
            return Response({'error': 'Authentication required.'}, status=401)

        updated = NotificationsNotification.objects.filter(customer_ref=int(customer_id), is_read=False).update(is_read=True)
        return Response({'success': True, 'marked_count': updated})


class OrderPlacedEventConsumerAPIView(APIView):
    """
    Consumes OrderPlaced event from Orders transactional outbox.
    Idempotent: Replay does not duplicate shipments or notifications.
    """
    def post(self, request):
        payload = request.data.get('payload') or request.data
        order_id = payload.get('order_id')
        customer_ref = payload.get('customer_ref')
        order_no = payload.get('order_no', f"Order #{order_id}")

        if not order_id:
            return Response({'error': 'order_id is required in event payload.'}, status=400)

        # Idempotent shipment entry creation
        shipment, _ = ShippingShipment.objects.get_or_create(
            order_ref=order_id,
            defaults={
                'courier': 'J&T Express',
                'waybill_no': f"WB-{order_id}-{int(timezone.now().timestamp())}",
                'tracking_no': f"JT-PH-{order_id:06d}",
                'status': 'pending',
                'booked_at': timezone.now(),
            }
        )

        # Idempotent customer notification
        if customer_ref:
            existing_note = NotificationsNotification.objects.filter(
                customer_ref=customer_ref,
                order_ref=order_id,
                category='order'
            ).first()

            if not existing_note:
                NotificationsNotification.objects.create(
                    customer_ref=customer_ref,
                    title='Order Confirmed',
                    body=f"Your order {order_no} has been confirmed and is being prepared.",
                    category='order',
                    order_ref=order_id,
                    is_read=False,
                    created_at=timezone.now(),
                )

        return Response({
            'success': True,
            'order_id': order_id,
            'tracking_no': shipment.tracking_no,
        }, status=status.HTTP_200_OK)
