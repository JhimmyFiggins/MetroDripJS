from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from unittest.mock import patch
from orders.authentication import SimpleUser
from orders.models import OrdersOrder, OrdersOrderLine, OrdersShippingAddress

class OrdersEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.order = OrdersOrder.objects.create(
            order_no='MD-2026-00318',
            customer_ref=1,
            status='placed',
            subtotal=2547,
            shipping=85,
            total=2632,
            currency='PHP',
        )
        self.line = OrdersOrderLine.objects.create(
            order=self.order,
            product_ref=1,
            variant_ref=1,
            product_name_snapshot='Drip Zip-Up Hoodie',
            sku_snapshot='MD-HD-001-BLK-M',
            quantity=1,
            unit_price=1249,
            total_price=1249,
        )
        self.addr = OrdersShippingAddress.objects.create(
            order=self.order,
            name='Juan Dela Cruz',
            address_line1='Unit 12B Serendra',
            city='Taguig',
            state='Metro Manila',
            phone='+63 917 123 4567',
        )

    def test_health_check(self):
        res = self.client.get('/health/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['service'], 'orders')

    def test_customer_order_history_requires_auth(self):
        res = self.client.get('/orders/')
        self.assertEqual(res.status_code, 401)

    def test_customer_order_history_returns_owned_orders(self):
        # Authenticated customer 1
        self.client.credentials(HTTP_X_USER_ID='1', HTTP_X_INTERNAL_TOKEN='internal_service_mesh_secret_2026')
        res = self.client.get('/orders/')
        self.assertEqual(res.status_code, 200)
        self.assertGreaterEqual(len(res.data), 1)
        self.assertEqual(res.data[0]['order_no'], 'MD-2026-00318')

    def test_order_detail_ownership_enforcement(self):
        # Customer 2 cannot access Customer 1's order
        self.client.credentials(HTTP_X_USER_ID='2', HTTP_X_INTERNAL_TOKEN='internal_service_mesh_secret_2026')
        res = self.client.get(f'/orders/{self.order.id}/')
        self.assertEqual(res.status_code, 404)

        # Customer 1 can access Customer 1's order
        self.client.credentials(HTTP_X_USER_ID='1', HTTP_X_INTERNAL_TOKEN='internal_service_mesh_secret_2026')
        res = self.client.get(f'/orders/{self.order.id}/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['order_no'], 'MD-2026-00318')

    def test_order_tracking_timeline(self):
        self.client.credentials(HTTP_X_USER_ID='1', HTTP_X_INTERNAL_TOKEN='internal_service_mesh_secret_2026')
        res = self.client.get(f'/orders/{self.order.id}/tracking/')
        self.assertEqual(res.status_code, 200)
        self.assertIn('events', res.data)
        self.assertEqual(res.data['events'][0]['key'], 'placed')
        self.assertEqual(res.data['events'][0]['state'], 'done')

    # --- Regression tests for the orders service auth boundary defects ---

    def test_raw_x_user_id_without_internal_token_is_rejected(self):
        # A caller who only forges X-User-ID must not be treated as that customer.
        # Previously this returned another customer's full order history.
        self.client.credentials(HTTP_X_USER_ID='999')
        res = self.client.get('/orders/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_raw_x_customer_id_checkout_is_rejected(self):
        # Anonymous checkout via forged X-Customer-ID must not place an order.
        self.client.credentials(HTTP_X_CUSTOMER_ID='999')
        res = self.client.post('/api/orders/checkout/', {
            'items': [{'variant_id': 1, 'quantity': 1}],
            'delivery_zone': 'NCR (Metro Manila)',
            'shipping_address': {'name': 'Intruder', 'address_line1': 'x', 'city': 'c', 'phone': '+639000000000'},
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_anonymous_order_detail_does_not_leak_private_address(self):
        # Anonymous caller previously received 200 with the owner's shipping address.
        res = self.client.get(f'/orders/{self.order.id}/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_anonymous_order_tracking_is_rejected(self):
        res = self.client.get(f'/orders/{self.order.id}/tracking/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unrelated_customer_detail_is_404(self):
        self.client.credentials(HTTP_X_USER_ID='2', HTTP_X_INTERNAL_TOKEN='internal_service_mesh_secret_2026')
        res = self.client.get(f'/orders/{self.order.id}/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_merchant_role_can_view_any_order(self):
        # Merchant/admin staff may inspect any order regardless of customer_ref.
        self.client.credentials(
            HTTP_X_USER_ID='1',
            HTTP_X_USER_ROLE='merchant',
            HTTP_X_INTERNAL_TOKEN='internal_service_mesh_secret_2026',
        )
        res = self.client.get(f'/orders/{self.order.id}/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['shipping_address']['name'], 'Juan Dela Cruz')

    def test_empty_bearer_credentials_do_not_crash(self):
        self.client.credentials(HTTP_AUTHORIZATION='Bearer ')
        self.assertEqual(self.client.get('/orders/').status_code, 401)

    @patch('orders.views.execute_cod_checkout_saga')
    def test_malformed_checkout_payloads_fail_before_saga(self, saga):
        self.client.force_authenticate(SimpleUser(user_id=1, role='customer', is_authenticated=True))
        valid = {'items': [{'variant_id': 1, 'quantity': 1}]}
        for payload in [[], {'items': 'bad'}, {'items': [None]},
                        {'items': [{'quantity': 1}]}, {'items': [{'variant_id': True, 'quantity': 1}]},
                        {'items': [{'variant_id': 1, 'quantity': 1.5}]},
                        {'items': [{'variant_id': 1, 'quantity': -1}]},
                        dict(valid, shipping_address=['bad']), dict(valid, payment_method=1),
                        dict(valid, delivery_zone=1), dict(valid, idempotency_key={}),
                        dict(valid, idempotency_key='x' * 65)]:
            with self.subTest(payload=payload):
                response = self.client.post('/api/orders/checkout/', payload, format='json')
                self.assertEqual(response.status_code, 400)
                self.assertIn('error', response.data)
        saga.assert_not_called()
