"""Server-owned payment capability snapshot.

Secret presence is not permission to offer a hosted rail. A rail is available
only when provider credentials, webhook verification, mode, and an explicit
allowlist all agree.
"""

from django.conf import settings


ONLINE_METHOD_IDS = ('gcash', 'maya', 'card')
METHOD_CATALOG = (
    {
        'id': 'cod',
        'name': 'Cash on Delivery',
        'description': 'Pay in cash upon delivery to your doorstep.',
        'type': 'offline',
        'min_amount': '1.00',
        'max_amount': '50000.00',
    },
    {
        'id': 'gcash',
        'name': 'GCash',
        'description': 'Instant e-wallet payment via PayMongo Hosted Checkout.',
        'type': 'hosted',
        'min_amount': '100.00',
        'max_amount': '50000.00',
    },
    {
        'id': 'maya',
        'name': 'Maya',
        'description': 'Pay via Maya wallet or QR via PayMongo Hosted Checkout.',
        'type': 'hosted',
        'min_amount': '100.00',
        'max_amount': '50000.00',
    },
    {
        'id': 'card',
        'name': 'Credit / Debit Card',
        'description': 'Visa, Mastercard, JCB via PayMongo Hosted Checkout.',
        'type': 'hosted',
        'min_amount': '100.00',
        'max_amount': '100000.00',
    },
)


def enabled_hosted_methods():
    raw = getattr(settings, 'PAYMONGO_ENABLED_METHODS', '')
    tokens = raw if isinstance(raw, (list, tuple, set)) else str(raw or '').replace(';', ',').split(',')
    enabled = []
    seen = set()
    for token in tokens:
        method = str(token).strip().lower()
        if method == 'paymaya':
            method = 'maya'
        if method in ONLINE_METHOD_IDS and method not in seen:
            seen.add(method)
            enabled.append(method)
    return enabled


def provider_configured():
    mode = str(getattr(settings, 'PAYMONGO_MODE', 'test') or '').lower()
    has_secret = bool(getattr(settings, 'PAYMONGO_SECRET_KEY', ''))
    has_webhook = bool(getattr(settings, 'PAYMONGO_WEBHOOK_SECRET', ''))
    return has_secret and has_webhook and mode in {'test', 'live'}


def get_merchant_enabled_methods():
    try:
        from identity.models import PlatformSetting
        return PlatformSetting.get_instance().get_enabled_payment_methods()
    except Exception:
        return ['cod', 'gcash', 'maya', 'card']


def is_method_provider_supported(method):
    if method == 'cod':
        return True
    return method in enabled_hosted_methods() and provider_configured()


def is_payment_method_available(method):
    merchant_enabled = get_merchant_enabled_methods()
    return (method in merchant_enabled) and is_method_provider_supported(method)


def hosted_method_available(method):
    return method in enabled_hosted_methods() and provider_configured() and is_payment_method_available(method)


def payment_capabilities():
    mode = str(getattr(settings, 'PAYMONGO_MODE', 'test') or 'test').lower()
    configured = provider_configured()
    enabled = set(enabled_hosted_methods())
    merchant_enabled = set(get_merchant_enabled_methods())
    methods = []
    for spec in METHOD_CATALOG:
        m_id = spec['id']
        is_merchant_on = m_id in merchant_enabled
        if spec['type'] == 'offline':
            provider_ok = True
            if not is_merchant_on:
                available = False
                unavailable_code = 'merchant_disabled'
            else:
                available = True
                unavailable_code = None
        elif not configured:
            provider_ok = False
            available = False
            unavailable_code = 'provider_not_configured'
        elif m_id not in enabled:
            provider_ok = False
            available = False
            unavailable_code = 'method_not_enabled'
        elif not is_merchant_on:
            provider_ok = True
            available = False
            unavailable_code = 'merchant_disabled'
        else:
            provider_ok = True
            available = True
            unavailable_code = None

        methods.append({
            **spec,
            'available': available,
            'provider_supported': provider_ok,
            'merchant_enabled': is_merchant_on,
            'unavailable_code': unavailable_code,
            'currencies': ['PHP'],
        })

    return {
        'currency': 'PHP',
        'provider': 'paymongo',
        'mode': mode,
        'provider_ready': configured,
        'enabled_methods': [method for method in ONLINE_METHOD_IDS if is_payment_method_available(method)],
        'methods': methods,
        'ttl_seconds': 1800,
    }

