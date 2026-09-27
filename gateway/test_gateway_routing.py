import unittest
from gateway import resolve_upstream, IDENTITY_URL, CATALOG_URL, ORDERS_URL, FULFILLMENT_URL, CONTENT_URL

class GatewayRoutingTests(unittest.TestCase):
    def test_identity_routes(self):
        self.assertEqual(resolve_upstream('/login/'), IDENTITY_URL)
        self.assertEqual(resolve_upstream('/signup/'), IDENTITY_URL)
        self.assertEqual(resolve_upstream('/profile/'), IDENTITY_URL)
        self.assertEqual(resolve_upstream('/wishlist/'), IDENTITY_URL)
        self.assertEqual(resolve_upstream('/api/admin/users/'), IDENTITY_URL)
        self.assertEqual(resolve_upstream('/api/identity/verify/'), IDENTITY_URL)

    def test_catalog_routes(self):
        self.assertEqual(resolve_upstream('/products/'), CATALOG_URL)
        self.assertEqual(resolve_upstream('/categories/'), CATALOG_URL)
        self.assertEqual(resolve_upstream('/variants/'), CATALOG_URL)
        self.assertEqual(resolve_upstream('/colors/'), CATALOG_URL)
        self.assertEqual(resolve_upstream('/cart/'), CATALOG_URL)
        self.assertEqual(resolve_upstream('/api/catalog/quote/'), CATALOG_URL)
        self.assertEqual(resolve_upstream('/api/catalog/reserve/'), CATALOG_URL)
        self.assertEqual(resolve_upstream('/api/merchant/products/'), CATALOG_URL)
        self.assertEqual(resolve_upstream('/api/merchant/inventory/'), CATALOG_URL)
        self.assertEqual(resolve_upstream('/api/merchant/categories/'), CATALOG_URL)

    def test_orders_routes(self):
        self.assertEqual(resolve_upstream('/orders/'), ORDERS_URL)
        self.assertEqual(resolve_upstream('/orders/1/'), ORDERS_URL)
        self.assertEqual(resolve_upstream('/api/orders/checkout/'), ORDERS_URL)
        self.assertEqual(resolve_upstream('/reviews/'), ORDERS_URL)
        self.assertEqual(resolve_upstream('/api/merchant/orders/'), ORDERS_URL)
        self.assertEqual(resolve_upstream('/api/merchant/analytics/'), ORDERS_URL)

    def test_fulfillment_routes(self):
        self.assertEqual(resolve_upstream('/shipping-zones/'), FULFILLMENT_URL)
        self.assertEqual(resolve_upstream('/shipments/'), FULFILLMENT_URL)
        self.assertEqual(resolve_upstream('/notifications/'), FULFILLMENT_URL)
        self.assertEqual(resolve_upstream('/api/fulfillment/shipping-quote/'), FULFILLMENT_URL)

    def test_content_routes(self):
        self.assertEqual(resolve_upstream('/banners/'), CONTENT_URL)
        self.assertEqual(resolve_upstream('/contact/'), CONTENT_URL)
        self.assertEqual(resolve_upstream('/api/content/banners/'), CONTENT_URL)
        self.assertEqual(resolve_upstream('/api/merchant/banners/'), CONTENT_URL)
        self.assertEqual(resolve_upstream('/api/merchant/contact-messages/'), CONTENT_URL)

    def test_unknown_route(self):
        self.assertIsNone(resolve_upstream('/unknown/path/here/'))

if __name__ == '__main__':
    unittest.main()
