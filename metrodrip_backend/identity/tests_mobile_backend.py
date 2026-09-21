from django.test import TestCase
from rest_framework.test import APIClient
from django.utils import timezone
from identity.models import AccountsCustomer, AccountsWishlistItem, AuditLog
from catalog.models import (
    CatalogCategory,
    CatalogProduct,
    CatalogColor,
    CatalogProductVariant,
    InventoryStockEntry,
)
from orders.models import OrdersOrder, OrdersOrderLine, OrdersShippingAddress, ReviewsReview


class MobileBackendAPITestCase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.now = timezone.now()

        # Seed test customer
        self.customer = AccountsCustomer.objects.create(
            name='Test Mobile User',
            email='mobileuser@metrodrip.ph',
            password='password123',
            phone='+639171234567',
            addresses={'address': 'Unit 402, Katipunan Ave, Quezon City'},
            role='customer',
            is_active=True,
            is_staff=False,
            is_superuser=False,
            date_joined=self.now,
        )

        self.customer2 = AccountsCustomer.objects.create(
            name='Second Customer',
            email='second@metrodrip.ph',
            password='password456',
            phone='+639189998877',
            addresses={},
            role='customer',
            is_active=True,
            is_staff=False,
            is_superuser=False,
            date_joined=self.now,
        )

        # Seed category
        self.category = CatalogCategory.objects.create(
            name='Hoodies & Jackets',
            slug='hoodies-jackets',
            description='Heavyweight streetwear outerwear',
            is_active=True,
            created_at=self.now,
            updated_at=self.now,
        )

        # Seed product
        self.product = CatalogProduct.objects.create(
            sku='MD-HOOD-01',
            name='Oversized Boxy Heavyweight Hoodie',
            description='450 GSM French Terry Cotton dropped shoulder hoodie',
            image_url='https://example.com/hoodie.jpg',
            category=self.category,
            base_price=2499.00,
            currency='PHP',
            is_active=True,
            is_featured=True,
            created_at=self.now,
            updated_at=self.now,
        )

        # Seed color and variant
        self.color = CatalogColor.objects.create(
            name='Washed Black',
            hex_code='#1C1C1E',
            is_active=True,
            created_at=self.now,
            updated_at=self.now,
        )

        self.variant = CatalogProductVariant.objects.create(
            product=self.product,
            color=self.color,
            sku='MD-HOOD-01-BLK-L',
            attributes={'size': 'L'},
            price_adjustment=0.00,
            is_active=True,
            created_at=self.now,
            updated_at=self.now,
        )

        # Seed stock
        self.stock = InventoryStockEntry.objects.create(
            product=self.product,
            variant=self.variant,
            warehouse_id=1,
            quantity=25,
            reserved_quantity=2,
            last_counted_at=self.now,
            created_at=self.now,
            updated_at=self.now,
        )

    # 1. AUTHENTICATION & LOGIN FLOW
    def test_signup_and_login_flow(self):
        signup_res = self.client.post('/signup/', {
            'name': 'New User',
            'email': 'newuser@metrodrip.ph',
            'password': 'securepass123',
        }, format='json')
        self.assertEqual(signup_res.status_code, 201)
        self.assertEqual(signup_res.data['name'], 'New User')
        self.assertEqual(signup_res.data['email'], 'newuser@metrodrip.ph')

        # Duplicate signup attempt
        duplicate_res = self.client.post('/signup/', {
            'name': 'Duplicate User',
            'email': 'newuser@metrodrip.ph',
            'password': 'securepass123',
        }, format='json')
        self.assertEqual(duplicate_res.status_code, 400)

        # Login with valid credentials
        login_res = self.client.post('/login/', {
            'email': 'newuser@metrodrip.ph',
            'password': 'securepass123',
        }, format='json')
        self.assertEqual(login_res.status_code, 200)
        self.assertEqual(login_res.data['email'], 'newuser@metrodrip.ph')

        # Login with invalid password
        bad_login = self.client.post('/login/', {
            'email': 'newuser@metrodrip.ph',
            'password': 'wrongpassword',
        }, format='json')
        self.assertEqual(bad_login.status_code, 401)

    # 2. FORGOT PASSWORD & PASSWORD RESET
    def test_forgot_password_flow(self):
        # Existing customer email
        res = self.client.post('/forgot-password/', {
            'email': 'mobileuser@metrodrip.ph',
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data['success'])

        # Check audit log was recorded
        audit = AuditLog.objects.filter(actor='Test Mobile User').first()
        self.assertIsNotNone(audit)

        # Alias route /password-reset/
        alias_res = self.client.post('/password-reset/', {
            'email': 'mobileuser@metrodrip.ph',
        }, format='json')
        self.assertEqual(alias_res.status_code, 200)

        # Nonexistent email
        missing_res = self.client.post('/forgot-password/', {
            'email': 'unknown@metrodrip.ph',
        }, format='json')
        self.assertEqual(missing_res.status_code, 404)

        # Empty email
        empty_res = self.client.post('/forgot-password/', {
            'email': '',
        }, format='json')
        self.assertEqual(empty_res.status_code, 400)

    # 3. PROFILE MANAGEMENT & HEADER RESILIENCE
    def test_profile_get_and_put(self):
        # GET with header
        get_res = self.client.get('/profile/', HTTP_X_CUSTOMER_ID=str(self.customer.id))
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.data['name'], 'Test Mobile User')

        # GET with Bearer token format
        bearer_res = self.client.get('/profile/', HTTP_AUTHORIZATION=f'Bearer {self.customer.id}')
        self.assertEqual(bearer_res.status_code, 200)
        self.assertEqual(bearer_res.data['email'], 'mobileuser@metrodrip.ph')

        # GET unauthenticated without any credentials
        anon_res = self.client.get('/profile/')
        self.assertEqual(anon_res.status_code, 401)

        # PUT with X-Customer-ID header
        put_res = self.client.put('/profile/', {
            'name': 'Updated Mobile User',
            'phone': '+639998887766',
            'addresses': {'address': 'Bonifacio Global City, Taguig'},
        }, HTTP_X_CUSTOMER_ID=str(self.customer.id), format='json')
        self.assertEqual(put_res.status_code, 200)
        self.assertEqual(put_res.data['name'], 'Updated Mobile User')
        self.assertEqual(put_res.data['phone'], '+639998887766')

        # PUT WITHOUT X-Customer-ID header (fallback via email in body like ProfileManagement.jsx)
        put_fallback_res = self.client.put('/profile/', {
            'email': 'mobileuser@metrodrip.ph',
            'name': 'Resilient Updated Name',
            'phone': '+639112223334',
            'addresses': {'address': 'Makati CBD, Metro Manila'},
        }, format='json')
        self.assertEqual(put_fallback_res.status_code, 200)
        self.assertEqual(put_fallback_res.data['name'], 'Resilient Updated Name')

        # PUT with email conflict
        conflict_res = self.client.put('/profile/', {
            'email': 'second@metrodrip.ph',
        }, HTTP_X_CUSTOMER_ID=str(self.customer.id), format='json')
        self.assertEqual(conflict_res.status_code, 400)

    # 4. WISHLIST OPERATIONS
    def test_wishlist_lifecycle(self):
        # Add item to wishlist
        add_res = self.client.post('/wishlist/', {
            'product_ref': self.product.id,
        }, HTTP_X_CUSTOMER_ID=str(self.customer.id), format='json')
        self.assertEqual(add_res.status_code, 201)
        item_id = add_res.data['id']
        self.assertTrue(add_res.data['created'])

        # Duplicate click should not create duplicate row
        dup_res = self.client.post('/wishlist/', {
            'product_ref': self.product.id,
        }, HTTP_X_CUSTOMER_ID=str(self.customer.id), format='json')
        self.assertEqual(dup_res.status_code, 201)
        self.assertFalse(dup_res.data['created'])
        self.assertEqual(AccountsWishlistItem.objects.filter(customer=self.customer).count(), 1)

        # GET wishlist with product metadata
        get_res = self.client.get('/wishlist/', HTTP_X_CUSTOMER_ID=str(self.customer.id))
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(len(get_res.data), 1)
        self.assertEqual(get_res.data[0]['name'], self.product.name)
        self.assertEqual(get_res.data[0]['product_ref'], self.product.id)

        # DELETE wishlist item
        del_res = self.client.delete('/wishlist/', {
            'id': item_id,
        }, HTTP_X_CUSTOMER_ID=str(self.customer.id), format='json')
        self.assertEqual(del_res.status_code, 200)
        self.assertEqual(AccountsWishlistItem.objects.filter(customer=self.customer).count(), 0)

        # DELETE non-existent wishlist item
        del_missing = self.client.delete('/wishlist/', {
            'id': 99999,
        }, HTTP_X_CUSTOMER_ID=str(self.customer.id), format='json')
        self.assertEqual(del_missing.status_code, 404)

    # 5. PRODUCT REVIEWS API (GET & POST)
    def test_product_reviews_endpoints(self):
        # GET reviews before any are posted
        get_empty = self.client.get(f'/products/{self.product.id}/reviews/')
        self.assertEqual(get_empty.status_code, 200)
        self.assertEqual(get_empty.data['stats']['count'], 0)
        self.assertEqual(get_empty.data['reviews'], [])

        # POST review with valid data
        post_res = self.client.post(f'/products/{self.product.id}/reviews/', {
            'rating': 5,
            'comment': 'Heavyweight fleece is top tier. Dropped shoulders sit just right.',
            'author': 'Bea S.',
        }, format='json')
        self.assertEqual(post_res.status_code, 201)
        self.assertEqual(post_res.data['review']['rating'], 5)
        self.assertEqual(post_res.data['review']['author'], 'Bea S.')

        # POST authenticated review (author auto-populated from customer)
        post_auth = self.client.post(f'/products/{self.product.id}/reviews/', {
            'rating': 4,
            'comment': 'Solid fabric and finish, fits oversize.',
        }, HTTP_X_CUSTOMER_ID=str(self.customer.id), format='json')
        self.assertEqual(post_auth.status_code, 201)
        self.assertEqual(post_auth.data['review']['author'], self.customer.name)

        # GET reviews list and verify statistics
        get_res = self.client.get(f'/products/{self.product.id}/reviews/')
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.data['stats']['count'], 2)
        self.assertEqual(get_res.data['stats']['average'], 4.5)
        self.assertEqual(get_res.data['stats']['breakdown'][5], 1)
        self.assertEqual(get_res.data['stats']['breakdown'][4], 1)

        # POST invalid rating
        bad_rating = self.client.post(f'/products/{self.product.id}/reviews/', {
            'rating': 10,
            'comment': 'Too big',
        }, format='json')
        self.assertEqual(bad_rating.status_code, 400)

        # POST empty comment
        bad_comment = self.client.post(f'/products/{self.product.id}/reviews/', {
            'rating': 5,
            'comment': '',
        }, format='json')
        self.assertEqual(bad_comment.status_code, 400)

    # 6. ORDERS & CHECKOUT FLOW
    def test_orders_creation_and_history(self):
        order_payload = {
            'status': 'pending',
            'subtotal': '2499.00',
            'tax': '0.00',
            'shipping': '150.00',
            'discount': '0.00',
            'total': '2649.00',
            'currency': 'PHP',
            'lines': [
                {
                    'product': self.product.id,
                    'variant': self.variant.id,
                    'quantity': 1,
                    'unit_price': '2499.00',
                    'discount_amount': '0.00',
                    'tax_amount': '0.00',
                    'tax_rate': '0.0000',
                }
            ],
            'shipping_address': {
                'name': 'Test Mobile User',
                'address_line1': 'Unit 402, Katipunan Ave',
                'address_line2': '',
                'city': 'Quezon City',
                'state': 'Metro Manila',
                'postal_code': '1108',
                'country': 'PH',
                'phone': '+639171234567',
            }
        }

        # Create order
        create_res = self.client.post(
            '/orders/',
            order_payload,
            HTTP_X_CUSTOMER_ID=str(self.customer.id),
            format='json'
        )
        self.assertEqual(create_res.status_code, 201)
        order_id = create_res.data['id']
        self.assertEqual(create_res.data['customer_id'], self.customer.id)
        self.assertEqual(len(create_res.data['lines']), 1)
        self.assertEqual(create_res.data['lines'][0]['product_name'], self.product.name)
        self.assertEqual(create_res.data['lines'][0]['variant_color'], self.color.name)

        # Retrieve customer order history
        history_res = self.client.get('/orders/', HTTP_X_CUSTOMER_ID=str(self.customer.id))
        self.assertEqual(history_res.status_code, 200)
        self.assertEqual(len(history_res.data), 1)
        self.assertEqual(history_res.data[0]['id'], order_id)

        # Retrieve specific order detail
        detail_res = self.client.get(f'/orders/{order_id}/', HTTP_X_CUSTOMER_ID=str(self.customer.id))
        self.assertEqual(detail_res.status_code, 200)
        self.assertEqual(detail_res.data['id'], order_id)
        self.assertEqual(detail_res.data['shipping_address']['city'], 'Quezon City')

        # Test guest order creation (customer_id is null, no header)
        guest_payload = order_payload.copy()
        guest_create = self.client.post('/orders/', guest_payload, format='json')
        self.assertEqual(guest_create.status_code, 201)
        self.assertIsNone(guest_create.data['customer_id'])

    # 7. PRODUCT CATALOG FILTERING & VARIANTS
    def test_catalog_search_and_variants(self):
        # Filter by category
        cat_res = self.client.get(f'/products/?category={self.category.id}')
        self.assertEqual(cat_res.status_code, 200)
        self.assertGreaterEqual(len(cat_res.data), 1)

        # Search by keyword
        search_res = self.client.get('/products/?search=Heavyweight')
        self.assertEqual(search_res.status_code, 200)
        self.assertEqual(len(search_res.data), 1)
        self.assertEqual(search_res.data[0]['sku'], 'MD-HOOD-01')

        # Variant list
        var_res = self.client.get(f'/products/{self.product.id}/variants/')
        self.assertEqual(var_res.status_code, 200)
        self.assertEqual(len(var_res.data), 1)
        self.assertEqual(var_res.data[0]['color_name'], self.color.name)

        # Stock check
        stock_res = self.client.get(f'/variants/{self.variant.id}/stock/')
        self.assertEqual(stock_res.status_code, 200)
        self.assertGreaterEqual(len(stock_res.data), 1)
        self.assertEqual(stock_res.data[0]['available_stock'], 23)  # 25 - 2
