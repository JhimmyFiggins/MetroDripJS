from django.test import TestCase
from rest_framework.test import APIClient
from orders.models import OrdersOrder, OrdersOrderLine, OrdersShippingAddress

class MerchantOrdersTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_empty_database_returns_honest_empty_list(self):
        OrdersOrder.objects.all().delete()
        res = self.client.get('/api/merchant/orders/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data, [])

    def test_merchant_orders_listing_and_patch_status(self):
        order = OrdersOrder.objects.create(
            order_no='MD-2026-00999',
            customer_ref=1,
            status='placed',
            subtotal=1000,
            shipping=85,
            total=1085,
            currency='PHP',
        )
        OrdersShippingAddress.objects.create(
            order=order,
            name='Maria Santos',
            address_line1='45 Session Road',
            city='Baguio',
            state='Benguet',
            phone='+63 920 123 4567',
        )

        # 1. List
        res = self.client.get('/api/merchant/orders/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]['customer'], 'Maria Santos')
        self.assertEqual(res.data[0]['raw_status'], 'placed')

        # 2. Detail
        det_res = self.client.get(f'/api/merchant/orders/{order.id}/')
        self.assertEqual(det_res.status_code, 200)
        self.assertEqual(det_res.data['shipping_address']['name'], 'Maria Santos')

        # 3. Patch Status
        patch_res = self.client.patch(f'/api/merchant/orders/{order.id}/', {'status': 'packed'}, format='json')
        self.assertEqual(patch_res.status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.status, 'packed')

    def test_merchant_orders_csv_export(self):
        OrdersOrder.objects.create(
            order_no='MD-2026-00888',
            customer_ref=1,
            status='placed',
            subtotal=500,
            shipping=85,
            total=585,
            currency='PHP',
        )
        res = self.client.get('/api/merchant/orders/export/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'text/csv')
        self.assertIn(b'MD-2026-00888', res.content)
