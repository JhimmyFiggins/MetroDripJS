"""
Security regression tests for fulfillment service.
These tests document and verify fixes for authentication/authorization defects.
"""
from django.test import TestCase
from unittest.mock import patch
import json
from rest_framework.test import APIClient
from fulfillment.models import ShippingShippingZone, NotificationsNotification, ShippingShipment


class FulfillmentAuthRegressionTests(TestCase):
    """Test authentication/authorization in fulfillment service."""

    def setUp(self):
        self.client = APIClient()
        self.ncr = ShippingShippingZone.objects.create(
            name='NCR (Metro Manila)', fee=85, is_active=True
        )
        self.notification = NotificationsNotification.objects.create(
            customer_ref=1, title='Test', body='Test body',
            category='order', is_read=False
        )

    def test_notifications_require_authentication(self):
        """
        REGRESSION: NotificationsAPIView only checked X-User-ID header without authentication.
        FIX: Should require proper authentication (internal token or bearer token).
        """
        # Without any auth - should be denied
        res = self.client.get('/notifications/')
        self.assertIn(res.status_code, (401, 403))

    def test_notifications_rejects_spoofed_x_user_id(self):
        """
        REGRESSION: X-User-ID header could be spoofed by any client.
        FIX: Should require internal token for header-based auth.
        """
        # Spoofed header without internal token
        self.client.credentials(HTTP_X_USER_ID='1')
        res = self.client.get('/notifications/')
        self.assertIn(res.status_code, (401, 403))

    def test_notifications_with_valid_internal_token(self):
        """Valid internal token with X-User-ID should work."""
        self.client.credentials(
            HTTP_X_INTERNAL_TOKEN='internal_service_mesh_secret_2026',
            HTTP_X_USER_ID='1'
        )
        res = self.client.get('/notifications/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)

    def test_notification_mark_read_requires_authentication(self):
        """Mark read endpoint should require authentication."""
        res = self.client.post(f'/notifications/{self.notification.id}/read/')
        self.assertIn(res.status_code, (401, 403))

    def test_notification_mark_all_read_requires_authentication(self):
        """Mark all read endpoint should require authentication."""
        res = self.client.post('/notifications/read-all/')
        self.assertIn(res.status_code, (401, 403))

    def test_shipments_require_authentication(self):
        """Shipments endpoints should require authentication."""
        res = self.client.get('/shipments/')
        self.assertIn(res.status_code, (401, 403))

        res = self.client.post('/shipments/', {'order_ref': 123}, format='json')
        self.assertIn(res.status_code, (401, 403))

    def test_shipping_zones_require_authentication_for_write(self):
        """Shipping zones GET may be public, but PATCH should require auth."""
        # GET might be public for frontend
        res = self.client.get('/shipping-zones/')
        # Could be 200 or 401 depending on design

        # PATCH should definitely require auth
        res = self.client.patch(f'/shipping-zones/{self.ncr.id}/', {'fee': 90}, format='json')
        self.assertIn(res.status_code, (401, 403))

    def test_order_placed_event_consumer_requires_internal_token(self):
        """
        REGRESSION: OrderPlacedEventConsumerAPIView had no authentication.
        FIX: Should require internal token (only orders service should call this).
        """
        payload = {'order_id': 999, 'customer_ref': 1, 'order_no': 'MD-999'}
        res = self.client.post('/api/fulfillment/events/order-placed/', payload, format='json')
        self.assertIn(res.status_code, (401, 403))

    def test_order_placed_event_consumer_with_internal_token(self):
        """Valid internal token should allow event consumption."""
        self.client.credentials(HTTP_X_INTERNAL_TOKEN='internal_service_mesh_secret_2026')
        payload = {'order_id': 888, 'customer_ref': 1, 'order_no': 'MD-888'}
        res = self.client.post('/api/fulfillment/events/order-placed/', payload, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data['success'])


class FulfillmentInternalTokenValidationTests(TestCase):
    """Test internal token validation in fulfillment service."""

    def setUp(self):
        self.client = APIClient()

    @patch('fulfillment.authentication.urllib.request.urlopen')
    def test_bearer_notification_access_uses_verified_owner(self, upstream):
        upstream.return_value.__enter__.return_value.read.return_value = json.dumps({
            'valid': True, 'customer': {'id': 1, 'role': 'customer'}}).encode()
        other = NotificationsNotification.objects.create(customer_ref=2, title='Private', body='Private', category='order')
        self.client.credentials(HTTP_AUTHORIZATION='Bearer fixture', HTTP_X_USER_ID='2')
        self.assertEqual(self.client.get('/notifications/').data, [])
        self.assertEqual(self.client.post(f'/notifications/{other.id}/read/').status_code, 404)
        other.refresh_from_db()
        self.assertFalse(other.is_read)

    @patch('fulfillment.authentication.urllib.request.urlopen', side_effect=OSError('unavailable'))
    def test_identity_outage_fails_closed(self, upstream):
        self.client.credentials(HTTP_AUTHORIZATION='Bearer fixture')
        self.assertEqual(self.client.get('/notifications/').status_code, 403)

    @patch('fulfillment.views.NotificationsNotification.objects.create', side_effect=RuntimeError('write failed'))
    def test_event_notification_failure_rolls_back_shipment(self, create):
        self.client.credentials(HTTP_X_INTERNAL_TOKEN='internal_service_mesh_secret_2026')
        with self.assertRaises(RuntimeError):
            self.client.post('/api/fulfillment/events/order-placed/', {'order_id': 7, 'customer_ref': 1}, format='json')
        self.assertFalse(ShippingShipment.objects.exists())

    def test_shipping_quote_public_endpoint(self):
        """
        Shipping quote might be intentionally public for checkout flow.
        This test documents current behavior.
        """
        res = self.client.post('/api/fulfillment/shipping-quote/', 
                               {'zone_name': 'NCR'}, format='json')
        # Currently public - document this design decision
        self.assertEqual(res.status_code, 200)
        self.assertIn('fee', res.data)
