from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from catalog.models import CatalogProduct
from fulfillment.models import NotificationsDeviceToken, NotificationsNotification
from identity.brevo import clear_test_outbox, get_test_outbox, send_transactional_email
from identity.models import AccountsCustomer, CustomerAccessToken
from orders.models import OrdersOrder, OrdersOrderLine
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

    def test_packed_out_for_delivery_payment_expired_notifications_with_order_lines(self):
        product = CatalogProduct.objects.create(
            sku='TEST-SKU-001',
            name='Renamed Catalog Item',
            base_price=Decimal('100.00'),
            is_active=True,
            is_featured=False,
            created_at=timezone.now(),
            updated_at=timezone.now(),
        )

        def make_order_with_lines():
            now = timezone.now()
            order = OrdersOrder.objects.create(
                customer_id=self.customer.id,
                status='placed',
                subtotal=Decimal('200.00'),
                tax=Decimal('0.00'),
                shipping=Decimal('0.00'),
                discount=Decimal('0.00'),
                total=Decimal('200.00'),
                currency='PHP',
                created_at=now,
                updated_at=now,
            )
            OrdersOrderLine.objects.create(
                order=order,
                product=product,
                quantity=2,
                unit_price=Decimal('100.00'),
                total_price=Decimal('200.00'),
                discount_amount=Decimal('0.00'),
                tax_amount=Decimal('0.00'),
                tax_rate=Decimal('0.00'),
                product_name_snapshot='Rugged Shirt',
                created_at=now,
                updated_at=now,
            )
            OrdersOrderLine.objects.create(
                order=order,
                product=product,
                quantity=1,
                unit_price=Decimal('100.00'),
                total_price=Decimal('100.00'),
                discount_amount=Decimal('0.00'),
                tax_amount=Decimal('0.00'),
                tax_rate=Decimal('0.00'),
                product_name_snapshot='Cargo Pant',
                created_at=now,
                updated_at=now,
            )
            return order

        # 1. Packed status
        order_packed = make_order_with_lines()
        clear_test_outbox()
        with self.captureOnCommitCallbacks(execute=True):
            schedule_order_status_notification(order_packed, 'packed')
        outbox = get_test_outbox()
        self.assertEqual(len(outbox), 1)
        self.assertEqual(
            outbox[0]['subject'],
            f'Order Packed: Rugged Shirt + 1 More (#{order_packed.id}) — MetroDrip',
        )

        # 2. Out for delivery (underscore and hyphen)
        order_out = make_order_with_lines()
        clear_test_outbox()
        with self.captureOnCommitCallbacks(execute=True):
            schedule_order_status_notification(order_out, 'out_for_delivery')
        outbox = get_test_outbox()
        self.assertEqual(len(outbox), 1)
        self.assertEqual(
            outbox[0]['subject'],
            f'Order Out For Delivery: Rugged Shirt + 1 More (#{order_out.id}) — MetroDrip',
        )

        order_out_hyphen = make_order_with_lines()
        clear_test_outbox()
        with self.captureOnCommitCallbacks(execute=True):
            schedule_order_status_notification(order_out_hyphen, 'out-for-delivery')
        outbox = get_test_outbox()
        self.assertEqual(len(outbox), 1)
        self.assertEqual(
            outbox[0]['subject'],
            f'Order Out For Delivery: Rugged Shirt + 1 More (#{order_out_hyphen.id}) — MetroDrip',
        )

        # 3. Payment expired (underscore, hyphen, and alias)
        order_exp = make_order_with_lines()
        clear_test_outbox()
        with self.captureOnCommitCallbacks(execute=True):
            schedule_order_status_notification(order_exp, 'payment_expired')
        outbox = get_test_outbox()
        self.assertEqual(len(outbox), 1)
        self.assertEqual(
            outbox[0]['subject'],
            f'Order Payment Expired: Rugged Shirt + 1 More (#{order_exp.id}) — MetroDrip',
        )

        order_exp_hyphen = make_order_with_lines()
        clear_test_outbox()
        with self.captureOnCommitCallbacks(execute=True):
            schedule_order_status_notification(order_exp_hyphen, 'payment-expired')
        outbox = get_test_outbox()
        self.assertEqual(len(outbox), 1)
        self.assertEqual(
            outbox[0]['subject'],
            f'Order Payment Expired: Rugged Shirt + 1 More (#{order_exp_hyphen.id}) — MetroDrip',
        )

        order_exp_alias = make_order_with_lines()
        clear_test_outbox()
        with self.captureOnCommitCallbacks(execute=True):
            schedule_order_status_notification(order_exp_alias, 'expired')
        outbox = get_test_outbox()
        self.assertEqual(len(outbox), 1)
        self.assertEqual(
            outbox[0]['subject'],
            f'Order Payment Expired: Rugged Shirt + 1 More (#{order_exp_alias.id}) — MetroDrip',
        )

    def test_status_notifications_fallback_without_lines_or_empty_snapshot(self):
        # Without lines
        clear_test_outbox()
        now = timezone.now()
        order_empty = OrdersOrder.objects.create(
            customer_id=self.customer.id,
            status='placed',
            subtotal=Decimal('50.00'),
            tax=Decimal('0.00'),
            shipping=Decimal('0.00'),
            discount=Decimal('0.00'),
            total=Decimal('50.00'),
            currency='PHP',
            created_at=now,
            updated_at=now,
        )
        with self.captureOnCommitCallbacks(execute=True):
            schedule_order_status_notification(order_empty, 'packed')
        self.assertEqual(
            get_test_outbox()[-1]['subject'],
            f'Order Packed (#{order_empty.id}) — MetroDrip',
        )

        with self.captureOnCommitCallbacks(execute=True):
            schedule_order_status_notification(order_empty, 'out_for_delivery')
        self.assertEqual(
            get_test_outbox()[-1]['subject'],
            f'Order Out For Delivery (#{order_empty.id}) — MetroDrip',
        )

        with self.captureOnCommitCallbacks(execute=True):
            schedule_order_status_notification(order_empty, 'payment_expired')
        self.assertEqual(
            get_test_outbox()[-1]['subject'],
            f'Order Payment Expired (#{order_empty.id}) — MetroDrip',
        )

        with self.captureOnCommitCallbacks(execute=True):
            schedule_order_status_notification(order_empty, 'cancelled')
        self.assertEqual(
            get_test_outbox()[-1]['subject'],
            f'Order Cancelled (#{order_empty.id}) — MetroDrip',
        )

    @override_settings(BREVO_TEST_MODE=False, BREVO_API_KEY='xkeysib-mock-api-key', BREVO_SENDER_EMAIL='orders@metrodrip.com')  # gitleaks:allow
    def test_live_brevo_delivery_payload_structure_and_header_safety(self):
        import io
        import json
        from urllib.error import HTTPError
        from orders.email_subjects import order_email_subject
        from identity.email_templates import render_order_status_email

        subject = order_email_subject('packed', 42, ['Rugged Shirt', 'Cargo Pant'])
        self.assertEqual(subject, 'Order Packed: Rugged Shirt + 1 More (#42) — MetroDrip')

        rendered_subject, html, text = render_order_status_email(
            name='Test Customer',
            order_number='MD-2026-00042',
            status_label='Order Packed',
            message='Your order has been packed and is ready for shipping.',
            changed_at='2026-10-26T08:00:00Z',
            order_url='https://metrodripjs-q4ik.onrender.com/customer/orders/42',
            support_email='support@metrodrip.com',
            subject=subject,
        )

        # 1. Successful simulated live dispatch via mock urlopen
        mock_response = io.BytesIO(json.dumps({'messageId': 'brevo-msg-live-999'}).encode('utf-8'))
        mock_response.getcode = lambda: 201

        captured_requests = []

        def fake_urlopen(req, timeout=10):
            captured_requests.append(req)
            return mock_response

        with patch('urllib.request.urlopen', side_effect=fake_urlopen):
            res = send_transactional_email(
                to_email='customer@example.com',
                to_name='Test Customer',
                subject=rendered_subject,
                html_content=html,
                text_content=text,
            )

        self.assertTrue(res['success'])
        self.assertEqual(res['message_id'], 'brevo-msg-live-999')
        self.assertEqual(res['code'], 'accepted')

        # Verify exact request parameters sent over wire
        self.assertEqual(len(captured_requests), 1)
        sent_req = captured_requests[0]
        self.assertEqual(sent_req.get_method(), 'POST')
        self.assertEqual(sent_req.full_url, 'https://api.brevo.com/v3/smtp/email')
        self.assertEqual(sent_req.headers.get('Api-key'), 'xkeysib-mock-api-key')
        self.assertEqual(sent_req.headers.get('Content-type'), 'application/json')

        payload = json.loads(sent_req.data.decode('utf-8'))
        self.assertEqual(payload['subject'], 'Order Packed: Rugged Shirt + 1 More (#42) — MetroDrip')
        self.assertNotIn('\r', payload['subject'])
        self.assertNotIn('\n', payload['subject'])
        self.assertEqual(payload['to'], [{'email': 'customer@example.com', 'name': 'Test Customer'}])
        self.assertEqual(payload['sender']['email'], 'orders@metrodrip.com')
        self.assertIn('<title>Order Packed: Rugged Shirt + 1 More (#42) — MetroDrip</title>', payload['htmlContent'])
        self.assertIn('MD-2026-00042', payload['textContent'])

        # 2. Provider HTTP error handling (e.g. 400 rejection)
        err_response = io.BytesIO(json.dumps({'code': 'invalid_parameter', 'message': 'Invalid header'}).encode('utf-8'))
        http_error = HTTPError('https://api.brevo.com/v3/smtp/email', 400, 'Bad Request', {}, err_response)

        with patch('urllib.request.urlopen', side_effect=http_error):
            res_err = send_transactional_email(
                to_email='customer@example.com',
                to_name='Test Customer',
                subject=rendered_subject,
                html_content=html,
                text_content=text,
            )
        self.assertFalse(res_err['success'])
        self.assertEqual(res_err['code'], 'email_rejected')
        self.assertIn('Invalid header', res_err['error'])
