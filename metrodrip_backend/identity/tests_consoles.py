from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from identity.models import AccountsCustomer, AuditLog
from catalog.models import (
    CatalogCategory,
    CatalogProduct,
    CatalogProductVariant,
    InventoryStockEntry,
    InventoryStockMovement,
)
from orders.models import OrdersOrder, ReviewsReview
from django.utils import timezone


class ConsolesAPITestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        now = timezone.now()

        # Seed test admin & customer
        self.admin_user = AccountsCustomer.objects.create(
            email='testadmin@metrodrip.ph',
            name='Test Admin',
            role='admin',
            is_active=True,
            is_staff=True,
            is_superuser=True,
            addresses=[],
            date_joined=now,
        )
        self.customer = AccountsCustomer.objects.create(
            email='testcustomer@email.com',
            name='Test Customer',
            role='customer',
            is_active=True,
            is_staff=False,
            is_superuser=False,
            addresses=[],
            date_joined=now,
        )

        # Seed category and product with low stock
        self.cat = CatalogCategory.objects.create(
            name='Tops › Hoodies',
            slug='tops-hoodies',
            description='Hoodies',
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        self.product = CatalogProduct.objects.create(
            name='Drip Zip-Up Hoodie',
            sku='MD-HD-002-BLK-M-OVS',
            category=self.cat,
            base_price=1249.00,
            currency='PHP',
            is_active=True,
            is_featured=True,
            created_at=now,
            updated_at=now,
        )
        self.variant = CatalogProductVariant.objects.create(
            product=self.product,
            sku='MD-HD-002-BLK-M-OVS',
            attributes={'size': 'M', 'color': 'BLK'},
            price_adjustment=0,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        self.stock = InventoryStockEntry.objects.create(
            product=self.product,
            variant=self.variant,
            warehouse_id=1,
            quantity=3,
            reserved_quantity=0,
            last_counted_at=now,
            created_at=now,
            updated_at=now,
        )

        # Seed review
        self.review = ReviewsReview.objects.create(
            customer_name='Bea S.',
            product_name='Drip Zip-Up Hoodie',
            rating=5,
            body='Super lapad ng fit!',
            status='pending',
            created_at=now,
        )

    def test_admin_dashboard_api(self):
        res = self.client.get('/api/admin/dashboard/')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn('metrics', data)
        self.assertIn('users', data)
        self.assertIn('audit_trail', data)
        self.assertGreaterEqual(data['metrics']['total_customers'], 1)

    def test_admin_users_api_create_and_audit(self):
        res = self.client.post('/api/admin/users/', {
            'name': 'New Staff',
            'email': 'staff@metrodrip.ph',
            'role': 'merchant',
            'phone': '+63 917 999 8888',
        }, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertTrue(AccountsCustomer.objects.filter(email='staff@metrodrip.ph').exists())
        # Verify AuditLog creation
        self.assertTrue(AuditLog.objects.filter(action__contains='New Staff').exists())

    def test_admin_toggle_user_status(self):
        res = self.client.patch(f'/api/admin/users/{self.customer.id}/', {
            'is_active': False
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.customer.refresh_from_db()
        self.assertFalse(self.customer.is_active)
        # Verify AuditLog creation
        self.assertTrue(AuditLog.objects.filter(action__contains=f'#{self.customer.id}').exists())

    def test_merchant_dashboard_api(self):
        res = self.client.get('/api/merchant/dashboard/')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn('metrics', data)
        self.assertIn('low_stock_alerts', data)

    def test_merchant_restock_api(self):
        initial_stock = self.stock.quantity
        res = self.client.post('/api/merchant/inventory/restock/', {
            'sku': self.variant.sku,
            'quantity': 25,
            'reason': 'restock',
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, initial_stock + 25)
        # Verify InventoryStockMovement record
        self.assertTrue(InventoryStockMovement.objects.filter(sku=self.variant.sku, delta=25).exists())

    def test_merchant_review_detail(self):
        res = self.client.get(f'/api/merchant/reviews/{self.review.id}/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['customer_name'], self.review.customer_name)
        self.assertEqual(res.data['product_name'], self.review.product_name)

    def test_merchant_review_reply(self):
        reply_msg = 'Thank you Bea! We designed the oversize fit specifically for streetwear layering.'
        res = self.client.post(f'/api/merchant/reviews/{self.review.id}/reply/', {
            'reply': reply_msg,
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.review.refresh_from_db()
        self.assertEqual(self.review.merchant_reply, reply_msg)
        self.assertIsNotNone(self.review.replied_at)

    def test_merchant_review_moderation_deprecated(self):
        res = self.client.post(f'/api/merchant/reviews/{self.review.id}/moderate/', {
            'status': 'approved',
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.review.refresh_from_db()
        self.assertEqual(self.review.status, 'approved')

