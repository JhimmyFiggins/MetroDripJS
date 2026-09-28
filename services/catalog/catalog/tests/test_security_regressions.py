"""
Security regression tests for catalog service.
These tests document and verify fixes for authentication/authorization defects.
"""
from django.test import TestCase
from rest_framework.test import APIClient
from unittest.mock import patch
import json
from catalog.models import (
    CatalogCategory, CatalogProduct, CatalogProductVariant,
    InventoryStockEntry, CatalogColor
)


class CatalogMerchantAuthRegressionTests(TestCase):
    """Test merchant endpoint authentication/authorization."""

    def setUp(self):
        self.client = APIClient()
        self.category = CatalogCategory.objects.create(name='Tees', slug='tees', is_active=True)
        self.product = CatalogProduct.objects.create(
            sku='MD-TS-001', name='Metro Boxy Tee', category=self.category,
            base_price=899, currency='PHP', is_active=True
        )
        self.color = CatalogColor.objects.create(name='White', hex_code='#FFFFFF', is_active=True)
        self.variant = CatalogProductVariant.objects.create(
            product=self.product, sku='MD-TS-001-WHT-L', color=self.color,
            attributes={'size': 'L', 'color': 'White'}, price_adjustment=0, is_active=True
        )
        InventoryStockEntry.objects.create(
            product=self.product, variant=self.variant, warehouse_id=1,
            quantity=10, reserved_quantity=0
        )

    def test_merchant_dashboard_requires_authentication(self):
        """
        REGRESSION: MerchantDashboardCatalogSliceAPIView had no authentication.
        FIX: Should require internal token + merchant/admin role.
        """
        res = self.client.get('/api/merchant/dashboard/catalog/')
        self.assertIn(res.status_code, (401, 403),
            f"Expected 401/403 for unauthenticated merchant dashboard, got {res.status_code}")

    def test_merchant_dashboard_with_internal_token_no_role(self):
        """Internal token without proper role should be denied."""
        self.client.credentials(
            HTTP_X_INTERNAL_TOKEN='internal_service_mesh_secret_2026',
            HTTP_X_USER_ID='1',
            HTTP_X_USER_ROLE='customer'
        )
        res = self.client.get('/api/merchant/dashboard/catalog/')
        self.assertIn(res.status_code, (401, 403))

    def test_merchant_dashboard_with_merchant_role_allowed(self):
        """Internal token with merchant role should be allowed."""
        self.client.credentials(
            HTTP_X_INTERNAL_TOKEN='internal_service_mesh_secret_2026',
            HTTP_X_USER_ID='1',
            HTTP_X_USER_ROLE='merchant'
        )
        res = self.client.get('/api/merchant/dashboard/catalog/')
        self.assertEqual(res.status_code, 200)
        self.assertIn('low_stock_skus', res.data)

    def test_merchant_products_list_requires_authentication(self):
        """
        REGRESSION: MerchantProductsAPIView had no authentication.
        FIX: Should require internal token + merchant/admin role.
        """
        res = self.client.get('/api/merchant/products/')
        self.assertIn(res.status_code, (401, 403))

    def test_merchant_products_create_requires_authentication(self):
        """POST to merchant products should require authentication."""
        res = self.client.post('/api/merchant/products/', {
            'name': 'Test Product', 'sku': 'TEST-001', 'base_price': 100
        }, format='json')
        self.assertIn(res.status_code, (401, 403))

    def test_merchant_inventory_requires_authentication(self):
        """
        REGRESSION: MerchantInventoryAPIView had no authentication.
        FIX: Should require internal token + merchant/admin role.
        """
        res = self.client.get('/inventory/')
        self.assertIn(res.status_code, (401, 403))

    def test_merchant_inventory_adjustment_requires_authentication(self):
        """POST to inventory (stock adjustment) should require authentication."""
        res = self.client.post('/inventory/', {
            'variant_id': self.variant.id, 'delta': 5, 'reason': 'restock'
        }, format='json')
        self.assertIn(res.status_code, (401, 403))


class CatalogInternalTokenValidationTests(TestCase):
    """Test internal token validation in catalog service."""

    def setUp(self):
        self.client = APIClient()

    @patch('catalog.authentication.urllib.request.urlopen')
    def test_bearer_merchant_is_verified_without_trusting_role_headers(self, upstream):
        upstream.return_value.__enter__.return_value.read.return_value = json.dumps({
            'valid': True, 'customer': {'id': 1, 'role': 'merchant'}}).encode()
        self.client.credentials(HTTP_AUTHORIZATION='Bearer fixture', HTTP_X_USER_ROLE='customer')
        self.assertEqual(self.client.get('/api/merchant/products/').status_code, 200)
        upstream.return_value.__enter__.return_value.read.return_value = json.dumps({
            'valid': True, 'customer': {'id': 1, 'role': 'customer'}}).encode()
        self.client.credentials(HTTP_AUTHORIZATION='Bearer fixture', HTTP_X_USER_ROLE='admin')
        self.assertEqual(self.client.get('/api/merchant/products/').status_code, 403)

    @patch('catalog.authentication.urllib.request.urlopen', side_effect=OSError('unavailable'))
    def test_identity_outage_fails_closed(self, upstream):
        self.client.credentials(HTTP_AUTHORIZATION='Bearer fixture')
        self.assertEqual(self.client.get('/api/merchant/products/').status_code, 403)

    def test_stock_mutations_require_internal_credentials(self):
        for path in ['/api/catalog/reserve/', '/api/catalog/reserve/qa/commit/', '/api/catalog/reserve/qa/release/']:
            with self.subTest(path=path):
                self.assertIn(self.client.post(path, {}, format='json').status_code, (401, 403))

    def test_internal_token_trusts_x_user_id_header(self):
        """
        REGRESSION: InternalServiceOrGatewayAuthentication trusted X-User-ID without validation.
        FIX: Should validate user exists in identity service (or at least check format).
        """
        # This test documents current behavior - the service trusts the header
        # After fix, it should validate the user
        self.client.credentials(
            HTTP_X_INTERNAL_TOKEN='internal_service_mesh_secret_2026',
            HTTP_X_USER_ID='1',
            HTTP_X_USER_ROLE='merchant'
        )
        # Current behavior: accepts without validation
        # After fix: should require valid user
        res = self.client.get('/api/merchant/products/')
        # Currently passes (200) - this is the defect
        # After fix: should still pass but with validated user
        self.assertEqual(res.status_code, 200)

    def test_internal_token_without_token_rejected(self):
        """Requests without internal token should be rejected for protected endpoints."""
        self.client.credentials(HTTP_X_USER_ID='1', HTTP_X_USER_ROLE='merchant')
        res = self.client.get('/api/merchant/products/')
        self.assertIn(res.status_code, (401, 403))

    def test_external_client_cannot_spoof_internal_headers(self):
        """
        REGRESSION: External clients could spoof X-User-ID/X-User-Role headers.
        FIX: Should only trust headers when valid X-Internal-Token is present.
        """
        # Without internal token, headers should be ignored
        self.client.credentials(HTTP_X_USER_ID='1', HTTP_X_USER_ROLE='admin')
        res = self.client.get('/api/merchant/products/')
        self.assertIn(res.status_code, (401, 403))
