import json
import logging
from urllib import request as urlrequest
from urllib.error import URLError

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from fulfillment.models import NotificationsDeviceToken, NotificationsNotification
from identity.brevo import send_transactional_email
from identity.email_templates import render_order_status_email
from identity.models import AccountsCustomer, PlatformSetting

logger = logging.getLogger(__name__)

STATUS_COPY = {
    'processing': ('Your order is being processed', 'Your order is being processed.'),
    'packed': ('Your order has been packed', 'Your order has been packed and is ready for shipping.'),
    'shipped': ('Your order is on its way', 'Your order is on its way.'),
    'out_for_delivery': ('Your order is out for delivery', 'Your order is out for delivery.'),
    'delivered': ('Your order has been delivered', 'Your order has been delivered.'),
    'cancelled': ('Your order has been cancelled', 'Your order has been cancelled.'),
    'payment_expired': ('Your checkout expired', 'The payment window for this order expired before it was confirmed.'),
}

_EXPO_TEST_OUTBOX = []
_EXPO_TEST_RESPONSES = []


def get_expo_test_outbox():
    return list(_EXPO_TEST_OUTBOX)


def clear_expo_test_outbox():
    _EXPO_TEST_OUTBOX.clear()
    _EXPO_TEST_RESPONSES.clear()


def queue_expo_test_response(body):
    _EXPO_TEST_RESPONSES.append(body)


def schedule_order_status_notification(order, new_status, changed_at=None):
    status = str(new_status or '').lower()
    if status not in STATUS_COPY or not getattr(order, 'customer_id', None):
        return
    changed_at = changed_at or timezone.now()
    order_id = order.id
    customer_id = order.customer_id

    def deliver():
        try:
            _deliver_order_status(order_id, customer_id, status, changed_at)
        except Exception:
            logger.exception('Order status notification failed for order %s', order_id)

    transaction.on_commit(deliver)


def _deliver_order_status(order_id, customer_id, status, changed_at):
    title, message = STATUS_COPY[status]
    category = f'order_status:{status}'
    with transaction.atomic():
        existing = NotificationsNotification.objects.select_for_update().filter(
            customer_ref=customer_id,
            order_ref=order_id,
            category=category,
        ).first()
        if existing:
            return
        NotificationsNotification.objects.create(
            customer_ref=customer_id,
            title=title,
            body=f'{message} Order reference {order_id}.',
            category=category,
            order_ref=order_id,
            is_read=False,
            created_at=changed_at,
        )
    customer = AccountsCustomer.objects.filter(pk=customer_id).first()
    _send_status_email(customer, order_id, status, title, message, changed_at)
    _send_status_push(customer_id, order_id, title, message)


def _send_status_email(customer, order_id, status, title, message, changed_at):
    if not customer or not customer.email:
        logger.info('Skipped status email for order %s because the customer has no email', order_id)
        return
    support = PlatformSetting.get_instance().support_email
    base_url = (getattr(settings, 'APP_PUBLIC_BASE_URL', None) or 'https://metrodripjs-q4ik.onrender.com').strip().rstrip('/')
    order_url = f"{base_url}/customer/orders/{order_id}"
    subject, html, text = render_order_status_email(
        customer.name,
        f'MD-{changed_at.year}-{order_id:05d}',
        status.replace('_', ' ').title(),
        message,
        changed_at.isoformat(),
        order_url,
        support,
    )
    result = send_transactional_email(customer.email, customer.name, subject, html, text)
    if not result.get('success'):
        logger.warning('Status email for order %s was not sent: %s', order_id, result.get('code'))


def _send_status_push(customer_id, order_id, title, message):
    tokens = list(NotificationsDeviceToken.objects.filter(customer_ref=customer_id))
    if not tokens:
        return
    push_payload = {
        'to': [row.token for row in tokens],
        'title': title,
        'body': message,
        'data': {'order_id': order_id, 'type': 'order_status'},
    }

    if getattr(settings, 'EXPO_PUSH_TEST_MODE', False) or getattr(settings, 'BREVO_TEST_MODE', False):
        _EXPO_TEST_OUTBOX.append(push_payload)
        if _EXPO_TEST_RESPONSES:
            body = _EXPO_TEST_RESPONSES.pop(0)
        else:
            body = {'data': [{'status': 'ok'} for _ in tokens]}
    else:
        payload = json.dumps(push_payload).encode('utf-8')
        req = urlrequest.Request(
            'https://exp.host/--/api/v2/push/send',
            data=payload,
            headers={'Accept': 'application/json', 'Content-Type': 'application/json'},
            method='POST',
        )
        try:
            with urlrequest.urlopen(req, timeout=10) as response:
                body = json.loads(response.read().decode('utf-8') or '{}')
        except (URLError, TimeoutError, json.JSONDecodeError) as exc:
            logger.warning('Expo push for order %s failed: %s', order_id, exc.__class__.__name__)
            return

    tickets = body.get('data') if isinstance(body, dict) else None
    if not isinstance(tickets, list):
        return
    for token, ticket in zip(tokens, tickets):
        details = ticket.get('details') if isinstance(ticket, dict) else None
        if isinstance(details, dict) and details.get('error') == 'DeviceNotRegistered':
            token.delete()
