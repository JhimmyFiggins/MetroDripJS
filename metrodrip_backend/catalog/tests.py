from decimal import Decimal

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .models import (
    CatalogCategory,
    CatalogProduct,
    CatalogProductVariant,
    InventoryStockEntry,
)


class PublicVariantPurchaseLimitTests(TestCase):
    def setUp(self):
        now = timezone.now()
        category = CatalogCategory.objects.create(
            name='Public catalog',
            slug='public-catalog',
            description='',
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        product = CatalogProduct.objects.create(
            name='Limit test hoodie',
            sku='LIMIT-HOODIE',
            description='',
            category=category,
            base_price=Decimal('1000.00'),
            currency='PHP',
            is_active=True,
            is_featured=False,
            created_at=now,
            updated_at=now,
        )
        self.variant = CatalogProductVariant.objects.create(
            product=product,
            sku='LIMIT-HOODIE-BLK-M',
            attributes={'color': 'Black', 'size': 'M', 'fit': 'Regular'},
            price_adjustment=Decimal('0.00'),
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        InventoryStockEntry.objects.create(
            product=product,
            variant=self.variant,
            warehouse_id=1,
            quantity=50,
            reserved_quantity=2,
            last_counted_at=now,
            created_at=now,
            updated_at=now,
        )
        self.client = APIClient()

    @override_settings(CHECKOUT_MAX_QUANTITY_PER_VARIANT=7)
    def test_public_variant_and_stock_responses_expose_checkout_limit(self):
        variants = self.client.get(f'/products/{self.variant.product_id}/variants/')
        self.assertEqual(variants.status_code, 200)
        self.assertEqual(variants.data[0]['max_order_quantity'], 7)

        stock = self.client.get(f'/variants/{self.variant.id}/stock/')
        self.assertEqual(stock.status_code, 200)
        self.assertEqual(stock.data[0]['max_order_quantity'], 7)
        self.assertEqual(stock.data[0]['available_stock'], 48)
