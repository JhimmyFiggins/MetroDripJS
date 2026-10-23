from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APIClient

from content.models import CmsHomepageBanner
from identity.models import AccountsCustomer


class BannerIntegrationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        now = timezone.now()
        self.merchant = AccountsCustomer.objects.create(
            email='merchant-banners@example.com',
            name='Banner Merchant',
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
            'email': 'merchant-banners@example.com',
            'password': 'merchant-pass-123',
        }, format='json')
        self.assertEqual(login_res.status_code, 200)
        self.merchant_token = login_res.data['access_token']

        # Customer user without merchant role
        self.customer = AccountsCustomer.objects.create(
            email='customer-banners@example.com',
            name='Banner Customer',
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
            'email': 'customer-banners@example.com',
            'password': 'customer-pass-123',
        }, format='json')
        self.assertEqual(cust_login.status_code, 200)
        self.customer_token = cust_login.data['access_token']

    def test_end_to_end_banner_lifecycle_and_synchronization(self):
        # 1. Baseline: Public endpoint returns empty list initially
        public_res = self.client.get('/banners/')
        self.assertEqual(public_res.status_code, 200)
        self.assertEqual(public_res.data, [])

        # Also verify alias /api/banners/
        alias_res = self.client.get('/api/banners/')
        self.assertEqual(alias_res.status_code, 200)
        self.assertEqual(alias_res.data, [])

        # 2. Merchant creates a live banner
        create_res = self.client.post('/api/merchant/banners/', {
            'title': 'Summer Drop 2026',
            'headline': 'HEAT WAVE STREETWEAR',
            'subtext': 'Curated drop for the Manila heat',
            'button_label': 'Explore Collection',
            'placement': 'homepage_hero',
            'link_url': '/shop?category=tees',
            'image_url': '/assets/banners/summer.jpg',
            'status': 'Live',
            'order': 1,
        }, format='json', HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        self.assertEqual(create_res.status_code, 201)
        banner_id = create_res.data['id']
        self.assertEqual(create_res.data['status'], 'Live')

        # 3. Public customer endpoint immediately reflects the published banner
        public_res = self.client.get('/banners/')
        self.assertEqual(public_res.status_code, 200)
        self.assertEqual(len(public_res.data), 1)
        banner_data = public_res.data[0]
        self.assertEqual(banner_data['id'], banner_id)
        self.assertEqual(banner_data['title'], 'Summer Drop 2026')
        self.assertEqual(banner_data['headline'], 'HEAT WAVE STREETWEAR')
        self.assertEqual(banner_data['subtext'], 'Curated drop for the Manila heat')
        self.assertEqual(banner_data['button_label'], 'Explore Collection')
        self.assertEqual(banner_data['placement'], 'homepage_hero')
        self.assertEqual(banner_data['link_url'], '/shop?category=tees')

        # 4. Placement query parameter filtering works
        hero_res = self.client.get('/banners/?placement=homepage_hero')
        self.assertEqual(hero_res.status_code, 200)
        self.assertEqual(len(hero_res.data), 1)

        other_res = self.client.get('/banners/?placement=announcement_bar')
        self.assertEqual(other_res.status_code, 200)
        self.assertEqual(len(other_res.data), 0)

        # 5. Merchant updates the banner content
        patch_res = self.client.patch(f'/api/merchant/banners/{banner_id}/', {
            'headline': 'HEAT WAVE DROP · FINAL RESTOCK',
            'button_label': 'Grab Yours Now',
        }, format='json', HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        self.assertEqual(patch_res.status_code, 200)
        self.assertEqual(patch_res.data['headline'], 'HEAT WAVE DROP · FINAL RESTOCK')

        # Public endpoint immediately reflects the update
        public_res = self.client.get('/banners/')
        self.assertEqual(public_res.data[0]['headline'], 'HEAT WAVE DROP · FINAL RESTOCK')
        self.assertEqual(public_res.data[0]['button_label'], 'Grab Yours Now')

        # 6. Merchant unpublishes banner (sets to Draft)
        unpublish_res = self.client.patch(f'/api/merchant/banners/{banner_id}/', {
            'status': 'Draft',
        }, format='json', HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        self.assertEqual(unpublish_res.status_code, 200)
        self.assertEqual(unpublish_res.data['status'], 'Draft')

        # Public customer endpoint omits the draft banner
        public_res = self.client.get('/banners/')
        self.assertEqual(public_res.status_code, 200)
        self.assertEqual(public_res.data, [])

        # 7. Merchant schedules banner in the future
        future_time = (timezone.now() + timedelta(days=2)).isoformat()
        schedule_res = self.client.patch(f'/api/merchant/banners/{banner_id}/', {
            'status': 'Scheduled',
            'starts_at': future_time,
        }, format='json', HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        self.assertEqual(schedule_res.status_code, 200)
        self.assertEqual(schedule_res.data['status'], 'Scheduled')

        # Public customer endpoint omits scheduled future banner
        public_res = self.client.get('/banners/')
        self.assertEqual(public_res.status_code, 200)
        self.assertEqual(public_res.data, [])

        # 8. Merchant deletes banner
        delete_res = self.client.delete(
            f'/api/merchant/banners/{banner_id}/',
            HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}'
        )
        self.assertEqual(delete_res.status_code, 200)
        self.assertFalse(CmsHomepageBanner.objects.filter(pk=banner_id).exists())

        # Public endpoint remains empty
        public_res = self.client.get('/banners/')
        self.assertEqual(public_res.status_code, 200)
        self.assertEqual(public_res.data, [])

    def test_banner_authorization_and_security_controls(self):
        # Unauthenticated request to merchant banners endpoint is rejected
        unauth_create = self.client.post('/api/merchant/banners/', {
            'title': 'Hacker Banner',
            'status': 'Live',
        }, format='json')
        self.assertEqual(unauth_create.status_code, 401)

        # Non-staff customer request to merchant banners endpoint is rejected
        customer_create = self.client.post('/api/merchant/banners/', {
            'title': 'Customer Banner',
            'status': 'Live',
        }, format='json', HTTP_AUTHORIZATION=f'Bearer {self.customer_token}')
        self.assertEqual(customer_create.status_code, 403)

        # Create a banner as merchant
        banner = CmsHomepageBanner.objects.create(
            title='Authorized Banner',
            placement='homepage_hero',
            is_active=True,
            order=1,
        )

        # Customer cannot modify banner
        customer_patch = self.client.patch(
            f'/api/merchant/banners/{banner.id}/',
            {'title': 'Tampered'},
            format='json',
            HTTP_AUTHORIZATION=f'Bearer {self.customer_token}'
        )
        self.assertEqual(customer_patch.status_code, 403)

        # Customer cannot delete banner
        customer_delete = self.client.delete(
            f'/api/merchant/banners/{banner.id}/',
            HTTP_AUTHORIZATION=f'Bearer {self.customer_token}'
        )
        self.assertEqual(customer_delete.status_code, 403)
        self.assertTrue(CmsHomepageBanner.objects.filter(pk=banner.id).exists())

    def test_artwork_customization_and_mode_switching(self):
        # 1. Merchant creates a banner with custom graphic configuration
        create_res = self.client.post('/api/merchant/banners/', {
            'title': 'Vol 5 Neon Drop',
            'headline': 'NEON STREETS',
            'placement': 'homepage_hero',
            'status': 'Live',
            'artwork_mode': 'graphic',
            'graphic_text_main': 'DRIP',
            'graphic_text_tagline': 'METRO EXCLUSIVE 2026',
            'graphic_text_sub': 'LIMITED EDITION / MANILA',
            'graphic_bg_color': '#ff0055',
            'graphic_text_color': '#ffffff',
            'graphic_accent_color': '#00ffcc',
            'graphic_alignment': 'center',
            'graphic_font_size': 'large',
            'image_fit': 'contain',
        }, format='json', HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        self.assertEqual(create_res.status_code, 201)
        banner_id = create_res.data['id']
        self.assertEqual(create_res.data['artwork_mode'], 'graphic')
        self.assertEqual(create_res.data['graphic_text_main'], 'DRIP')
        self.assertEqual(create_res.data['graphic_bg_color'], '#ff0055')
        self.assertEqual(create_res.data['graphic_alignment'], 'center')

        # 2. Public storefront reflects custom graphic properties
        public_res = self.client.get('/banners/?placement=homepage_hero')
        self.assertEqual(public_res.status_code, 200)
        hero = next(b for b in public_res.data if b['id'] == banner_id)
        self.assertEqual(hero['artwork_mode'], 'graphic')
        self.assertEqual(hero['graphic_text_main'], 'DRIP')
        self.assertEqual(hero['graphic_bg_color'], '#ff0055')

        # 3. Switch mode to custom image while preserving graphic settings
        patch_res = self.client.patch(f'/api/merchant/banners/{banner_id}/', {
            'artwork_mode': 'image',
            'image_url': '/media/banners/custom_hero.png',
        }, format='json', HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        self.assertEqual(patch_res.status_code, 200)
        self.assertEqual(patch_res.data['artwork_mode'], 'image')
        self.assertEqual(patch_res.data['image_url'], '/media/banners/custom_hero.png')
        # Preserved previous graphic configuration
        self.assertEqual(patch_res.data['graphic_text_main'], 'DRIP')
        self.assertEqual(patch_res.data['graphic_bg_color'], '#ff0055')

        # 4. Public storefront reflects image mode
        public_res2 = self.client.get('/banners/?placement=homepage_hero')
        hero2 = next(b for b in public_res2.data if b['id'] == banner_id)
        self.assertEqual(hero2['artwork_mode'], 'image')
        self.assertEqual(hero2['image_url'], '/media/banners/custom_hero.png')
        self.assertEqual(hero2['graphic_text_main'], 'DRIP')

    def test_artwork_validation_and_injection_prevention(self):
        # 1. Invalid hex color is rejected
        res_bad_color = self.client.post('/api/merchant/banners/', {
            'title': 'Bad Color Banner',
            'headline': 'Exploit Attempt',
            'graphic_bg_color': 'red; background: url(evil.com)',
        }, format='json', HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        self.assertEqual(res_bad_color.status_code, 400)
        self.assertIn('hex color', res_bad_color.data['error'])

        # 2. HTML script tag in graphic text is rejected
        res_xss = self.client.post('/api/merchant/banners/', {
            'title': 'XSS Attempt',
            'headline': 'Clean Headline',
            'graphic_text_main': '<script>alert(1)</script>',
        }, format='json', HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        self.assertEqual(res_xss.status_code, 400)
        self.assertIn('invalid characters', res_xss.data['error'])

        # 3. Unsupported artwork mode is rejected
        res_bad_mode = self.client.post('/api/merchant/banners/', {
            'title': 'Bad Mode Banner',
            'headline': 'Clean Headline',
            'artwork_mode': 'vector_canvas',
        }, format='json', HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        self.assertEqual(res_bad_mode.status_code, 400)
        self.assertIn('artwork_mode must be one of', res_bad_mode.data['error'])

    def test_banner_image_upload_endpoint(self):
        # 1. Anonymous upload rejected
        anon_res = self.client.post('/api/merchant/banners/upload/', {})
        self.assertEqual(anon_res.status_code, 401)

        # 2. Non-staff customer upload rejected
        cust_res = self.client.post('/api/merchant/banners/upload/', {}, HTTP_AUTHORIZATION=f'Bearer {self.customer_token}')
        self.assertEqual(cust_res.status_code, 403)

        # 3. Missing file rejected
        empty_res = self.client.post('/api/merchant/banners/upload/', {}, HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        self.assertEqual(empty_res.status_code, 400)
        self.assertIn('image file is required', empty_res.data['error'])

        # 4. Non-image file (e.g. text/html) rejected
        html_file = SimpleUploadedFile('exploit.html', b'<html><script>alert(1)</script></html>', content_type='text/html')
        bad_format_res = self.client.post('/api/merchant/banners/upload/', {'file': html_file}, HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        self.assertEqual(bad_format_res.status_code, 400)
        self.assertIn('Only JPG, PNG, and WebP', bad_format_res.data['error'])

        # 5. Valid PNG file (with valid PNG magic bytes) succeeds
        valid_png_content = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4'
        png_file = SimpleUploadedFile('hero_promo.png', valid_png_content, content_type='image/png')
        upload_res = self.client.post('/api/merchant/banners/upload/', {'file': png_file}, HTTP_AUTHORIZATION=f'Bearer {self.merchant_token}')
        self.assertEqual(upload_res.status_code, 201)
        self.assertTrue(upload_res.data['url'].startswith('/media/banners/'))
        self.assertEqual(upload_res.data['mime_type'], 'image/png')

