import hashlib
import hmac
import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .brevo import send_transactional_email
from .email_templates import render_email_otp
from .models import AccountsCustomer, EmailOtpChallenge, PlatformSetting

logger = logging.getLogger(__name__)


def otp_enforced():
    return bool(getattr(settings, 'EMAIL_OTP_ENFORCED', True))


def otp_lifetime():
    return timedelta(seconds=int(getattr(settings, 'EMAIL_OTP_TTL_SECONDS', 300)))


def otp_resend_cooldown():
    return timedelta(seconds=int(getattr(settings, 'EMAIL_OTP_RESEND_SECONDS', 60)))


def otp_max_attempts():
    return int(getattr(settings, 'EMAIL_OTP_MAX_ATTEMPTS', 5))


def mask_email(email):
    local, _, domain = str(email or '').partition('@')
    if not local or not domain:
        return 'your email'
    visible = local[:1]
    return f'{visible}***@{domain}'


def staff_otp_required(customer):
    if customer.role == 'customer' and not customer.is_staff:
        return True
    policy = PlatformSetting.get_instance().staff_mfa_policy
    return policy == 'required'


def login_requires_otp(customer):
    if not otp_enforced():
        return False
    if customer.role == 'customer' and not customer.is_staff:
        return True
    return staff_otp_required(customer)


def _digest(value):
    key = str(settings.SECRET_KEY).encode('utf-8')
    return hmac.new(key, str(value).encode('utf-8'), hashlib.sha256).hexdigest()


def _code_digest(customer_id, purpose, challenge_token, code):
    return _digest(f'{customer_id}:{purpose}:{challenge_token}:{code}')


def _generate_code():
    return f'{secrets.randbelow(1_000_000):06d}'


def _invalidate_open(customer, purpose, now):
    EmailOtpChallenge.objects.filter(
        customer=customer,
        purpose=purpose,
        consumed_at__isnull=True,
    ).update(consumed_at=now)


def issue_challenge(customer, purpose):
    if purpose not in {
        EmailOtpChallenge.PURPOSE_EMAIL_VERIFICATION,
        EmailOtpChallenge.PURPOSE_LOGIN_2FA,
    }:
        raise ValueError('Unsupported OTP purpose.')
    now = timezone.now()
    code = _generate_code()
    challenge_token = secrets.token_urlsafe(32)
    with transaction.atomic():
        _invalidate_open(customer, purpose, now)
        EmailOtpChallenge.objects.create(
            customer=customer,
            purpose=purpose,
            challenge_digest=_digest(challenge_token),
            code_digest=_code_digest(customer.id, purpose, challenge_token, code),
            expires_at=now + otp_lifetime(),
            sent_at=now,
            max_attempts=otp_max_attempts(),
        )
    subject, html_content, text_content = render_email_otp(
        customer,
        code,
        purpose,
        int(otp_lifetime().total_seconds() // 60),
    )
    delivery = send_transactional_email(
        customer.email,
        customer.name,
        subject,
        html_content,
        text_content,
    )
    if not delivery.get('success'):
        EmailOtpChallenge.objects.filter(challenge_digest=_digest(challenge_token)).update(consumed_at=timezone.now())
        logger.warning(
            'OTP email was not delivered for account %s purpose %s code %s',
            customer.id,
            purpose,
            delivery.get('code'),
        )
        return None, delivery
    return public_challenge(challenge_token, customer, purpose), delivery


def public_challenge(challenge_token, customer, purpose):
    return {
        'otp_required': True,
        'purpose': purpose,
        'challenge_id': challenge_token,
        'masked_email': mask_email(customer.email),
        'expires_in': int(otp_lifetime().total_seconds()),
        'resend_after': int(otp_resend_cooldown().total_seconds()),
        'role': customer.role,
    }


def _load_challenge(challenge_token):
    if not challenge_token:
        return None
    return EmailOtpChallenge.objects.select_related('customer').filter(
        challenge_digest=_digest(challenge_token),
    ).first()


def resend_challenge(challenge_token):
    current = _load_challenge(challenge_token)
    if current is None:
        return None, {'code': 'invalid_challenge'}
    elapsed = timezone.now() - current.sent_at
    if elapsed < otp_resend_cooldown():
        remaining = int((otp_resend_cooldown() - elapsed).total_seconds())
        return None, {'code': 'resend_cooldown', 'retry_after': max(remaining, 1)}
    return issue_challenge(current.customer, current.purpose)


def verify_challenge(challenge_token, code):
    normalized = ''.join(ch for ch in str(code or '') if ch.isdigit())
    if len(normalized) != 6:
        return {'ok': False, 'code': 'invalid_otp'}
    with transaction.atomic():
        challenge = EmailOtpChallenge.objects.select_for_update().select_related('customer').filter(
            challenge_digest=_digest(challenge_token or ''),
        ).first()
        if challenge is None:
            return {'ok': False, 'code': 'invalid_otp'}
        if challenge.consumed_at is not None:
            code = 'otp_locked' if challenge.failed_attempts >= challenge.max_attempts else 'invalid_otp'
            return {'ok': False, 'code': code}
        now = timezone.now()
        if challenge.expires_at <= now:
            challenge.consumed_at = now
            challenge.save(update_fields=['consumed_at'])
            return {'ok': False, 'code': 'otp_expired'}
        if challenge.failed_attempts >= challenge.max_attempts:
            challenge.consumed_at = now
            challenge.save(update_fields=['consumed_at'])
            return {'ok': False, 'code': 'otp_locked'}
        expected = _code_digest(challenge.customer_id, challenge.purpose, challenge_token, normalized)
        if not hmac.compare_digest(expected, challenge.code_digest):
            challenge.failed_attempts += 1
            if challenge.failed_attempts >= challenge.max_attempts:
                challenge.consumed_at = now
            challenge.save(update_fields=['failed_attempts', 'consumed_at'])
            return {'ok': False, 'code': 'otp_locked' if challenge.consumed_at else 'invalid_otp'}
        challenge.consumed_at = now
        challenge.save(update_fields=['consumed_at'])
        customer = AccountsCustomer.objects.select_for_update().get(pk=challenge.customer_id)
        if challenge.purpose == EmailOtpChallenge.PURPOSE_EMAIL_VERIFICATION and customer.email_verified_at is None:
            customer.email_verified_at = now
            customer.save(update_fields=['email_verified_at'])
        return {
            'ok': True,
            'purpose': challenge.purpose,
            'customer': customer,
        }
