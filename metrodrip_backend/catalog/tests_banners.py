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
