from django.test import TestCase
from rest_framework.test import APIClient
from identity.models import AccountsCustomer, AuthToken, AccountsWishlistItem

class IdentityPermissionsAndWishlistTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.customer = AccountsCustomer.objects.create(
            email='customer1@metrodrip.ph',
            name='Customer One',
            role='customer',
            is_active=True,
        )
        self.customer.set_password('Password123!')
        self.customer.save()
        self.cust_token = AuthToken.objects.create(customer=self.customer)

        self.merchant = AccountsCustomer.objects.create(
            email='merchant1@metrodrip.ph',
            name='Merchant One',
            role='merchant',
            is_staff=True,
            is_active=True,
        )
        self.merchant.set_password('Password123!')
        self.merchant.save()
        self.merch_token = AuthToken.objects.create(customer=self.merchant)

        self.admin = AccountsCustomer.objects.create(
            email='admin1@metrodrip.ph',
            name='Admin One',
            role='admin',
            is_staff=True,
            is_superuser=True,
            is_active=True,
        )
        self.admin.set_password('Password123!')
        self.admin.save()
        self.admin_token = AuthToken.objects.create(customer=self.admin)

    def test_anonymous_user_denied_admin(self):
        res = self.client.get('/api/admin/dashboard/')
        self.assertIn(res.status_code, (401, 403))

    def test_invalid_token_denied(self):
        self.client.credentials(HTTP_AUTHORIZATION='Bearer invalid_token_12345')
        res = self.client.get('/api/admin/dashboard/')
        self.assertEqual(res.status_code, 401)

    def test_customer_role_denied_admin(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.cust_token.key}')
        res = self.client.get('/api/admin/dashboard/')
        self.assertEqual(res.status_code, 403)

    def test_admin_role_allowed_admin(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.admin_token.key}')
        res = self.client.get('/api/admin/dashboard/')
        self.assertEqual(res.status_code, 200)
        self.assertIn('metrics', res.data)

    def test_wishlist_lifecycle(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.cust_token.key}')
        
        # 1. Add item to wishlist
        res = self.client.post('/wishlist/', {'product_ref': 42}, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data['product_ref'], 42)

        # 2. Get wishlist
        res = self.client.get('/wishlist/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]['product_ref'], 42)

        # 3. Remove item from wishlist
        res = self.client.delete('/wishlist/', {'product_ref': 42}, format='json')
        self.assertEqual(res.status_code, 200)

        # 4. Verify empty
        res = self.client.get('/wishlist/')
        self.assertEqual(len(res.data), 0)
