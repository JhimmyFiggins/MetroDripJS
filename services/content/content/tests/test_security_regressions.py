"""
Security regression tests for content service.
These tests document and verify fixes for authentication/authorization defects.
"""
from django.test import TestCase
from rest_framework.test import APIClient
from content.models import CmsHomepageBanner, CmsContactMessage
from unittest.mock import patch
import json


class ContentMerchantAuthRegressionTests(TestCase):
    """Test merchant endpoint authentication/authorization in content service."""

    def setUp(self):
        self.client = APIClient()
        self.banner = CmsHomepageBanner.objects.create(
            title='Test Banner', image_url='/assets/banners/test.jpg',
            link_url='/shop', is_active=True, order=1
        )
        self.message = CmsContactMessage.objects.create(
            name='John Doe', email='john@example.com',
            message='Test message', is_resolved=False
        )

    def test_merchant_banners_list_requires_authentication(self):
        """
        REGRESSION: MerchantBannersAPIView had no authentication.
        FIX: Should require internal token + merchant/admin role.
        """
        res = self.client.get('/api/merchant/banners/')
        self.assertIn(res.status_code, (401, 403))

    def test_merchant_banners_create_requires_authentication(self):
        """POST to create banner should require authentication."""
        res = self.client.post('/api/merchant/banners/', {
            'title': 'New Banner', 'link_url': '/promo', 'is_active': True, 'order': 5
        }, format='json')
        self.assertIn(res.status_code, (401, 403))

    def test_merchant_banner_detail_patch_requires_authentication(self):
        """PATCH banner detail should require authentication."""
        res = self.client.patch(f'/api/merchant/banners/{self.banner.id}/', 
                                {'title': 'Updated'}, format='json')
        self.assertIn(res.status_code, (401, 403))

    def test_merchant_banner_detail_delete_requires_authentication(self):
        """DELETE banner should require authentication."""
        res = self.client.delete(f'/api/merchant/banners/{self.banner.id}/')
        self.assertIn(res.status_code, (401, 403))

    def test_merchant_contact_messages_list_requires_authentication(self):
        """
        REGRESSION: ContactMessagesAPIView GET (merchant view) had no authentication.
        FIX: Should require internal token + merchant/admin role.
        """
        res = self.client.get('/api/merchant/contact-messages/')
        self.assertIn(res.status_code, (401, 403))

    def test_merchant_contact_message_detail_requires_authentication(self):
        """PATCH contact message detail should require authentication."""
        res = self.client.patch(f'/api/merchant/contact-messages/{self.message.id}/', 
                                {'is_resolved': True}, format='json')
        self.assertIn(res.status_code, (401, 403))

    def test_public_banners_remains_public(self):
        """Public banners endpoint should remain accessible without auth."""
        res = self.client.get('/banners/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)

    def test_public_contact_form_remains_public(self):
        """Public contact form POST should remain accessible without auth."""
        res = self.client.post('/contact/', {
            'name': 'Jane', 'email': 'jane@example.com', 'message': 'Hello'
        }, format='json')
        self.assertEqual(res.status_code, 201)

    def test_merchant_banners_with_valid_internal_token(self):
        """Valid internal token with merchant role should allow access."""
        self.client.credentials(
            HTTP_X_INTERNAL_TOKEN='internal_service_mesh_secret_2026',
            HTTP_X_USER_ID='1',
            HTTP_X_USER_ROLE='merchant'
        )
        res = self.client.get('/api/merchant/banners/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 1)


class ContentInternalTokenValidationTests(TestCase):
    """Test internal token validation in content service."""

    def setUp(self):
        self.client = APIClient()

    @patch('content.authentication.urllib.request.urlopen')
    def test_bearer_access_uses_verified_role(self, upstream):
        upstream.return_value.__enter__.return_value.read.return_value = json.dumps({
            'valid': True, 'customer': {'id': 1, 'role': 'merchant'}}).encode()
        self.client.credentials(HTTP_AUTHORIZATION='Bearer fixture')
        self.assertEqual(self.client.get('/api/merchant/banners/').status_code, 200)
        upstream.return_value.__enter__.return_value.read.return_value = json.dumps({
            'valid': True, 'customer': {'id': 1, 'role': 'customer'}}).encode()
        self.client.credentials(HTTP_AUTHORIZATION='Bearer fixture', HTTP_X_USER_ROLE='admin')
        self.assertEqual(self.client.get('/api/merchant/banners/').status_code, 403)

    @patch('content.authentication.urllib.request.urlopen', side_effect=OSError('unavailable'))
    def test_identity_outage_fails_closed(self, upstream):
        self.client.credentials(HTTP_AUTHORIZATION='Bearer fixture')
        self.assertEqual(self.client.get('/api/merchant/banners/').status_code, 403)

    def test_empty_banner_get_does_not_create_demo_records(self):
        self.client.credentials(HTTP_X_INTERNAL_TOKEN='internal_service_mesh_secret_2026', HTTP_X_USER_ROLE='merchant')
        self.assertEqual(self.client.get('/api/merchant/banners/').data, [])
        self.assertFalse(CmsHomepageBanner.objects.exists())

    def test_internal_token_without_role_denied(self):
        """Internal token without merchant/admin role should be denied for merchant endpoints."""
        self.client.credentials(
            HTTP_X_INTERNAL_TOKEN='internal_service_mesh_secret_2026',
            HTTP_X_USER_ID='1',
            HTTP_X_USER_ROLE='customer'
        )
        res = self.client.get('/api/merchant/banners/')
        self.assertIn(res.status_code, (401, 403))

    def test_internal_token_with_admin_role_allowed(self):
        """Internal token with admin role should be allowed."""
        self.client.credentials(
            HTTP_X_INTERNAL_TOKEN='internal_service_mesh_secret_2026',
            HTTP_X_USER_ID='1',
            HTTP_X_USER_ROLE='admin'
        )
        res = self.client.get('/api/merchant/banners/')
        self.assertEqual(res.status_code, 200)
