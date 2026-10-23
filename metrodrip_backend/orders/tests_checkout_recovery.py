from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIClient

from catalog.models import CatalogProduct, InventoryReservation, InventoryStockEntry
from identity.models import AccountsCustomer, CustomerAccessToken

from .checkout import serialize_checkout
from .models import OrdersOrder, OrdersOrderLine, OrdersPayment, OrdersShippingAddress


class CheckoutRecoveryAPITests(TestCase):
    url = '/api/orders/checkout/'

    def setUp(self):
        self.client = APIClient()
        now = timezone.now()
        self.customer = AccountsCustomer.objects.create(
            email='recovery@example.invalid', name='Recovery customer', phone='',
            password='!', addresses={}, is_active=True, is_staff=False,
            is_superuser=False, role='customer', date_joined=now,
        )
        _, raw_token = CustomerAccessToken.issue(self.customer)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {raw_token}')
        self.order = OrdersOrder.objects.create(
            customer_id=self.customer.id, status='pending_payment',
            subtotal=Decimal('100.00'), tax=Decimal('0.00'), shipping=Decimal('85.00'),
            discount=Decimal('0.00'), total=Decimal('185.00'), currency='PHP',
            checkout_idempotency_key='recovery-owned-001',
            reservation_expires_at=now + timedelta(minutes=10),
            created_at=now, updated_at=now,
        )
        self.payment = OrdersPayment.objects.create(
            order=self.order, method='gcash', status='awaiting_payment',
            amount=self.order.total, currency='PHP', provider='paymongo',
            provider_ref='cs_recovery_fixture',
            checkout_url='https://checkout.paymongo.com/cs_recovery_fixture',
            metadata={}, created_at=now, updated_at=now,
        )
        OrdersShippingAddress.objects.create(
            order=self.order, name='Recovery customer', address_line1='1 Test Street',
            city='Manila', state='NCR', country='PH', phone='',
            created_at=now, updated_at=now,
        )
        product = CatalogProduct.objects.create(
            sku='RECOVERY-001', name='Recovery tee', description='',
            base_price=Decimal('100.00'), currency='PHP', is_active=True,
            is_featured=False, created_at=now, updated_at=now,
        )
        OrdersOrderLine.objects.create(
            order=self.order, product=product, quantity=1,
            unit_price=Decimal('100.00'), total_price=Decimal('100.00'),
            discount_amount=Decimal('0.00'), tax_amount=Decimal('0.00'),
            tax_rate=Decimal('0.0000'), product_name_snapshot='Recovery tee',
            sku_snapshot=product.sku, created_at=now, updated_at=now,
        )
        InventoryStockEntry.objects.create(
            product=product, warehouse_id=1, quantity=2, reserved_quantity=1,
            last_counted_at=now, created_at=now, updated_at=now,
        )
        InventoryReservation.objects.create(
            order_id=self.order.id, product=product, quantity=1, warehouse_id=1,
            expires_at=self.order.reservation_expires_at, created_at=now,
        )
        for target in (
            'orders.checkout.PayMongoClient',
            'orders.views.execute_checkout',
            'orders.views.expire_one_stale_checkout',
            'orders.views.reconcile_payment',
            'orders.views.cancel_checkout',
        ):
            self.enterContext(patch(target, side_effect=AssertionError('Recovery must only read.')))

    def recover(self, key):
        params = {} if key is None else {'idempotency_key': key}
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get(self.url, params)

        # Preserve the existing auth/throttle bookkeeping, but allow no other
        # database writes. Do not include SQL or bearer material in failures.
        allowed = (
            'SELECT ', 'SAVEPOINT ', 'RELEASE SAVEPOINT ',
            'UPDATE "identity_customeraccesstoken" ',
            'INSERT INTO "identity_request_ratelimit" ',
            'UPDATE "identity_request_ratelimit" ',
        )
        self.assertTrue(
            all(query['sql'].lstrip().startswith(allowed) for query in queries),
            'Recovery executed SQL beyond reads and existing security bookkeeping.',
        )
        return response

    def test_owned_key_returns_canonical_checkout(self):
        response = self.recover(self.order.checkout_idempotency_key)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), serialize_checkout(self.order, self.payment))
        self.assertEqual(response.json()['items'][0]['product_name'], 'Recovery tee')
        self.assertEqual(response.json()['payment_action']['type'], 'redirect')

    def test_cod_outcome_is_recovered_without_another_checkout(self):
        self.order.status = 'placed'
        self.order.save(update_fields=['status'])
        self.payment.method = 'cod'
        self.payment.status = 'pending_collection'
        self.payment.save(update_fields=['method', 'status'])

        response = self.recover(self.order.checkout_idempotency_key)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), serialize_checkout(self.order, self.payment))
        self.assertIsNone(response.json()['payment_action'])

    def test_foreign_absent_and_missing_payment_are_indistinguishable(self):
        absent = self.recover('recovery-absent-001')
        other = AccountsCustomer.objects.create(
            email='other-recovery@example.invalid', name='Other customer', phone='',
            password='!', addresses={}, is_active=True, is_staff=False,
            is_superuser=False, role='customer', date_joined=timezone.now(),
        )
        OrdersOrder.objects.filter(pk=self.order.pk).update(customer_id=other.id)
        foreign = self.recover(self.order.checkout_idempotency_key)
        self.order.pk = None
        self.order.checkout_idempotency_key = 'recovery-incomplete-001'
        self.order.save()
        incomplete = self.recover(self.order.checkout_idempotency_key)

        for response in (absent, foreign, incomplete):
            self.assertEqual(response.status_code, 404)
            self.assertEqual(response.json(), {'error': 'Order not found.'})

    def test_missing_or_numeric_bearer_is_unauthorized(self):
        self.client.credentials()
        self.assertEqual(self.recover(self.order.checkout_idempotency_key).status_code, 401)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.customer.id}')
        self.assertEqual(self.recover(self.order.checkout_idempotency_key).status_code, 401)

    def test_malformed_keys_fail_before_order_lookup(self):
        keys = (
            None, '', 'a' * 7, 'a' * 129, 'a' * 10000,
            'recovery key', 'recovery/key', 'recovery+key',
            'recovery%key', 'recovery\n', 'recovery\x00', 'recovery\u00e9',
        )
        for index, key in enumerate(keys):
            with self.subTest(case=index), patch.object(OrdersOrder.objects, 'filter') as lookup:
                response = self.recover(key)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json(), {
                    'error': 'A valid idempotency key is required.',
                    'code': 'invalid_idempotency_key',
                })
                lookup.assert_not_called()

    def test_valid_key_boundaries_and_charset_are_preserved(self):
        for key in ('Aa0._:-9', 'a' * 128):
            with self.subTest(length=len(key)):
                OrdersOrder.objects.filter(pk=self.order.pk).update(checkout_idempotency_key=key)
                response = self.recover(key)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()['id'], self.order.id)

    def test_repeated_recovery_does_not_expire_or_reconcile_stale_checkout(self):
        past = timezone.now() - timedelta(minutes=1)
        OrdersOrder.objects.filter(pk=self.order.pk).update(reservation_expires_at=past)
        InventoryReservation.objects.filter(order_id=self.order.id).update(expires_at=past)
        self.order.refresh_from_db()

        for _ in range(2):
            response = self.recover(self.order.checkout_idempotency_key)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json(), serialize_checkout(self.order, self.payment))
            self.assertEqual(response.json()['status'], 'pending_payment')
            self.assertEqual(response.json()['payment_status'], 'awaiting_payment')

    def test_unbound_failed_setup_is_recovered_without_provider_retry(self):
        self.payment.status = 'setup_failed'
        self.payment.provider_ref = None
        self.payment.checkout_url = None
        self.payment.save(update_fields=['status', 'provider_ref', 'checkout_url'])

        response = self.recover(self.order.checkout_idempotency_key)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), serialize_checkout(self.order, self.payment))
        self.assertIsNone(response.json()['payment_action'])
