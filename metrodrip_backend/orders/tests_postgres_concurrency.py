import json
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from decimal import Decimal
from threading import Barrier
from unittest import skipUnless

from django.db import close_old_connections, connection
from django.test import TransactionTestCase, override_settings
from django.utils import timezone

from catalog.models import (
    CatalogCategory,
    CatalogProduct,
    CatalogProductVariant,
    InventoryReservation,
    InventoryStockEntry,
    InventoryStockMovement,
)
from fulfillment.models import ShippingShippingZone
from identity.models import AccountsCustomer

from .checkout import CheckoutError, execute_checkout
from .models import OrdersOrder, OrdersPaymentTransition, PaymentWebhookEvent
from .webhooks import process_paymongo_webhook


class FakePayMongoClient:
    def create_checkout_session(self, order, payment, line_items, shipping_address, customer_email):
        return f'cs_concurrency_{order.id}', f'https://checkout.paymongo.com/cs_concurrency_{order.id}#test'


@skipUnless(connection.vendor == 'postgresql', 'PostgreSQL row-lock semantics are required.')
@override_settings(PAYMONGO_MODE='test')
class PostgreSQLCheckoutConcurrencyTests(TransactionTestCase):
    """Exercise invariants that SQLite cannot prove because it lacks row locks."""

    def setUp(self):
        self.now = timezone.now()
        self.customer = self._customer('buyer-one@example.com')
        self.other_customer = self._customer('buyer-two@example.com')
        category = CatalogCategory.objects.create(
            name='Concurrency Test Category',
            slug='concurrency-test-category',
            description='Synthetic PostgreSQL concurrency fixture',
            is_active=True,
            created_at=self.now,
            updated_at=self.now,
        )
        product = CatalogProduct.objects.create(
            sku='CONCURRENCY-PRODUCT',
            name='Concurrency Product',
            description='Synthetic PostgreSQL concurrency fixture',
            category=category,
            base_price=Decimal('100.00'),
            currency='PHP',
            is_active=True,
            is_featured=False,
            created_at=self.now,
            updated_at=self.now,
        )
        self.variant = CatalogProductVariant.objects.create(
            product=product,
            sku='CONCURRENCY-VARIANT',
            attributes={'size': 'M'},
            price_adjustment=Decimal('0.00'),
            is_active=True,
            created_at=self.now,
            updated_at=self.now,
        )
        self.stock = InventoryStockEntry.objects.create(
            product=product,
            variant=self.variant,
            warehouse_id=1,
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

    def _customer(self, email):
        customer = AccountsCustomer(
            email=email,
            name='Concurrency Buyer',
            phone='09171234567',
            addresses={},
            is_active=True,
            is_staff=False,
            is_superuser=False,
            role='customer',
            date_joined=self.now,
        )
        customer.set_password('synthetic-test-password')
        customer.save()
        return customer

    def _payload(self, key, method='cod'):
        return {
            'items': [{'variant_id': self.variant.id, 'quantity': 1}],
            'delivery_zone': 'NCR (Metro Manila)',
            'payment_method': method,
            'idempotency_key': key,
            'shipping_address': {
                'name': 'Concurrency Buyer',
                'address_line1': '1 Synthetic Test Street',
                'address_line2': '',
                'city': 'Quezon City',
                'state': 'Metro Manila',
                'postal_code': '1101',
                'country': 'PH',
                'phone': '09171234567',
            },
        }

    @staticmethod
    def _run_parallel(functions):
        gate = Barrier(len(functions))

        def run(function):
            close_old_connections()
            try:
                gate.wait(timeout=10)
                return function()
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=len(functions)) as executor:
            futures = [executor.submit(run, function) for function in functions]
            return [future.result(timeout=30) for future in futures]

    def _checkout_worker(self, customer_id, payload):
        def execute():
            customer = AccountsCustomer.objects.get(pk=customer_id)
            try:
                order, _payment, replay = execute_checkout(customer, deepcopy(payload))
                return 'ok', order.id, replay
            except CheckoutError as error:
                return 'rejected', error.code, error.status_code

        return execute

    def test_parallel_same_idempotency_key_creates_one_order(self):
        payload = self._payload('parallel-same-key')

        results = self._run_parallel([
            self._checkout_worker(self.customer.id, payload),
            self._checkout_worker(self.customer.id, payload),
        ])

        self.assertEqual([result[0] for result in results], ['ok', 'ok'])
        self.assertEqual(len({result[1] for result in results}), 1)
        self.assertEqual(sorted(result[2] for result in results), [False, True])
        self.assertEqual(OrdersOrder.objects.filter(checkout_idempotency_key='parallel-same-key').count(), 1)
        self.assertEqual(InventoryStockMovement.objects.count(), 1)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 4)
        self.assertEqual(self.stock.reserved_quantity, 0)

    def test_parallel_customers_cannot_oversell_one_unit(self):
        InventoryStockEntry.objects.filter(pk=self.stock.pk).update(quantity=1)
        first = self._payload('parallel-stock-first')
        second = self._payload('parallel-stock-second')
        second['shipping_address']['address_line1'] = '2 Synthetic Test Street'

        results = self._run_parallel([
            self._checkout_worker(self.customer.id, first),
            self._checkout_worker(self.other_customer.id, second),
        ])

        self.assertEqual(sum(result[0] == 'ok' for result in results), 1)
        self.assertEqual(sum(result[:2] == ('rejected', 'insufficient_stock') for result in results), 1)
        self.assertEqual(OrdersOrder.objects.count(), 1)
        self.assertEqual(InventoryStockMovement.objects.count(), 1)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 0)
        self.assertEqual(self.stock.reserved_quantity, 0)

    def test_parallel_duplicate_paid_webhook_applies_once(self):
        order, payment, _replay = execute_checkout(
            self.customer,
            self._payload('parallel-webhook', method='gcash'),
            provider_client=FakePayMongoClient(),
        )
        event = {
            'data': {
                'id': f'evt_parallel_{order.id}',
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
                                'id': f'pay_parallel_{order.id}',
                                'attributes': {
                                    'amount': int(payment.amount * 100),
                                    'currency': payment.currency,
                                    'status': 'paid',
                                },
                            }],
                        },
                    },
                },
            },
        }
        raw_body = json.dumps(event, separators=(',', ':')).encode('utf-8')

        results = self._run_parallel([
            lambda: process_paymongo_webhook(raw_body),
            lambda: process_paymongo_webhook(raw_body),
        ])

        self.assertEqual(sorted(results), ['duplicate', 'processed'])
        self.assertEqual(PaymentWebhookEvent.objects.filter(event_id=event['data']['id']).count(), 1)
        self.assertEqual(
            OrdersPaymentTransition.objects.filter(payment=payment, to_status='paid').count(),
            1,
        )
        self.assertEqual(InventoryReservation.objects.get(order_id=order.id).status, 'committed')
        self.assertEqual(InventoryStockMovement.objects.filter(ref_order_ref=order.id).count(), 1)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 4)
        self.assertEqual(self.stock.reserved_quantity, 0)
