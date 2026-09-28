import hashlib
import hmac
import json
import time
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.db import connection
from django.conf import settings
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from catalog.models import (
    CatalogCategory,
    CatalogColor,
    CatalogProduct,
    CatalogProductVariant,
    InventoryReservation,
    InventoryStockEntry,
    InventoryStockMovement,
)
from fulfillment.models import ShippingShipment, ShippingShippingZone
from identity.models import AccountsCustomer, CustomerAccessToken

from .checkout import apply_verified_payment, execute_checkout, reconcile_payment
from .models import OrdersOrder, OrdersPayment, PaymentWebhookEvent
from .paymongo import PayMongoClient, PayMongoError


class FakePayMongoClient:
    def __init__(self):
        self.created_methods = []
        self.expired = []
        self.session_data = None

    def create_checkout_session(self, order, payment, line_items, shipping_address, customer_email):
        self.created_methods.append(payment.method)
        return f'cs_order_{order.id}', f'https://checkout.paymongo.com/cs_order_{order.id}#test'

    def retrieve_checkout_session(self, provider_ref):
        return self.session_data or {
            'data': {
                'id': provider_ref,
                'attributes': {'status': 'active', 'payments': []},
            },
        }

    def expire_checkout_session(self, provider_ref):
        self.expired.append(provider_ref)
        return {'data': {'id': provider_ref, 'attributes': {'status': 'expired'}}}


class RecordingPayMongoClient(PayMongoClient):
    def __init__(self, checkout_url='https://checkout.paymongo.com/cs_recorded#test'):
        super().__init__(secret_key='sk_test_example')
        self.request = None
        self.checkout_url = checkout_url

    def _request(self, method, path, payload=None, idempotency_key=None):
        self.request = (method, path, payload, idempotency_key)
        return {
            'data': {
                'id': 'cs_recorded',
                'attributes': {'checkout_url': self.checkout_url},
            },
        }


