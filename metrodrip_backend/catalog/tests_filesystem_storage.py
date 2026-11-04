from decimal import Decimal
import io
import os
from pathlib import Path
from PIL import Image

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from catalog.models import (
    CatalogCategory,
    CatalogProduct,
    CatalogProductMedia,
    CatalogProductVariant,
    InventoryStockEntry,
)
from identity.models import AccountsCustomer


def _create_test_image(format='PNG', size=(20, 20), color='green'):
    buf = io.BytesIO()
    mode = 'RGBA' if format.upper() == 'PNG' else 'RGB'
    Image.new(mode, size, color=color).save(buf, format=format)
    return buf.getvalue()


@override_settings(
    STORAGES={
        'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
        'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'},
    },
    MEDIA_STORAGE_BACKEND='django.core.files.storage.FileSystemStorage',
    MEDIA_STORAGE_DRIVER='local',
    MEDIA_STORAGE_REQUIRE_DURABLE=False,
    MEDIA_STORAGE_DURABLE=False,
    IS_RENDER=True,  # Test in simulated Render Free environment
)
class FilesystemMediaStorageWorkflowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        now = timezone.now()

        # Merchant with manage_catalog permission
        self.merchant = AccountsCustomer.objects.create(
            email='merchant-fs@example.com',
            name='FS Merchant',
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
            'email': 'merchant-fs@example.com',
            'password': 'merchant-pass-123',
        }, format='json')
        self.assertEqual(login_res.status_code, 200)
        self.merchant_token = login_res.data['access_token']

        # Category & sample product
        self.category = CatalogCategory.objects.create(
            name='Streetwear FS',
            slug='streetwear-fs',
            description='Test Category',
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        self.product = CatalogProduct.objects.create(
            name='Metro Cargo Pant',
            sku='CARGO-001',
            description='Durable tactical cargo pant',
            category=self.category,
            base_price=Decimal('2499.00'),
            currency='PHP',
            is_active=True,
            is_featured=False,
            created_at=now,
            updated_at=now,
        )

    # --------------------------------------------------------------------------
    # Test 1: Upload image when creating a product
    # --------------------------------------------------------------------------
    def test_01_upload_image_when_creating_product(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        # Step A: Create product
        prod_res = self.client.post('/api/merchant/products/', {
            'name': 'Metro Graphic Hoodie',
            'sku': 'HOODIE-FS-01',
            'category': 'Streetwear FS',
            'price': 1899,
            'stock': 15,
            'description': 'Heavyweight fleece hoodie',
        }, format='json')
        self.assertEqual(prod_res.status_code, 201)
        prod_id = prod_res.data['id']

        # Step B: Upload image to newly created product
        img_bytes = _create_test_image('PNG', (50, 50), 'lime')
        upload = SimpleUploadedFile('hoodie.png', img_bytes, content_type='image/png')
        media_res = self.client.post(
            f'/api/merchant/products/{prod_id}/media/',
            {'file': upload, 'alt_text': 'Hoodie primary image'},
            format='multipart',
        )
        self.assertEqual(media_res.status_code, 201)
        self.assertTrue(media_res.data['url'].startswith('/media/products/'))
        self.assertTrue(media_res.data['is_primary'])

        # Verify product image_url is populated
        created_prod = CatalogProduct.objects.get(id=prod_id)
        self.assertEqual(created_prod.image_url, media_res.data['url'])

    # --------------------------------------------------------------------------
    # Test 2: Upload image when editing a product
    # --------------------------------------------------------------------------
    def test_02_upload_image_when_editing_product(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        img_bytes = _create_test_image('JPEG', (40, 40), 'black')
        upload = SimpleUploadedFile('cargo.jpg', img_bytes, content_type='image/jpeg')

        res = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': upload, 'alt_text': 'Cargo front view'},
            format='multipart',
        )
        self.assertEqual(res.status_code, 201)
        self.assertTrue(res.data['url'].startswith('/media/products/'))
        self.assertEqual(res.data['mime_type'], 'image/jpeg')

    # --------------------------------------------------------------------------
    # Test 3: Upload multiple gallery images
    # --------------------------------------------------------------------------
    def test_03_upload_multiple_gallery_images(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')

        for i in range(3):
            img_bytes = _create_test_image('PNG', (30, 30), f'rgb({i*80}, 200, 50)')
            upload = SimpleUploadedFile(f'gallery_{i}.png', img_bytes, content_type='image/png')
            res = self.client.post(
                f'/api/merchant/products/{self.product.id}/media/',
                {'file': upload, 'alt_text': f'View {i}'},
                format='multipart',
            )
            self.assertEqual(res.status_code, 201)

        self.assertEqual(self.product.media.count(), 3)
        # First image uploaded should be primary
        primary = self.product.media.filter(is_primary=True).first()
        self.assertIsNotNone(primary)
        self.product.refresh_from_db()
        self.assertEqual(self.product.image_url, primary.url)

    # --------------------------------------------------------------------------
    # Test 4: Save uploaded product image persists in database
    # --------------------------------------------------------------------------
    def test_04_save_uploaded_product_image_persists_in_db(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        img_bytes = _create_test_image('WEBP', (30, 30), 'blue')
        upload = SimpleUploadedFile('test.webp', img_bytes, content_type='image/webp')

        res = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': upload, 'alt_text': 'Webp format'},
            format='multipart',
        )
        self.assertEqual(res.status_code, 201)
        media_id = res.data['id']

        # Query database directly
        db_media = CatalogProductMedia.objects.get(id=media_id)
        self.assertEqual(db_media.product, self.product)
        self.assertEqual(db_media.alt_text, 'Webp format')
        self.assertEqual(db_media.mime_type, 'image/webp')
        self.assertTrue(db_media.file.name.startswith('products/'))

    # --------------------------------------------------------------------------
    # Test 5: Refresh Merchant Console returns images
    # --------------------------------------------------------------------------
    def test_05_refresh_merchant_console_returns_images(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        img_bytes = _create_test_image('JPEG', (25, 25), 'gray')
        upload = SimpleUploadedFile('refresh.jpg', img_bytes, content_type='image/jpeg')
        self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': upload},
            format='multipart',
        )

        detail_res = self.client.get(f'/api/merchant/products/{self.product.id}/')
        self.assertEqual(detail_res.status_code, 200)
        self.assertTrue(len(detail_res.data['media']) >= 1)
        self.assertTrue(detail_res.data['image_url'].startswith('/media/products/'))

    # --------------------------------------------------------------------------
    # Test 6: Open Customer Website exposes uploaded images
    # --------------------------------------------------------------------------
    def test_06_open_customer_website_exposes_uploaded_images(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        img_bytes = _create_test_image('PNG', (35, 35), 'yellow')
        upload = SimpleUploadedFile('cust_view.png', img_bytes, content_type='image/png')
        self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': upload},
            format='multipart',
        )

        # Anonymous public customer request
        anon_client = APIClient()
        list_res = anon_client.get('/products/')
        self.assertEqual(list_res.status_code, 200)
        prod_data = next((p for p in list_res.data if p['id'] == self.product.id), None)
        self.assertIsNotNone(prod_data)
        self.assertTrue(prod_data['image_url'].startswith('/media/products/'))
        self.assertTrue(len(prod_data['media']) >= 1)
        self.assertTrue(prod_data['media'][0]['url'].startswith('/media/products/'))

    # --------------------------------------------------------------------------
    # Test 7: Open Customer Mobile App image URL resolution
    # --------------------------------------------------------------------------
    def test_07_customer_mobile_image_url_resolution(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        img_bytes = _create_test_image('PNG', (30, 30), 'red')
        upload = SimpleUploadedFile('mob.png', img_bytes, content_type='image/png')
        res = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': upload},
            format='multipart',
        )
        url = res.data['url']
        self.assertTrue(url.startswith('/media/products/'))

        # Check that URL is relative to backend root and not referencing localhost
        self.assertFalse(url.startswith('http://localhost'))
        self.assertFalse(url.startswith('file://'))

    # --------------------------------------------------------------------------
    # Test 8: Update product image (promote another image to primary)
    # --------------------------------------------------------------------------
    def test_08_update_product_primary_image(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        # Upload 2 images
        r1 = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': SimpleUploadedFile('img1.png', _create_test_image(), content_type='image/png')},
            format='multipart',
        )
        r2 = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': SimpleUploadedFile('img2.png', _create_test_image(), content_type='image/png')},
            format='multipart',
        )
        m1_id, m2_id = r1.data['id'], r2.data['id']
        m2_url = r2.data['url']

        # Promote m2 to primary
        patch_res = self.client.patch(
            f'/api/merchant/products/{self.product.id}/media/{m2_id}/',
            {'is_primary': True},
            format='json',
        )
        self.assertEqual(patch_res.status_code, 200)

        self.product.refresh_from_db()
        self.assertEqual(self.product.image_url, m2_url)
        self.assertTrue(CatalogProductMedia.objects.get(id=m2_id).is_primary)
        self.assertFalse(CatalogProductMedia.objects.get(id=m1_id).is_primary)

    # --------------------------------------------------------------------------
    # Test 9: Remove product image
    # --------------------------------------------------------------------------
    def test_09_remove_product_image_updates_references(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        r1 = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': SimpleUploadedFile('del1.png', _create_test_image(), content_type='image/png')},
            format='multipart',
        )
        r2 = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': SimpleUploadedFile('del2.png', _create_test_image(), content_type='image/png')},
            format='multipart',
        )
        m1_id, m2_id = r1.data['id'], r2.data['id']
        m2_url = r2.data['url']

        # Delete m1 (which was primary)
        del_res = self.client.delete(f'/api/merchant/products/{self.product.id}/media/{m1_id}/')
        self.assertEqual(del_res.status_code, 200)
        self.assertFalse(CatalogProductMedia.objects.filter(id=m1_id).exists())

        # m2 should now be automatically promoted to primary
        self.product.refresh_from_db()
        self.assertEqual(self.product.image_url, m2_url)
        self.assertTrue(CatalogProductMedia.objects.get(id=m2_id).is_primary)

    # --------------------------------------------------------------------------
    # Test 10: Upload invalid image file rejected
    # --------------------------------------------------------------------------
    def test_10_upload_invalid_image_file_rejected(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        bad_file = SimpleUploadedFile('fake.jpg', b'THIS_IS_NOT_AN_IMAGE_CONTENT', content_type='image/jpeg')

        res = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': bad_file},
            format='multipart',
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn('Invalid image format', res.data['error'])

    # --------------------------------------------------------------------------
    # Test 11: Upload oversized file rejected
    # --------------------------------------------------------------------------
    def test_11_upload_oversized_file_rejected(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        # Header for JPEG plus 8.5 MiB of null bytes
        large_bytes = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00' + b'\x00' * (9 * 1024 * 1024)
        big_file = SimpleUploadedFile('giant.jpg', large_bytes, content_type='image/jpeg')

        res = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': big_file},
            format='multipart',
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn('exceeds the 8 MiB limit', res.data['error'])

    # --------------------------------------------------------------------------
    # Test 12: Access a public product image URL loads successfully
    # --------------------------------------------------------------------------
    def test_12_access_public_product_image_url_loads(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        img_bytes = _create_test_image('PNG', (20, 20), 'purple')
        res = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': SimpleUploadedFile('pub.png', img_bytes, content_type='image/png')},
            format='multipart',
        )
        url = res.data['url']

        # Fetch using anonymous client
        anon_client = APIClient()
        fetch_res = anon_client.get(url)
        self.assertEqual(fetch_res.status_code, 200)
        self.assertEqual(fetch_res['Content-Type'], 'image/png')

    # --------------------------------------------------------------------------
    # Test 13: Edit product without changing its image preserves references
    # --------------------------------------------------------------------------
    def test_13_edit_product_without_changing_image_preserves_reference(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        upload_res = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': SimpleUploadedFile('keep.png', _create_test_image(), content_type='image/png')},
            format='multipart',
        )
        expected_url = upload_res.data['url']

        # Patch product metadata (price, name, description)
        patch_res = self.client.patch(
            f'/api/merchant/products/{self.product.id}/',
            {
                'name': 'Updated Metro Cargo Pant',
                'price': 2799,
                'description': 'Updated tactical cargo pants description',
            },
            format='json',
        )
        self.assertEqual(patch_res.status_code, 200)

        self.product.refresh_from_db()
        self.assertEqual(self.product.name, 'Updated Metro Cargo Pant')
        self.assertEqual(self.product.image_url, expected_url)
        self.assertEqual(self.product.media.count(), 1)

    # --------------------------------------------------------------------------
    # Test 14: Render instance loses temporary image file -> placeholder appears without crashing
    # --------------------------------------------------------------------------
    def test_14_lost_temporary_image_file_serves_placeholder_without_crashing(self):
        anon_client = APIClient()
        # Request a path that does not exist on disk
        missing_jpg = anon_client.get('/media/products/2026/11/missing_restart_file.jpg')
        self.assertEqual(missing_jpg.status_code, 200)
        self.assertEqual(missing_jpg['Content-Type'], 'image/jpeg')
        self.assertTrue(len(missing_jpg.content) > 0)

        missing_png = anon_client.get('/media/products/2026/11/missing_restart_file.png')
        self.assertEqual(missing_png.status_code, 200)
        self.assertEqual(missing_png['Content-Type'], 'image/png')

        missing_webp = anon_client.get('/media/products/2026/11/missing_restart_file.webp')
        self.assertEqual(missing_webp.status_code, 200)
        self.assertEqual(missing_webp['Content-Type'], 'image/webp')

    # --------------------------------------------------------------------------
    # Test 15: Existing product variations continue functioning correctly
    # --------------------------------------------------------------------------
    def test_15_existing_product_variations_continue_functioning(self):
        now = timezone.now()
        v1 = CatalogProductVariant.objects.create(
            product=self.product,
            sku='CARGO-BLK-32',
            attributes={'Color': 'Black', 'Size': '32'},
            price_adjustment=Decimal('0.00'),
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        InventoryStockEntry.objects.create(
            product=self.product,
            variant=v1,
            warehouse_id=1,
            quantity=20,
            reserved_quantity=2,
            last_counted_at=now,
            created_at=now,
            updated_at=now,
        )

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        # Upload media for variant product
        upload_res = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': SimpleUploadedFile('variant_pant.png', _create_test_image(), content_type='image/png')},
            format='multipart',
        )
        self.assertEqual(upload_res.status_code, 201)

        detail_res = self.client.get(f'/api/merchant/products/{self.product.id}/')
        self.assertEqual(detail_res.status_code, 200)
        self.assertEqual(len(detail_res.data['variants']), 1)
        self.assertEqual(detail_res.data['variants'][0]['sku'], 'CARGO-BLK-32')
        self.assertEqual(detail_res.data['variants'][0]['stock'], 20)
        self.assertEqual(detail_res.data['variants'][0]['available_stock'], 18)

    # --------------------------------------------------------------------------
    # Test 16: Existing product catalog remains functional
    # --------------------------------------------------------------------------
    def test_16_existing_product_catalog_remains_functional(self):
        anon_client = APIClient()
        cat_res = anon_client.get('/categories/')
        self.assertEqual(cat_res.status_code, 200)

        prod_res = anon_client.get('/products/')
        self.assertEqual(prod_res.status_code, 200)
        self.assertTrue(len(prod_res.data) >= 1)
