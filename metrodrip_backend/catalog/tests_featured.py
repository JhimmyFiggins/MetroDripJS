from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from catalog.models import CatalogProduct


class FeaturedProductsTests(TestCase):
    def test_featured_filter_returns_only_active_featured_products(self):
        now = timezone.now()
        for sku, active, featured in [
            ('FEATURED-1', True, True),
            ('ORDINARY-1', True, False),
            ('INACTIVE-1', False, True),
        ]:
            CatalogProduct.objects.create(
                sku=sku, name=sku, description='', base_price='100.00', currency='PHP',
                is_active=active, is_featured=featured, created_at=now, updated_at=now,
            )
        response = APIClient().get('/products/?featured=1')
        self.assertEqual(response.status_code, 200)
        self.assertEqual([product['sku'] for product in response.data], ['FEATURED-1'])
