import hashlib
import hmac
import json
import time

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .checkout import apply_verified_payment
from .models import OrdersPayment, PaymentWebhookEvent
from .paymongo import verified_paid_payment


class WebhookError(Exception):
    def __init__(self, message, status_code=400, code='invalid_webhook'):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code


def verify_paymongo_signature(raw_body, signature_header, now=None):
    secret = getattr(settings, 'PAYMONGO_WEBHOOK_SECRET', '')
    if not secret:
        raise WebhookError('Webhook is not configured.', status_code=503, code='webhook_not_configured')
    if not signature_header:
        raise WebhookError('Missing webhook signature.', status_code=401, code='signature_missing')

    parts = {}
    for segment in signature_header.split(','):
        key, separator, value = segment.strip().partition('=')
        if separator:
            parts[key] = value
    timestamp = parts.get('t', '')
    mode = getattr(settings, 'PAYMONGO_MODE', '').lower()
    if mode not in {'test', 'live'}:
        mode = 'live' if getattr(settings, 'PAYMONGO_SECRET_KEY', '').startswith('sk_live_') else 'test'
    supplied = parts.get('li' if mode == 'live' else 'te', '')
    try:
        timestamp_int = int(timestamp)
    except (TypeError, ValueError) as error:
        raise WebhookError('Invalid webhook timestamp.', status_code=401, code='timestamp_invalid') from error
    current = int(now if now is not None else time.time())
    tolerance = int(getattr(settings, 'PAYMONGO_WEBHOOK_TOLERANCE_SECONDS', 300))
    if abs(current - timestamp_int) > tolerance:
        raise WebhookError('Stale webhook request.', status_code=401, code='timestamp_outside_tolerance')

    signed_payload = timestamp.encode('ascii') + b'.' + raw_body
    expected = hmac.new(secret.encode('utf-8'), signed_payload, hashlib.sha256).hexdigest()
    if not supplied or not hmac.compare_digest(expected, supplied):
        raise WebhookError('Invalid webhook signature.', status_code=401, code='signature_invalid')


def _extract_event(payload, payload_digest):
    data = payload.get('data') if isinstance(payload, dict) else None
    if not isinstance(data, dict):
        raise WebhookError('Invalid event envelope.')

    if data.get('type') == 'event':
        attributes = data.get('attributes')
        if not isinstance(attributes, dict):
            raise WebhookError('Invalid event attributes.')
        return {
            'event_id': data.get('id') or f'evt_digest_{payload_digest}',
            'event_type': attributes.get('type'),
            'livemode': attributes.get('livemode'),
            'resource': attributes.get('data'),
        }

    # PayMongo's current Developer Tools envelope places the event type and
    # resource directly inside `data` and may omit an evt_* identifier.
    return {
        'event_id': data.get('event_id') or f'evt_digest_{payload_digest}',
        'event_type': data.get('type'),
        'livemode': data.get('livemode'),
        'resource': data.get('data'),
    }


def _recover_unbound_payment(resource, provider_ref):
    """Claim a paid session whose create response was lost after PayMongo committed it."""
    if not isinstance(provider_ref, str) or not provider_ref.startswith('cs_') or len(provider_ref) > 100:
        return None

    attributes = resource.get('attributes') if isinstance(resource, dict) else None
    metadata = attributes.get('metadata') if isinstance(attributes, dict) else None
    order_id = metadata.get('order_id') if isinstance(metadata, dict) else None
    if not isinstance(order_id, str) or not order_id.isdigit():
        return None

    payment = (
        OrdersPayment.objects.select_for_update()
        .select_related('order')
        .filter(
            order_id=int(order_id),
            provider='paymongo',
            provider_ref__isnull=True,
        )
        .order_by('-created_at')
        .first()
    )
    if not payment:
        return None

    expected_reference = f'MD-{payment.order.created_at.year}-{payment.order.id:05d}'
    identity_matches = (
        attributes.get('reference_number') == expected_reference
        and metadata.get('checkout_fingerprint') == payment.order.checkout_fingerprint
    )
    amount_matches = verified_paid_payment(
        {'data': resource},
        payment.amount,
        payment.currency,
    )
    if not identity_matches or not amount_matches:
        return None

    payment.provider_ref = provider_ref
    payment.save(update_fields=['provider_ref'])
    return payment


