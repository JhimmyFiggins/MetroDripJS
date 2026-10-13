from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from types import SimpleNamespace
from unittest import skipUnless

from django.contrib.auth.models import AnonymousUser
from django.db import close_old_connections, connection
from django.test import TransactionTestCase

from .models import RequestRateLimitBucket
from .throttling import DatabaseScopedRateThrottle


class OneRequestPerMinuteThrottle(DatabaseScopedRateThrottle):
    THROTTLE_RATES = {'shared_test': '1/min'}


@skipUnless(connection.vendor == 'postgresql', 'PostgreSQL row-lock semantics are required.')
class DatabaseScopedRateThrottleConcurrencyTests(TransactionTestCase):
    def test_parallel_workers_share_one_atomic_limit(self):
        gate = Barrier(2)

        def attempt():
            close_old_connections()
            try:
                gate.wait(timeout=10)
                request = SimpleNamespace(
                    user=AnonymousUser(),
                    headers={},
                    META={'REMOTE_ADDR': '192.0.2.50'},
                )
                view = SimpleNamespace(throttle_scope='shared_test')
                throttle = OneRequestPerMinuteThrottle()
                return throttle.allow_request(request, view)
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(attempt) for _index in range(2)]
            outcomes = [future.result(timeout=30) for future in futures]

        self.assertEqual(sorted(outcomes), [False, True])
        bucket = RequestRateLimitBucket.objects.get(scope='shared_test')
        self.assertEqual(bucket.request_count, 1)
        self.assertEqual(len(bucket.identity_digest), 64)
        self.assertNotIn('192.0.2.50', bucket.identity_digest)
