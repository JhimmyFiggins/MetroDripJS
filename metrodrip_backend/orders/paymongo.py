import base64
import hashlib
import json
import urllib.error
import urllib.parse
import urllib.request
from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings


class PayMongoError(Exception):
    def __init__(self, message, code='provider_unavailable', retryable=True):
        super().__init__(message)
        self.code = code
        self.retryable = retryable


def pesos_to_centavos(value):
    normalized = Decimal(value).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    return int(normalized * 100)


def _extract_provider_error(payload, default_message):
    errors = payload.get('errors') if isinstance(payload, dict) else None
    if isinstance(errors, list) and errors:
        detail = errors[0].get('detail') if isinstance(errors[0], dict) else None
        code = errors[0].get('code') if isinstance(errors[0], dict) else None
        return detail or default_message, code or 'provider_rejected'
    return default_message, 'provider_rejected'


def _is_trusted_checkout_url(url):
    """Allow redirects only to PayMongo's HTTPS hosted-checkout origin."""
    try:
        parsed = urllib.parse.urlsplit(url or '')
        port = parsed.port
    except (TypeError, ValueError):
        return False
    return (
        parsed.scheme == 'https'
        and parsed.hostname == 'checkout.paymongo.com'
        and parsed.username is None
        and parsed.password is None
        and port in (None, 443)
    )


class PayMongoClient:
    api_base = 'https://api.paymongo.com'

    def __init__(self, secret_key=None, timeout=None):
        self.secret_key = secret_key or getattr(settings, 'PAYMONGO_SECRET_KEY', '')
        self.timeout = timeout or getattr(settings, 'PAYMONGO_TIMEOUT_SECONDS', 8)
        if not self.secret_key:
            raise PayMongoError(
                'Online payments are temporarily unavailable.',
                code='provider_not_configured',
                retryable=False,
            )

    def _request(self, method, path, payload=None, idempotency_key=None):
        credentials = base64.b64encode(f'{self.secret_key}:'.encode('utf-8')).decode('ascii')
        headers = {
            'Accept': 'application/json',
            'Authorization': f'Basic {credentials}',
            'Content-Type': 'application/json',
        }
        if idempotency_key:
            headers['Idempotency-Key'] = idempotency_key
        body = json.dumps(payload, separators=(',', ':')).encode('utf-8') if payload is not None else None
        request = urllib.request.Request(
            f'{self.api_base}{path}',
            data=body,
            headers=headers,
            method=method,
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                response_body = response.read().decode('utf-8')
                return json.loads(response_body) if response_body else {}
        except urllib.error.HTTPError as error:
            try:
                payload = json.loads(error.read().decode('utf-8'))
            except (ValueError, UnicodeDecodeError):
                payload = {}
            message, code = _extract_provider_error(payload, 'Payment provider rejected the request.')
            retryable = error.code >= 500 or error.code in {408, 429} or code == 'idempotency_in_progress'
            raise PayMongoError(message, code=code, retryable=retryable) from error
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            raise PayMongoError('Payment provider is temporarily unavailable.') from error

    def create_checkout_session(self, order, payment, line_items, shipping_address, customer_email):
        method_map = {'gcash': 'gcash', 'maya': 'paymaya', 'card': 'card'}
        provider_method = method_map[payment.method]
        success_url = getattr(
            settings,
            'PAYMONGO_SUCCESS_URL',
            'https://metrodripjs.onrender.com/payment/return?result=success',
        )
        cancel_url = getattr(
            settings,
            'PAYMONGO_CANCEL_URL',
            'https://metrodripjs.onrender.com/payment/return?result=cancelled',
        )
        if any(
            urllib.parse.urlparse(url).scheme != 'https'
            or not urllib.parse.urlparse(url).hostname
            for url in (success_url, cancel_url)
        ):
            raise PayMongoError(
                'Online payment return URLs are not configured securely.',
                code='return_url_invalid',
                retryable=False,
            )
        separator = '&' if '?' in success_url else '?'
        success_url = f'{success_url}{separator}order_id={order.id}'
        separator = '&' if '?' in cancel_url else '?'
        cancel_url = f'{cancel_url}{separator}order_id={order.id}'

        attributes = {
            'billing': {
                'address': {
                    'city': shipping_address.city,
                    'country': shipping_address.country,
                    'line1': shipping_address.address_line1,
                    'line2': shipping_address.address_line2 or '',
                    'postal_code': shipping_address.postal_code or '',
                    'state': shipping_address.state,
                },
                'email': customer_email,
                'name': shipping_address.name,
                'phone': shipping_address.phone,
            },
            'cancel_url': cancel_url,
            'description': f'MetroDrip order MD-{order.created_at.year}-{order.id:05d}',
            'line_items': line_items,
            'metadata': {
                'order_id': str(order.id),
                'checkout_fingerprint': order.checkout_fingerprint,
            },
            'payment_method_types': [provider_method],
            'reference_number': f'MD-{order.created_at.year}-{order.id:05d}',
            'send_email_receipt': True,
            'show_description': True,
            'show_line_items': True,
            'success_url': success_url,
        }
        response = self._request(
            'POST',
            '/v2/checkout_sessions',
            {'data': {'attributes': attributes}},
            idempotency_key=(
                'metrodrip-'
                + hashlib.sha256(order.checkout_idempotency_key.encode('utf-8')).hexdigest()
            ),
        )
        data = response.get('data') if isinstance(response, dict) else None
        response_attributes = data.get('attributes') if isinstance(data, dict) else None
        provider_ref = data.get('id') if isinstance(data, dict) else None
        checkout_url = response_attributes.get('checkout_url') if isinstance(response_attributes, dict) else None
        if not provider_ref or not _is_trusted_checkout_url(checkout_url):
            raise PayMongoError('Payment provider returned an invalid checkout session.')
        return provider_ref, checkout_url

    def retrieve_checkout_session(self, provider_ref):
        safe_ref = urllib.parse.quote(provider_ref, safe='')
        return self._request('GET', f'/v1/checkout_sessions/{safe_ref}')

    def expire_checkout_session(self, provider_ref):
        safe_ref = urllib.parse.quote(provider_ref, safe='')
        return self._request('POST', f'/v1/checkout_sessions/{safe_ref}/expire', {})


def verified_paid_payment(session_data, expected_amount, expected_currency='PHP'):
    """Return the paid payment only when all fulfillment invariants match."""
    data = session_data.get('data') if isinstance(session_data, dict) else None
    attributes = data.get('attributes') if isinstance(data, dict) else None
    payments = attributes.get('payments', []) if isinstance(attributes, dict) else []
    expected_centavos = pesos_to_centavos(expected_amount)
    for payment in payments if isinstance(payments, list) else []:
        payment_attributes = payment.get('attributes') if isinstance(payment, dict) else None
        if not isinstance(payment_attributes, dict):
            continue
        if (
            payment_attributes.get('status') == 'paid'
            and payment_attributes.get('amount') == expected_centavos
            and payment_attributes.get('currency') == expected_currency
        ):
            return payment
    return None
