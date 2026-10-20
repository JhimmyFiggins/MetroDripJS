import io
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from identity.models import AccountsCustomer
from catalog.models import (
    CatalogCategory,
    CatalogProduct,
    CatalogProductVariant,
    CatalogProductMedia,
    InventoryStockEntry,
)


class ProductsModernizationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        now = timezone.now()

        # Merchant user
        self.merchant = AccountsCustomer.objects.create(
            email='merchant-media@example.com',
            name='Media Merchant',
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
            'email': 'merchant-media@example.com',
            'password': 'merchant-pass-123',
        }, format='json')
        self.assertEqual(login_res.status_code, 200)
        self.merchant_token = login_res.data['access_token']

        # Customer user (unauthorized for merchant endpoints)
        self.customer = AccountsCustomer.objects.create(
            email='customer-media@example.com',
            name='Media Customer',
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
            'email': 'customer-media@example.com',
            'password': 'customer-pass-123',
        }, format='json')
        self.assertEqual(cust_login.status_code, 200)
        self.customer_token = cust_login.data['access_token']

        # Category and Product
        self.category = CatalogCategory.objects.create(
            name='Streetwear',
            slug='streetwear',
            description='Streetwear collection',
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        self.product = CatalogProduct.objects.create(
            name='Urban Hoodie',
            sku='MD-HOOD-001',
            description='Heavyweight streetwear hoodie',
            category=self.category,
            base_price=Decimal('1250.00'),
            currency='PHP',
            is_active=True,
            is_featured=False,
            created_at=now,
            updated_at=now,
        )
        self.variant = CatalogProductVariant.objects.create(
            product=self.product,
            sku='MD-HOOD-001',
            attributes={},
            price_adjustment=Decimal('0.00'),
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        self.stock_entry = InventoryStockEntry.objects.create(
            product=self.product,
            variant=self.variant,
            warehouse_id=1,
            quantity=50,
            reserved_quantity=5,
            last_counted_at=now,
            created_at=now,
            updated_at=now,
        )

    def _make_dummy_image(self, format_type='jpeg', size=100):
        if format_type == 'jpeg':
            # Valid JPEG header: FF D8 FF E0 00 10 4A 46 49 46 00 01
            header = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00'
            body = b'\x00' * max(0, size - len(header))
            return header + body
        elif format_type == 'png':
            # Valid PNG header: 89 50 4E 47 0D 0A 1A 0A
            header = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR'
            body = b'\x00' * max(0, size - len(header))
            return header + body
        elif format_type == 'webp':
            # Valid WebP header: 'RIFF' + 4 bytes size + 'WEBP'
            header = b'RIFF\x24\x00\x00\x00WEBPVP8 '
            body = b'\x00' * max(0, size - len(header))
            return header + body
        else:
            return b'not an image content'

    def test_merchant_product_list_and_detail_stock_and_media(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        res = self.client.get('/api/merchant/products/')
        self.assertEqual(res.status_code, 200)
        item = next(p for p in res.data if p['id'] == self.product.id)
        self.assertEqual(item['stock'], 50)
        self.assertEqual(item['reserved_stock'], 5)
        self.assertEqual(item['available_stock'], 45)
        self.assertEqual(item['image_url'], '')

        detail_res = self.client.get(f'/api/merchant/products/{self.product.id}/')
        self.assertEqual(detail_res.status_code, 200)
        self.assertEqual(detail_res.data['available_stock'], 45)
        self.assertEqual(detail_res.data['reserved_stock'], 5)
        self.assertEqual(detail_res.data['media'], [])

    def test_customer_cannot_upload_product_media(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.customer_token}')
        img_bytes = self._make_dummy_image('jpeg')
        uploaded = SimpleUploadedFile('hoodie.jpg', img_bytes, content_type='image/jpeg')

        res = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': uploaded, 'alt_text': 'Hacked upload'},
            format='multipart',
        )
        self.assertIn(res.status_code, [401, 403])

    def test_merchant_upload_valid_images_and_sync_primary(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        img_bytes1 = self._make_dummy_image('jpeg', 1024)
        file1 = SimpleUploadedFile('front.jpg', img_bytes1, content_type='image/jpeg')

        # First upload should automatically become primary
        res1 = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': file1, 'alt_text': 'Urban Hoodie Front'},
            format='multipart',
        )
        self.assertEqual(res1.status_code, 201)
        self.assertTrue(res1.data['is_primary'])
        self.assertEqual(res1.data['alt_text'], 'Urban Hoodie Front')
        media1_id = res1.data['id']
        media1_url = res1.data['url']

        self.product.refresh_from_db()
        self.assertEqual(self.product.image_url, media1_url)

        # Upload second image (PNG)
        img_bytes2 = self._make_dummy_image('png', 2048)
        file2 = SimpleUploadedFile('back.png', img_bytes2, content_type='image/png')
        res2 = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': file2, 'alt_text': 'Urban Hoodie Back'},
            format='multipart',
        )
        self.assertEqual(res2.status_code, 201)
        self.assertFalse(res2.data['is_primary'])
        media2_id = res2.data['id']
        media2_url = res2.data['url']

        # Upload third image (WebP)
        img_bytes3 = self._make_dummy_image('webp', 1500)
        file3 = SimpleUploadedFile('detail.webp', img_bytes3, content_type='image/webp')
        res3 = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': file3, 'alt_text': 'Urban Hoodie Fabric Detail'},
            format='multipart',
        )
        self.assertEqual(res3.status_code, 201)

        # Switch primary to media 2
        patch_res = self.client.patch(
            f'/api/merchant/products/{self.product.id}/media/{media2_id}/',
            {'is_primary': True},
            format='json',
        )
        self.assertEqual(patch_res.status_code, 200)
        self.assertTrue(patch_res.data['is_primary'])

        self.product.refresh_from_db()
        self.assertEqual(self.product.image_url, media2_url)

        # Verify old primary is now false
        media1 = CatalogProductMedia.objects.get(id=media1_id)
        self.assertFalse(media1.is_primary)

        # Public endpoints should now expose media and image_url
        pub_client = APIClient()
        pub_res = pub_client.get(f'/products/{self.product.id}/')
        self.assertEqual(pub_res.status_code, 200)
        self.assertEqual(pub_res.data['image_url'], media2_url)
        self.assertEqual(len(pub_res.data['media']), 3)

        # Delete current primary media (media2)
        del_res = self.client.delete(f'/api/merchant/products/{self.product.id}/media/{media2_id}/')
        self.assertEqual(del_res.status_code, 200)

        # Next media should automatically be promoted to primary
        self.product.refresh_from_db()
        self.assertTrue(self.product.image_url)
        self.assertNotEqual(self.product.image_url, media2_url)

    def test_reject_spoofed_or_unsafe_uploads(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')

        # SVG or script disguised as jpg
        fake_svg = SimpleUploadedFile('exploit.jpg', b'<svg onload=alert(1)>', content_type='image/jpeg')
        res = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': fake_svg},
            format='multipart',
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn('Invalid image format', res.data['error'])

        # Plain text
        fake_txt = SimpleUploadedFile('notes.txt', b'Hello world text file', content_type='text/plain')
        res_txt = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': fake_txt},
            format='multipart',
        )
        self.assertEqual(res_txt.status_code, 400)

    def test_reject_oversized_file(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        # Exceed 8 MiB (8 * 1024 * 1024 + 1 bytes)
        big_bytes = self._make_dummy_image('jpeg', size=8 * 1024 * 1024 + 10)
        big_file = SimpleUploadedFile('huge.jpg', big_bytes, content_type='image/jpeg')

        res = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': big_file},
            format='multipart',
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn('8 MiB', res.data['error'])

    def test_enforce_max_images_limit(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        for i in range(12):
            img_bytes = self._make_dummy_image('jpeg', 100)
            f = SimpleUploadedFile(f'img_{i}.jpg', img_bytes, content_type='image/jpeg')
            res = self.client.post(
                f'/api/merchant/products/{self.product.id}/media/',
                {'file': f},
                format='multipart',
            )
            self.assertEqual(res.status_code, 201)

        # 13th upload should fail
        img_bytes13 = self._make_dummy_image('jpeg', 100)
        f13 = SimpleUploadedFile('img_13.jpg', img_bytes13, content_type='image/jpeg')
        res13 = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': f13},
            format='multipart',
        )
        self.assertEqual(res13.status_code, 400)
        self.assertIn('Maximum of 12 images', res13.data['error'])
