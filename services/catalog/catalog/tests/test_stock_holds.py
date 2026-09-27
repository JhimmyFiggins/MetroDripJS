from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from django.core.management import call_command
from rest_framework.test import APIClient
from catalog.models import (
    CatalogCategory,
    CatalogProduct,
    CatalogProductVariant,
    InventoryStockEntry,
    InventoryReservation,
)

class StockHoldAndReservationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.category = CatalogCategory.objects.create(name='Hoodies', slug='hoodies')
        self.product = CatalogProduct.objects.create(
            sku='MD-HD-001',
            name='Drip Zip-Up Hoodie',
            category=self.category,
            base_price=1249,
            currency='PHP',
        )
        self.variant = CatalogProductVariant.objects.create(
            product=self.product,
            sku='MD-HD-001-BLK-M',
            attributes={'size': 'M', 'color': 'Black'},
            price_adjustment=0,
        )
        # Set up exactly 2 units in stock
        self.stock = InventoryStockEntry.objects.create(
            product=self.product,
            variant=self.variant,
            warehouse_id=1,
            quantity=2,
            reserved_quantity=0,
        )

    def test_reservation_lifecycle_and_commit(self):
        checkout_id = 'chk_test_1001'
        payload = {
            'checkout_id': checkout_id,
            'ttl_seconds': 300,
            'items': [{'variant_id': self.variant.id, 'quantity': 1}]
        }

        # 1. Reserve 1 unit
        res = self.client.post('/api/catalog/reserve/', payload, format='json')
        self.assertEqual(res.status_code, 201)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.reserved_quantity, 1)
        self.assertEqual(self.stock.available_quantity, 1)

        # 2. Idempotent reservation retry returns active state
        res_retry = self.client.post('/api/catalog/reserve/', payload, format='json')
        self.assertEqual(res_retry.status_code, 200)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.reserved_quantity, 1)

        # 3. Commit reservation
        commit_res = self.client.post(f'/api/catalog/reserve/{checkout_id}/commit/', {'order_ref': 500}, format='json')
        self.assertEqual(commit_res.status_code, 200)
        self.stock.refresh_from_db()
        # On-hand quantity decremented by 1, reserved_quantity decremented by 1
        self.assertEqual(self.stock.quantity, 1)
        self.assertEqual(self.stock.reserved_quantity, 0)
        self.assertEqual(self.stock.available_quantity, 1)

        # 4. Commit retry is idempotent
        commit_retry = self.client.post(f'/api/catalog/reserve/{checkout_id}/commit/', {'order_ref': 500}, format='json')
        self.assertEqual(commit_retry.status_code, 200)

    def test_insufficient_stock_rejection(self):
        checkout_id = 'chk_test_short'
        payload = {
            'checkout_id': checkout_id,
            'ttl_seconds': 300,
            'items': [{'variant_id': self.variant.id, 'quantity': 5}] # Only 2 available
        }
        res = self.client.post('/api/catalog/reserve/', payload, format='json')
        self.assertEqual(res.status_code, 409)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.reserved_quantity, 0)

    def test_release_reservation_restores_stock(self):
        checkout_id = 'chk_test_cancel'
        # Reserve 2 units
        self.client.post('/api/catalog/reserve/', {
            'checkout_id': checkout_id,
            'items': [{'variant_id': self.variant.id, 'quantity': 2}]
        }, format='json')
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.available_quantity, 0)

        # Release
        rel = self.client.post(f'/api/catalog/reserve/{checkout_id}/release/', format='json')
        self.assertEqual(rel.status_code, 200)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.reserved_quantity, 0)
        self.assertEqual(self.stock.available_quantity, 2)

    def test_release_expired_holds_command(self):
        # Create an expired reservation directly
        past_time = timezone.now() - timedelta(minutes=10)
        self.stock.reserved_quantity = 1
        self.stock.save()

        InventoryReservation.objects.create(
            checkout_id='chk_expired',
            product=self.product,
            variant=self.variant,
            quantity=1,
            status='active',
            expires_at=past_time,
        )

        call_command('release_expired_holds')

        self.stock.refresh_from_db()
        self.assertEqual(self.stock.reserved_quantity, 0)
        res = InventoryReservation.objects.get(checkout_id='chk_expired')
        self.assertEqual(res.status, 'expired')
