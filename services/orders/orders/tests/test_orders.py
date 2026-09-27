from django.test import TestCase
from rest_framework.test import APIClient
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
