from unittest.mock import patch
from django.test import TestCase
from rest_framework.test import APIClient
from orders.models import OrdersOrder, OrdersOrderLine, OrdersPayment, OrdersStockHold, OrdersOutboxMessage, OrdersIdempotencyRecord, OrdersShippingAddress
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

    @patch('orders.saga._http_post_json')
    def test_local_transaction_failure_releases_orphaned_catalog_reservation(self, mock_post):
        """
        Regression: the catalog reservation is created (step 4) BEFORE the local
        Orders transaction (step 5). If the local write raises, the old code
        let the reservation leak and permanently double-locked stock. The saga
        must now issue a compensating release call.
        """
        release_calls = []

        def side_effect(url, payload, headers=None, timeout=3.0):
            if '/api/catalog/quote/' in url:
                return 200, {
                    'valid': True,
                    'subtotal': 899,
                    'items': [
                        {
                            'product_ref': 1,
                            'variant_ref': 101,
                            'sku': 'MD-HD-001-BLK-M',
                            'product_name': 'Drip Hoodie',
                            'variant_desc': 'M / Black',
                            'unit_price': 899,
                            'quantity': 1,
                            'line_total': 899,
                        }
                    ]
                }
            elif '/api/fulfillment/shipping-quote/' in url:
                return 200, {'fee': 85}
            elif '/api/catalog/reserve/' in url and 'commit' not in url and 'release' not in url:
                return 201, {'success': True, 'status': 'reserved'}
            elif '/api/catalog/reserve/' in url and 'release' in url:
                release_calls.append((url, payload))
                return 200, {'success': True, 'status': 'released'}
            return 200, {}

        mock_post.side_effect = side_effect

        initial_orders = OrdersOrder.objects.count()
        with self.assertRaises(Exception):
            with patch.object(OrdersShippingAddress, 'objects') as mock_objects:
                # Force the local transaction body to raise after the catalog
                # reservation has already been created in step 4.
                mock_objects.create.side_effect = RuntimeError('DB write failed')
                execute_cod_checkout_saga(
                    customer_id=1,
                    items=[{'variant_id': 101, 'quantity': 1}],
                    shipping_address_data={'name': 'Juan'},
                    idempotency_key='test-local-tx-failure',
                )

        # No order should be persisted because the local transaction rolled back.
        self.assertEqual(OrdersOrder.objects.count(), initial_orders)
        # The compensating release call must have been attempted.
        self.assertTrue(release_calls, 'Expected a compensating release call to catalog')


class SagaBoundaryTests(TestCase):
    def setUp(self):
        self.payload = dict(customer_id=1, items=[{'variant_id': 1, 'quantity': 1}],
                            shipping_address_data={'name': 'QA'}, idempotency_key='boundary-key')
        self.quote = {'subtotal': 100, 'items': [{'product_ref': 1, 'variant_ref': 1,
            'sku': 'QA', 'product_name': 'QA Product', 'unit_price': 100, 'quantity': 1, 'line_total': 100}]}

    @patch('orders.saga._http_post_json')
    def test_another_customer_cannot_replay_key(self, post):
        order = OrdersOrder.objects.create(order_no='QA-private', customer_ref=2, status='placed')
        OrdersIdempotencyRecord.objects.create(key='boundary-key', order=order)
        with self.assertRaises(SagaExecutionError) as error:
            execute_cod_checkout_saga(**self.payload)
        self.assertEqual(error.exception.status_code, 409)
        post.assert_not_called()

    @patch('orders.saga._http_post_json')
    def test_incomplete_or_cancelled_order_is_not_successful_replay(self, post):
        order = OrdersOrder.objects.create(order_no='QA-pending', customer_ref=1)
        OrdersIdempotencyRecord.objects.create(key='boundary-key', order=order)
        for state, code in [('pending_stock_confirmation', 503), ('cancelled', 409)]:
            with self.subTest(state=state):
                order.status = state
                order.save()
                with self.assertRaises(SagaExecutionError) as error:
                    execute_cod_checkout_saga(**self.payload)
                self.assertEqual(error.exception.status_code, code)
        post.assert_not_called()

    @patch('orders.saga._http_post_json')
    def test_shipping_quote_rejection_prevents_stock_and_order_writes(self, post):
        post.side_effect = [(200, self.quote), (400, {'error': 'Invalid delivery zone'})]
        with self.assertRaises(SagaExecutionError) as error:
            execute_cod_checkout_saga(**self.payload)
        self.assertEqual(error.exception.status_code, 400)
        self.assertEqual(post.call_count, 2)
        self.assertFalse(OrdersOrder.objects.exists())

    @patch('orders.saga._http_post_json')
    def test_shipping_quote_outage_does_not_invent_a_fee(self, post):
        post.side_effect = [(200, self.quote), SagaExecutionError('Unavailable', 503)]
        with self.assertRaises(SagaExecutionError) as error:
            execute_cod_checkout_saga(**self.payload)
        self.assertEqual(error.exception.status_code, 503)
        self.assertEqual(post.call_count, 2)
        self.assertFalse(OrdersOrder.objects.exists())

    @patch('orders.saga._http_post_json')
    def test_commit_rejection_cancels_without_success_response(self, post):
        post.side_effect = [(200, self.quote), (200, {'fee': 85}), (201, {}), (409, {}), (200, {})]
        with self.assertRaises(SagaExecutionError):
            execute_cod_checkout_saga(**self.payload)
        self.assertEqual(OrdersOrder.objects.get().status, 'cancelled')
        self.assertEqual(OrdersStockHold.objects.get().state, 'released')
        self.assertEqual(OrdersOutboxMessage.objects.get().state, 'cancelled')

    @patch('orders.saga._http_post_json')
    def test_uncertain_commit_preserves_pending_order_and_reports_503(self, post):
        post.side_effect = [(200, self.quote), (200, {'fee': 85}), (201, {}), SagaExecutionError('Timeout', 503)]
        with self.assertRaises(SagaExecutionError) as error:
            execute_cod_checkout_saga(**self.payload)
        self.assertEqual(error.exception.status_code, 503)
        self.assertEqual(OrdersOrder.objects.get().status, 'pending_stock_confirmation')
        self.assertEqual(OrdersStockHold.objects.get().state, 'active')
        self.assertEqual(post.call_count, 4)

    @patch('orders.saga._http_post_json')
    def test_invalid_shipping_fee_is_rejected_before_reservation(self, post):
        for fee in [None, -1, 85.5, True, '85']:
            with self.subTest(fee=fee):
                post.side_effect = [(200, self.quote), (200, {'fee': fee})]
                with self.assertRaises(SagaExecutionError) as error:
                    execute_cod_checkout_saga(**self.payload)
                self.assertEqual(error.exception.status_code, 502)
        self.assertFalse(OrdersOrder.objects.exists())

    @patch('orders.saga._http_post_json')
    def test_failed_compensation_retains_recovery_state(self, post):
        post.side_effect = [(200, self.quote), (200, {'fee': 85}), (201, {}), (409, {}), SagaExecutionError('Timeout', 503)]
        with self.assertRaises(SagaExecutionError):
            execute_cod_checkout_saga(**self.payload)
        self.assertEqual(OrdersOrder.objects.get().status, 'cancelled')
        self.assertEqual(OrdersStockHold.objects.get().state, 'release_pending')
        self.assertEqual(OrdersOutboxMessage.objects.get().state, 'cancelled')
