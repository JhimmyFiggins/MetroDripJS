import io
from decimal import Decimal
from django.test import TestCase, override_settings
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
    InventoryStockMovement,
    InventoryReservation,
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

    @override_settings(MEDIA_STORAGE_DURABLE=False, MEDIA_STORAGE_REQUIRE_DURABLE=True)
    def test_production_like_ephemeral_storage_rejects_upload_without_side_effects(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        uploaded = SimpleUploadedFile(
            'front.jpg',
            self._make_dummy_image('jpeg'),
            content_type='image/jpeg',
        )

        response = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': uploaded},
            format='multipart',
        )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data['code'], 'durable_media_storage_required')
        self.assertFalse(CatalogProductMedia.objects.filter(product=self.product).exists())

    @override_settings(
        MEDIA_STORAGE_DURABLE=False,
        MEDIA_STORAGE_REQUIRE_DURABLE=False,
        IS_RENDER=True,
        STORAGES={
            'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
            'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'},
        },
        MEDIA_STORAGE_BACKEND='django.core.files.storage.FileSystemStorage',
    )
    def test_render_free_ephemeral_storage_allows_upload_when_durable_not_required(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        uploaded = SimpleUploadedFile(
            'render_tee.jpg',
            self._make_dummy_image('jpeg'),
            content_type='image/jpeg',
        )

        response = self.client.post(
            f'/api/merchant/products/{self.product.id}/media/',
            {'file': uploaded},
            format='multipart',
        )

        self.assertEqual(response.status_code, 201)
        self.assertIn('url', response.data)
        self.assertTrue(response.data['url'].startswith('/media/products/'))
        self.product.refresh_from_db()
        self.assertEqual(self.product.image_url, response.data['url'])
        self.assertTrue(CatalogProductMedia.objects.filter(product=self.product).exists())

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

    def test_bulk_activate_and_deactivate(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        now = timezone.now()
        p2 = CatalogProduct.objects.create(
            name='Test Pants',
            sku='MD-PANTS-001',
            description='Test pants',
            category=self.category,
            base_price=Decimal('1000.00'),
            is_active=True,
            is_featured=False,
            created_at=now,
            updated_at=now,
        )

        # Bulk deactivate
        res = self.client.post('/api/merchant/products/bulk/', {
            'action': 'deactivate',
            'product_ids': [self.product.id, p2.id],
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['affected_count'], 2)

        self.product.refresh_from_db()
        p2.refresh_from_db()
        self.assertFalse(self.product.is_active)
        self.assertFalse(p2.is_active)

        # Bulk activate
        res_act = self.client.post('/api/merchant/products/bulk/', {
            'action': 'activate',
            'product_ids': [self.product.id, p2.id],
        }, format='json')
        self.assertEqual(res_act.status_code, 200)
        self.assertEqual(res_act.data['affected_count'], 2)

        self.product.refresh_from_db()
        p2.refresh_from_db()
        self.assertTrue(self.product.is_active)
        self.assertTrue(p2.is_active)

    def test_bulk_change_category(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        new_cat = CatalogCategory.objects.create(
            name='Accessories › Bags',
            slug='accessories-bags',
            description='Bags category',
            is_active=True,
            created_at=timezone.now(),
            updated_at=timezone.now(),
        )

        res = self.client.post('/api/merchant/products/bulk/', {
            'action': 'change_category',
            'product_ids': [self.product.id],
            'params': {'category_id': new_cat.id},
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.product.refresh_from_db()
        self.assertEqual(self.product.category_id, new_cat.id)

    def test_bulk_update_stock_set_increase_decrease(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        # Set stock to 100
        res_set = self.client.post('/api/merchant/products/bulk/', {
            'action': 'update_stock',
            'product_ids': [self.product.id],
            'params': {'mode': 'set', 'quantity': 100},
        }, format='json')
        self.assertEqual(res_set.status_code, 200)
        self.stock_entry.refresh_from_db()
        self.assertEqual(self.stock_entry.quantity, 100)
        self.assertTrue(InventoryStockMovement.objects.filter(variant=self.variant, delta=50, reason='bulk_adjustment').exists())

        # Increase by 25
        res_inc = self.client.post('/api/merchant/products/bulk/', {
            'action': 'update_stock',
            'product_ids': [self.product.id],
            'params': {'mode': 'increase', 'quantity': 25},
        }, format='json')
        self.assertEqual(res_inc.status_code, 200)
        self.stock_entry.refresh_from_db()
        self.assertEqual(self.stock_entry.quantity, 125)

        # Decrease by 20
        res_dec = self.client.post('/api/merchant/products/bulk/', {
            'action': 'update_stock',
            'product_ids': [self.product.id],
            'params': {'mode': 'decrease', 'quantity': 20},
        }, format='json')
        self.assertEqual(res_dec.status_code, 200)
        self.stock_entry.refresh_from_db()
        self.assertEqual(self.stock_entry.quantity, 105)

    def test_bulk_update_stock_rejects_multi_stock_ambiguity(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        # Create second stock entry for same product (warehouse 2)
        InventoryStockEntry.objects.create(
            product=self.product,
            variant=self.variant,
            warehouse_id=2,
            quantity=30,
            reserved_quantity=0,
            last_counted_at=timezone.now(),
            created_at=timezone.now(),
            updated_at=timezone.now(),
        )

        res = self.client.post('/api/merchant/products/bulk/', {
            'action': 'update_stock',
            'product_ids': [self.product.id],
            'params': {'mode': 'set', 'quantity': 80},
        }, format='json')
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data['code'], 'warehouse_stock_ambiguous')

    def test_bulk_update_stock_rejects_reduction_below_reserved(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        # self.stock_entry quantity=50, reserved_quantity=5
        res = self.client.post('/api/merchant/products/bulk/', {
            'action': 'update_stock',
            'product_ids': [self.product.id],
            'params': {'mode': 'set', 'quantity': 3},  # 3 < 5 reserved
        }, format='json')
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data['code'], 'stock_reserved')

    def test_bulk_delete_and_single_delete_block_active_reservations(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        # Active reservation
        reservation = InventoryReservation.objects.create(
            order_id=999,
            product=self.product,
            variant=self.variant,
            quantity=2,
            warehouse_id=1,
            status='active',
            expires_at=timezone.now() + timezone.timedelta(hours=1),
            created_at=timezone.now(),
        )

        # Single delete should fail with 409
        del_single = self.client.delete(f'/api/merchant/products/{self.product.id}/')
        self.assertEqual(del_single.status_code, 409)
        self.assertEqual(del_single.data['code'], 'active_reservations')

        # Bulk delete should fail with 409
        del_bulk = self.client.post('/api/merchant/products/bulk/', {
            'action': 'delete',
            'product_ids': [self.product.id],
        }, format='json')
        self.assertEqual(del_bulk.status_code, 409)
        self.assertEqual(del_bulk.data['code'], 'active_reservations')

        # Release reservation
        reservation.status = 'released'
        reservation.released_at = timezone.now()
        reservation.save()

        # Bulk delete now succeeds (soft-deactivates)
        del_ok = self.client.post('/api/merchant/products/bulk/', {
            'action': 'delete',
            'product_ids': [self.product.id],
        }, format='json')
        self.assertEqual(del_ok.status_code, 200)
        self.product.refresh_from_db()
        self.assertFalse(self.product.is_active)

    def test_create_product_with_variations(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        payload = {
            'name': 'Cargo Pants',
            'category': 'Bottoms › Cargo',
            'sku': 'MD-CARGO-MAIN',
            'price': 1500,
            'description': 'Tactical streetwear cargo pants',
            'variants': [
                {
                    'sku': 'MD-CARGO-BLK-S',
                    'attributes': {'Size': 'S', 'Color': 'Black'},
                    'price_override': 1500,
                    'stock': 15,
                    'is_active': True,
                },
                {
                    'sku': 'MD-CARGO-BLK-M',
                    'attributes': {'Size': 'M', 'Color': 'Black'},
                    'price_override': 1600,
                    'stock': 20,
                    'is_active': True,
                },
            ]
        }
        res = self.client.post('/api/merchant/products/', payload, format='json')
        self.assertEqual(res.status_code, 201)
        prod_id = res.data['id']
        self.assertEqual(res.data['stock'], 35)
        self.assertEqual(res.data['variants_count'], 2)

        prod = CatalogProduct.objects.get(id=prod_id)
        variants = list(prod.variants.all().order_by('id'))
        self.assertEqual(len(variants), 2)
        self.assertEqual(variants[0].sku, 'MD-CARGO-BLK-S')
        self.assertEqual(variants[0].price_adjustment, Decimal('0.00'))
        self.assertEqual(variants[1].sku, 'MD-CARGO-BLK-M')
        self.assertEqual(variants[1].price_adjustment, Decimal('100.00'))

        # Verify stock entries
        entry1 = InventoryStockEntry.objects.get(variant=variants[0])
        self.assertEqual(entry1.quantity, 15)
        entry2 = InventoryStockEntry.objects.get(variant=variants[1])
        self.assertEqual(entry2.quantity, 20)

    def test_create_product_variations_validation_and_duplicate_rejection(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        # Duplicate combination
        payload = {
            'name': 'Duplicate Combo Tee',
            'category': 'Tops › T-Shirts',
            'sku': 'MD-TEE-DUP',
            'price': 800,
            'variants': [
                {'sku': 'MD-TEE-1', 'attributes': {'Size': 'M'}, 'stock': 5},
                {'sku': 'MD-TEE-2', 'attributes': {'Size': 'M'}, 'stock': 5},
            ]
        }
        res = self.client.post('/api/merchant/products/', payload, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('Duplicate variation combination', res.data['error'])

        # Duplicate SKU with existing
        payload_sku = {
            'name': 'Duplicate SKU Tee',
            'category': 'Tops › T-Shirts',
            'sku': 'MD-TEE-SKU-DUP',
            'price': 800,
            'variants': [
                {'sku': self.product.sku, 'attributes': {'Size': 'L'}, 'stock': 5},
            ]
        }
        res_sku = self.client.post('/api/merchant/products/', payload_sku, format='json')
        self.assertEqual(res_sku.status_code, 409)

    def test_edit_product_with_variations(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        # Detail get returns variants
        detail_res = self.client.get(f'/api/merchant/products/{self.product.id}/')
        self.assertEqual(detail_res.status_code, 200)
        self.assertIn('variants', detail_res.data)
        self.assertEqual(len(detail_res.data['variants']), 1)
        v1_id = detail_res.data['variants'][0]['id']

        # Edit to update variant and add a second variant
        patch_res = self.client.patch(f'/api/merchant/products/{self.product.id}/', {
            'variants': [
                {
                    'id': v1_id,
                    'sku': self.product.sku,
                    'attributes': {'Size': 'Standard'},
                    'stock': 60,
                    'price_override': 1250,
                    'is_active': True,
                },
                {
                    'sku': 'MD-HOOD-001-XL',
                    'attributes': {'Size': 'XL'},
                    'stock': 15,
                    'price_override': 1350,
                    'is_active': True,
                }
            ]
        }, format='json')
        self.assertEqual(patch_res.status_code, 200)
        self.assertEqual(patch_res.data['total_stock'], 75)
        self.assertEqual(len(patch_res.data['variants']), 2)

    def test_edit_product_cannot_remove_variant_with_active_reservations(self):
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        # Put active reservation on self.variant
        InventoryReservation.objects.create(
            order_id=888,
            product=self.product,
            variant=self.variant,
            quantity=1,
            warehouse_id=1,
            status='active',
            expires_at=timezone.now() + timezone.timedelta(hours=1),
            created_at=timezone.now(),
        )

        # Attempt to patch variants omitting self.variant
        res = self.client.patch(f'/api/merchant/products/{self.product.id}/', {
            'variants': [
                {
                    'sku': 'MD-HOOD-NEW-ONLY',
                    'attributes': {'Size': 'XXL'},
                    'stock': 10,
                    'is_active': True,
                }
            ]
        }, format='json')
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.data['code'], 'active_reservations')

