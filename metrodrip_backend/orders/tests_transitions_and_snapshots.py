import json
from decimal import Decimal
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from catalog.models import (
    CatalogCategory,
    CatalogProduct,
    CatalogProductVariant,
    InventoryStockEntry,
)
from fulfillment.models import ShippingShippingZone
from identity.models import AccountsCustomer, CustomerAccessToken
from orders.checkout import execute_checkout, serialize_checkout, cancel_checkout
from orders.models import OrdersOrder, OrdersOrderLine, OrdersPayment, OrdersPaymentTransition


class FakePayMongoClient:
    def create_checkout_session(self, order, payment, line_items, shipping_address, customer_email):
        return f'cs_test_{order.id}', f'https://checkout.paymongo.com/cs_test_{order.id}#test'

    def expire_checkout_session(self, provider_ref):
        return {'data': {'id': provider_ref, 'attributes': {'status': 'expired'}}}


@override_settings(
    PAYMONGO_SECRET_KEY='sk_test_example',
    PAYMONGO_WEBHOOK_SECRET='whsec_test_example',
    PAYMONGO_MODE='test',
)
class TransitionsAndSnapshotsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.fake_provider = FakePayMongoClient()
        self.now = timezone.now()
        self.user = AccountsCustomer(
            name='Test Shopper',
            email='shopper_snapshot@example.com',
            phone='09171234567',
            addresses={},
            role='customer',
            is_active=True,
            is_staff=False,
            is_superuser=False,
            date_joined=self.now,
        )
        self.user.set_password('shopper_pass_123')
        self.user.save()
        _, raw_token = CustomerAccessToken.issue(self.user)
        self.token = raw_token
        self.auth = {'HTTP_AUTHORIZATION': f'Bearer {raw_token}'}

        self.zone, _ = ShippingShippingZone.objects.get_or_create(
            name='NCR (Metro Manila)',
            defaults={'fee': 150, 'is_active': True},
        )
        self.category, _ = CatalogCategory.objects.get_or_create(
            slug='hoodies-snap',
            defaults={
                'name': 'Hoodies Snap',
                'description': 'Hoodies category',
                'is_active': True,
                'created_at': self.now,
                'updated_at': self.now,
            },
        )
        self.product = CatalogProduct.objects.create(
            category=self.category,
            name='Original Box Logo Hoodie',
            sku='MD-HOOD-001',
            description='Heavyweight 450GSM cotton fleece',
            base_price=Decimal('2500.00'),
            currency='PHP',
            is_active=True,
            is_featured=True,
            created_at=self.now,
            updated_at=self.now,
        )
        self.variant = CatalogProductVariant.objects.create(
            product=self.product,
            sku='MD-HOOD-001-BLK-L',
            price_adjustment=Decimal('0.00'),
            attributes={'size': 'L', 'color': 'Black', 'fit': 'Oversized'},
            is_active=True,
            created_at=self.now,
            updated_at=self.now,
        )
        self.stock = InventoryStockEntry.objects.create(
            product=self.product,
            variant=self.variant,
            warehouse_id=1,
            quantity=10,
            reserved_quantity=0,
            last_counted_at=self.now,
            created_at=self.now,
            updated_at=self.now,
        )
        self.checkout_payload = {
            'idempotency_key': 'chk-trans-snap-001',
            'items': [{'variant_id': self.variant.id, 'quantity': 1}],
            'delivery_zone': 'NCR (Metro Manila)',
            'payment_method': 'cod',
            'shipping_address': {
                'name': 'Test Shopper',
                'address_line1': '123 Ayala Ave',
                'city': 'Makati',
                'state': 'Metro Manila',
                'postal_code': '1226',
                'country': 'PH',
                'phone': '+639171234567',
            },
        }

    def test_payment_transition_recorded_on_cod_checkout(self):
        order, payment, is_replay = execute_checkout(self.user, self.checkout_payload)
        self.assertFalse(is_replay)
        self.assertEqual(payment.status, 'pending_collection')

        transitions = list(OrdersPaymentTransition.objects.filter(payment=payment))
        self.assertEqual(len(transitions), 1)
        t = transitions[0]
        self.assertEqual(t.from_status, 'none')
        self.assertEqual(t.to_status, 'pending_collection')
        self.assertEqual(t.actor_type, 'customer')
        self.assertEqual(t.actor_id, str(self.user.id))
        self.assertIn('Order checkout initiated', t.reason)

    def test_order_line_snapshots_populated_and_immutable(self):
        order, payment, _ = execute_checkout(self.user, self.checkout_payload)
        line = order.lines.first()
        self.assertIsNotNone(line)
        self.assertEqual(line.product_name_snapshot, 'Original Box Logo Hoodie')
        self.assertEqual(line.sku_snapshot, 'MD-HOOD-001-BLK-L')
        self.assertIn('L', line.variant_desc_snapshot)
        self.assertIn('BLACK', line.variant_desc_snapshot)

        # Mutate catalog product name and variant SKU
        self.product.name = 'Renamed Cheap Hoodie'
        self.product.sku = 'MUTATED-SKU'
        self.product.save()
        self.variant.sku = 'MUTATED-VAR-SKU'
        self.variant.save()

        # Serialization must preserve the purchase-time snapshots
        serialized = serialize_checkout(order, payment)
        item = serialized['items'][0]
        self.assertEqual(item['product_name'], 'Original Box Logo Hoodie')
        self.assertEqual(item['sku'], 'MD-HOOD-001-BLK-L')

    def test_payment_transition_on_cancellation(self):
        payload = dict(self.checkout_payload)
        payload['idempotency_key'] = 'chk-trans-cancel-002'
        payload['payment_method'] = 'gcash'
        order, payment, _ = execute_checkout(self.user, payload, provider_client=self.fake_provider)

        cancel_checkout(order, provider_client=self.fake_provider)
        payment.refresh_from_db()
        self.assertEqual(payment.status, 'cancelled')

        transitions = list(OrdersPaymentTransition.objects.filter(payment=payment).order_by('created_at'))
        self.assertEqual(len(transitions), 2)
        init_t, cancel_t = transitions[0], transitions[1]
        self.assertEqual(init_t.to_status, 'awaiting_payment')
        self.assertEqual(cancel_t.from_status, 'awaiting_payment')
        self.assertEqual(cancel_t.to_status, 'cancelled')
        self.assertEqual(cancel_t.actor_type, 'customer')

    def test_payment_capabilities_endpoint(self):
        response = self.client.get('/api/payments/capabilities/')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['currency'], 'PHP')
        self.assertEqual(data['provider'], 'paymongo')
        methods = {m['id']: m for m in data['methods']}
        self.assertIn('cod', methods)
        self.assertIn('gcash', methods)
        self.assertIn('maya', methods)
        self.assertIn('card', methods)
        self.assertTrue(methods['cod']['available'])
