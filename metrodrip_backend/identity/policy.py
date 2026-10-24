from datetime import timedelta

from django.core.cache import cache
from django.utils import timezone

from .models import PlatformSetting


def platform_setting():
    try:
        return PlatformSetting.get_instance()
    except Exception:
        return PlatformSetting.get_instance()


def password_min_length():
    try:
        value = int(platform_setting().password_min_length)
    except (TypeError, ValueError):
        value = 8
    return min(max(value, 8), 64)


def password_length_error(password):
    minimum = password_min_length()
    if len(password or '') < minimum:
        return f'Password must be at least {minimum} characters.'
    return ''


def session_timeout():
    try:
        minutes = int(platform_setting().session_timeout_minutes)
    except (TypeError, ValueError):
        minutes = 60
    minutes = min(max(minutes, 5), 1440)
    return timedelta(minutes=minutes)


def _lock_key(email):
    return f'metrodrip-login-lock:{email}'


def _fail_key(email):
    return f'metrodrip-login-fail:{email}'


def login_is_locked(email):
    return bool(email and cache.get(_lock_key(email)))


def record_login_failure(email):
    if not email:
        return False
    setting = platform_setting()
    try:
        limit = int(setting.max_login_attempts)
        duration = int(setting.lockout_duration_minutes)
    except (TypeError, ValueError):
        limit, duration = 5, 15
    limit = min(max(limit, 1), 50)
    duration = min(max(duration, 1), 1440)
    failures = cache.get(_fail_key(email), 0) + 1
    cache.set(_fail_key(email), failures, duration * 60)
    if failures < limit:
        return False
    cache.set(_lock_key(email), True, duration * 60)
    cache.delete(_fail_key(email))
    return True


def clear_login_failures(email):
    if not email:
        return
    cache.delete(_fail_key(email))
    cache.delete(_lock_key(email))
