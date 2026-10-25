from django.test import TestCase
from rest_framework.test import APIClient
from catalog.merchant_views import _detect_image_mime
import io


def _get_bytes(res):
    if hasattr(res, 'streaming_content'):
        return b''.join(res.streaming_content)
    return res.content


class MediaServingTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_existing_product_png_served_with_200(self):
        res = self.client.get('/media/products/2026/10/ayos.png')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers.get('Content-Type'), 'image/png')
        content = _get_bytes(res)
        mime = _detect_image_mime(io.BytesIO(content))
        self.assertEqual(mime, 'image/png')

    def test_existing_product_jpg_served_with_200(self):
        res = self.client.get('/media/products/2026/10/streetwear.jpg')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers.get('Content-Type'), 'image/jpeg')
        content = _get_bytes(res)
        mime = _detect_image_mime(io.BytesIO(content))
        self.assertEqual(mime, 'image/jpeg')

    def test_missing_image_returns_resilient_fallback_not_404(self):
        res = self.client.get('/media/products/9999/99/does-not-exist.png')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers.get('Content-Type'), 'image/png')
        content = _get_bytes(res)
        mime = _detect_image_mime(io.BytesIO(content))
        self.assertEqual(mime, 'image/png')

    def test_missing_jpg_returns_resilient_fallback_not_404(self):
        res = self.client.get('/media/products/9999/99/does-not-exist.jpg')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers.get('Content-Type'), 'image/jpeg')
        content = _get_bytes(res)
        mime = _detect_image_mime(io.BytesIO(content))
        self.assertEqual(mime, 'image/jpeg')

    def test_path_traversal_fails_closed_404(self):
        res = self.client.get('/media/../../manage.py')
        self.assertEqual(res.status_code, 404)
