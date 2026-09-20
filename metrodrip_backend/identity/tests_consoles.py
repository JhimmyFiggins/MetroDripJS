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

    def test_admin_roles_create_custom(self):
        res = self.client.post('/api/admin/roles/', {
            'role': 'dispatcher',
            'title': 'Warehouse Dispatcher',
            'description': 'Handles fulfillment packing and courier handoffs.',
            'permissions': ['manage_inventory', 'manage_orders'],
        }, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data['role'], 'dispatcher')
        self.assertTrue(AuditLog.objects.filter(action__contains='Warehouse Dispatcher').exists())

    def test_admin_settings_get_and_patch(self):
        # 1. GET settings
        res = self.client.get('/api/admin/settings/')
        self.assertEqual(res.status_code, 200)
        self.assertIn('store_name', res.data)
        self.assertIn('free_shipping_threshold', res.data)

        # 2. PATCH settings
        res = self.client.patch('/api/admin/settings/', {
            'free_shipping_threshold': 3000,
            'standard_shipping_rate': 140,
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['settings']['free_shipping_threshold'], 3000)
        self.assertEqual(res.data['settings']['standard_shipping_rate'], 140)
        self.assertTrue(AuditLog.objects.filter(action__contains='free_shipping_threshold').exists())

    def test_admin_user_reset_password(self):
        res = self.client.post(f'/api/admin/users/{self.customer.id}/reset-password/')
        self.assertEqual(res.status_code, 200)
        self.assertIn('reset_token', res.data)
        self.assertTrue(AuditLog.objects.filter(action__contains=f'#{self.customer.id}').exists())

    def test_admin_audit_logs_filter_and_export(self):
        # GET with search
        res = self.client.get('/api/admin/audit-logs/?search=Admin')
        self.assertEqual(res.status_code, 200)

        # GET export CSV
        res = self.client.get('/api/admin/audit-logs/export/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'text/csv')
        self.assertIn('Timestamp', res.content.decode('utf-8'))

    def test_merchant_shipments_get_and_post(self):
        # GET shipments
        res = self.client.get('/api/merchant/shipments/')
        self.assertEqual(res.status_code, 200)
        self.assertGreaterEqual(len(res.data), 1)

        # POST book shipment
        res = self.client.post('/api/merchant/shipments/', {
            'order_ref': 318,
            'carrier': 'NinjaVan Express',
        }, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertIn('waybill_no', res.data)
        self.assertEqual(res.data['order_ref'], 318)

    def test_merchant_shipping_eligibility(self):
        # NCR with free shipping qualification
        res = self.client.post('/api/merchant/shipping-zones/eligibility/', {
            'address': 'Salcedo Village, Makati City, Metro Manila',
            'subtotal': 2999,
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data['eligible'])
        self.assertTrue(res.data['free_shipping_applied'])
        self.assertEqual(res.data['final_fee'], 0)

        # VisMin with standard rate
        res = self.client.post('/api/merchant/shipping-zones/eligibility/', {
            'address': 'Cebu City, Visayas',
            'subtotal': 1200,
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data['eligible'])
        self.assertFalse(res.data['free_shipping_applied'])
        self.assertEqual(res.data['final_fee'], 150)

    def test_merchant_banners_get_and_patch(self):
        # GET banners
        res = self.client.get('/api/merchant/banners/')
        self.assertEqual(res.status_code, 200)
        self.assertGreaterEqual(len(res.data), 1)

        banner_id = res.data[0]['id']
        # PATCH banner
        res = self.client.patch(f'/api/merchant/banners/{banner_id}/', {
            'title': 'Cyber Heavyweight Drop 2026',
            'is_active': True,
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['title'], 'Cyber Heavyweight Drop 2026')

    def test_admin_users_api_negative_validation(self):
        # 1. Missing required email or name
        res = self.client.post('/api/admin/users/', {'name': 'No Email User'}, format='json')
        self.assertEqual(res.status_code, 400)

        # 2. Duplicate email registration
        res = self.client.post('/api/admin/users/', {
            'name': 'Duplicate Customer',
            'email': self.customer.email,
            'role': 'customer',
        }, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('already exists', res.data.get('error', ''))

        # 3. PATCH non-existent user PK
        res = self.client.patch('/api/admin/users/999999/', {'is_active': False}, format='json')
        self.assertEqual(res.status_code, 404)

        # 4. Reset password for non-existent user
        res = self.client.post('/api/admin/users/999999/reset-password/', format='json')
        self.assertEqual(res.status_code, 404)

    def test_admin_roles_api_negative(self):
        res = self.client.post('/api/admin/roles/', {
            'role': '',
            'title': '',
        }, format='json')
        self.assertEqual(res.status_code, 400)

    def test_admin_shipping_zones_negative(self):
        res = self.client.patch('/api/admin/shipping-zones/999999/', {'fee': 110}, format='json')
        self.assertEqual(res.status_code, 404)

    def test_merchant_products_api_negative(self):
        # Missing required name and sku
        res = self.client.post('/api/merchant/products/', {'price': 999}, format='json')
        self.assertEqual(res.status_code, 400)

        # Non-existent product GET
        res = self.client.get('/api/merchant/products/999999/')
        self.assertEqual(res.status_code, 404)

        # Non-existent product PATCH
        res = self.client.patch('/api/merchant/products/999999/', {'price': 1200}, format='json')
        self.assertEqual(res.status_code, 404)

    def test_merchant_review_reply_negative(self):
        # Empty reply text
        res = self.client.post(f'/api/merchant/reviews/{self.review.id}/reply/', {'reply': '   '}, format='json')
        self.assertEqual(res.status_code, 400)

        # Non-existent review
        res = self.client.post('/api/merchant/reviews/999999/reply/', {'reply': 'Thanks!'}, format='json')
        self.assertEqual(res.status_code, 404)

    def test_merchant_shipments_negative(self):
        # Missing order_ref
        res = self.client.post('/api/merchant/shipments/', {}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_merchant_shipping_eligibility_negative(self):
        # Empty address
        res = self.client.post('/api/merchant/shipping-zones/eligibility/', {'address': ''}, format='json')
        self.assertEqual(res.status_code, 400)

        # Unserviceable remote area
        res = self.client.post('/api/merchant/shipping-zones/eligibility/', {
            'address': 'Batanes Remote Island',
            'subtotal': 1500,
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertFalse(res.data['eligible'])
        self.assertEqual(res.data['final_fee'], 0)

    def test_merchant_banners_crud_and_negative(self):
        # Missing title
        res = self.client.post('/api/merchant/banners/', {'link_url': '/promo'}, format='json')
        self.assertEqual(res.status_code, 400)

        # Create new banner
        res = self.client.post('/api/merchant/banners/', {
            'title': 'QA Test Flash Banner',
            'link_url': '/flash',
            'is_active': False,
            'order': 6,
        }, format='json')
        self.assertEqual(res.status_code, 201)
        created_id = res.data['id']

        # Delete created banner
        del_res = self.client.delete(f'/api/merchant/banners/{created_id}/')
        self.assertEqual(del_res.status_code, 200)

        # Non-existent banner PATCH
        patch_res = self.client.patch('/api/merchant/banners/999999/', {'title': 'Ghost'}, format='json')
        self.assertEqual(patch_res.status_code, 404)

    def test_admin_and_merchant_logout(self):
        # Admin logout
        res_admin = self.client.post('/api/admin/logout/', {
            'actor': 'Admin Test User',
            'role': 'admin',
            'user_id': self.admin_user.id,
        }, format='json')
        self.assertEqual(res_admin.status_code, 200)
        self.assertTrue(res_admin.data['success'])

        # Verify audit entry
        latest_audit = AuditLog.objects.order_by('-created_at').first()
        self.assertEqual(latest_audit.actor, 'Admin Test User')
        self.assertIn('Signed out', latest_audit.action)

        # Merchant logout
        res_merch = self.client.post('/api/merchant/logout/', {
            'actor': 'Merchant Test User',
            'role': 'merchant',
        }, format='json')
        self.assertEqual(res_merch.status_code, 200)
        self.assertTrue(res_merch.data['success'])

    def test_get_switchable_users(self):
        res = self.client.get('/api/admin/switch-user/')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data['success'])
        self.assertGreaterEqual(len(res.data['users']), 2)

        # Filter by role
        res_admin_only = self.client.get('/api/admin/switch-user/?role=admin')
        self.assertEqual(res_admin_only.status_code, 200)
        for u in res_admin_only.data['users']:
            self.assertEqual(u['role'], 'admin')

    def test_switch_user_success(self):
        # Create a merchant user
        now = timezone.now()
        merchant_user = AccountsCustomer.objects.create(
            email='switch_merchant@metrodrip.ph',
            name='Switchable Merchant',
            role='merchant',
            is_active=True,
            is_staff=True,
            is_superuser=False,
            addresses=[],
            date_joined=now,
        )

        # Switch by user_id
        res = self.client.post('/api/admin/switch-user/', {
            'user_id': merchant_user.id,
            'current_actor': 'Test Admin',
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data['success'])
        self.assertEqual(res.data['user']['email'], 'switch_merchant@metrodrip.ph')
        self.assertEqual(res.data['redirect_url'], '/merchant/index.html')

        # Switch by email back to admin
        res2 = self.client.post('/api/merchant/switch-user/', {
            'email': self.admin_user.email,
            'current_actor': 'Switchable Merchant',
        }, format='json')
        self.assertEqual(res2.status_code, 200)
        self.assertEqual(res2.data['user']['email'], self.admin_user.email)
        self.assertEqual(res2.data['redirect_url'], '/admin/index.html')

    def test_switch_user_invalid_or_suspended(self):
        # Suspended user
        now = timezone.now()
        suspended_user = AccountsCustomer.objects.create(
            email='suspended_test@metrodrip.ph',
            name='Suspended Account',
            role='customer',
            is_active=False,
            is_staff=False,
            is_superuser=False,
            addresses=[],
            date_joined=now,
        )
        res = self.client.post('/api/admin/switch-user/', {'user_id': suspended_user.id}, format='json')
        self.assertEqual(res.status_code, 404)
        self.assertFalse(res.data['success'])

        # Non-existent user
        res_none = self.client.post('/api/admin/switch-user/', {'user_id': 999999}, format='json')
        self.assertEqual(res_none.status_code, 404)
        self.assertFalse(res_none.data['success'])