def process_paymongo_webhook(raw_body):
    payload_digest = hashlib.sha256(raw_body).hexdigest()
    try:
        payload = json.loads(raw_body.decode('utf-8'))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise WebhookError('Invalid JSON payload.') from error
    event = _extract_event(payload, payload_digest)
    if not isinstance(event['event_id'], str) or len(event['event_id']) > 100:
        raise WebhookError('Invalid event identifier.')
    if not isinstance(event['event_type'], str) or len(event['event_type']) > 100:
        raise WebhookError('Invalid event type.')
    if event['livemode'] is not None and not isinstance(event['livemode'], bool):
        raise WebhookError('Invalid webhook mode.', status_code=401, code='mode_invalid')

    expected_live = getattr(settings, 'PAYMONGO_MODE', '').lower() == 'live'
    if getattr(settings, 'PAYMONGO_MODE', '').lower() not in {'test', 'live'}:
        expected_live = getattr(settings, 'PAYMONGO_SECRET_KEY', '').startswith('sk_live_')
    if event['livemode'] is not None and bool(event['livemode']) != expected_live:
        raise WebhookError('Webhook mode mismatch.', status_code=401, code='mode_mismatch')

    resource = event['resource']
    provider_ref = resource.get('id', '') if isinstance(resource, dict) else ''
    with transaction.atomic():
        inbox, created = PaymentWebhookEvent.objects.select_for_update().get_or_create(
            event_id=event['event_id'],
            defaults={
                'event_type': str(event['event_type'] or ''),
                'provider_ref': provider_ref if isinstance(provider_ref, str) else '',
                'payload_digest': payload_digest,
            },
        )
        if not created:
            # Event identifiers are immutable. A changed payload with the same
            # identifier is not an idempotent retry and must never be applied.
            if inbox.payload_digest != payload_digest:
                raise WebhookError('Webhook event identifier collision.', status_code=409, code='event_collision')
            if inbox.status != 'received':
                return 'duplicate'

        if event['event_type'] != 'checkout_session.payment.paid':
            inbox.status = 'ignored'
            inbox.processed_at = timezone.now()
            inbox.save(update_fields=['status', 'processed_at'])
            return 'ignored'
        if not isinstance(resource, dict) or not isinstance(provider_ref, str):
            inbox.status = 'rejected'
            inbox.error_code = 'resource_invalid'
            inbox.processed_at = timezone.now()
            inbox.save(update_fields=['status', 'error_code', 'processed_at'])
            return 'rejected'

        payment = OrdersPayment.objects.select_for_update().select_related('order').filter(
            provider='paymongo',
            provider_ref=provider_ref,
        ).first()
        if not payment:
            payment = _recover_unbound_payment(resource, provider_ref)
        if not payment:
            inbox.status = 'rejected'
            inbox.error_code = 'payment_not_found'
            inbox.processed_at = timezone.now()
            inbox.save(update_fields=['status', 'error_code', 'processed_at'])
            return 'rejected'

        attributes = resource.get('attributes')
        metadata = attributes.get('metadata', {}) if isinstance(attributes, dict) else {}
        expected_reference = f'MD-{payment.order.created_at.year}-{payment.order.id:05d}'
        invariant_ok = (
            isinstance(attributes, dict)
            and attributes.get('reference_number') == expected_reference
            and isinstance(metadata, dict)
            and metadata.get('order_id') == str(payment.order.id)
            and metadata.get('checkout_fingerprint') == payment.order.checkout_fingerprint
        )
        if not invariant_ok or not apply_verified_payment(payment, {'data': resource}):
            inbox.status = 'rejected'
            inbox.error_code = 'payment_invariant_mismatch'
            inbox.processed_at = timezone.now()
            inbox.save(update_fields=['status', 'error_code', 'processed_at'])
            return 'rejected'

        inbox.status = 'processed'
        inbox.processed_at = timezone.now()
        inbox.save(update_fields=['status', 'processed_at'])
        return 'processed'