@override_settings(
    PAYMONGO_SECRET_KEY='sk_test_example',
    PAYMONGO_WEBHOOK_SECRET='whsec_test_example',
    PAYMONGO_MODE='test',
)
class HostedCheckoutAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.now = timezone.now()
        self.customer = AccountsCustomer(
            email='buyer@example.com',
            name='Metro Buyer',
            phone='09171234567',
            addresses={},
            is_active=True,
            is_staff=False,
            is_superuser=False,
            role='customer',
            date_joined=self.now,
        )
        self.customer.set_password('correct horse battery staple')
        self.customer.save()
        _, raw_token = CustomerAccessToken.issue(self.customer)
        self.auth = {'HTTP_AUTHORIZATION': f'Bearer {raw_token}'}

        category = CatalogCategory.objects.create(
            name='Test Payment Category',
            slug='test-payment-category',
            description='Checkout test category',
            is_active=True,
            created_at=self.now,
            updated_at=self.now,
        )
        product = CatalogProduct.objects.create(
            sku='PAY-TEST-001',
            name='Provider-safe hoodie',
            description='Test product',
            category=category,
            base_price=Decimal('2499.00'),
            currency='PHP',
            is_active=True,
            is_featured=False,
            created_at=self.now,
            updated_at=self.now,
        )
        color = CatalogColor.objects.create(
            name='Payment Test Black',
            hex_code='#101011',
            created_at=self.now,
            updated_at=self.now,
        )
        self.variant = CatalogProductVariant.objects.create(
            product=product,
            color=color,
            sku='PAY-TEST-001-BLK-L',
            attributes={'size': 'L'},
            price_adjustment=Decimal('1.50'),
            is_active=True,
            created_at=self.now,
            updated_at=self.now,
        )
        self.stock = InventoryStockEntry.objects.create(
            product=product,
            variant=self.variant,
            warehouse_id=77,
            quantity=5,
            reserved_quantity=0,
            last_counted_at=self.now,
            created_at=self.now,
            updated_at=self.now,
        )
        ShippingShippingZone.objects.update_or_create(
            name='NCR (Metro Manila)',
            defaults={'fee': 85, 'is_active': True},
        )

    def payload(self, method='cod', key='checkout-attempt-001'):
        return {
            'items': [{'variant_id': self.variant.id, 'quantity': 2}],
            'delivery_zone': 'Metro Manila (NCR)',
            'payment_method': method,
            'idempotency_key': key,
            'shipping_address': {
                'name': 'Metro Buyer',
                'address_line1': '21 Maginhawa Street',
                'address_line2': '',
                'city': 'Quezon City',
                'state': 'Metro Manila (NCR)',
                'postal_code': '1101',
                'country': 'PH',
                'phone': '09171234567',
            },
        }

    def test_health_is_public_small_and_dependency_free(self):
        client = APIClient()
        with CaptureQueriesContext(connection) as queries:
            get_response = client.get('/health/')
            head_response = client.head('/health/')
        self.assertEqual(get_response.status_code, 200)
        self.assertEqual(get_response.data, {'status': 'ok'})
        self.assertEqual(head_response.status_code, 200)
        self.assertEqual(len(queries), 0)

    def test_local_database_connections_are_bounded_and_health_checked(self):
        database = settings.DATABASES['default']
        self.assertEqual(database['CONN_MAX_AGE'], 0)
        self.assertTrue(database['CONN_HEALTH_CHECKS'])

    def test_checkout_requires_an_opaque_bearer_token(self):
        response = self.client.post(
            '/api/orders/checkout/',
            self.payload(),
            HTTP_AUTHORIZATION=f'Bearer {self.customer.id}',
            format='json',
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(OrdersOrder.objects.count(), 0)

    def test_forged_customer_ids_fail_across_customer_data_routes(self):
        attacker = APIClient()
        attempts = [
            attacker.get('/profile/', HTTP_X_CUSTOMER_ID=str(self.customer.id)),
            attacker.get(f'/wishlist/?customer_id={self.customer.id}'),
            attacker.get(f'/notifications/?customer_id={self.customer.id}'),
            attacker.post(
                f'/products/{self.variant.product_id}/reviews/',
                {'rating': 5, 'comment': 'Forged', 'customer_id': self.customer.id},
                HTTP_X_CUSTOMER_ID=str(self.customer.id),
                format='json',
            ),
        ]
        self.assertTrue(all(response.status_code == 401 for response in attempts))

    def test_cod_uses_server_prices_shipping_and_reserves_stock(self):
        payload = self.payload()
        payload['subtotal'] = '0.01'
        payload['total'] = '0.01'
        response = self.client.post('/api/orders/checkout/', payload, format='json', **self.auth)

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['payment_method'], 'cod')
        self.assertEqual(response.data['payment_status'], 'pending_collection')
        self.assertIsNone(response.data['payment_action'])
        self.assertEqual(Decimal(response.data['subtotal']), Decimal('5001.00'))
        self.assertEqual(Decimal(response.data['shipping']), Decimal('85.00'))
        self.assertEqual(Decimal(response.data['total']), Decimal('5086.00'))
        self.assertEqual(response.data['shipping_address']['name'], 'Metro Buyer')
        self.assertEqual(response.data['shipping_address']['city'], 'Quezon City')
        self.assertEqual(response.data['shipping_address']['country'], 'PH')
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 3)
        self.assertEqual(self.stock.reserved_quantity, 0)
        self.assertTrue(InventoryReservation.objects.filter(order_id=response.data['id'], status='committed').exists())
        self.assertEqual(InventoryStockMovement.objects.filter(ref_order_ref=response.data['id']).count(), 1)

    def test_online_checkout_returns_hosted_action_and_replays_idempotently(self):
        provider = FakePayMongoClient()
        with patch('orders.checkout.PayMongoClient', return_value=provider):
            first = self.client.post('/api/orders/checkout/', self.payload('gcash'), format='json', **self.auth)
            replay = self.client.post('/api/orders/checkout/', self.payload('gcash'), format='json', **self.auth)

        self.assertEqual(first.status_code, 201)
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(first.data['id'], replay.data['id'])
        self.assertEqual(first.data['payment_status'], 'awaiting_payment')
        self.assertEqual(first.data['payment_action']['type'], 'redirect')
        self.assertTrue(first.data['payment_action']['url'].startswith('https://checkout.paymongo.com/'))
        self.assertEqual(provider.created_methods, ['gcash'])
        self.assertEqual(OrdersOrder.objects.filter(customer_id=self.customer.id).count(), 1)

    def test_maya_maps_to_paymongo_paymaya_without_wallet_credentials(self):
        order = self.client.post('/api/orders/checkout/', self.payload(), format='json', **self.auth)
        order_model = OrdersOrder.objects.get(pk=order.data['id'])
        payment = order_model.payments.get()
        payment.method = 'maya'
        client = RecordingPayMongoClient()
        client.create_checkout_session(
            order_model,
            payment,
            [{'name': 'Test', 'amount': 10000, 'currency': 'PHP', 'quantity': 1}],
            order_model.shipping_address,
            self.customer.email,
        )
        _, path, provider_payload, idempotency_key = client.request
        attributes = provider_payload['data']['attributes']
        self.assertEqual(path, '/v2/checkout_sessions')
        self.assertEqual(attributes['payment_method_types'], ['paymaya'])
        self.assertNotIn('card_number', json.dumps(provider_payload))
        self.assertEqual(
            idempotency_key,
            'metrodrip-' + hashlib.sha256(b'checkout-attempt-001').hexdigest(),
        )

    def test_provider_checkout_url_must_use_the_exact_paymongo_https_origin(self):
        order = self.client.post('/api/orders/checkout/', self.payload(), format='json', **self.auth)
        order_model = OrdersOrder.objects.get(pk=order.data['id'])
        payment = order_model.payments.get()
        payment.method = 'card'
        invalid_urls = (
            'http://checkout.paymongo.com/cs_recorded',
            'https://attacker@checkout.paymongo.com/cs_recorded',
            'https://checkout.paymongo.com.evil.example/cs_recorded',
            'https://checkout.paymongo.com:8443/cs_recorded',
        )

        for checkout_url in invalid_urls:
            with self.subTest(checkout_url=checkout_url):
                client = RecordingPayMongoClient(checkout_url=checkout_url)
                with self.assertRaises(PayMongoError):
                    client.create_checkout_session(
                        order_model,
                        payment,
                        [{'name': 'Test', 'amount': 10000, 'currency': 'PHP', 'quantity': 1}],
                        order_model.shipping_address,
                        self.customer.email,
                    )

    def test_idempotency_key_rejects_changed_checkout(self):
        first = self.client.post('/api/orders/checkout/', self.payload(), format='json', **self.auth)
        changed = self.payload(method='cod')
        changed['items'][0]['quantity'] = 1
        conflict = self.client.post('/api/orders/checkout/', changed, format='json', **self.auth)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(conflict.status_code, 409)
        self.assertEqual(conflict.data['code'], 'idempotency_conflict')

    def test_raw_card_data_is_rejected_before_order_creation(self):
        payload = self.payload('card')
        payload['card'] = {'card_number': '4343434343434345', 'cvv': '123'}
        response = self.client.post('/api/orders/checkout/', payload, format='json', **self.auth)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['code'], 'raw_payment_credentials_rejected')
        self.assertEqual(OrdersOrder.objects.count(), 0)

        for credentials in (
            {'cardNumber': '4343434343434345'},
            {'security_code': '123'},
            {'wallet-pin': '1234'},
        ):
            payload = self.payload('card', key=f"sensitive-{next(iter(credentials))}")
            payload['provider_details'] = credentials
            rejected = self.client.post('/api/orders/checkout/', payload, format='json', **self.auth)
            self.assertEqual(rejected.status_code, 400)
            self.assertEqual(rejected.data['code'], 'raw_payment_credentials_rejected')

    def test_online_retry_with_recreated_draft_reuses_matching_active_checkout(self):
        provider = FakePayMongoClient()
        with patch('orders.checkout.PayMongoClient', return_value=provider):
            first = self.client.post(
                '/api/orders/checkout/',
                self.payload('gcash', 'process-before-restart'),
                format='json',
                **self.auth,
            )
            recreated = self.client.post(
                '/api/orders/checkout/',
                self.payload('gcash', 'process-after-restart'),
                format='json',
                **self.auth,
            )

        self.assertEqual(first.status_code, 201)
        self.assertEqual(recreated.status_code, 200)
        self.assertEqual(recreated.data['id'], first.data['id'])
        self.assertTrue(recreated.data['is_replay'])
        self.assertEqual(OrdersOrder.objects.count(), 1)

    def test_online_checkout_limits_active_holds_per_customer_and_variant(self):
        provider = FakePayMongoClient()
        with patch('orders.checkout.PayMongoClient', return_value=provider):
            for attempt in range(3):
                payload = self.payload('card', f'active-attempt-{attempt}')
                payload['items'][0]['quantity'] = 1
                payload['shipping_address']['address_line1'] = f'{attempt + 1} Different Street'
                response = self.client.post('/api/orders/checkout/', payload, format='json', **self.auth)
                self.assertEqual(response.status_code, 201)

            fourth = self.payload('card', 'active-attempt-4')
            fourth['items'][0]['quantity'] = 1
            fourth['shipping_address']['address_line1'] = '4 Different Street'
            blocked = self.client.post('/api/orders/checkout/', fourth, format='json', **self.auth)

        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked.data['code'], 'active_checkout_limit')

        too_many = self.payload('gcash', 'quantity-limit')
        too_many['items'][0]['quantity'] = 6
        quantity_blocked = self.client.post('/api/orders/checkout/', too_many, format='json', **self.auth)
        self.assertEqual(quantity_blocked.status_code, 400)
        self.assertEqual(quantity_blocked.data['code'], 'item_quantity_limit')

    def test_online_checkout_caps_reserved_quantity_across_active_attempts(self):
        provider = FakePayMongoClient()
        first_payload = self.payload('maya', 'reserve-cap-1')
        first_payload['items'][0]['quantity'] = 4
        second_payload = self.payload('maya', 'reserve-cap-2')
        second_payload['items'][0]['quantity'] = 2
        second_payload['shipping_address']['address_line1'] = 'A different address'

        with patch('orders.checkout.PayMongoClient', return_value=provider):
            first = self.client.post('/api/orders/checkout/', first_payload, format='json', **self.auth)
            second = self.client.post('/api/orders/checkout/', second_payload, format='json', **self.auth)

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 409)
        self.assertEqual(second.data['code'], 'active_reservation_limit')

    def _online_order(self, method='maya', key='checkout-attempt-online'):
        provider = FakePayMongoClient()
        with patch('orders.checkout.PayMongoClient', return_value=provider):
            response = self.client.post('/api/orders/checkout/', self.payload(method, key), format='json', **self.auth)
        self.assertEqual(response.status_code, 201)
        return OrdersOrder.objects.get(pk=response.data['id']), provider

    def _paid_event(self, order, amount=None):
        payment = order.payments.get()
        amount = amount if amount is not None else int(payment.amount * 100)
        return {
            'data': {
                'id': f'evt_paid_{order.id}',
                'type': 'event',
                'attributes': {
                    'type': 'checkout_session.payment.paid',
                    'livemode': False,
                    'data': {
                        'id': payment.provider_ref,
                        'type': 'checkout_session',
                        'attributes': {
                            'reference_number': f'MD-{order.created_at.year}-{order.id:05d}',
                            'metadata': {
                                'order_id': str(order.id),
                                'checkout_fingerprint': order.checkout_fingerprint,
                            },
                            'payments': [{
                                'id': f'pay_order_{order.id}',
                                'attributes': {
                                    'amount': amount,
                                    'currency': 'PHP',
                                    'status': 'paid',
                                },
                            }],
                        },
                    },
                },
            },
        }

    def _paid_session(self, payment, provider_ref=None):
        return {
            'data': {
                'id': provider_ref or payment.provider_ref,
                'attributes': {
                    'status': 'paid',
                    'payments': [{
                        'id': f'pay_order_{payment.order_id}',
                        'attributes': {
                            'amount': int(payment.amount * 100),
                            'currency': payment.currency,
                            'status': 'paid',
                        },
                    }],
                },
            },
        }

    def test_paid_state_wins_when_session_setup_finishes_concurrently(self):
        test_case = self

        class PaidDuringCreate(FakePayMongoClient):
            def __init__(self, fail_after_payment=False):
                super().__init__()
                self.fail_after_payment = fail_after_payment

            def create_checkout_session(self, order, payment, line_items, shipping_address, customer_email):
                provider_ref = f'cs_race_{order.id}'
                OrdersPayment.objects.filter(pk=payment.pk).update(provider_ref=provider_ref)
                payment.refresh_from_db()
                apply_verified_payment(payment, test_case._paid_session(payment, provider_ref))
                if self.fail_after_payment:
                    raise PayMongoError('The create response was lost.', code='provider_unavailable')
                return provider_ref, f'https://checkout.paymongo.com/{provider_ref}#test'

        for fail_after_payment in (False, True):
            key = f'concurrent-paid-{int(fail_after_payment)}'
            order, payment, _ = execute_checkout(
                self.customer,
                self.payload('gcash', key),
                provider_client=PaidDuringCreate(fail_after_payment),
            )
            order.refresh_from_db()
            payment.refresh_from_db()
            self.assertEqual(payment.status, 'paid')
            self.assertEqual(order.status, 'placed')

    def test_paid_state_wins_when_expired_reconciliation_finishes_concurrently(self):
        order, _ = self._online_order(key='checkout-expiry-race')
        payment = order.payments.get()
        test_case = self

        class PaidDuringRetrieve(FakePayMongoClient):
            def retrieve_checkout_session(self, provider_ref):
                current = OrdersPayment.objects.get(pk=payment.pk)
                apply_verified_payment(current, test_case._paid_session(current, provider_ref))
                return {'data': {'id': provider_ref, 'attributes': {'status': 'expired', 'payments': []}}}

        result = reconcile_payment(payment, provider_client=PaidDuringRetrieve())
        order.refresh_from_db()
        payment.refresh_from_db()
        self.assertEqual(result, 'paid')
        self.assertEqual(payment.status, 'paid')
        self.assertEqual(order.status, 'placed')

    def test_late_payment_after_reservation_expiry_requires_review(self):
        order, _ = self._online_order(key='checkout-late-payment')
        payment = order.payments.get()
        provider = FakePayMongoClient()
        provider.session_data = {
            'data': {
                'id': payment.provider_ref,
                'attributes': {'status': 'expired', 'payments': []},
            },
        }

        self.assertEqual(reconcile_payment(payment, provider_client=provider), 'expired')
        payment.refresh_from_db()
        self.assertTrue(apply_verified_payment(payment, self._paid_session(payment)))

        order.refresh_from_db()
        payment.refresh_from_db()
        self.stock.refresh_from_db()
        self.assertEqual(payment.status, 'paid')
        self.assertEqual(order.status, 'payment_review')
        self.assertEqual(self.stock.quantity, 5)
        self.assertEqual(self.stock.reserved_quantity, 0)
        self.assertTrue(InventoryReservation.objects.filter(order_id=order.id, status='expired').exists())

    def _post_signed_event(self, event, valid=True):
        raw_body = json.dumps(event, separators=(',', ':')).encode('utf-8')
        timestamp = str(int(time.time()))
        signature = hmac.new(
            b'whsec_test_example',
            timestamp.encode('ascii') + b'.' + raw_body,
            hashlib.sha256,
        ).hexdigest()
        if not valid:
            signature = '0' * 64
        return self.client.post(
            '/api/payments/paymongo/webhook/',
            data=raw_body,
            content_type='application/json',
            HTTP_PAYMONGO_SIGNATURE=f't={timestamp},te={signature},li=',
        )

    def test_signed_paid_webhook_is_verified_and_deduplicated(self):
        order, _ = self._online_order()
        event = self._paid_event(order)

        first = self._post_signed_event(event)
        duplicate = self._post_signed_event(event)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.data['result'], 'processed')
        self.assertEqual(duplicate.data['result'], 'duplicate')
        payment = OrdersPayment.objects.get(order=order)
        order.refresh_from_db()
        self.assertEqual(payment.status, 'paid')
        self.assertEqual(order.status, 'placed')
        self.assertEqual(PaymentWebhookEvent.objects.count(), 1)
        self.assertTrue(InventoryReservation.objects.filter(order_id=order.id, status='committed').exists())
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 3)
        self.assertEqual(self.stock.reserved_quantity, 0)
        self.assertEqual(InventoryStockMovement.objects.filter(ref_order_ref=order.id).count(), 1)

    def test_current_webhook_envelope_is_processed(self):
        order, _ = self._online_order(key='checkout-current-webhook')
        legacy_event = self._paid_event(order)
        resource = legacy_event['data']['attributes']['data']
        current_event = {
            'event_type': 'send.webhook',
            'data': {
                'type': 'checkout_session.payment.paid',
                'resource': 'checkout_session',
                'livemode': False,
                'data': resource,
            },
        }

        response = self._post_signed_event(current_event)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['result'], 'processed')
        order.refresh_from_db()
        self.assertEqual(order.status, 'placed')
        self.assertEqual(OrdersPayment.objects.get(order=order).status, 'paid')

    def test_paid_webhook_recovers_a_session_when_create_response_was_lost(self):
        order, _ = self._online_order(key='checkout-lost-create-response')
        event = self._paid_event(order)
        expected_provider_ref = order.payments.get().provider_ref
        OrdersPayment.objects.filter(order=order).update(
            provider_ref=None,
            checkout_url=None,
            status='setup_failed',
        )
        OrdersOrder.objects.filter(pk=order.pk).update(status='payment_setup_failed')

        response = self._post_signed_event(event)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['result'], 'processed')
        payment = OrdersPayment.objects.get(order=order)
        order.refresh_from_db()
        self.assertEqual(payment.provider_ref, expected_provider_ref)
        self.assertEqual(payment.status, 'paid')
        self.assertEqual(order.status, 'placed')

    def test_unbound_session_is_not_claimed_when_paid_amount_is_wrong(self):
        order, _ = self._online_order(key='checkout-unbound-wrong-amount')
        event = self._paid_event(order, amount=1)
        OrdersPayment.objects.filter(order=order).update(
            provider_ref=None,
            checkout_url=None,
            status='setup_failed',
        )

        response = self._post_signed_event(event)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['result'], 'rejected')
        payment = OrdersPayment.objects.get(order=order)
        self.assertIsNone(payment.provider_ref)
        self.assertEqual(payment.status, 'setup_failed')

    def test_webhook_rejects_bad_signature_and_wrong_amount(self):
        order, _ = self._online_order(key='checkout-webhook-negative')
        event = self._paid_event(order, amount=1)

        forged = self._post_signed_event(event, valid=False)
        mismatched = self._post_signed_event(event)

        self.assertEqual(forged.status_code, 401)
        self.assertEqual(mismatched.status_code, 200)
        self.assertEqual(mismatched.data['result'], 'rejected')
        self.assertEqual(OrdersPayment.objects.get(order=order).status, 'awaiting_payment')

    @override_settings(PAYMONGO_WEBHOOK_MAX_BYTES=8)
    def test_webhook_rejects_oversized_raw_body_before_processing(self):
        response = self.client.post(
            '/api/payments/paymongo/webhook/',
            data=b'{"larger":true}',
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.data['code'], 'payload_too_large')
        self.assertEqual(PaymentWebhookEvent.objects.count(), 0)

    def test_owner_detail_and_cancel_release_the_hold(self):
        order, provider = self._online_order(method='card', key='checkout-cancel')
        other = AccountsCustomer.objects.create(
            email='other@example.com',
            name='Other Buyer',
            password='not-used',
            phone='',
            addresses={},
            is_active=True,
            is_staff=False,
            is_superuser=False,
            role='customer',
            date_joined=self.now,
        )
        _, other_raw = CustomerAccessToken.issue(other)
        hidden = self.client.get(
            f'/orders/{order.id}/',
            HTTP_AUTHORIZATION=f'Bearer {other_raw}',
        )
        self.assertEqual(hidden.status_code, 404)

        with patch('orders.checkout.PayMongoClient', return_value=provider):
            cancelled = self.client.post(f'/orders/{order.id}/cancel/', {}, format='json', **self.auth)
        self.assertEqual(cancelled.status_code, 200)
        self.assertEqual(cancelled.data['status'], 'cancelled')
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 5)
        self.assertEqual(self.stock.reserved_quantity, 0)
        self.assertEqual(provider.expired, [f'cs_order_{order.id}'])

    def test_tracking_never_fabricates_courier_eta_or_stage_timestamps(self):
        checkout = self.client.post('/api/orders/checkout/', self.payload(), format='json', **self.auth)
        order = OrdersOrder.objects.get(pk=checkout.data['id'])
        ShippingShipment.objects.create(
            order_ref=order.id,
            counter=1,
            waybill_no='WB-OBSERVED',
            tracking_no='TRACK-OBSERVED',
            status='shipped',
            booked_at=self.now,
        )

        response = self.client.get(f'/orders/{order.id}/tracking/', **self.auth)

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data['shipment']['courier'])
        self.assertEqual(response.data['shipment']['courier_source'], 'unavailable')
        self.assertIsNone(response.data['shipment']['eta_label'])
        shipped = next(event for event in response.data['events'] if event['key'] == 'shipped')
        self.assertEqual(shipped['state'], 'done')
        self.assertIsNone(shipped['timestamp'])
        self.assertEqual(shipped['timestamp_source'], 'unavailable')
