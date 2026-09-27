from django.test import TestCase
from rest_framework.test import APIClient
from catalog.models import CatalogCategory, CatalogProduct, CatalogProductVariant, InventoryStockEntry

class CatalogPublicBrowsingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.category = CatalogCategory.objects.create(
            name='Tees',
            slug='tees',
            is_active=True
        )
        self.product = CatalogProduct.objects.create(
            sku='MD-TS-001',
            name='Metro Boxy Tee',
            category=self.category,
            base_price=899,
            currency='PHP',
            is_active=True
        )
        self.variant = CatalogProductVariant.objects.create(
            product=self.product,
            sku='MD-TS-001-WHT-L',
            attributes={'size': 'L', 'color': 'White', 'fit': 'Boxy'},
            price_adjustment=0,
            is_active=True
        )
        self.stock = InventoryStockEntry.objects.create(
            product=self.product,
            variant=self.variant,
            warehouse_id=1,
            quantity=10,
            reserved_quantity=0
        )

    def test_health_check(self):
        res = self.client.get('/health/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['service'], 'catalog')

    def test_products_list_and_detail(self):
        res = self.client.get('/products/')
        self.assertEqual(res.status_code, 200)
        self.assertGreaterEqual(len(res.data), 1)
        self.assertEqual(res.data[0]['name'], 'Metro Boxy Tee')

        detail_res = self.client.get(f'/products/{self.product.id}/')
        self.assertEqual(detail_res.status_code, 200)
        self.assertEqual(len(detail_res.data['variants']), 1)
        self.assertEqual(detail_res.data['variants'][0]['stock'], 10)

    def test_quote_endpoint_authoritative_server_price(self):
        payload = {
            'items': [
                {'variant_id': self.variant.id, 'quantity': 2}
            ]
        }
        res = self.client.post('/api/catalog/quote/', payload, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data['valid'])
        self.assertEqual(res.data['currency'], 'PHP')
        self.assertEqual(res.data['subtotal'], 899 * 2)
        self.assertIn('fingerprint', res.data)
        self.assertIn('expires_at', res.data)

    def test_quote_fails_on_insufficient_stock(self):
        payload = {
            'items': [
                {'variant_id': self.variant.id, 'quantity': 50}
            ]
        }
        res = self.client.post('/api/catalog/quote/', payload, format='json')
        self.assertEqual(res.status_code, 409)
