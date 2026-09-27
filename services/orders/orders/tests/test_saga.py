from unittest.mock import patch
from django.test import TestCase
from rest_framework.test import APIClient
from orders.models import OrdersOrder, OrdersOrderLine, OrdersPayment, OrdersStockHold, OrdersOutboxMessage, OrdersIdempotencyRecord
from orders.saga import execute_cod_checkout_saga, SagaExecutionError

class CodCheckoutSagaTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    @patch('orders.saga._http_post_json')
    def test_successful_cod_checkout_saga(self, mock_post):
        # Mock responses:
        # 1. Quote response
        # 2. Shipping quote
        # 3. Reserve response
        # 4. Commit response
        def side_effect(url, payload, headers=None, timeout=3.0):
            if '/api/catalog/quote/' in url:
                return 200, {
                    'valid': True,
                    'subtotal': 1798,
                    'items': [
                        {
                            'product_ref': 1,
                            'variant_ref': 101,
                            'sku': 'MD-HD-001-BLK-M',
                            'product_name': 'Drip Hoodie',
                            'variant_desc': 'M / Black',
                            'unit_price': 899,
                            'quantity': 2,
                            'line_total': 1798,
                        }
                    ]
                }
            elif '/api/fulfillment/shipping-quote/' in url:
                return 200, {'fee': 85}
            elif '/api/catalog/reserve/' in url and 'commit' not in url and 'release' not in url:
                return 201, {'success': True, 'status': 'reserved'}
            elif 'commit' in url:
                return 200, {'success': True, 'status': 'committed'}
            return 200, {}

        mock_post.side_effect = side_effect

        order, is_replay = execute_cod_checkout_saga(
            customer_id=1,
            items=[{'variant_id': 101, 'quantity': 2}],
            shipping_address_data={
                'name': 'Juan Dela Cruz',
                'address_line1': '123 Ayala Ave',
                'city': 'Makati',
                'state': 'Metro Manila',
                'phone': '+63 917 123 4567',
            },
            delivery_zone='NCR (Metro Manila)',
            idempotency_key='test-key-uuid-1',
        )

        self.assertFalse(is_replay)
        self.assertEqual(order.status, 'placed')
        self.assertEqual(order.subtotal, 1798)
        self.assertEqual(order.shipping, 85)
        self.assertEqual(order.total, 1883)

        # Check line snapshots
        self.assertEqual(order.lines.count(), 1)
        line = order.lines.first()
        self.assertEqual(line.product_name_snapshot, 'Drip Hoodie')
        self.assertEqual(line.unit_price, 899)
        self.assertEqual(line.quantity, 2)

        # Check payment record is pending_collection (COD)
        payment = order.payments.first()
        self.assertIsNotNone(payment)
        self.assertEqual(payment.method, 'cod')
        self.assertEqual(payment.status, 'pending_collection')

        # Check outbox intent was persisted
        outbox = OrdersOutboxMessage.objects.filter(correlation_id='test-key-uuid-1').first()
        self.assertIsNotNone(outbox)
        self.assertEqual(outbox.topic, 'OrderPlaced')

        # Check stock hold record
        hold = OrdersStockHold.objects.filter(order=order).first()
        self.assertIsNotNone(hold)
        self.assertEqual(hold.state, 'committed')

    @patch('orders.saga._http_post_json')
    def test_idempotent_replay_returns_existing_order(self, mock_post):
        # Seed an existing order with idempotency key
        order = OrdersOrder.objects.create(
            order_no='MD-2026-00318',
            customer_ref=1,
            status='placed',
            subtotal=1000,
            shipping=85,
            total=1085,
        )
        OrdersIdempotencyRecord.objects.create(key='test-replay-key', order=order)

        # Calling saga with same idempotency key must not call external services
        ret_order, is_replay = execute_cod_checkout_saga(
            customer_id=1,
            items=[{'variant_id': 101, 'quantity': 1}],
            shipping_address_data={'name': 'Juan'},
            idempotency_key='test-replay-key'
        )

        self.assertTrue(is_replay)
        self.assertEqual(ret_order.id, order.id)
        mock_post.assert_not_called()

    @patch('orders.saga._http_post_json')
    def test_insufficient_stock_raises_saga_error_no_order_created(self, mock_post):
        def side_effect(url, payload, headers=None, timeout=3.0):
            if '/api/catalog/quote/' in url:
                return 409, {'error': 'Insufficient stock for SKU MD-HD-001.'}
            return 200, {}

        mock_post.side_effect = side_effect

        initial_count = OrdersOrder.objects.count()
        with self.assertRaises(SagaExecutionError):
            execute_cod_checkout_saga(
                customer_id=1,
                items=[{'variant_id': 101, 'quantity': 10}],
                shipping_address_data={'name': 'Juan'},
                idempotency_key='test-out-of-stock'
            )

        self.assertEqual(OrdersOrder.objects.count(), initial_count)
