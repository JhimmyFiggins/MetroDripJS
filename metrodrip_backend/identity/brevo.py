"""
Brevo (formerly Sendinblue) Transactional Email Delivery Service.
Transports security & password lifecycle emails over HTTPS port 443.
Zero external library dependencies; uses standard library urllib.request.
"""

import json
import logging
import os
import urllib.error
import urllib.request
from django.conf import settings

logger = logging.getLogger(__name__)

BREVO_API_ENDPOINT = 'https://api.brevo.com/v3/smtp/email'
DEFAULT_SENDER_NAME = 'MetroDrip'
DEFAULT_SENDER_EMAIL = 'support@metrodrip.ph'
DEFAULT_PUBLIC_BASE_URL = 'https://metrodripjs-q4ik.onrender.com'

# In-memory test outbox for automated testing without network calls
_TEST_OUTBOX = []


def clear_test_outbox():
    _TEST_OUTBOX.clear()


def get_test_outbox():
    return list(_TEST_OUTBOX)


def is_brevo_configured():
    """Return True if a Brevo API key is configured or test mode is enabled."""
    if getattr(settings, 'BREVO_TEST_MODE', False):
        return True
    key = getattr(settings, 'BREVO_API_KEY', None) or os.environ.get('BREVO_API_KEY', '')
    return bool(key and key.strip())


def get_public_base_url():
    """Return the canonical public web origin for password-reset links."""
    base = getattr(settings, 'APP_PUBLIC_BASE_URL', None) or os.environ.get('APP_PUBLIC_BASE_URL', '')
    if base and base.strip():
        return base.strip().rstrip('/')
    return DEFAULT_PUBLIC_BASE_URL


def build_reset_url(raw_token):
    return f"{get_public_base_url()}/Registration/screens/ResetPasswordScreen.html?token={raw_token}"


def get_sender_identity():
    sender_name = (
        getattr(settings, 'BREVO_SENDER_NAME', None)
        or os.environ.get('BREVO_SENDER_NAME', '')
        or DEFAULT_SENDER_NAME
    ).strip()
    sender_email = (
        getattr(settings, 'BREVO_SENDER_EMAIL', None)
        or os.environ.get('BREVO_SENDER_EMAIL', '')
        or DEFAULT_SENDER_EMAIL
    ).strip()
    return sender_name, sender_email


def send_transactional_email(to_email, to_name, subject, html_content, text_content):
    """
    Send a transactional email using Brevo's v3 SMTP email API over HTTPS.

    Returns:
        dict: {
            'success': bool,
            'message_id': str or None,
            'code': str,
            'error': str or None,
        }
    """
    if not to_email or not to_email.strip():
        return {
            'success': False,
            'message_id': None,
            'code': 'invalid_recipient',
            'error': 'Recipient email address is required.',
        }

    recipient_email = to_email.strip()
    recipient_name = (to_name or recipient_email).strip()

    # In-memory simulation during automated test execution
    if getattr(settings, 'BREVO_TEST_MODE', False):
        msg = {
            'to_email': recipient_email,
            'to_name': recipient_name,
            'subject': subject,
            'html_content': html_content,
            'text_content': text_content,
        }
        _TEST_OUTBOX.append(msg)
        return {
            'success': True,
            'message_id': f"mock-msg-{len(_TEST_OUTBOX)}",
            'code': 'mock_delivered',
            'error': None,
        }

    api_key = (getattr(settings, 'BREVO_API_KEY', None) or os.environ.get('BREVO_API_KEY', '')).strip()
    if not api_key:
        return {
            'success': False,
            'message_id': None,
            'code': 'reset_delivery_unconfigured',
            'error': 'Password-reset delivery is not configured. No reset email was sent.',
        }

    sender_name, sender_email = get_sender_identity()

    payload = {
        'sender': {'name': sender_name, 'email': sender_email},
        'to': [{'email': recipient_email, 'name': recipient_name}],
        'subject': subject,
        'htmlContent': html_content,
        'textContent': text_content,
    }

    body = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        BREVO_API_ENDPOINT,
        data=body,
        headers={
            'api-key': api_key,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'MetroDripJS-Identity/1.0',
        },
        method='POST',
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            status_code = response.getcode()
            response_data = json.loads(response.read().decode('utf-8'))
            message_id = response_data.get('messageId')
            logger.info("Brevo email dispatched to %s with messageId=%s", recipient_email[:3] + '***', message_id)
            return {
                'success': True,
                'message_id': message_id,
                'code': 'accepted',
                'error': None,
            }
    except urllib.error.HTTPError as error:
        raw_error = ''
        try:
            raw_error = error.read().decode('utf-8', errors='replace')
            parsed = json.loads(raw_error)
            err_msg = parsed.get('message') or parsed.get('error') or str(error)
        except Exception:
            err_msg = str(error)

        status_code = error.code
        logger.warning("Brevo HTTP error %s sending to %s: %s", status_code, recipient_email[:3] + '***', err_msg)

        if status_code == 401:
            code = 'email_auth_failed'
            msg = 'Email provider authentication failed. Check BREVO_API_KEY.'
        elif status_code == 400:
            code = 'email_rejected'
            msg = f'Email rejected by provider: {err_msg}'
        elif status_code == 429:
            code = 'email_rate_limit'
            msg = 'Email provider rate limit reached.'
        else:
            code = 'email_provider_error'
            msg = f'Email provider returned error {status_code}.'

        return {
            'success': False,
            'message_id': None,
            'code': code,
            'error': msg,
        }
    except urllib.error.URLError as error:
        logger.warning("Brevo network failure sending to %s: %s", recipient_email[:3] + '***', str(error.reason))
        return {
            'success': False,
            'message_id': None,
            'code': 'email_network_error',
            'error': 'Network timeout or connection failure communicating with email provider.',
        }
    except Exception as error:
        logger.error("Unexpected error sending email via Brevo: %s", str(error))
        return {
            'success': False,
            'message_id': None,
            'code': 'email_unexpected_error',
            'error': 'Unexpected error while dispatching email.',
        }
