from django.test import TestCase
from rest_framework.test import APIClient
from identity.models import AccountsCustomer, AuthToken

class IdentityAuthTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.customer = AccountsCustomer(
            email='testuser@metrodrip.ph',
            name='Test User',
            role='customer',
            is_active=True,
        )
        self.customer.set_password('CorrectPassword123!')
        self.customer.save()

    def test_health_check(self):
        res = self.client.get('/health/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['service'], 'identity')

    def test_signup_hashes_password_and_returns_token(self):
        payload = {
            'email': 'newcustomer@metrodrip.ph',
            'name': 'New Customer',
            'password': 'StrongPassword2026!',
            'phone': '+639171112222',
        }
        res = self.client.post('/signup/', payload, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertIn('token', res.data)
        
        # Verify in database: password must NOT be plaintext
        created = AccountsCustomer.objects.get(email='newcustomer@metrodrip.ph')
        self.assertNotEqual(created.password, 'StrongPassword2026!')
        self.assertTrue(created.password.startswith('pbkdf2_') or created.password.startswith('argon2'))
        self.assertTrue(created.check_password('StrongPassword2026!'))

    def test_login_success_and_token_issuance(self):
        res = self.client.post('/login/', {
            'email': 'testuser@metrodrip.ph',
            'password': 'CorrectPassword123!',
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertIn('token', res.data)
        self.assertEqual(res.data['email'], 'testuser@metrodrip.ph')

    def test_login_invalid_password_rejected(self):
        res = self.client.post('/login/', {
            'email': 'testuser@metrodrip.ph',
            'password': 'WrongPassword!',
        }, format='json')
        self.assertEqual(res.status_code, 401)
        self.assertNotIn('token', res.data)

    def test_legacy_plaintext_password_migrates_on_login(self):
        legacy = AccountsCustomer(
            email='legacy@metrodrip.ph',
            name='Legacy Customer',
            password='PlaintextPassword123',
            role='customer',
            is_active=True,
        )
        legacy.save()

        # Login with plaintext password
        res = self.client.post('/login/', {
            'email': 'legacy@metrodrip.ph',
            'password': 'PlaintextPassword123',
        }, format='json')
        self.assertEqual(res.status_code, 200)
        
        # Database password should now be hashed
        legacy.refresh_from_db()
        self.assertTrue(legacy.password.startswith('pbkdf2_') or legacy.password.startswith('argon2'))
        self.assertNotEqual(legacy.password, 'PlaintextPassword123')

    def test_verify_token_endpoint(self):
        token = AuthToken.objects.create(customer=self.customer)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token.key}')
        res = self.client.post('/api/identity/verify-token/', {'token': token.key}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data['valid'])
        self.assertEqual(res.data['customer']['email'], self.customer.email)
