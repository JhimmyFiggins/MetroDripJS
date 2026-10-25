"""
Comprehensive tests for Merchant Order Settings Migration and Admin Platform Settings Expansion.
"""
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from identity.models import AccountsCustomer, AuditLog, PlatformSetting
from orders.models import OrdersOrder, OrdersOrderLine, OrdersShippingAddress
from catalog.models import CatalogProduct
from orders.capabilities import is_payment_method_available, payment_capabilities
from orders.notifications import dispatch_order_confirmation_if_enabled


class SettingsMigrationTestSuite(TestCase):
    def setUp(self):
        self.client = APIClient()

        now = timezone.now()
        # Create Admin
        self.admin = AccountsCustomer.objects.create(
            email='admin@metrodrip.ph',
            name='Platform Admin',
            role='admin',
            is_active=True,
            is_staff=True,
            is_superuser=True,
            addresses=[],
            date_joined=now,
        )
        self.admin.set_password('AdminSecure123!')
        self.admin.save()

        # Create Merchant
        self.merchant = AccountsCustomer.objects.create(
            email='merchant@metrodrip.ph',
            name='Store Merchant',
            role='merchant',
            is_active=True,
            is_staff=True,
            is_superuser=False,
            addresses=[],
            date_joined=now,
        )
        self.merchant.set_password('MerchantSecure123!')
        self.merchant.save()

        # Create Customer
        self.customer = AccountsCustomer.objects.create(
            email='customer@metrodrip.ph',
            name='Regular Customer',
            role='customer',
            is_active=True,
            is_staff=False,
            is_superuser=False,
            addresses=[],
            date_joined=now,
        )
        self.customer.set_password('CustomerSecure123!')
        self.customer.save()

        self.setting = PlatformSetting.get_instance()
        self.setting.order_confirmation_emails = 'enabled'
        self.setting.sender_name = 'MetroDrip Orders'
        self.setting.customer_registration = 'enabled'
        self.setting.maintenance_mode = 'off'
        self.setting.enabled_payment_methods = ['cod']
        self.setting.save()

    def _login(self, user):
        from identity.models import CustomerAccessToken
        _, token = CustomerAccessToken.issue(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        return token

    # =========================================================================
    # PART 1: MERCHANT ORDER SETTINGS API & PERMISSIONS
    # =========================================================================

    def test_merchant_order_settings_permissions(self):
        # 1. Unauthenticated -> 401
        self.client.credentials()
        res = self.client.get('/api/merchant/orders/settings/')
        self.assertEqual(res.status_code, 401)

        # 2. Customer -> 403
        self._login(self.customer)
        res = self.client.get('/api/merchant/orders/settings/')
        self.assertEqual(res.status_code, 403)

        # 3. Merchant -> 200
        self._login(self.merchant)
        res = self.client.get('/api/merchant/orders/settings/')
        self.assertEqual(res.status_code, 200)
        self.assertIn('settings', res.data)
        data = res.data['settings']
        self.assertEqual(data['order_confirmation_emails'], 'enabled')
        self.assertEqual(data['sender_name'], 'MetroDrip Orders')
        self.assertIn('cod', data['enabled_payment_methods'])

        # 4. Admin also has merchant privileges -> 200
        self._login(self.admin)
        res = self.client.get('/api/merchant/orders/settings/')
        self.assertEqual(res.status_code, 200)

    def test_merchant_order_settings_patch_validation(self):
        self._login(self.merchant)

        # Reject invalid payment method
        res = self.client.patch('/api/merchant/orders/settings/', {
            'enabled_payment_methods': ['bitcoin', 'cod']
        }, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('Unknown payment method', res.data['error'])

        # Reject enabling unconfigured hosted payment method when PayMongo is unconfigured
        res = self.client.patch('/api/merchant/orders/settings/', {
            'enabled_payment_methods': ['gcash']
        }, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('cannot be enabled because it is not configured', res.data['error'])

        # Reject invalid order_confirmation_emails value
        res = self.client.patch('/api/merchant/orders/settings/', {
            'order_confirmation_emails': 'maybe'
        }, format='json')
        self.assertEqual(res.status_code, 400)

        # Reject empty sender_name
        res = self.client.patch('/api/merchant/orders/settings/', {
            'sender_name': '   '
        }, format='json')
        self.assertEqual(res.status_code, 400)

    def test_merchant_order_settings_successful_update_and_audit(self):
        self._login(self.merchant)

        res = self.client.patch('/api/merchant/orders/settings/', {
            'enabled_payment_methods': ['cod'],
            'order_confirmation_emails': 'disabled',
            'sender_name': 'MetroDrip Official Store',
        }, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['settings']['order_confirmation_emails'], 'disabled')
        self.assertEqual(res.data['settings']['sender_name'], 'MetroDrip Official Store')

        # Verify persistence
        self.setting.refresh_from_db()
        self.assertEqual(self.setting.order_confirmation_emails, 'disabled')
        self.assertEqual(self.setting.sender_name, 'MetroDrip Official Store')

        # Verify Audit Log
        self.assertTrue(AuditLog.objects.filter(
            actor=self.merchant.name,
            action__contains='Updated merchant order settings',
        ).exists())

    def test_empty_payment_selection_remains_cod_only(self):
        self._login(self.merchant)

        response = self.client.patch(
            '/api/merchant/orders/settings/',
            {'enabled_payment_methods': []},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['settings']['enabled_payment_methods'], ['cod'])
        self.setting.refresh_from_db()
        self.assertEqual(self.setting.enabled_payment_methods, ['cod'])
        self.assertTrue(is_payment_method_available('cod'))

    # =========================================================================
    # PART 2: PAYMENT METHOD CAPABILITIES & ENFORCEMENT
    # =========================================================================

    def test_payment_capability_distinction(self):
        caps = payment_capabilities()
        self.assertIn('methods', caps)
        cod_method = next((m for m in caps['methods'] if m['id'] == 'cod'), None)
        self.assertIsNotNone(cod_method)
        self.assertTrue(cod_method['available'])
        self.assertTrue(cod_method['merchant_enabled'])

        # COD is available
        self.assertTrue(is_payment_method_available('cod'))

        # Hosted rails are unavailable because PayMongo is unconfigured in test
        self.assertFalse(is_payment_method_available('gcash'))
        self.assertFalse(is_payment_method_available('paymaya'))
        self.assertFalse(is_payment_method_available('card'))

        # If merchant disables COD (only enables gcash)
        self.setting.enabled_payment_methods = ['gcash']
        self.setting.save()
        self.assertFalse(is_payment_method_available('cod'))

    # =========================================================================
    # PART 3: ADMIN PLATFORM SETTINGS EXPANSION & HEALTH
    # =========================================================================

    def test_admin_settings_get_and_patch_expanded_fields(self):
        self._login(self.admin)
        res = self.client.get('/api/admin/settings/')
        self.assertEqual(res.status_code, 200)
        s = res.data['settings']

        # Confirm Checkout & Communications fields are REMOVED from admin response
        self.assertNotIn('order_confirmation_emails', s)
        self.assertNotIn('sender_name', s)
        self.assertNotIn('payment_methods', s)

        # Confirm newly expanded administrative fields exist
        self.assertIn('registration_message', s)
        self.assertIn('maintenance_message', s)
        self.assertIn('maintenance_scheduled_start', s)
        self.assertIn('maintenance_scheduled_end', s)
        self.assertIn('password_min_length', s)
        self.assertIn('max_login_attempts', s)
        self.assertIn('lockout_duration_minutes', s)
        self.assertIn('admin_security_alerts', s)
        self.assertIn('admin_alert_email', s)

        # Update expanded fields
        res = self.client.patch('/api/admin/settings/', {
            'registration_message': 'Public signup closed.',
            'maintenance_mode': 'off',
            'maintenance_message': 'Under routine maintenance.',
            'password_min_length': 12,
            'max_login_attempts': 3,
            'lockout_duration_minutes': 30,
            'admin_security_alerts': 'enabled',
            'admin_alert_email': 'security@metrodrip.ph',
        }, format='json')
        self.assertEqual(res.status_code, 200)
        updated = res.data['settings']
        self.assertEqual(updated['password_min_length'], 12)
        self.assertEqual(updated['max_login_attempts'], 3)
        self.assertEqual(updated['lockout_duration_minutes'], 30)
        self.assertEqual(updated['admin_alert_email'], 'security@metrodrip.ph')

        # Audit log created
        self.assertTrue(AuditLog.objects.filter(
            actor=self.admin.name,
            action__contains='Updated platform settings',
        ).exists())

    def test_admin_settings_numeric_validation(self):
        self._login(self.admin)

        # Min password length too short (< 8)
        res = self.client.patch('/api/admin/settings/', {'password_min_length': 5}, format='json')
        self.assertEqual(res.status_code, 400)

        # Max login attempts out of range (> 50)
        res = self.client.patch('/api/admin/settings/', {'max_login_attempts': 99}, format='json')
        self.assertEqual(res.status_code, 400)

        # Invalid email
        res = self.client.patch('/api/admin/settings/', {'admin_alert_email': 'invalid-email'}, format='json')
        self.assertEqual(res.status_code, 400)

    def test_admin_health_api(self):
        # 1. Non-admin forbidden
        self._login(self.merchant)
        res = self.client.get('/api/admin/health/')
        self.assertEqual(res.status_code, 403)

        # 2. Admin access
        self._login(self.admin)
        res = self.client.get('/api/admin/health/')
        self.assertEqual(res.status_code, 200)
        self.assertIn('health', res.data)
        health = res.data['health']
        self.assertIn(health['status'], ['healthy', 'degraded', 'unavailable'])
        self.assertEqual(health['database']['status'], 'healthy')
        self.assertIn('latency_ms', health['database'])
        self.assertIn('transactional_email', health)
        self.assertIn('payment_provider', health)
        self.assertIn('environment', health)

    # =========================================================================
    # PART 4: CUSTOMER REGISTRATION ENFORCEMENT
    # =========================================================================

    def test_customer_registration_policy_enforcement(self):
        self.client.credentials()

        # 1. When enabled -> normal signup allowed
        self.setting.customer_registration = 'enabled'
        self.setting.save()

        res = self.client.post('/signup/', {
            'email': 'newcustomer1@example.com',
            'name': 'New Customer One',
            'password': 'StrongPassword123!',
        }, format='json')
        self.assertEqual(res.status_code, 201)

        # 2. When disabled -> 403 registration_disabled
        self.setting.customer_registration = 'disabled'
        self.setting.registration_message = 'Store is currently invitation-only.'
        self.setting.save()

        res = self.client.post('/signup/', {
            'email': 'newcustomer2@example.com',
            'name': 'New Customer Two',
            'password': 'StrongPassword123!',
        }, format='json')
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.data['code'], 'registration_disabled')
        self.assertEqual(res.data['error'], 'Store is currently invitation-only.')

        # Existing users can still log in
        login_res = self.client.post('/login/', {
            'email': 'newcustomer1@example.com',
            'password': 'StrongPassword123!',
        }, format='json')
        self.assertEqual(login_res.status_code, 200)

    # =========================================================================
    # PART 5: MAINTENANCE MODE MIDDLEWARE ENFORCEMENT
    # =========================================================================

    def test_maintenance_mode_enforcement(self):
        # Enable maintenance mode
        self.setting.maintenance_mode = 'on'
        self.setting.maintenance_message = 'Undergoing scheduled upgrade.'
        self.setting.save()

        # Public customer endpoint -> 503
        self.client.credentials()
        res = self.client.get('/api/catalog/products/')
        self.assertEqual(res.status_code, 503)
        data = res.json()
        self.assertEqual(data['code'], 'maintenance_mode')
        self.assertEqual(data['error'], 'Undergoing scheduled upgrade.')

        # Internal health probe is EXEMPT -> 200
        res = self.client.get('/health/')
        self.assertEqual(res.status_code, 200)

        # PayMongo payment webhook is EXEMPT from maintenance mode (reaches endpoint, not blocked with maintenance_mode)
        res = self.client.post('/api/payments/paymongo/webhook/', {}, format='json')
        self.assertNotEqual(res.json().get('code'), 'maintenance_mode')

        # Staff user with token is EXEMPT -> 200
        self._login(self.admin)
        res = self.client.get('/api/admin/settings/')
        self.assertEqual(res.status_code, 200)

        self._login(self.merchant)
        res = self.client.get('/api/merchant/orders/settings/')
        self.assertEqual(res.status_code, 200)

    # =========================================================================
    # PART 6: ORDER CONFIRMATION EMAIL IDEMPOTENCY & DISPATCH
    # =========================================================================

    @patch('orders.notifications.send_transactional_email')
    def test_order_confirmation_email_dispatch_and_idempotency(self, mock_send):
        mock_send.return_value = {'success': True, 'code': 'email_sent', 'message_id': 'brevo-msg-123'}

        product = CatalogProduct.objects.create(
            sku='TEST-TEE-001',
            name='Classic Metro Tee',
            description='MetroDrip classic shirt',
            base_price=1400,
            is_active=True,
            is_featured=False,
            created_at=timezone.now(),
            updated_at=timezone.now(),
        )
        order = OrdersOrder.objects.create(
            customer_id=self.customer.id,
            total=1500,
            subtotal=1400,
            shipping=100,
            tax=0,
            discount=0,
            status='placed',
            currency='PHP',
            created_at=timezone.now(),
            updated_at=timezone.now(),
        )
        OrdersShippingAddress.objects.create(
            order=order,
            name='Regular Customer',
            address_line1='123 Main St',
            city='Manila',
            state='Metro Manila',
            country='PH',
            phone='09171234567',
            created_at=timezone.now(),
            updated_at=timezone.now(),
        )
        OrdersOrderLine.objects.create(
            order=order,
            product=product,
            quantity=1,
            unit_price=1400,
            total_price=1400,
            discount_amount=0,
            tax_amount=0,
            tax_rate=0,
            product_name_snapshot='Classic Metro Tee',
            created_at=timezone.now(),
            updated_at=timezone.now(),
        )

        # 1. When enabled -> email sent and confirmation_email_sent_at populated
        self.setting.order_confirmation_emails = 'enabled'
        self.setting.sender_name = 'Custom Merchant Name'
        self.setting.save()

        success, reason = dispatch_order_confirmation_if_enabled(order)
        self.assertTrue(success)
        mock_send.assert_called_once()
        self.assertEqual(mock_send.call_args.kwargs['sender_name_override'], 'Custom Merchant Name')

        order.refresh_from_db()
        self.assertIsNotNone(order.confirmation_email_sent_at)

        # 2. Idempotency test: calling again does NOT send duplicate email
        mock_send.reset_mock()
        success2, reason2 = dispatch_order_confirmation_if_enabled(order)
        self.assertFalse(success2)
        self.assertEqual(reason2, 'already_sent')
        mock_send.assert_not_called()

    @patch('orders.notifications.send_transactional_email')
    def test_order_confirmation_skipped_when_disabled(self, mock_send):
        self.setting.order_confirmation_emails = 'disabled'
        self.setting.save()

        order = OrdersOrder.objects.create(
            customer_id=self.customer.id,
            total=2000,
            subtotal=2000,
            shipping=0,
            tax=0,
            discount=0,
            status='placed',
            currency='PHP',
            created_at=timezone.now(),
            updated_at=timezone.now(),
        )

        success, reason = dispatch_order_confirmation_if_enabled(order)
        self.assertFalse(success)
        self.assertEqual(reason, 'disabled_by_merchant')
        mock_send.assert_not_called()
        self.assertIsNone(order.confirmation_email_sent_at)
