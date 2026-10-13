import hashlib
from datetime import datetime, timezone as datetime_timezone

from django.db import transaction
from rest_framework.throttling import ScopedRateThrottle

from .models import RequestRateLimitBucket


class DatabaseScopedRateThrottle(ScopedRateThrottle):
    """Atomic fixed-window throttling shared across processes and instances.

    Only a SHA-256 digest of DRF's user-or-IP cache key is persisted. Database
    errors intentionally fail closed as request errors instead of silently
    disabling an abuse-control boundary.
    """

    def allow_request(self, request, view):
        self.scope = getattr(view, self.scope_attr, None)
        if not self.scope:
            return True

        self.rate = self.get_rate()
        self.num_requests, self.duration = self.parse_rate(self.rate)
        if self.rate is None:
            return True

        cache_key = self.get_cache_key(request, view)
        if cache_key is None:
            return True

        self.now = self.timer()
        window_epoch = int(self.now // self.duration) * self.duration
        window_started_at = datetime.fromtimestamp(
            window_epoch,
            tz=datetime_timezone.utc,
        )
        identity_digest = hashlib.sha256(cache_key.encode('utf-8')).hexdigest()

        with transaction.atomic():
            bucket, _created = (
                RequestRateLimitBucket.objects.select_for_update().get_or_create(
                    scope=self.scope,
                    identity_digest=identity_digest,
                    defaults={
                        'window_started_at': window_started_at,
                        'request_count': 0,
                    },
                )
            )
            if bucket.window_started_at != window_started_at:
                bucket.window_started_at = window_started_at
                bucket.request_count = 0
            if bucket.request_count >= self.num_requests:
                self._wait_seconds = max(0, self.duration - (self.now - window_epoch))
                return False

            bucket.request_count += 1
            bucket.save(update_fields=['window_started_at', 'request_count', 'updated_at'])

        self._wait_seconds = None
        return True

    def wait(self):
        return self._wait_seconds
