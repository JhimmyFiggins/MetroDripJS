import re
from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from identity.brevo import clear_test_outbox, get_test_outbox
from identity.models import AccountsCustomer, CustomerAccessToken, EmailOtpChallenge, PlatformSetting


@override_settings(EMAIL_OTP_ENFORCED=True, BREVO_TEST_MODE=True)
class EmailOtpAuthenticationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        clear_test_outbox()
        self.now = timezone.now()

    def create_user(self, role='customer', email='customer@example.com', verified=True, staff=False):
        return AccountsCustomer.objects.create(
            name='OTP User',
            email=email,
            phone='',
            addresses={},
            role=role,
            is_active=True,
            is_staff=staff or role in {'admin', 'merchant'},
            is_superuser=role == 'admin',
            date_joined=self.now,
            email_verified_at=self.now if verified else None,
            password='synthetic-password',
        )

    def latest_code(self):
        body = get_test_outbox()[-1]['text_content']
        match = re.search(r'Code: (\d{6})', body)
        self.assertIsNotNone(match)
        return match.group(1)

    def test_signup_requires_otp_and_does_not_issue_a_session(self):
        response = self.client.post('/signup/', {
            'name': 'New Customer',
            'email': 'new@example.com',
            'password': 'synthetic-password',
        }, format='json')
        self.assertEqual(response.status_code, 202)
        self.assertTrue(response.data['otp_required'])
        self.assertNotIn('access_token', response.data)
        self.assertNotIn(self.latest_code(), str(response.data))
        customer = AccountsCustomer.objects.get(email='new@example.com')
        self.assertIsNone(customer.email_verified_at)
        self.assertFalse(CustomerAccessToken.objects.filter(customer=customer).exists())

        confirmed = self.client.post('/auth/otp/verify/', {
            'challenge_id': response.data['challenge_id'],
            'code': self.latest_code(),
        }, format='json')
        self.assertEqual(confirmed.status_code, 200)
        self.assertTrue(confirmed.data['verified'])
        self.assertNotIn('access_token', confirmed.data)
        customer.refresh_from_db()
        self.assertIsNotNone(customer.email_verified_at)

        replay = self.client.post('/auth/otp/verify/', {
            'challenge_id': response.data['challenge_id'],
            'code': self.latest_code(),
        }, format='json')
        self.assertEqual(replay.status_code, 400)

    def test_customer_login_token_is_withheld_until_otp(self):
        user = self.create_user()
        user.set_password('synthetic-password')
        user.save(update_fields=['password'])
        login = self.client.post('/login/', {
            'email': user.email,
            'password': 'synthetic-password',
        }, format='json')
        self.assertEqual(login.status_code, 200)
        self.assertEqual(login.data['purpose'], 'login_2fa')
        self.assertNotIn('access_token', login.data)
        self.assertFalse(CustomerAccessToken.objects.filter(customer=user).exists())

        wrong = self.client.post('/auth/otp/verify/', {
            'challenge_id': login.data['challenge_id'],
            'code': '000000',
        }, format='json')
        self.assertEqual(wrong.status_code, 400)
        self.assertFalse(CustomerAccessToken.objects.filter(customer=user).exists())

        verified = self.client.post('/auth/otp/verify/', {
            'challenge_id': login.data['challenge_id'],
            'code': self.latest_code(),
        }, format='json')
        self.assertEqual(verified.status_code, 200)
        self.assertTrue(verified.data['access_token'])
        profile = self.client.get('/profile/', HTTP_AUTHORIZATION=f"Bearer {verified.data['access_token']}")
        self.assertEqual(profile.status_code, 200)

    def test_expired_and_cross_user_codes_do_not_authenticate(self):
        user = self.create_user()
        user.set_password('synthetic-password')
        user.save(update_fields=['password'])
        other = self.create_user(email='other@example.com')
        other.set_password('synthetic-password')
        other.save(update_fields=['password'])
        first = self.client.post('/login/', {'email': user.email, 'password': 'synthetic-password'}, format='json')
        second = self.client.post('/login/', {'email': other.email, 'password': 'synthetic-password'}, format='json')
        crossed = self.client.post('/auth/otp/verify/', {
            'challenge_id': second.data['challenge_id'],
            'code': re.search(r'Code: (\d{6})', get_test_outbox()[0]['text_content']).group(1),
        }, format='json')
        self.assertEqual(crossed.status_code, 400)
        EmailOtpChallenge.objects.filter(customer=user).update(expires_at=timezone.now() - timedelta(seconds=1))
        expired = self.client.post('/auth/otp/verify/', {
            'challenge_id': first.data['challenge_id'],
            'code': re.search(r'Code: (\d{6})', get_test_outbox()[0]['text_content']).group(1),
        }, format='json')
        self.assertEqual(expired.data['code'], 'otp_expired')

    def test_attempt_limit_and_resend_cooldown(self):
        user = self.create_user()
        user.set_password('synthetic-password')
        user.save(update_fields=['password'])
        login = self.client.post('/login/', {'email': user.email, 'password': 'synthetic-password'}, format='json')
        for _ in range(5):
            self.client.post('/auth/otp/verify/', {
                'challenge_id': login.data['challenge_id'],
                'code': '111111',
            }, format='json')
        locked = self.client.post('/auth/otp/verify/', {
            'challenge_id': login.data['challenge_id'],
            'code': self.latest_code(),
        }, format='json')
        self.assertEqual(locked.data['code'], 'otp_locked')
        cooling = self.client.post('/auth/otp/resend/', {'challenge_id': login.data['challenge_id']}, format='json')
        self.assertEqual(cooling.status_code, 429)
        EmailOtpChallenge.objects.filter(customer=user).update(sent_at=timezone.now() - timedelta(seconds=61))
        resent = self.client.post('/auth/otp/resend/', {'challenge_id': login.data['challenge_id']}, format='json')
        self.assertEqual(resent.status_code, 200)
        self.assertNotEqual(resent.data['challenge_id'], login.data['challenge_id'])

    def test_staff_policy_controls_admin_and_merchant_otp(self):
        PlatformSetting.objects.update_or_create(id=1, defaults={'staff_mfa_policy': 'optional'})
        admin = self.create_user(role='admin', email='admin@example.com')
        admin.set_password('synthetic-password')
        admin.save(update_fields=['password'])
        optional = self.client.post('/login/', {'email': admin.email, 'password': 'synthetic-password'}, format='json')
        self.assertIn('access_token', optional.data)

        PlatformSetting.objects.filter(id=1).update(staff_mfa_policy='required')
        merchant = self.create_user(role='merchant', email='merchant@example.com')
        merchant.set_password('synthetic-password')
        merchant.save(update_fields=['password'])
        required = self.client.post('/login/', {'email': merchant.email, 'password': 'synthetic-password'}, format='json')
        self.assertEqual(required.data['purpose'], 'login_2fa')
        self.assertNotIn('access_token', required.data)

    def test_unverified_token_cannot_read_profile_when_otp_is_enforced(self):
        user = self.create_user(verified=False)
        _token, raw = CustomerAccessToken.issue(user)
        response = self.client.get('/profile/', HTTP_AUTHORIZATION=f'Bearer {raw}')
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data['code'], 'email_unverified')
