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
from fulfillment.models import ShippingShippingZone
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

    def test_merchant_product_detail_and_patch(self):
        # 1. GET product detail
        res = self.client.get(f'/api/merchant/products/{self.product.id}/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['name'], self.product.name)
        self.assertEqual(res.data['price'], int(self.product.base_price))
        self.assertEqual(res.data['stock'], self.stock.quantity)

        # 2. PATCH product detail (price, stock, name)
        res = self.client.patch(f'/api/merchant/products/{self.product.id}/', {
            'name': 'Drip Heavyweight Zip-Up Hoodie',
            'price': 1499,
            'stock': 40,
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['price'], 1499)
        self.assertEqual(res.data['stock'], 40)

        # Verify DB updates
        self.product.refresh_from_db()
        self.assertEqual(self.product.name, 'Drip Heavyweight Zip-Up Hoodie')
        self.assertEqual(int(self.product.base_price), 1499)
        self.stock.refresh_from_db()
        self.assertEqual(self.stock.quantity, 40)

    def test_merchant_categories_list_and_create(self):
        # GET categories
        res = self.client.get('/api/merchant/categories/')
        self.assertEqual(res.status_code, 200)
        self.assertGreaterEqual(len(res.data), 1)

        # POST new category
        res = self.client.post('/api/merchant/categories/', {
            'name': 'Outerwear › Windbreakers',
            'description': 'Streetwear windbreakers',
        }, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertTrue(CatalogCategory.objects.filter(name='Outerwear › Windbreakers').exists())

    def test_merchant_orders_detail_and_status_update(self):
        # GET order detail
        res = self.client.get('/api/merchant/orders/318/')
        self.assertEqual(res.status_code, 200)
        self.assertIn('order_no', res.data)
        self.assertIn('shipping_address', res.data)
        self.assertIn('lines', res.data)

        # PATCH order status
        res = self.client.patch('/api/merchant/orders/318/status/', {
            'status': 'packed',
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['status'], 'Packed')

    def test_merchant_orders_export_csv(self):
        res = self.client.get('/api/merchant/orders/export/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'text/csv')
        self.assertIn('Order ID', res.content.decode('utf-8'))

    def test_admin_shipping_zones_get_and_patch(self):
        # GET shipping zones
        res = self.client.get('/api/admin/shipping-zones/')
        self.assertEqual(res.status_code, 200)
        self.assertGreaterEqual(len(res.data), 1)

        zone_id = res.data[0]['id']
        # PATCH shipping zone fee
        res = self.client.patch(f'/api/admin/shipping-zones/{zone_id}/', {
            'fee': 95,
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['fee'], 95)

        # Verify audit log was recorded
        self.assertTrue(AuditLog.objects.filter(action__contains='shipping fee').exists())

    def test_admin_roles_api(self):
        res = self.client.get('/api/admin/roles/')
        self.assertEqual(res.status_code, 200)
        roles = [r['role'] for r in res.data]
        self.assertIn('admin', roles)
        self.assertIn('merchant', roles)
        self.assertIn('customer', roles)


