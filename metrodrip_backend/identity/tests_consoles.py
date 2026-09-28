from datetime import timedelta

from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from identity.models import AccountsCustomer, AuditLog, CustomerAccessToken
from catalog.models import (
    CatalogCategory,
    CatalogProduct,
    CatalogProductVariant,
    InventoryStockEntry,
    InventoryStockMovement,
)
from content.models import CmsHomepageBanner
from orders.models import (
    OrdersOrder,
    OrdersOrderLine,
    OrdersPayment,
    OrdersShippingAddress,
    ReviewsReview,
)
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
        self.merchant_user = AccountsCustomer.objects.create(
            email='testmerchant@metrodrip.ph',
            name='Test Merchant',
            role='merchant',
            is_active=True,
            is_staff=True,
            is_superuser=False,
            addresses=[],
            date_joined=now,
        )
        _, self.admin_token = CustomerAccessToken.issue(self.admin_user)
        _, self.merchant_token = CustomerAccessToken.issue(self.merchant_user)
        _, self.customer_token = CustomerAccessToken.issue(self.customer)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.admin_token}')

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
        self.order = OrdersOrder.objects.create(
            id=318,
            customer_id=self.customer.id,
            status='placed',
            subtotal=1249,
            tax=0,
            shipping=85,
            discount=0,
            total=1334,
            currency='PHP',
            created_at=now,
            updated_at=now,
        )
        OrdersOrderLine.objects.create(
            order=self.order,
            product=self.product,
            variant=self.variant,
            quantity=1,
            unit_price=1249,
            total_price=1249,
            discount_amount=0,
            tax_amount=0,
            tax_rate=0,
            created_at=now,
            updated_at=now,
        )
        OrdersShippingAddress.objects.create(
            order=self.order,
            name='Test Customer',
            address_line1='21 Maginhawa Street',
            address_line2='',
            city='Quezon City',
            state='Metro Manila',
            postal_code='1101',
            country='PH',
            phone='09170000000',
            created_at=now,
            updated_at=now,
        )
        OrdersPayment.objects.create(
            order=self.order,
            method='cod',
            status='pending_collection',
            amount=1334,
            currency='PHP',
            provider='cod',
            metadata={},
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
        created = AccountsCustomer.objects.get(email='staff@metrodrip.ph')
        self.assertFalse(created.check_password('pbkdf2_sha256$placeholder'))
        self.assertTrue(res.data['password_setup_required'])
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

        invalid = self.client.post(f'/api/merchant/reviews/{self.review.id}/moderate/', {
            'status': 'featured',
        }, format='json')
        self.assertEqual(invalid.status_code, 400)

        missing = self.client.post('/api/merchant/reviews/999999/moderate/', {
            'status': 'rejected',
        }, format='json')
        self.assertEqual(missing.status_code, 404)

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
        self.assertEqual(res.status_code, 501)
        self.assertEqual(res.data['code'], 'role_persistence_unconfigured')
        self.assertFalse(AuditLog.objects.filter(action__contains='Warehouse Dispatcher').exists())

    def test_admin_settings_get_and_patch(self):
        res = self.client.get('/api/admin/settings/')
        self.assertEqual(res.status_code, 501)
        self.assertEqual(res.data['code'], 'settings_persistence_unconfigured')

        res = self.client.patch('/api/admin/settings/', {
            'free_shipping_threshold': 3000,
            'standard_shipping_rate': 140,
        }, format='json')
        self.assertEqual(res.status_code, 501)
        self.assertEqual(res.data['code'], 'settings_persistence_unconfigured')
        self.assertFalse(AuditLog.objects.filter(action__contains='free_shipping_threshold').exists())

    def test_admin_user_reset_password(self):
        res = self.client.post(f'/api/admin/users/{self.customer.id}/reset-password/')
        self.assertEqual(res.status_code, 501)
        self.assertEqual(res.data['code'], 'reset_delivery_unconfigured')
        self.assertNotIn('reset_token', res.data)
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
        self.assertEqual(res.data, [])

        # POST book shipment
        res = self.client.post('/api/merchant/shipments/', {
            'order_ref': 318,
            'carrier': 'NinjaVan Express',
        }, format='json')
        self.assertEqual(res.status_code, 501)
        self.assertEqual(res.data['code'], 'carrier_integration_unconfigured')
        self.assertNotIn('waybill_no', res.data)

    def test_merchant_shipping_eligibility(self):
        res = self.client.post('/api/merchant/shipping-zones/eligibility/', {
            'address': 'Salcedo Village, Makati City, Metro Manila',
            'subtotal': 2999,
        }, format='json')
        self.assertEqual(res.status_code, 501)
        self.assertEqual(res.data['code'], 'shipping_eligibility_unconfigured')
        self.assertNotIn('final_fee', res.data)

    def test_merchant_banners_get_and_patch(self):
        created = self.client.post('/api/merchant/banners/', {
            'title': 'Verified banner',
            'headline': 'Verified storefront headline',
            'subtext': 'Persisted supporting copy',
            'button_label': 'Shop verified',
            'placement': 'Announcement bar',
            'link_url': '/shop',
            'is_active': False,
            'order': 1,
        }, format='json')
        self.assertEqual(created.status_code, 201)

        banner_id = created.data['id']
        # PATCH banner
        res = self.client.patch(f'/api/merchant/banners/{banner_id}/', {
            'title': 'Cyber Heavyweight Drop 2026',
            'status': 'Scheduled',
            'starts_at': (timezone.now() + timedelta(days=1)).isoformat(),
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['title'], 'Cyber Heavyweight Drop 2026')
        self.assertEqual(res.data['headline'], 'Verified storefront headline')
        self.assertEqual(res.data['subtext'], 'Persisted supporting copy')
        self.assertEqual(res.data['button_label'], 'Shop verified')
        self.assertEqual(res.data['placement'], 'announcement_bar')
        self.assertEqual(res.data['placement_source'], 'persisted')
        self.assertEqual(res.data['status'], 'Scheduled')

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

        # Structured values must be rejected instead of reaching string methods.
        res = self.client.post('/api/admin/users/', {
            'name': {'unexpected': 'object'},
            'email': ['not', 'an', 'email'],
            'role': 'customer',
        }, format='json')
        self.assertEqual(res.status_code, 400)

    def test_admin_roles_api_negative(self):
        res = self.client.post('/api/admin/roles/', {
            'role': '',
            'title': '',
        }, format='json')
        self.assertEqual(res.status_code, 501)
        self.assertEqual(res.data['code'], 'role_persistence_unconfigured')

    def test_admin_shipping_zones_negative(self):
        res = self.client.patch('/api/admin/shipping-zones/999999/', {'fee': 110}, format='json')
        self.assertEqual(res.status_code, 404)

        zone = ShippingShippingZone.objects.first()
        invalid_fee = self.client.patch(f'/api/admin/shipping-zones/{zone.id}/', {'fee': 'free'}, format='json')
        self.assertEqual(invalid_fee.status_code, 400)

        negative_fee = self.client.patch(f'/api/admin/shipping-zones/{zone.id}/', {'fee': -1}, format='json')
        self.assertEqual(negative_fee.status_code, 400)

        string_boolean = self.client.patch(
            f'/api/admin/shipping-zones/{zone.id}/',
            {'is_active': 'false'},
            format='json',
        )
        self.assertEqual(string_boolean.status_code, 400)

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

        valid_product = {
            'name': 'Truthful Product',
            'category': self.cat.name,
            'sku': 'MD-TRUTH-001',
            'price': 999,
            'stock': 4,
        }
        for field, invalid_value in (
            ('price', 'not-a-price'),
            ('price', -1),
            ('stock', -1),
            ('stock', 1.5),
            ('stock', False),
        ):
            payload = dict(valid_product)
            payload[field] = invalid_value
            invalid = self.client.post('/api/merchant/products/', payload, format='json')
            self.assertEqual(invalid.status_code, 400)

        created = self.client.post('/api/merchant/products/', valid_product, format='json')
        self.assertEqual(created.status_code, 201)
        created_product = CatalogProduct.objects.get(pk=created.data['id'])
        created_variant = created_product.variants.get()
        self.assertEqual(created_variant.sku, valid_product['sku'])
        self.assertEqual(created_variant.attributes, {})

        invalid_active = self.client.patch(
            f'/api/merchant/products/{self.product.id}/',
            {'is_active': 'false'},
            format='json',
        )
        self.assertEqual(invalid_active.status_code, 400)

        self.stock.reserved_quantity = 2
        self.stock.save(update_fields=['reserved_quantity'])
        below_reserved = self.client.patch(
            f'/api/merchant/products/{self.product.id}/',
            {'stock': 1},
            format='json',
        )
        self.assertEqual(below_reserved.status_code, 409)
        self.assertEqual(below_reserved.data['code'], 'stock_reserved')

        InventoryStockEntry.objects.create(
            product=self.product,
            variant=self.variant,
            warehouse_id=2,
            quantity=5,
            reserved_quantity=0,
            last_counted_at=timezone.now(),
            created_at=timezone.now(),
            updated_at=timezone.now(),
        )
        ambiguous = self.client.patch(
            f'/api/merchant/products/{self.product.id}/',
            {'stock': 10},
            format='json',
        )
        self.assertEqual(ambiguous.status_code, 409)
        self.assertEqual(ambiguous.data['code'], 'warehouse_stock_ambiguous')

    def test_merchant_category_and_review_text_validation(self):
        category = self.client.post('/api/merchant/categories/', {
            'name': {'unexpected': 'object'},
            'description': 'Invalid structured name',
        }, format='json')
        self.assertEqual(category.status_code, 400)

        reply = self.client.post(
            f'/api/merchant/reviews/{self.review.id}/reply/',
            {'reply': ['not', 'text']},
            format='json',
        )
        self.assertEqual(reply.status_code, 400)

    def test_merchant_review_reply_negative(self):
        # Empty reply text
        res = self.client.post(f'/api/merchant/reviews/{self.review.id}/reply/', {'reply': '   '}, format='json')
        self.assertEqual(res.status_code, 400)

        # Non-existent review
        res = self.client.post('/api/merchant/reviews/999999/reply/', {'reply': 'Thanks!'}, format='json')
        self.assertEqual(res.status_code, 404)

    def test_merchant_empty_collections_do_not_return_or_create_demo_data(self):
        self.review.delete()

        reviews = self.client.get('/api/merchant/reviews/')
        movements = self.client.get('/api/merchant/inventory/movements/')
        banners = self.client.get('/api/merchant/banners/')

        self.assertEqual(reviews.status_code, 200)
        self.assertEqual(reviews.data, [])
        self.assertEqual(movements.status_code, 200)
        self.assertEqual(movements.data, [])
        self.assertEqual(banners.status_code, 200)
        self.assertEqual(banners.data, [])
        self.assertFalse(CmsHomepageBanner.objects.exists())

    def test_merchant_restock_rejects_false_success_inputs(self):
        missing_variant = self.client.post('/api/merchant/inventory/restock/', {
            'sku': 'UNKNOWN-SKU',
            'quantity': 5,
            'reason': 'restock',
        }, format='json')
        self.assertEqual(missing_variant.status_code, 404)

        invalid_quantity = self.client.post('/api/merchant/inventory/restock/', {
            'sku': self.variant.sku,
            'quantity': 0,
            'reason': 'restock',
        }, format='json')
        self.assertEqual(invalid_quantity.status_code, 400)

        invalid_reason = self.client.post('/api/merchant/inventory/restock/', {
            'sku': self.variant.sku,
            'quantity': 5,
            'reason': 'sale',
        }, format='json')
        self.assertEqual(invalid_reason.status_code, 400)

    def test_merchant_shipments_negative(self):
        # Missing order_ref
        res = self.client.post('/api/merchant/shipments/', {}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_merchant_shipping_eligibility_negative(self):
        # Empty address
        res = self.client.post('/api/merchant/shipping-zones/eligibility/', {'address': ''}, format='json')
        self.assertEqual(res.status_code, 400)

        res = self.client.post('/api/merchant/shipping-zones/eligibility/', {
            'address': 'Batanes Remote Island',
            'subtotal': 1500,
        }, format='json')
        self.assertEqual(res.status_code, 501)
        self.assertEqual(res.data['code'], 'shipping_eligibility_unconfigured')

    def test_merchant_shipping_zone_patch_validates_types(self):
        zone = ShippingShippingZone.objects.first()

        invalid_fee = self.client.patch(f'/api/merchant/shipping-zones/{zone.id}/', {
            'fee': 'not-a-number',
        }, format='json')
        self.assertEqual(invalid_fee.status_code, 400)

        invalid_boolean = self.client.patch(f'/api/merchant/shipping-zones/{zone.id}/', {
            'is_active': 'false',
        }, format='json')
        self.assertEqual(invalid_boolean.status_code, 400)

    def test_merchant_analytics_fails_closed_without_instrumentation(self):
        res = self.client.get('/api/merchant/analytics/')
        self.assertEqual(res.status_code, 501)
        self.assertEqual(res.data['code'], 'analytics_unconfigured')
        self.assertNotIn('kpis', res.data)

    def test_merchant_banners_crud_and_negative(self):
        # Missing title
        res = self.client.post('/api/merchant/banners/', {'link_url': '/promo'}, format='json')
        self.assertEqual(res.status_code, 400)

        invalid_boolean = self.client.post('/api/merchant/banners/', {
            'title': 'Invalid state banner',
            'is_active': 'false',
        }, format='json')
        self.assertEqual(invalid_boolean.status_code, 400)

        unsafe_link = self.client.post('/api/merchant/banners/', {
            'title': 'Unsafe link banner',
            'link_url': 'javascript:alert(1)',
            'is_active': False,
        }, format='json')
        self.assertEqual(unsafe_link.status_code, 400)

        missing_schedule = self.client.post('/api/merchant/banners/', {
            'title': 'Missing schedule',
            'link_url': '/scheduled',
            'status': 'Scheduled',
        }, format='json')
        self.assertEqual(missing_schedule.status_code, 400)

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
        res_admin = self.client.post('/api/admin/logout/', {
            'actor': 'Forged Actor',
            'role': 'customer',
        }, format='json')
        self.assertEqual(res_admin.status_code, 200)
        self.assertTrue(res_admin.data['success'])

        latest_audit = AuditLog.objects.order_by('-created_at').first()
        self.assertEqual(latest_audit.actor, self.admin_user.name)
        self.assertIn('Signed out', latest_audit.action)

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        res_merch = self.client.post('/api/merchant/logout/', format='json')
        self.assertEqual(res_merch.status_code, 200)
        self.assertTrue(res_merch.data['success'])

    def test_client_side_account_switching_is_retired(self):
        res = self.client.get('/api/admin/switch-user/')
        self.assertEqual(res.status_code, 410)
        self.assertFalse(res.data['success'])
        self.assertNotIn('users', res.data)

        post_res = self.client.post('/api/admin/switch-user/', {'user_id': self.merchant_user.id}, format='json')
        self.assertEqual(post_res.status_code, 410)
        self.assertNotIn('user', post_res.data)

        merchant_route = self.client.get('/api/merchant/switch-user/')
        self.assertEqual(merchant_route.status_code, 404)

    def test_staff_role_boundaries_are_server_enforced(self):
        anonymous = APIClient()
        self.assertEqual(anonymous.get('/api/admin/users/').status_code, 401)
        self.assertEqual(anonymous.get('/api/merchant/orders/').status_code, 401)

        customer_client = APIClient()
        customer_client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.customer_token}')
        self.assertEqual(customer_client.get('/api/admin/users/').status_code, 403)
        self.assertEqual(customer_client.get('/api/merchant/orders/').status_code, 403)

        merchant_client = APIClient()
        merchant_client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        self.assertEqual(merchant_client.get('/api/admin/users/').status_code, 403)
        self.assertEqual(merchant_client.get('/api/merchant/orders/').status_code, 200)

    def test_user_me_profile_and_security(self):
        _, raw_token = CustomerAccessToken.issue(self.admin_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {raw_token}')
        # 1. GET /users/me/
        get_res = self.client.get('/users/me/', HTTP_X_CUSTOMER_ID=str(self.admin_user.id))
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.data['email'], self.admin_user.email)
        self.assertEqual(get_res.data['role'], 'admin')
        self.assertIn('preferences', get_res.data)
        self.assertIn('sessions', get_res.data)

        # 2. PUT /users/me/ update attributes
        put_res = self.client.put('/users/me/', {
            'name': 'Updated Admin Name',
            'phone': '+639170001122',
            'avatar': 'data:image/png;base64,sampleavatar',
            'preferences': {'table_density': 'compact', 'theme': 'dark'},
        }, HTTP_X_CUSTOMER_ID=str(self.admin_user.id), format='json')
        self.assertEqual(put_res.status_code, 200)
        self.assertEqual(put_res.data['name'], 'Updated Admin Name')
        self.assertEqual(put_res.data['phone'], '+639170001122')
        self.assertEqual(put_res.data['avatar'], 'data:image/png;base64,sampleavatar')

        # 3. POST /users/me/password/ with NIST SP 800-63B validation
        # Too short (< 8 chars)
        short_res = self.client.post('/users/me/password/', {
            'current_password': '',
            'new_password': 'short',
            'confirm_password': 'short',
        }, HTTP_X_CUSTOMER_ID=str(self.admin_user.id), format='json')
        self.assertEqual(short_res.status_code, 400)
        self.assertIn('NIST SP 800-63B requirement', short_res.data['error'])

        # Easily guessable (contains 'password' or 'metrodrip')
        guessable_res = self.client.post('/users/me/password/', {
            'current_password': '',
            'new_password': 'metrodrippassword123',
            'confirm_password': 'metrodrippassword123',
        }, HTTP_X_CUSTOMER_ID=str(self.admin_user.id), format='json')
        self.assertEqual(guessable_res.status_code, 400)
        self.assertIn('easily guessable', guessable_res.data['error'])

        # Valid rotation
        valid_res = self.client.post('/users/me/password/', {
            'current_password': '',
            'new_password': 'CorrectHorseBatteryStaple99!',
            'confirm_password': 'CorrectHorseBatteryStaple99!',
        }, HTTP_X_CUSTOMER_ID=str(self.admin_user.id), format='json')
        self.assertEqual(valid_res.status_code, 200)
        self.assertTrue(valid_res.data['success'])

        # 4. MFA never accepts arbitrary six-digit codes without a configured provider.
        mfa_enable = self.client.post('/users/me/mfa/', {
            'code': '849201',
        }, HTTP_X_CUSTOMER_ID=str(self.admin_user.id), format='json')
        self.assertEqual(mfa_enable.status_code, 501)
        self.assertEqual(mfa_enable.data['code'], 'mfa_unconfigured')

        mfa_disable = self.client.post('/users/me/mfa/', {
            'enabled': False,
        }, HTTP_X_CUSTOMER_ID=str(self.admin_user.id), format='json')
        self.assertEqual(mfa_disable.status_code, 501)

        # 5. POST /users/me/sessions/revoke/
        revoke_res = self.client.post('/users/me/sessions/revoke/', {
            'revoke_all': True,
        }, HTTP_X_CUSTOMER_ID=str(self.admin_user.id), format='json')
        self.assertEqual(revoke_res.status_code, 200)
        self.assertEqual(len(revoke_res.data['sessions']), 1)  # Only current session kept
