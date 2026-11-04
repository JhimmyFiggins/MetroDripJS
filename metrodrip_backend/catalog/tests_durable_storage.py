from decimal import Decimal
import io
from unittest.mock import patch, MagicMock
from PIL import Image

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from catalog.models import CatalogCategory, CatalogProduct, CatalogProductMedia
from content.models import CmsHomepageBanner
from identity.models import AccountsCustomer
from metrodrip_backend.storage import CloudinaryMediaStorage, validate_durable_storage_configuration


def _create_test_image(format='PNG', size=(10, 10), color='red'):
    buf = io.BytesIO()
    mode = 'RGBA' if format.upper() == 'PNG' else 'RGB'
    Image.new(mode, size, color=color).save(buf, format=format)
    return buf.getvalue()


@override_settings(
    STORAGES={
        'default': {'BACKEND': 'metrodrip_backend.storage.CloudinaryMediaStorage'},
        'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'},
    },
    MEDIA_STORAGE_BACKEND='metrodrip_backend.storage.CloudinaryMediaStorage',
    CLOUDINARY_CLOUD_NAME='test-cloud',
    CLOUDINARY_API_KEY='test-key',
    CLOUDINARY_API_SECRET='test-secret',
    CLOUDINARY_CONFIGURED=True,
    MEDIA_STORAGE_DURABLE=True,
    IS_RENDER=False,
)
class DurableStorageMediaTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        now = timezone.now()

        # Merchant user with manage_catalog & publish_content permissions
        self.merchant = AccountsCustomer.objects.create(
            email='merchant-storage@example.com',
            name='Storage Merchant',
            role='merchant',
            is_staff=True,
            is_active=True,
            is_superuser=False,
            addresses=[],
            date_joined=now,
        )
        self.merchant.set_password('merchant-pass-123')
        self.merchant.save()

        login_res = self.client.post('/login/', {
            'email': 'merchant-storage@example.com',
            'password': 'merchant-pass-123',
        }, format='json')
        self.assertEqual(login_res.status_code, 200)
        self.merchant_token = login_res.data['access_token']

        # Customer user (non-merchant)
        self.customer = AccountsCustomer.objects.create(
            email='customer-storage@example.com',
            name='Customer User',
            role='customer',
            is_staff=False,
            is_active=True,
            is_superuser=False,
            addresses=[],
            date_joined=now,
        )
        self.customer.set_password('customer-pass-123')
        self.customer.save()

        cust_login = self.client.post('/login/', {
            'email': 'customer-storage@example.com',
            'password': 'customer-pass-123',
        }, format='json')
        self.assertEqual(cust_login.status_code, 200)
        self.customer_token = cust_login.data['access_token']

        # Sample category & product
        self.category = CatalogCategory.objects.create(
            name='Streetwear Test',
            slug='streetwear-test',
            description='',
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        self.product = CatalogProduct.objects.create(
            name='Metro Test Tee',
            sku='TEST-TEE-001',
            description='',
            category=self.category,
            base_price=Decimal('1299.00'),
            currency='PHP',
            is_active=True,
            is_featured=False,
            created_at=now,
            updated_at=now,
        )

    # --------------------------------------------------------------------------
    # Scenario 1: Valid product image upload (PNG, JPG, WebP) with durable storage active
    # --------------------------------------------------------------------------
    @patch('cloudinary.uploader.upload')
    def test_01_valid_product_image_upload_formats(self, mock_upload):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')

        formats = [
            ('PNG', 'test.png', 'image/png'),
            ('JPEG', 'test.jpg', 'image/jpeg'),
            ('WEBP', 'test.webp', 'image/webp'),
        ]

        for fmt, fname, expected_mime in formats:
            mock_upload.return_value = {
                'public_id': f'products/2026/11/{fmt.lower()}_mock',
                'format': fmt.lower().replace('jpeg', 'jpg'),
                'secure_url': f'https://res.cloudinary.com/test-cloud/image/upload/v1/products/2026/11/{fmt.lower()}_mock.{fmt.lower().replace("jpeg", "jpg")}',
                'bytes': 256,
            }

            img_bytes = _create_test_image(format=fmt)
            upload_file = SimpleUploadedFile(fname, img_bytes, content_type=expected_mime)

            res = self.client.post(
                f'/api/merchant/products/{self.product.id}/media/',
                {'file': upload_file, 'alt_text': f'{fmt} test image'},
                format='multipart',
            )
            self.assertIn(res.status_code, (200, 201))
            self.assertTrue(res.data['url'].startswith('https://res.cloudinary.com/'))
            self.assertEqual(res.data['mime_type'], expected_mime)

        # First image should have become primary
        self.product.refresh_from_db()
        self.assertTrue(self.product.image_url.startswith('https://res.cloudinary.com/'))

    # --------------------------------------------------------------------------
    # Scenario 2: Valid banner artwork upload with durable storage active
    # --------------------------------------------------------------------------
    @patch('cloudinary.uploader.upload')
    def test_02_valid_banner_artwork_upload(self, mock_upload):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')

        mock_upload.return_value = {
            'public_id': 'banners/banner_mock',
            'format': 'png',
            'secure_url': 'https://res.cloudinary.com/test-cloud/image/upload/v1/banners/banner_mock.png',
            'bytes': 512,
        }

        img_bytes = _create_test_image(format='PNG')
        banner_file = SimpleUploadedFile('hero_banner.png', img_bytes, content_type='image/png')

        res = self.client.post(
            '/api/merchant/banners/upload/',
            {'file': banner_file},
            format='multipart',
        )
        self.assertEqual(res.status_code, 201)
        self.assertTrue(res.data['url'].startswith('https://res.cloudinary.com/'))
        self.assertEqual(res.data['mime_type'], 'image/png')
        self.assertIn('filename', res.data)

    # --------------------------------------------------------------------------
    # Scenario 3: Multiple media items upload on a product (up to 12)
    # --------------------------------------------------------------------------
    @patch('cloudinary.uploader.upload')
    def test_03_multiple_media_upload_and_limit(self, mock_upload):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')

        mock_upload.return_value = {
            'public_id': 'products/2026/11/mock_multi',
            'format': 'png',
            'secure_url': 'https://res.cloudinary.com/test-cloud/image/upload/v1/products/2026/11/mock_multi.png',
            'bytes': 100,
        }

        # Upload 12 images
        for i in range(12):
            img_bytes = _create_test_image(format='PNG')
            upload_file = SimpleUploadedFile(f'img_{i}.png', img_bytes, content_type='image/png')
            res = self.client.post(
                f'/api/merchant/products/{self.product.id}/media/',
                {'file': upload_file},
                format='multipart',
            )
            self.assertIn(res.status_code, (200, 201))

        self.assertEqual(self.product.media.count(), 12)

        # 13th upload should be rejected
        img_bytes = _create_test_image(format='PNG')
        upload_file = SimpleUploadedFile('img_13.png', img_bytes, content_type='image/png')
        res_limit = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': upload_file},
            format='multipart',
        )
        self.assertEqual(res_limit.status_code, 400)
        self.assertIn('Maximum of 12 images', res_limit.data['error'])

    # --------------------------------------------------------------------------
    # Scenario 4: Media replacement and primary flag toggle updates product.image_url
    # --------------------------------------------------------------------------
    @patch('cloudinary.uploader.upload')
    def test_04_media_primary_toggle(self, mock_upload):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')

        mock_upload.return_value = {
            'public_id': 'products/2026/11/item1',
            'format': 'png',
            'secure_url': 'https://res.cloudinary.com/test-cloud/image/upload/v1/products/2026/11/item1.png',
            'bytes': 100,
        }
        res1 = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': SimpleUploadedFile('1.png', _create_test_image(), content_type='image/png')},
            format='multipart',
        )
        media1_id = res1.data['id']
        media1_url = res1.data['url']

        mock_upload.return_value = {
            'public_id': 'products/2026/11/item2',
            'format': 'png',
            'secure_url': 'https://res.cloudinary.com/test-cloud/image/upload/v1/products/2026/11/item2.png',
            'bytes': 100,
        }
        res2 = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': SimpleUploadedFile('2.png', _create_test_image(), content_type='image/png')},
            format='multipart',
        )
        media2_id = res2.data['id']
        media2_url = res2.data['url']

        self.product.refresh_from_db()
        self.assertEqual(self.product.image_url, media1_url)

        # Set media 2 as primary via PATCH
        patch_res = self.client.patch(
            f'/api/merchant/products/{self.product.id}/media/{media2_id}/',
            {'is_primary': True},
            format='json',
        )
        self.assertEqual(patch_res.status_code, 200)

        self.product.refresh_from_db()
        self.assertEqual(self.product.image_url, media2_url)
        self.assertFalse(CatalogProductMedia.objects.get(id=media1_id).is_primary)
        self.assertTrue(CatalogProductMedia.objects.get(id=media2_id).is_primary)

    # --------------------------------------------------------------------------
    # Scenario 5: Media removal / deletion cleans up storage and updates primary image
    # --------------------------------------------------------------------------
    @patch('cloudinary.uploader.destroy')
    @patch('cloudinary.uploader.upload')
    def test_05_media_delete_and_cleanup(self, mock_upload, mock_destroy):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')

        mock_upload.return_value = {
            'public_id': 'products/2026/11/del1',
            'format': 'png',
            'secure_url': 'https://res.cloudinary.com/test-cloud/image/upload/v1/products/2026/11/del1.png',
            'bytes': 100,
        }
        res1 = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': SimpleUploadedFile('1.png', _create_test_image(), content_type='image/png')},
            format='multipart',
        )
        m1_id = res1.data['id']

        mock_upload.return_value = {
            'public_id': 'products/2026/11/del2',
            'format': 'png',
            'secure_url': 'https://res.cloudinary.com/test-cloud/image/upload/v1/products/2026/11/del2.png',
            'bytes': 100,
        }
        res2 = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': SimpleUploadedFile('2.png', _create_test_image(), content_type='image/png')},
            format='multipart',
        )
        m2_id = res2.data['id']
        m2_url = res2.data['url']

        # Delete m1 (which is primary)
        del_res = self.client.delete(f'/api/merchant/products/{self.product.id}/media/{m1_id}/')
        self.assertEqual(del_res.status_code, 200)

        # Confirm destroy was invoked on storage
        self.assertTrue(mock_destroy.called)

        # m2 should now be promoted to primary
        self.product.refresh_from_db()
        self.assertEqual(self.product.image_url, m2_url)
        self.assertTrue(CatalogProductMedia.objects.get(id=m2_id).is_primary)

    # --------------------------------------------------------------------------
    # Scenario 6: Format rejection (GIF, SVG, executable/txt renamed to .jpg)
    # --------------------------------------------------------------------------
    def test_06_format_rejection(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')

        bad_files = [
            ('anim.gif', b'GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;', 'image/gif'),
            ('vector.svg', b'<svg xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg>', 'image/svg+xml'),
            ('fake.jpg', b'This is plain text pretending to be a JPEG image.', 'image/jpeg'),
        ]

        for fname, content, ctype in bad_files:
            upload_file = SimpleUploadedFile(fname, content, content_type=ctype)
            res = self.client.post(
                f'/api/merchant/products/{self.product.id}/media/',
                {'file': upload_file},
                format='multipart',
            )
            self.assertEqual(res.status_code, 400)
            self.assertIn('Invalid image format', res.data['error'])

    # --------------------------------------------------------------------------
    # Scenario 7: Corrupt content rejection (valid extension but corrupt magic bytes)
    # --------------------------------------------------------------------------
    def test_07_corrupt_content_rejection(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')

        # Valid image extension (.jpg) with corrupt / invalid magic bytes
        corrupt_bytes = b'CORRUPT_BYTES_NOT_AN_IMAGE_HEADER'
        upload_file = SimpleUploadedFile('corrupt.jpg', corrupt_bytes, content_type='image/jpeg')

        res = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': upload_file},
            format='multipart',
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn('Invalid image format', res.data['error'])

    # --------------------------------------------------------------------------
    # Scenario 8: Oversized file rejection (>8 MiB for products, >5 MiB for banners)
    # --------------------------------------------------------------------------
    def test_08_oversized_file_rejection(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')

        # 8.1 MiB for product
        oversized_product_data = b'\x89PNG\r\n\x1a\n' + b'A' * (8 * 1024 * 1024 + 1024)
        prod_file = SimpleUploadedFile('large.png', oversized_product_data, content_type='image/png')
        res_prod = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': prod_file},
            format='multipart',
        )
        self.assertEqual(res_prod.status_code, 400)
        self.assertIn('8 MiB limit', res_prod.data['error'])

        # 5.1 MiB for banner
        oversized_banner_data = b'\x89PNG\r\n\x1a\n' + b'B' * (5 * 1024 * 1024 + 1024)
        banner_file = SimpleUploadedFile('large_banner.png', oversized_banner_data, content_type='image/png')
        res_banner = self.client.post(
            '/api/merchant/banners/upload/',
            {'file': banner_file},
            format='multipart',
        )
        self.assertEqual(res_banner.status_code, 400)
        self.assertIn('5 MiB limit', res_banner.data['error'])

    # --------------------------------------------------------------------------
    # Scenario 9: Decompression bomb / oversized pixel dimensions rejection
    # --------------------------------------------------------------------------
    def test_09_oversized_pixel_dimensions_rejection(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')

        # Create an image with dimension 8001 x 10 (> 8000px max limit)
        oversized_dim_bytes = _create_test_image(format='PNG', size=(8001, 10))
        upload_file = SimpleUploadedFile('huge_dim.png', oversized_dim_bytes, content_type='image/png')

        res = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': upload_file},
            format='multipart',
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn('exceed maximum allowed', res.data['error'])

    # --------------------------------------------------------------------------
    # Scenario 10: Missing storage credentials triggers 503 durable_media_storage_required
    # --------------------------------------------------------------------------
    @override_settings(
        STORAGES={
            'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
            'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'},
        },
        MEDIA_STORAGE_BACKEND='django.core.files.storage.FileSystemStorage',
        MEDIA_STORAGE_DURABLE=False,
        MEDIA_STORAGE_REQUIRE_DURABLE=True,
        IS_RENDER=True,
    )
    def test_10_missing_storage_credentials_503(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')

        img_bytes = _create_test_image()
        upload_file = SimpleUploadedFile('pic.png', img_bytes, content_type='image/png')

        res = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': upload_file},
            format='multipart',
        )
        self.assertEqual(res.status_code, 503)
        self.assertEqual(res.data['code'], 'durable_media_storage_required')
        self.assertEqual(self.product.media.count(), 0)

    # --------------------------------------------------------------------------
    # Scenario 11: Simulated provider failure / network exception gracefully handled
    # --------------------------------------------------------------------------
    @patch('cloudinary.uploader.upload')
    def test_11_provider_failure_graceful_rollback(self, mock_upload):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')

        mock_upload.side_effect = Exception("Cloudinary connection timeout error")

        img_bytes = _create_test_image()
        upload_file = SimpleUploadedFile('retry.png', img_bytes, content_type='image/png')

        res = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': upload_file},
            format='multipart',
        )
        self.assertEqual(res.status_code, 502)
        self.assertIn('failed', res.data['error'])
        # Ensure DB rollback: no media record created
        self.assertEqual(self.product.media.count(), 0)

    # --------------------------------------------------------------------------
    # Scenario 12: Authorization checks: unauthenticated request returns 401
    # --------------------------------------------------------------------------
    def test_12_unauthenticated_request_401(self):
        self.client.credentials()  # Clear credentials

        img_bytes = _create_test_image()
        upload_file = SimpleUploadedFile('anon.png', img_bytes, content_type='image/png')

        res = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': upload_file},
            format='multipart',
        )
        self.assertEqual(res.status_code, 401)

        res_banner = self.client.post(
            '/api/merchant/banners/upload/',
            {'file': upload_file},
            format='multipart',
        )
        self.assertEqual(res_banner.status_code, 401)

    # --------------------------------------------------------------------------
    # Scenario 13: Authorization checks: customer non-merchant returns 403
    # --------------------------------------------------------------------------
    def test_13_non_merchant_forbidden_403(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.customer_token}')

        img_bytes = _create_test_image()
        upload_file = SimpleUploadedFile('customer.png', img_bytes, content_type='image/png')

        res = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': upload_file},
            format='multipart',
        )
        self.assertEqual(res.status_code, 403)

        res_banner = self.client.post(
            '/api/merchant/banners/upload/',
            {'file': upload_file},
            format='multipart',
        )
        self.assertEqual(res_banner.status_code, 403)

    # --------------------------------------------------------------------------
    # Scenario 14: Fallback resilience: missing asset returns graceful fallback
    # --------------------------------------------------------------------------
    def test_14_media_view_fallback_resilience(self):
        # 1. With Cloudinary durable storage active, requests for missing local files redirect to Cloudinary
        res_redir = self.client.get('/media/products/2026/10/remote_image.jpg')
        self.assertEqual(res_redir.status_code, 302)
        self.assertTrue(res_redir.url.startswith('https://res.cloudinary.com/'))

        # 2. In offline/local mode without durable storage, requests return fallback placeholder image
        with override_settings(
            STORAGES={
                'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
                'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'},
            },
            MEDIA_STORAGE_BACKEND='django.core.files.storage.FileSystemStorage',
        ):
            res_local = self.client.get('/media/products/2026/10/missing_local_image.jpg')
            self.assertEqual(res_local.status_code, 200)
            self.assertEqual(res_local['Content-Type'], 'image/jpeg')

            res_png = self.client.get('/media/products/2026/10/missing_local_image.png')
            self.assertEqual(res_png.status_code, 200)
            self.assertEqual(res_png['Content-Type'], 'image/png')

    # --------------------------------------------------------------------------
    # Scenario 15: Cross-client URL formatting: returned URLs are valid HTTPS
    # --------------------------------------------------------------------------
    def test_15_cross_client_url_formatting(self):
        storage = CloudinaryMediaStorage(cloud_name='metrodrip-test', api_key='k', api_secret='s')

        # Test URL building
        url = storage.url('products/2026/11/jacket.jpg')
        self.assertTrue(url.startswith('https://res.cloudinary.com/metrodrip-test/'))
        self.assertTrue(url.endswith('.jpg'))

        # Test public ID extraction
        pub_id1 = storage.extract_public_id('products/2026/11/jacket.jpg')
        self.assertEqual(pub_id1, 'products/2026/11/jacket')

        pub_id2 = storage.extract_public_id('https://res.cloudinary.com/metrodrip-test/image/upload/v1234/banners/hero.webp')
        self.assertEqual(pub_id2, 'banners/hero')

    # --------------------------------------------------------------------------
    # Scenario 16: Sync management command: dry-run and live synchronization
    # --------------------------------------------------------------------------
    @patch('cloudinary.uploader.upload')
    def test_16_sync_management_command(self, mock_upload):
        mock_upload.return_value = {
            'public_id': 'products/2026/10/synced_front',
            'format': 'jpg',
            'secure_url': 'https://res.cloudinary.com/test-cloud/image/upload/v1/products/2026/10/synced_front.jpg',
            'bytes': 1024,
        }

        # Dry-run call
        out = io.StringIO()
        call_command('sync_media_to_durable_storage', '--dry-run', stdout=out)
        self.assertIn('DRY-RUN', out.getvalue())
        self.assertIn('Synchronization audit completed', out.getvalue())

        # Live call with force flag
        out_live = io.StringIO()
        call_command('sync_media_to_durable_storage', '--force', stdout=out_live)
        self.assertIn('Synchronization audit completed', out_live.getvalue())
