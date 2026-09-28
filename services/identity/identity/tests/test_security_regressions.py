"""
Security regression tests for identity service.
These tests document and verify fixes for authentication/authorization defects.
"""
from django.test import TestCase
from rest_framework.test import APIClient
from identity.models import AccountsCustomer, AuthToken


class IdentitySecurityRegressionTests(TestCase):
    """Test cases for security defects in identity service."""

    def setUp(self):
        self.client = APIClient()
        self.customer = AccountsCustomer.objects.create(
            email='victim@metrodrip.ph',
            name='Victim User',
            role='customer',
            is_active=True,
        )
        self.customer.set_password('StrongPassword123!')
        self.customer.save()
        self.token = AuthToken.objects.create(customer=self.customer)

    def test_service_introspection_accepts_valid_body_token(self):
        # Existing service callers authenticate by possession of the body token.
        res = self.client.post('/api/identity/verify-token/', {'token': self.token.key}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['customer']['id'], self.customer.id)

    def test_verify_token_endpoint_works_with_valid_token(self):
        """Verify token endpoint works when properly authenticated."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token.key}')
        res = self.client.post('/api/identity/verify-token/', {'token': self.token.key}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data['valid'])
        self.assertEqual(res.data['customer']['email'], self.customer.email)

    def test_verify_token_rejects_invalid_token_when_unauthenticated(self):
        """Invalid tokens should be rejected with 401 when not authenticated."""
        # No authentication - provide invalid token in request body
        res = self.client.post('/api/identity/verify-token/', {'token': 'invalid_token_xyz'}, format='json')
        self.assertEqual(res.status_code, 401)
        self.assertFalse(res.data['valid'])

    def test_malformed_introspection_payloads_are_rejected(self):
        for payload in [[], {'token': []}, {'token': {'bad': 'shape'}}]:
            with self.subTest(payload=payload):
                self.assertEqual(self.client.post('/api/identity/verify-token/', payload, format='json').status_code, 400)


class InternalTokenSecurityTests(TestCase):
    """Test internal service token handling."""

    def setUp(self):
        self.client = APIClient()
        self.customer = AccountsCustomer.objects.create(
            email='internal_test@metrodrip.ph',
            name='Internal Test User',
            role='customer',
            is_active=True,
        )
        self.customer.set_password('Password123!')
        self.customer.save()

    def test_internal_token_requires_valid_user_id(self):
        """
        REGRESSION: Internal token with arbitrary X-User-ID could impersonate users.
        FIX: Internal token should validate user exists and is active.
        """
        # Valid internal token with valid user ID should work
        self.client.credentials(
            HTTP_X_INTERNAL_TOKEN='internal_service_mesh_secret_2026',
            HTTP_X_USER_ID=str(self.customer.id)
        )
        res = self.client.get('/profile/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['email'], self.customer.email)

    def test_internal_token_rejects_nonexistent_user(self):
        """Internal token with non-existent user ID should be rejected."""
        self.client.credentials(
            HTTP_X_INTERNAL_TOKEN='internal_service_mesh_secret_2026',
            HTTP_X_USER_ID='999999'
        )
        res = self.client.get('/profile/')
        # Should be 401 (unauthenticated) not 200
        self.assertIn(res.status_code, (401, 403))

    def test_internal_token_rejects_inactive_user(self):
        """Internal token with inactive user should be rejected."""
        self.customer.is_active = False
        self.customer.save()
        
        self.client.credentials(
            HTTP_X_INTERNAL_TOKEN='internal_service_mesh_secret_2026',
            HTTP_X_USER_ID=str(self.customer.id)
        )
        res = self.client.get('/profile/')
        self.assertIn(res.status_code, (401, 403))

    def test_invalid_internal_token_rejected(self):
        """Wrong internal token should not authenticate."""
        self.client.credentials(
            HTTP_X_INTERNAL_TOKEN='wrong_token',
            HTTP_X_USER_ID=str(self.customer.id)
        )
        res = self.client.get('/profile/')
        self.assertIn(res.status_code, (401, 403))
