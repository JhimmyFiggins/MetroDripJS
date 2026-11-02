from decimal import Decimal
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from fulfillment.models import NotificationsDeviceToken, NotificationsNotification
from identity.models import AccountsCustomer, AccountsWishlistItem, CustomerAccessToken
from orders.models import OrdersOrder, ReviewsReview


class CustomerAccountClosureTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.customer = AccountsCustomer(
            email='closure@example.com', name='Disposable customer', phone='09170000000',
            addresses={'address': 'Disposable address'}, role='customer',
            is_active=True, is_staff=False, is_superuser=False, date_joined=timezone.now(),
        )
        self.customer.set_password('strong-password-123')
        self.customer.save()
        self.token, self.raw_token = CustomerAccessToken.issue(self.customer)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.raw_token}')

    def close(self, password='strong-password-123', confirmation='CLOSE MY ACCOUNT'):
        return self.client.post('/account/close/', {
            'password': password, 'confirmation': confirmation,
        }, format='json')

    def test_closure_revokes_every_session_and_removes_customer_content(self):
        other_token, _ = CustomerAccessToken.issue(self.customer)
        AccountsWishlistItem.objects.create(customer=self.customer, product_ref=999, created_at=timezone.now())
        ReviewsReview.objects.create(customer_ref=self.customer.id, customer_name=self.customer.name,
                                     product_name='Product', body='Review', status='approved')
        NotificationsDeviceToken.objects.create(customer_ref=self.customer.id, token='ExpoPushToken[disposable]',
                                                platform='android', created_at=timezone.now(), last_seen_at=timezone.now())
        NotificationsNotification.objects.create(customer_ref=self.customer.id, title='Notice', body='Body',
                                                  category='order', is_read=False, created_at=timezone.now())

        response = self.close()
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['erasure_complete'])
        self.customer.refresh_from_db()
        self.assertFalse(self.customer.is_active)
        self.assertTrue(self.customer.is_deleted)
        self.assertEqual(self.customer.addresses, {})
        self.assertNotEqual(self.customer.email, 'closure@example.com')
        self.assertFalse(self.customer.has_usable_password())
        self.assertFalse(CustomerAccessToken.objects.filter(pk__in=[self.token.pk, other_token.pk]).exists())
        self.assertFalse(AccountsWishlistItem.objects.filter(customer=self.customer).exists())
        self.assertFalse(ReviewsReview.objects.filter(customer_ref=self.customer.id).exists())
        self.assertFalse(NotificationsDeviceToken.objects.filter(customer_ref=self.customer.id).exists())
        self.assertFalse(NotificationsNotification.objects.filter(customer_ref=self.customer.id).exists())
        self.assertEqual(self.client.get('/profile/').status_code, 401)
        self.assertEqual(self.close().status_code, 401)
        self.client.credentials()
        denied_login = self.client.post('/login/', {
            'email': 'closure@example.com', 'password': 'strong-password-123',
        }, format='json')
        self.assertGreaterEqual(denied_login.status_code, 400)

    def test_invalid_confirmation_and_password_do_not_close(self):
        self.assertEqual(self.close(confirmation='NO').status_code, 400)
        self.assertEqual(self.close(password='wrong').status_code, 400)
        self.customer.refresh_from_db()
        self.assertTrue(self.customer.is_active)

    def test_open_order_blocks_closure_without_changing_history(self):
        order = OrdersOrder.objects.create(
            customer_id=self.customer.id, status='placed', subtotal=Decimal('100.00'),
            tax=Decimal('0.00'), shipping=Decimal('0.00'), discount=Decimal('0.00'),
            total=Decimal('100.00'), currency='PHP', created_at=timezone.now(), updated_at=timezone.now(),
        )
        self.assertEqual(self.close().status_code, 409)
        self.customer.refresh_from_db()
        self.assertTrue(self.customer.is_active)
        self.assertTrue(OrdersOrder.objects.filter(pk=order.pk).exists())

    def test_staff_account_cannot_use_customer_closure(self):
        self.customer.role = 'admin'
        self.customer.is_staff = True
        self.customer.save(update_fields=['role', 'is_staff'])
        self.assertEqual(self.close().status_code, 403)
        self.customer.refresh_from_db()
        self.assertTrue(self.customer.is_active)

    def test_unauthenticated_request_is_rejected(self):
        self.client.credentials()
        self.assertEqual(self.close().status_code, 401)

    def test_closed_account_retains_terminal_order_snapshot(self):
        order = OrdersOrder.objects.create(
            customer_id=self.customer.id, status='delivered', subtotal=Decimal('100.00'),
            tax=Decimal('0.00'), shipping=Decimal('0.00'), discount=Decimal('0.00'),
            total=Decimal('100.00'), currency='PHP', created_at=timezone.now(), updated_at=timezone.now(),
        )
        self.assertEqual(self.close().status_code, 200)
        order.refresh_from_db()
        self.assertEqual(order.customer_id, self.customer.id)
        self.assertEqual(order.status, 'delivered')

    def test_review_history_is_scoped_to_authenticated_customer(self):
        ReviewsReview.objects.create(customer_ref=self.customer.id, customer_name='Disposable customer',
                                     product_name='Own product', body='Own review', status='pending')
        ReviewsReview.objects.create(customer_ref=self.customer.id + 1, customer_name='Other customer',
                                     product_name='Other product', body='Other review', status='approved')
        response = self.client.get('/reviews/mine/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['comment'], 'Own review')
        self.client.credentials()
        self.assertEqual(self.client.get('/reviews/mine/').status_code, 401)

    def test_profile_validation_preserves_existing_values(self):
        for payload in ({'name': ' '}, {'email': 'invalid'}, {'phone': '1' * 33}):
            self.assertEqual(self.client.put('/profile/', payload, format='json').status_code, 400)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.name, 'Disposable customer')
        self.assertEqual(self.customer.email, 'closure@example.com')

    def test_expired_token_cannot_close_account(self):
        self.token.expires_at = timezone.now() - timedelta(seconds=1)
        self.token.save(update_fields=['expires_at'])
        self.assertEqual(self.close().status_code, 401)
        self.customer.refresh_from_db()
        self.assertTrue(self.customer.is_active)

    def test_caller_selected_customer_id_cannot_close_another_account(self):
        other = AccountsCustomer(
            email='other@example.com', name='Other customer', phone='', addresses={},
            role='customer', is_active=True, is_staff=False, is_superuser=False,
            date_joined=timezone.now(),
        )
        other.set_password('another-password-123')
        other.save()
        response = self.client.post('/account/close/', {
            'customer_id': other.id,
            'password': 'strong-password-123',
            'confirmation': 'CLOSE MY ACCOUNT',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        other.refresh_from_db()
        self.assertTrue(other.is_active)

    def test_backend_failure_rolls_back_closure(self):
        with patch('identity.views.NotificationsNotification.objects.filter', side_effect=RuntimeError('synthetic failure')):
            with self.assertRaises(RuntimeError):
                self.close()
        self.customer.refresh_from_db()
        self.assertTrue(self.customer.is_active)
        self.assertEqual(self.customer.email, 'closure@example.com')
        self.assertTrue(CustomerAccessToken.objects.filter(pk=self.token.pk).exists())

    def test_password_attempts_are_rate_limited(self):
        for _ in range(5):
            self.assertEqual(self.close(password='wrong').status_code, 400)
        self.assertEqual(self.close(password='wrong').status_code, 429)
        self.customer.refresh_from_db()
        self.assertTrue(self.customer.is_active)
