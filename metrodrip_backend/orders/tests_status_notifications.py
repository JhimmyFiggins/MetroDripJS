from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from fulfillment.models import NotificationsDeviceToken, NotificationsNotification
from identity.brevo import clear_test_outbox, get_test_outbox
from identity.models import AccountsCustomer, CustomerAccessToken
from orders.models import OrdersOrder
from orders.status_notifications import (
    clear_expo_test_outbox,
    get_expo_test_outbox,
    queue_expo_test_response,
    schedule_order_status_notification,
)


@override_settings(BREVO_TEST_MODE=True, EXPO_PUSH_TEST_MODE=True)
class OrderStatusNotificationTests(TestCase):
    def setUp(self):
        clear_test_outbox()
        clear_expo_test_outbox()
        now = timezone.now()
        self.customer = AccountsCustomer.objects.create(
            email='status-customer@example.com',
            name='Status Customer',
            phone='',
            addresses={},
            role='customer',
            is_active=True,
            is_staff=False,
            is_superuser=False,
            date_joined=now,
        )
        _, self.raw_token = CustomerAccessToken.issue(self.customer)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.raw_token}')

        self.order = OrdersOrder.objects.create(
            customer_id=self.customer.id,
            status='placed',
            subtotal=Decimal('100.00'),
            tax=Decimal('0.00'),
            shipping=Decimal('0.00'),
            discount=Decimal('0.00'),
            total=Decimal('100.00'),
            currency='PHP',
            created_at=now,
            updated_at=now,
        )

    def test_status_change_notifies_once_and_email_failure_keeps_the_order(self):
        with self.captureOnCommitCallbacks(execute=True):
            schedule_order_status_notification(self.order, 'packed')
            schedule_order_status_notification(self.order, 'packed')
        self.assertEqual(NotificationsNotification.objects.filter(customer_ref=self.customer.id, order_ref=self.order.id).count(), 1)
        self.assertEqual(len(get_test_outbox()), 1)
        self.assertIn('packed', get_test_outbox()[0]['subject'].lower())
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'placed')

        with patch('orders.status_notifications.send_transactional_email', return_value={'success': False, 'code': 'provider_down'}):
            with self.captureOnCommitCallbacks(execute=True):
                schedule_order_status_notification(self.order, 'shipped')
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, 'placed')
        self.assertEqual(NotificationsNotification.objects.filter(order_ref=self.order.id, category='order_status:shipped').count(), 1)

    def test_push_notification_dispatch_and_token_cleanup(self):
        now = timezone.now()
        t1 = NotificationsDeviceToken.objects.create(
            customer_ref=self.customer.id,
            token='ExponentPushToken[device-active]',
            platform='ios',
            created_at=now,
            last_seen_at=now,
        )
        t2 = NotificationsDeviceToken.objects.create(
            customer_ref=self.customer.id,
            token='ExponentPushToken[device-stale]',
            platform='android',
            created_at=now,
            last_seen_at=now,
        )

        queue_expo_test_response({
            'data': [
                {'status': 'ok', 'id': 'ticket-1'},
                {'status': 'error', 'message': 'DeviceNotRegistered', 'details': {'error': 'DeviceNotRegistered'}},
            ]
        })

        with self.captureOnCommitCallbacks(execute=True):
            schedule_order_status_notification(self.order, 'out_for_delivery')

        outbox = get_expo_test_outbox()
        self.assertEqual(len(outbox), 1)
        push = outbox[0]
        self.assertIn(t1.token, push['to'])
        self.assertIn(t2.token, push['to'])
        self.assertEqual(push['title'], 'Your order is out for delivery')
        self.assertEqual(push['data'], {'order_id': self.order.id, 'type': 'order_status'})

        # Stale token was cleaned up, active token was kept
        self.assertTrue(NotificationsDeviceToken.objects.filter(token=t1.token).exists())
        self.assertFalse(NotificationsDeviceToken.objects.filter(token=t2.token).exists())

    def test_device_token_api_view_post_and_delete(self):
        # 1. Validation errors
        res = self.client.post('/notifications/devices/', {'token': 'invalid-token', 'platform': 'ios'}, format='json')
        self.assertEqual(res.status_code, 400)

        res = self.client.post('/notifications/devices/', {'token': 'ExponentPushToken[abc]', 'platform': 'windows'}, format='json')
        self.assertEqual(res.status_code, 400)

        # 2. Successful creation
        created_time = timezone.now() - timedelta(days=1)
        res = self.client.post(
            '/notifications/devices/',
            {'token': 'ExponentPushToken[device-test]', 'platform': 'ios'},
            format='json',
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.data.get('ok'))
        dev = NotificationsDeviceToken.objects.get(token='ExponentPushToken[device-test]')
        self.assertEqual(dev.customer_ref, self.customer.id)
        self.assertEqual(dev.platform, 'ios')

        # Backdate created_at to verify it is preserved on re-registration
        NotificationsDeviceToken.objects.filter(token='ExponentPushToken[device-test]').update(created_at=created_time)

        # 3. Update existing token (e.g. platform switch or session refresh)
        res = self.client.post(
            '/notifications/devices/',
            {'token': 'ExponentPushToken[device-test]', 'platform': 'android'},
            format='json',
        )
        self.assertEqual(res.status_code, 200)
        dev.refresh_from_db()
        self.assertEqual(dev.platform, 'android')
        self.assertEqual(dev.created_at, created_time)

        # 4. Delete device token
        res = self.client.delete(
            '/notifications/devices/',
            {'token': 'ExponentPushToken[device-test]'},
            format='json',
        )
        self.assertEqual(res.status_code, 200)
        self.assertFalse(NotificationsDeviceToken.objects.filter(token='ExponentPushToken[device-test]').exists())

        # 5. Unauthenticated request rejected
        anon_client = APIClient()
        res = anon_client.post('/notifications/devices/', {'token': 'ExponentPushToken[abc]', 'platform': 'ios'}, format='json')
        self.assertEqual(res.status_code, 401)

    def test_notification_list_serializes_is_read_and_read(self):
        NotificationsNotification.objects.create(
            customer_ref=self.customer.id,
            title='Order update',
            body='Status changed',
            category='order_status:delivered',
            order_ref=self.order.id,
            is_read=False,
            created_at=timezone.now(),
        )

        res = self.client.get('/notifications/')
        self.assertEqual(res.status_code, 200)
        results = res.data.get('results', [])
        self.assertEqual(len(results), 1)
        item = results[0]
        self.assertEqual(item['is_read'], False)
        self.assertEqual(item['read'], False)
        self.assertEqual(item['type'], 'order')
        self.assertEqual(item['order_id'], self.order.id)
