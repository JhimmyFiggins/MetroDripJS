from django.test import TestCase
from rest_framework.test import APIClient
from fulfillment.models import ShippingShippingZone, ShippingShipment, NotificationsNotification

class FulfillmentServiceTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.ncr = ShippingShippingZone.objects.create(name='NCR (Metro Manila)', fee=85, is_active=True)
        self.luzon = ShippingShippingZone.objects.create(name='North & South Luzon', fee=120, is_active=True)
        self.vismin = ShippingShippingZone.objects.create(name='Visayas & Mindanao (VisMin)', fee=150, is_active=True)

    def test_health_check(self):
        res = self.client.get('/health/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['service'], 'fulfillment')

    def test_shipping_quote_calculation(self):
        # NCR zone
        res_ncr = self.client.post('/api/fulfillment/shipping-quote/', {'zone_name': 'NCR (Metro Manila)'}, format='json')
        self.assertEqual(res_ncr.status_code, 200)
        self.assertEqual(res_ncr.data['fee'], 85)

        # Luzon zone
        res_luzon = self.client.post('/api/fulfillment/shipping-quote/', {'zone_name': 'Luzon'}, format='json')
        self.assertEqual(res_luzon.status_code, 200)
        self.assertEqual(res_luzon.data['fee'], 120)

        # VisMin zone
        res_vismin = self.client.post('/api/fulfillment/shipping-quote/', {'zone_name': 'VisMin'}, format='json')
        self.assertEqual(res_vismin.status_code, 200)
        self.assertEqual(res_vismin.data['fee'], 150)

    def test_shipping_zones_listing_and_patch(self):
        res = self.client.get('/shipping-zones/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 3)

        # PATCH requires internal token with merchant/admin role
        self.client.credentials(
            HTTP_X_INTERNAL_TOKEN='internal_service_mesh_secret_2026',
            HTTP_X_USER_ROLE='merchant'
        )
        patch_res = self.client.patch(f'/shipping-zones/{self.ncr.id}/', {'fee': 90}, format='json')
        self.assertEqual(patch_res.status_code, 200)
        self.ncr.refresh_from_db()
        self.assertEqual(self.ncr.fee, 90)

    def test_notifications_lifecycle(self):
        note = NotificationsNotification.objects.create(
            customer_ref=1,
            title='Order Placed',
            body='Order #MD-2026-00318 placed',
            category='order',
            is_read=False,
        )

        # Unauthenticated request rejected
        unauth_res = self.client.get('/notifications/')
        self.assertIn(unauth_res.status_code, (401, 403))

        # Authenticated customer 1 via internal token
        self.client.credentials(
            HTTP_X_INTERNAL_TOKEN='internal_service_mesh_secret_2026',
            HTTP_X_USER_ID='1'
        )
        res = self.client.get('/notifications/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)
        self.assertFalse(res.data[0]['is_read'])

        # Mark read
        read_res = self.client.post(f'/notifications/{note.id}/read/')
        self.assertEqual(read_res.status_code, 200)
        note.refresh_from_db()
        self.assertTrue(note.is_read)

    def test_order_placed_event_consumer_idempotency(self):
        payload = {
            'order_id': 999,
            'order_no': 'MD-2026-00999',
            'customer_ref': 1,
            'total': 1883,
        }

        # 1. First event consumption - requires internal token
        self.client.credentials(HTTP_X_INTERNAL_TOKEN='internal_service_mesh_secret_2026')
        res = self.client.post('/api/fulfillment/events/order-placed/', payload, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(ShippingShipment.objects.filter(order_ref=999).exists())
        self.assertTrue(NotificationsNotification.objects.filter(customer_ref=1, order_ref=999).exists())

        # 2. Replay event consumption must be idempotent (no duplicate rows)
        res_replay = self.client.post('/api/fulfillment/events/order-placed/', payload, format='json')
        self.assertEqual(res_replay.status_code, 200)
        self.assertEqual(ShippingShipment.objects.filter(order_ref=999).count(), 1)
        self.assertEqual(NotificationsNotification.objects.filter(customer_ref=1, order_ref=999).count(), 1)
