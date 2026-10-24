import json
import urllib.error
from datetime import timedelta
from unittest.mock import MagicMock, patch

from django.conf import settings
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from identity.admin_views import generate_secure_temporary_password
from identity.brevo import (
    clear_test_outbox,
    get_test_outbox,
    is_brevo_configured,
    send_transactional_email,
)
from identity.models import (
    AccountsCustomer,
    CustomerAccessToken,
    PasswordResetToken,
)


class BaseAuthTestCase(TestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        clear_test_outbox()

        # Create base test accounts
        self.admin_user = AccountsCustomer.objects.create(
            email='superadmin@metrodrip.ph',
            name='Admin User',
            role='admin',
            is_staff=True,
            is_superuser=True,
            is_active=True,
            addresses=[],
            date_joined=timezone.now(),
            password_change_required=False,
        )
        self.admin_user.set_password('AdminPass1234!')
        self.admin_user.save()

        self.merchant_user = AccountsCustomer.objects.create(
            email='merchant@metrodrip.ph',
            name='Merchant User',
            role='merchant',
            is_staff=True,
            is_superuser=False,
            is_active=True,
            addresses=[],
            date_joined=timezone.now(),
            password_change_required=False,
        )
        self.merchant_user.set_password('MerchantPass1234!')
        self.merchant_user.save()

        self.customer_user = AccountsCustomer.objects.create(
            email='customer@example.com',
            name='Customer User',
            role='customer',
            is_staff=False,
            is_superuser=False,
            is_active=True,
            addresses=[],
            date_joined=timezone.now(),
            password_change_required=False,
        )
        self.customer_user.set_password('CustomerPass1234!')
        self.customer_user.save()

    def get_token(self, user):
        token_obj, token_str = CustomerAccessToken.issue(customer=user)
        return token_str


class AccountProvisioningTests(BaseAuthTestCase):
    """
    Feature A: Secure Account Provisioning, Temporary Passwords,
    and first-login password-change enforcement.
    """

    def test_generate_secure_temporary_password(self):
        pwd = generate_secure_temporary_password(14)
        self.assertEqual(len(pwd), 14)
        self.assertTrue(any(c.isupper() for c in pwd))
        self.assertTrue(any(c.islower() for c in pwd))
        self.assertTrue(any(c.isdigit() for c in pwd))
        self.assertTrue(any(c in '!@#$%^&*()-_=+' for c in pwd))

    def test_admin_creates_account_with_custom_temporary_password(self):
        admin_token = self.get_token(self.admin_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token}')

        payload = {
            'name': 'New Staff',
            'email': 'newstaff@metrodrip.ph',
            'role': 'merchant',
            'password_option': 'custom',
            'password': 'TempSecretPasscode987!',
        }
        res = self.client.post('/api/admin/users/', data=json.dumps(payload), content_type='application/json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        data = res.json()
        self.assertEqual(data['email'], 'newstaff@metrodrip.ph')
        self.assertTrue(data['password_change_required'])

        new_account = AccountsCustomer.objects.get(email='newstaff@metrodrip.ph')
        self.assertTrue(new_account.check_password('TempSecretPasscode987!'))
        self.assertTrue(new_account.password_change_required)

        # Ensure subsequent GET does not leak password
        get_res = self.client.get('/api/admin/users/')
        self.assertEqual(get_res.status_code, status.HTTP_200_OK)
        user_list = get_res.json()
        target = next((u for u in user_list if u['email'] == 'newstaff@metrodrip.ph'), None)
        self.assertIsNotNone(target)
        self.assertNotIn('password', target)
        self.assertNotIn('temporary_password', target)

    def test_admin_creates_account_with_generated_temporary_password(self):
        admin_token = self.get_token(self.admin_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token}')

        payload = {
            'name': 'Generated Staff',
            'email': 'genstaff@metrodrip.ph',
            'role': 'admin',
            'password_option': 'generated',
        }
        res = self.client.post('/api/admin/users/', data=json.dumps(payload), content_type='application/json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        data = res.json()
        self.assertIn('temporary_password', data)
        temp_pwd = data['temporary_password']
        self.assertGreaterEqual(len(temp_pwd), 12)

        account = AccountsCustomer.objects.get(email='genstaff@metrodrip.ph')
        self.assertTrue(account.check_password(temp_pwd))
        self.assertTrue(account.password_change_required)

    @override_settings(BREVO_API_KEY='test-key', BREVO_TEST_MODE=True)
    def test_admin_creates_account_with_email_invite(self):
        admin_token = self.get_token(self.admin_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token}')

        payload = {
            'name': 'Invited User',
            'email': 'invitee@metrodrip.ph',
            'role': 'customer',
            'password_option': 'email_invite',
        }
        res = self.client.post('/api/admin/users/', data=json.dumps(payload), content_type='application/json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        account = AccountsCustomer.objects.get(email='invitee@metrodrip.ph')
        self.assertFalse(account.has_usable_password())
        self.assertTrue(account.password_change_required)

        # Check that Brevo test outbox received setup invitation
        outbox = get_test_outbox()
        self.assertEqual(len(outbox), 1)
        self.assertEqual(outbox[0]['to_email'], 'invitee@metrodrip.ph')
        self.assertIn('Set up your MetroDrip', outbox[0]['subject'])

    def test_unauthorized_account_creation_rejected(self):
        cust_token = self.get_token(self.customer_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {cust_token}')

        payload = {'name': 'Hack', 'email': 'hack@example.com', 'role': 'admin'}
        res = self.client.post('/api/admin/users/', data=json.dumps(payload), content_type='application/json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_restricted_token_enforcement(self):
        """
        Users with password_change_required=True are restricted from accessing
        protected application endpoints until password is changed.
        """
        temp_user = AccountsCustomer.objects.create(
            email='tempuser@example.com',
            name='Temp User',
            role='customer',
            is_active=True,
            is_staff=False,
            is_superuser=False,
            addresses=[],
            date_joined=timezone.now(),
            password_change_required=True,
        )
        temp_user.set_password('TemporaryPass123!')
        temp_user.save()

        # Login successfully
        login_res = self.client.post('/login/', data={
            'email': 'tempuser@example.com',
            'password': 'TemporaryPass123!',
        }, format='json')
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)
        token = login_res.json()['token']
        self.assertTrue(login_res.json()['password_change_required'])

        # Attempt to access protected endpoint (e.g. /profile/ or /users/me/)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        protected_res = self.client.get('/profile/')
        self.assertEqual(protected_res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(protected_res.json().get('code'), 'password_change_required')

        # Permitted endpoint: /users/me/password/ allows changing password
        pwd_res = self.client.patch('/users/me/password/', data={
            'current_password': 'TemporaryPass123!',
            'new_password': 'PermanentNewPass123!',
        }, format='json')
        self.assertEqual(pwd_res.status_code, status.HTTP_200_OK)

        # Refresh user from database
        temp_user.refresh_from_db()
        self.assertFalse(temp_user.password_change_required)
        self.assertTrue(temp_user.check_password('PermanentNewPass123!'))

        # Now protected endpoint is accessible!
        now_allowed = self.client.get('/profile/')
        self.assertEqual(now_allowed.status_code, status.HTTP_200_OK)


class PasswordResetFlowTests(BaseAuthTestCase):
    """
    Feature B & C: Administrator-initiated and Self-service Password Recovery.
    """

    @override_settings(BREVO_API_KEY='test-key', BREVO_TEST_MODE=True)
    def test_admin_initiated_password_reset(self):
        admin_token = self.get_token(self.admin_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token}')

        res = self.client.post(f'/api/admin/users/{self.merchant_user.id}/reset-password/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        outbox = get_test_outbox()
        self.assertEqual(len(outbox), 1)
        self.assertEqual(outbox[0]['to_email'], self.merchant_user.email)
        self.assertIn('Password reset', outbox[0]['subject'])

        token = PasswordResetToken.objects.filter(customer=self.merchant_user, purpose='reset').first()
        self.assertIsNotNone(token)
        self.assertIsNone(token.consumed_at)

    @override_settings(BREVO_API_KEY='', BREVO_TEST_MODE=False)
    def test_admin_reset_when_brevo_unconfigured_returns_501(self):
        admin_token = self.get_token(self.admin_user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token}')

        res = self.client.post(f'/api/admin/users/{self.merchant_user.id}/reset-password/')
        self.assertEqual(res.status_code, status.HTTP_501_NOT_IMPLEMENTED)
        self.assertEqual(res.json().get('code'), 'reset_delivery_unconfigured')

    @override_settings(BREVO_API_KEY='test-key', BREVO_TEST_MODE=True)
    def test_self_service_forgot_password_enumeration_safe(self):
        # 1. Existing user
        res1 = self.client.post('/forgot-password/', data={'email': self.customer_user.email}, format='json')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertTrue(res1.json().get('success'))

        # 2. Non-existent user returns identical 200 response
        res2 = self.client.post('/forgot-password/', data={'email': 'nonexistent@example.com'}, format='json')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertTrue(res2.json().get('success'))
        self.assertEqual(res1.json()['message'], res2.json()['message'])

        # Only 1 email was sent (for the existing user)
        outbox = get_test_outbox()
        self.assertEqual(len(outbox), 1)
        self.assertEqual(outbox[0]['to_email'], self.customer_user.email)

    @override_settings(BREVO_API_KEY='', BREVO_TEST_MODE=False)
    def test_self_service_when_brevo_unconfigured_returns_503(self):
        res = self.client.post('/forgot-password/', data={'email': self.customer_user.email}, format='json')
        self.assertEqual(res.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(res.json().get('code'), 'reset_delivery_unconfigured')

    def test_token_verification_and_atomic_consumption(self):
        # Issue a reset token
        token_obj, raw_token = PasswordResetToken.issue(customer=self.customer_user, purpose='reset')

        # Issue active bearer session for customer to test revocation
        active_token = self.get_token(self.customer_user)
        self.assertEqual(CustomerAccessToken.objects.filter(customer=self.customer_user, revoked_at__isnull=True).count(), 1)

        # 1. Verify valid token
        verify_res = self.client.get(f'/password-reset/verify/?token={raw_token}')
        self.assertEqual(verify_res.status_code, status.HTTP_200_OK)
        self.assertTrue(verify_res.json()['valid'])
        self.assertEqual(verify_res.json()['purpose'], 'reset')

        # 2. Invalidate/test password mismatch
        mismatch_res = self.client.post('/password-reset/confirm/', data={
            'token': raw_token,
            'new_password': 'BrandNewPass1234!',
            'confirm_password': 'DifferentPassword1234!',
        }, format='json')
        self.assertEqual(mismatch_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(mismatch_res.json().get('code'), 'password_mismatch')

        # 3. Confirm with valid passwords
        confirm_res = self.client.post('/password-reset/confirm/', data={
            'token': raw_token,
            'new_password': 'BrandNewPass1234!',
            'confirm_password': 'BrandNewPass1234!',
        }, format='json')
        self.assertEqual(confirm_res.status_code, status.HTTP_200_OK)

        # Verify password changed in DB
        self.customer_user.refresh_from_db()
        self.assertTrue(self.customer_user.check_password('BrandNewPass1234!'))

        # Verify token is now consumed
        token_obj.refresh_from_db()
        self.assertIsNotNone(token_obj.consumed_at)

        # Verify previous bearer tokens were revoked
        active_count = CustomerAccessToken.objects.filter(customer=self.customer_user, revoked_at__isnull=True).count()
        self.assertEqual(active_count, 0)

        # 4. Token cannot be reused!
        reuse_res = self.client.post('/password-reset/confirm/', data={
            'token': raw_token,
            'new_password': 'AnotherNewPass1234!',
            'confirm_password': 'AnotherNewPass1234!',
        }, format='json')
        self.assertEqual(reuse_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(reuse_res.json().get('code'), 'token_already_used')

    def test_expired_token_rejected(self):
        token_obj, raw_token = PasswordResetToken.issue(
            customer=self.customer_user,
            purpose='reset',
            lifetime_seconds=1,
        )
        # Manually backdate expires_at
        token_obj.expires_at = timezone.now() - timedelta(minutes=10)
        token_obj.save(update_fields=['expires_at'])

        verify_res = self.client.get(f'/password-reset/verify/?token={raw_token}')
        self.assertEqual(verify_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(verify_res.json().get('code'), 'token_expired')

        confirm_res = self.client.post('/password-reset/confirm/', data={
            'token': raw_token,
            'new_password': 'ValidPassword123!',
            'confirm_password': 'ValidPassword123!',
        }, format='json')
        self.assertEqual(confirm_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(confirm_res.json().get('code'), 'token_expired')

    def test_suspended_account_cannot_reset_password(self):
        self.customer_user.is_active = False
        self.customer_user.save()

        token_obj, raw_token = PasswordResetToken.issue(customer=self.customer_user)
        verify_res = self.client.get(f'/password-reset/verify/?token={raw_token}')
        self.assertEqual(verify_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(verify_res.json().get('code'), 'account_inactive')


class BrevoIntegrationTests(TestCase):
    """
    Feature D: Brevo HTTPS transactional email client.
    """

    def setUp(self):
        clear_test_outbox()

    @override_settings(
        BREVO_API_KEY='xkeysib-mock-api-key',
        BREVO_SENDER_EMAIL='sender@metrodrip.ph',
        BREVO_SENDER_NAME='MetroDrip Security',
        BREVO_TEST_MODE=False,
    )
    @patch('urllib.request.urlopen')
    def test_brevo_successful_send(self, mock_urlopen):
        # Mock successful HTTP 201 response from Brevo
        mock_response = MagicMock()
        mock_response.status = 201
        mock_response.read.return_value = json.dumps({'messageId': '<20261024.12345@smtp-relay.brevo.com>'}).encode('utf-8')
        mock_urlopen.return_value.__enter__.return_value = mock_response

        res = send_transactional_email(
            to_email='customer@example.com',
            to_name='Test Customer',
            subject='Security Test',
            html_content='<p>Hello world</p>',
            text_content='Hello world',
        )
        self.assertTrue(res['success'])
        self.assertEqual(res['message_id'], '<20261024.12345@smtp-relay.brevo.com>')

        # Verify request structure passed to urlopen
        called_request = mock_urlopen.call_args[0][0]
        self.assertEqual(called_request.full_url, 'https://api.brevo.com/v3/smtp/email')
        self.assertEqual(called_request.headers.get('Api-key'), 'xkeysib-mock-api-key')
        self.assertEqual(called_request.headers.get('Content-type'), 'application/json')

        body = json.loads(called_request.data.decode('utf-8'))
        self.assertEqual(body['sender']['email'], 'sender@metrodrip.ph')
        self.assertEqual(body['to'][0]['email'], 'customer@example.com')
        self.assertEqual(body['subject'], 'Security Test')

    @override_settings(
        BREVO_API_KEY='xkeysib-mock-api-key',
        BREVO_SENDER_EMAIL='sender@metrodrip.ph',
        BREVO_TEST_MODE=False,
    )
    @patch('urllib.request.urlopen')
    def test_brevo_401_authentication_failure(self, mock_urlopen):
        error_resp = urllib.error.HTTPError(
            url='https://api.brevo.com/v3/smtp/email',
            code=401,
            msg='Unauthorized',
            hdrs={},
            fp=MagicMock(read=lambda: json.dumps({'message': 'Key not found', 'code': 'unauthorized'}).encode('utf-8')),
        )
        mock_urlopen.side_effect = error_resp

        res = send_transactional_email(
            to_email='test@example.com',
            to_name='Test',
            subject='Test',
            html_content='<p>test</p>',
            text_content='test',
        )
        self.assertFalse(res['success'])
        self.assertEqual(res['code'], 'email_auth_failed')

    @override_settings(
        BREVO_API_KEY='xkeysib-mock-api-key',
        BREVO_SENDER_EMAIL='sender@metrodrip.ph',
        BREVO_TEST_MODE=False,
    )
    @patch('urllib.request.urlopen')
    def test_brevo_400_invalid_sender(self, mock_urlopen):
        error_resp = urllib.error.HTTPError(
            url='https://api.brevo.com/v3/smtp/email',
            code=400,
            msg='Bad Request',
            hdrs={},
            fp=MagicMock(read=lambda: json.dumps({'message': 'Sender not verified', 'code': 'invalid_parameter'}).encode('utf-8')),
        )
        mock_urlopen.side_effect = error_resp

        res = send_transactional_email(
            to_email='test@example.com',
            to_name='Test',
            subject='Test',
            html_content='<p>test</p>',
            text_content='test',
        )
        self.assertFalse(res['success'])
        self.assertEqual(res['code'], 'email_rejected')
        self.assertIn('Sender not verified', res['error'])

    @override_settings(
        BREVO_API_KEY='xkeysib-mock-api-key',
        BREVO_SENDER_EMAIL='sender@metrodrip.ph',
        BREVO_TEST_MODE=False,
    )
    @patch('urllib.request.urlopen')
    def test_brevo_402_403_account_unactivated(self, mock_urlopen):
        error_resp = urllib.error.HTTPError(
            url='https://api.brevo.com/v3/smtp/email',
            code=403,
            msg='Forbidden',
            hdrs={},
            fp=MagicMock(read=lambda: json.dumps({
                'message': 'Your account is not activated yet to send transactional emails.',
                'code': 'permission_denied',
            }).encode('utf-8')),
        )
        mock_urlopen.side_effect = error_resp

        res = send_transactional_email(
            to_email='test@example.com',
            to_name='Test',
            subject='Test',
            html_content='<p>test</p>',
            text_content='test',
        )
        self.assertFalse(res['success'])
        self.assertEqual(res['code'], 'email_account_unactivated')
        self.assertIn('not activated', res['error'])

    @override_settings(
        BREVO_API_KEY='xkeysib-mock-api-key',
        BREVO_SENDER_EMAIL='sender@metrodrip.ph',
        BREVO_TEST_MODE=False,
    )
    @patch('urllib.request.urlopen')
    def test_brevo_429_rate_limiting(self, mock_urlopen):
        error_resp = urllib.error.HTTPError(
            url='https://api.brevo.com/v3/smtp/email',
            code=429,
            msg='Too Many Requests',
            hdrs={},
            fp=MagicMock(read=lambda: json.dumps({'message': 'Rate limit exceeded'}).encode('utf-8')),
        )
        mock_urlopen.side_effect = error_resp

        res = send_transactional_email(
            to_email='test@example.com',
            to_name='Test',
            subject='Test',
            html_content='<p>test</p>',
            text_content='test',
        )
        self.assertFalse(res['success'])
        self.assertEqual(res['code'], 'email_rate_limit')

    @override_settings(
        BREVO_API_KEY='xkeysib-mock-api-key',
        BREVO_SENDER_EMAIL='sender@metrodrip.ph',
        BREVO_TEST_MODE=False,
    )
    @patch('urllib.request.urlopen')
    def test_brevo_network_timeout(self, mock_urlopen):
        mock_urlopen.side_effect = urllib.error.URLError('Connection timed out')

        res = send_transactional_email(
            to_email='test@example.com',
            to_name='Test',
            subject='Test',
            html_content='<p>test</p>',
            text_content='test',
        )
        self.assertFalse(res['success'])
        self.assertEqual(res['code'], 'email_network_error')

    @override_settings(
        BREVO_API_KEY='',
        BREVO_SENDER_EMAIL='sender@metrodrip.ph',
        BREVO_TEST_MODE=False,
    )
    def test_brevo_missing_api_key(self):
        res = send_transactional_email(
            to_email='test@example.com',
            to_name='Test',
            subject='Test',
            html_content='<p>test</p>',
            text_content='test',
        )
        self.assertFalse(res['success'])
        self.assertEqual(res['code'], 'reset_delivery_unconfigured')

    @override_settings(
        BREVO_API_KEY='xkeysib-mock-api-key',
        BREVO_SENDER_EMAIL='',
        BREVO_TEST_MODE=False,
    )
    def test_brevo_sender_unconfigured_safeguard(self):
        res = send_transactional_email(
            to_email='test@example.com',
            to_name='Test',
            subject='Test',
            html_content='<p>test</p>',
            text_content='test',
        )
        self.assertFalse(res['success'])
        self.assertEqual(res['code'], 'sender_unconfigured')

    @override_settings(
        BREVO_API_KEY='xkeysib-mock-api-key',
        BREVO_SENDER_EMAIL='sender@metrodrip.ph',
        BREVO_TEST_MODE=True,
        DEBUG=False,
    )
    @patch('identity.brevo.is_test_environment', return_value=False)
    @patch('urllib.request.urlopen')
    def test_brevo_test_mode_safeguard_in_production(self, mock_urlopen, mock_is_test_env):
        # In simulated production (DEBUG=False, not test environment), BREVO_TEST_MODE=True
        # must be strictly ignored and NOT add mock messages to _TEST_OUTBOX.
        mock_response = MagicMock()
        mock_response.status = 201
        mock_response.read.return_value = json.dumps({'messageId': '<prod-test-msg-123@smtp-relay.brevo.com>'}).encode('utf-8')
        mock_urlopen.return_value.__enter__.return_value = mock_response

        res = send_transactional_email(
            to_email='test@example.com',
            to_name='Test',
            subject='Prod Test',
            html_content='<p>test</p>',
            text_content='test',
        )
        # Verify it went to live dispatcher, NOT mock outbox
        self.assertEqual(len(get_test_outbox()), 0)
        self.assertTrue(res['success'])
        self.assertEqual(res['message_id'], '<prod-test-msg-123@smtp-relay.brevo.com>')
        self.assertEqual(res['code'], 'accepted')

