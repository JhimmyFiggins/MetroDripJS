from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from catalog.models import (
    CatalogCategory,
    CatalogColor,
    CatalogProduct,
    CatalogProductVariant,
    InventoryStockEntry,
)
from fulfillment.models import ShippingShippingZone
from identity.models import AccountsCustomer, CustomerAccessToken
from orders.models import OrdersOrder
from orders.paymongo import PayMongoError


class CustomerCapabilityContractTests(TestCase):
    def test_capabilities_fail_closed_without_provider_configuration(self):
        response = self.client.get('/api/payments/capabilities/')

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        methods = {item['id']: item for item in payload['methods']}
        self.assertTrue(methods['cod']['available'])
        self.assertFalse(methods['gcash']['available'])
        self.assertEqual(methods['gcash']['unavailable_code'], 'provider_not_configured')
        self.assertEqual(payload['enabled_methods'], [])
        self.assertFalse(payload['provider_ready'])

    @override_settings(
        PAYMONGO_SECRET_KEY='sk_test_example',
        PAYMONGO_WEBHOOK_SECRET='whsec_test_example',
        PAYMONGO_MODE='test',
        PAYMONGO_ENABLED_METHODS='',
    )
    def test_secret_presence_does_not_enable_hosted_rails(self):
        response = self.client.get('/api/payments/capabilities/')

        methods = {item['id']: item for item in response.json()['methods']}
        self.assertTrue(response.json()['provider_ready'])
        self.assertFalse(methods['gcash']['available'])
        self.assertFalse(methods['maya']['available'])
        self.assertFalse(methods['card']['available'])
        self.assertEqual(methods['card']['unavailable_code'], 'method_not_enabled')

    @override_settings(
        PAYMONGO_SECRET_KEY='sk_test_example',
        PAYMONGO_WEBHOOK_SECRET='whsec_test_example',
        PAYMONGO_MODE='test',
        PAYMONGO_ENABLED_METHODS='gcash',
    )
    def test_allowlist_enables_only_named_hosted_rail(self):
        methods = {item['id']: item for item in self.client.get('/api/payments/capabilities/').json()['methods']}

        self.assertTrue(methods['gcash']['available'])
        self.assertFalse(methods['maya']['available'])
        self.assertIsNone(methods['gcash']['unavailable_code'])


class CustomerShippingZoneContractTests(TestCase):
    def test_public_zone_list_returns_active_server_names_only(self):
        ShippingShippingZone.objects.create(name='Customer Visible Zone', fee=95, is_active=True)
        ShippingShippingZone.objects.create(name='Customer Hidden Zone', fee=10, is_active=False)

        response = self.client.get('/api/shipping-zones/')

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload['currency'], 'PHP')
        names = [zone['name'] for zone in payload['zones']]
        self.assertIn('Customer Visible Zone', names)
        self.assertNotIn('Customer Hidden Zone', names)
        visible = next(zone for zone in payload['zones'] if zone['name'] == 'Customer Visible Zone')
        self.assertEqual(visible['fee'], '95.00')
        self.assertEqual(self.client.post('/api/shipping-zones/', {}, format='json').status_code, 405)


@override_settings(
    PAYMONGO_SECRET_KEY='sk_test_example',
    PAYMONGO_WEBHOOK_SECRET='whsec_test_example',
    PAYMONGO_MODE='test',
    PAYMONGO_ENABLED_METHODS='',
)
class UnavailableOnlineCheckoutTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        now = timezone.now()
        customer = AccountsCustomer(
            email='customer-web@example.com',
            name='Customer Web',
            phone='09170000000',
            addresses={},
            is_active=True,
            is_staff=False,
            is_superuser=False,
            role='customer',
            date_joined=now,
        )
        customer.set_password('synthetic-test-password')
        customer.save()
        _, raw_token = CustomerAccessToken.issue(customer)
        self.auth = {'HTTP_AUTHORIZATION': f'Bearer {raw_token}'}
        category = CatalogCategory.objects.create(
            name='Customer Web Category',
            slug='customer-web-category',
            description='Synthetic category',
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        product = CatalogProduct.objects.create(
            sku='CUST-WEB-001',
            name='Customer web tee',
            description='Synthetic product',
            category=category,
            base_price=Decimal('1000.00'),
            currency='PHP',
            is_active=True,
            is_featured=False,
            created_at=now,
            updated_at=now,
        )
        color = CatalogColor.objects.create(
            name='Customer Web Ink',
            hex_code='#0B0C0D',
            created_at=now,
            updated_at=now,
        )
        variant = CatalogProductVariant.objects.create(
            product=product,
            color=color,
            sku='CUST-WEB-001-INK',
            attributes={'size': 'M'},
            price_adjustment=Decimal('0.00'),
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        InventoryStockEntry.objects.create(
            product=product,
            variant=variant,
            warehouse_id=3,
            quantity=2,
            reserved_quantity=0,
            last_counted_at=now,
            created_at=now,
            updated_at=now,
        )
        ShippingShippingZone.objects.update_or_create(
            name='NCR (Metro Manila)',
            defaults={'fee': 85, 'is_active': True},
        )
        self.payload = {
            'items': [{'variant_id': variant.id, 'quantity': 1}],
            'delivery_zone': 'NCR (Metro Manila)',
            'payment_method': 'gcash',
            'idempotency_key': 'customer-web-unavailable',
            'shipping_address': {
                'name': 'Customer Web',
                'address_line1': '1 Sample Street',
                'city': 'Manila',
                'state': 'NCR',
                'postal_code': '1000',
                'country': 'PH',
                'phone': '09170000000',
            },
        }

    def test_unlisted_online_method_is_rejected_before_an_order_exists(self):
        response = self.client.post('/api/orders/checkout/', self.payload, format='json', **self.auth)

        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.data['code'], 'payment_method_unavailable')
        self.assertFalse(OrdersOrder.objects.filter(checkout_idempotency_key='customer-web-unavailable').exists())

    @override_settings(PAYMONGO_ENABLED_METHODS='gcash')
    def test_provider_client_construction_failure_does_not_return_500(self):
        with patch(
            'orders.checkout.PayMongoClient',
            side_effect=PayMongoError('Offline', code='provider_not_configured', retryable=False),
        ):
            response = self.client.post('/api/orders/checkout/', self.payload, format='json', **self.auth)

        self.assertNotEqual(response.status_code, 500)
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.data['code'], 'provider_not_configured')
