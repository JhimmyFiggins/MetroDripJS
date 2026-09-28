from django.test import TestCase
from django.conf import settings
from rest_framework.test import APIClient
from content.models import CmsHomepageBanner, CmsContactMessage

class ContentServiceTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.banner1 = CmsHomepageBanner.objects.create(
            title='Hero Banner',
            image_url='/assets/banners/hero.jpg',
            link_url='/shop',
            is_active=True,
            order=1,
        )
        self.banner2 = CmsHomepageBanner.objects.create(
            title='Draft Banner',
            image_url='/assets/banners/draft.jpg',
            link_url='/draft',
            is_active=False,
            order=2,
        )

    def test_health_check(self):
        res = self.client.get('/health/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['service'], 'content')

    def test_public_banners_filtering(self):
        res = self.client.get('/banners/')
        self.assertEqual(res.status_code, 200)
        # Should only return active banners
        self.assertEqual(len(res.data), 1)
        self.assertEqual(res.data[0]['title'], 'Hero Banner')

        res_alias = self.client.get('/api/content/banners/')
        self.assertEqual(res_alias.status_code, 200)
        self.assertEqual(len(res_alias.data), 1)

    def test_merchant_banners_crud(self):
        self.client.credentials(HTTP_X_INTERNAL_TOKEN=settings.INTERNAL_TOKEN, HTTP_X_USER_ROLE='merchant')
        # 1. List all banners
        res = self.client.get('/api/merchant/banners/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.data), 2)

        # 2. Create banner
        create_res = self.client.post('/api/merchant/banners/', {
            'title': 'Flash Sale Promo',
            'link_url': '/flash-sale',
            'is_active': True,
            'order': 3,
        }, format='json')
        self.assertEqual(create_res.status_code, 201)
        new_id = create_res.data['id']

        # 3. Patch banner
        patch_res = self.client.patch(f'/api/merchant/banners/{new_id}/', {
            'title': 'Flash Sale Extended',
            'is_active': False,
        }, format='json')
        self.assertEqual(patch_res.status_code, 200)
        self.assertEqual(patch_res.data['title'], 'Flash Sale Extended')
        self.assertFalse(patch_res.data['is_active'])

        # 4. Delete banner
        del_res = self.client.delete(f'/api/merchant/banners/{new_id}/')
        self.assertEqual(del_res.status_code, 200)
        self.assertFalse(CmsHomepageBanner.objects.filter(pk=new_id).exists())

    def test_merchant_banners_negative(self):
        self.client.credentials(HTTP_X_INTERNAL_TOKEN=settings.INTERNAL_TOKEN, HTTP_X_USER_ROLE='merchant')
        # Missing title
        res = self.client.post('/api/merchant/banners/', {'link_url': '/promo'}, format='json')
        self.assertEqual(res.status_code, 400)

        # 404 for non-existent banner
        res_404 = self.client.patch('/api/merchant/banners/999999/', {'title': 'Ghost'}, format='json')
        self.assertEqual(res_404.status_code, 404)

    def test_contact_messages_flow(self):
        # 1. Validation error on missing fields
        bad_res = self.client.post('/contact/', {'name': 'Juan'}, format='json')
        self.assertEqual(bad_res.status_code, 400)

        # 2. Successful creation
        good_res = self.client.post('/contact/', {
            'name': 'Maria Santos',
            'email': 'maria@example.com',
            'message': 'Inquiry about bulk shipping to Cebu.',
        }, format='json')
        self.assertEqual(good_res.status_code, 201)
        msg_id = good_res.data['id']

        # 3. Merchant list
        self.client.credentials(HTTP_X_INTERNAL_TOKEN=settings.INTERNAL_TOKEN, HTTP_X_USER_ROLE='merchant')
        list_res = self.client.get('/api/merchant/contact-messages/')
        self.assertEqual(list_res.status_code, 200)
        self.assertTrue(any(m['id'] == msg_id for m in list_res.data))

        # 4. Resolve message
        resolve_res = self.client.patch(f'/api/merchant/contact-messages/{msg_id}/', {
            'is_resolved': True,
        }, format='json')
        self.assertEqual(resolve_res.status_code, 200)
        self.assertTrue(resolve_res.data['is_resolved'])
