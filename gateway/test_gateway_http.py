import http.client
import json
import threading
import unittest
from unittest.mock import patch

from gateway import GatewayRequestHandler, ThreadingHTTPServer, resolve_upstream, IDENTITY_URL, CATALOG_URL


class UpstreamResponse:
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def read(self):
        return b'{}'

    def getheaders(self):
        return [('Content-Type', 'application/json')]


class QuietHandler(GatewayRequestHandler):
    def log_message(self, *args):
        pass


class GatewayHTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), QuietHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def request(self, method, path, headers=None):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=1)
        self.addCleanup(connection.close)
        connection.request(method, path, headers=headers or {})
        return connection.getresponse()

    def test_forgot_password_reaches_identity(self):
        self.assertEqual(resolve_upstream('/forgot-password/'), IDENTITY_URL)

    def test_inventory_and_catalog_dashboard_aliases_reach_catalog(self):
        self.assertEqual(resolve_upstream('/inventory/'), CATALOG_URL)
        self.assertEqual(resolve_upstream('/api/merchant/dashboard/catalog/'), CATALOG_URL)

    def test_query_does_not_break_route_selection(self):
        self.assertEqual(resolve_upstream('/profile?expand=addresses'), IDENTITY_URL)

    def test_preflight_has_finite_empty_body(self):
        response = self.request('OPTIONS', '/profile/')
        self.assertEqual(response.status, 200)
        self.assertEqual(response.getheader('Content-Length'), '0')
        self.assertEqual(response.read(), b'')

    @patch('gateway.urllib.request.urlopen', return_value=UpstreamResponse())
    def test_untrusted_identity_headers_are_not_forwarded(self, upstream):
        response = self.request('GET', '/orders/', {
            'Authorization': 'Bearer regression-test-token',
            'X-User-ID': '1', 'X-User-Role': 'admin', 'X-Internal-Token': 'forged',
        })
        self.assertEqual(response.status, 200)
        self.assertEqual(response.read(), b'{}')
        headers = {key.lower(): value for key, value in upstream.call_args.args[0].header_items()}
        self.assertEqual(headers['authorization'], 'Bearer regression-test-token')
        for name in ('x-user-id', 'x-user-role', 'x-internal-token'):
            self.assertNotIn(name, headers)
        self.assertTrue(response.getheader('X-Correlation-ID'))

    @patch('gateway.urllib.request.urlopen', return_value=UpstreamResponse())
    def test_invalid_body_framing_rejected_before_upstream(self, upstream):
        for headers, expected in [
            ({'Content-Length': 'invalid'}, 400),
            ({'Content-Length': '-1'}, 400),
            ({'Content-Length': '1048577'}, 413),
            ({'Transfer-Encoding': 'chunked'}, 400),
        ]:
            with self.subTest(headers=headers):
                response = self.request('POST', '/login/', headers)
                self.assertEqual(response.status, expected)
                self.assertEqual(response.getheader('Connection'), 'close')
                self.assertEqual(json.loads(response.read())['status'], expected)
        upstream.assert_not_called()

    @patch('gateway.urllib.request.urlopen', side_effect=OSError('private-host-detail'))
    def test_upstream_failure_is_structured_without_internal_details(self, upstream):
        response = self.request('GET', '/products/')
        self.assertEqual(response.status, 502)
        payload = json.loads(response.read())
        self.assertEqual(payload['status'], 502)
        self.assertNotIn('target', payload)
        self.assertNotIn('private-host-detail', payload['error'])
        self.assertEqual(payload['correlation_id'], response.getheader('X-Correlation-ID'))

    @patch('gateway.urllib.request.urlopen', return_value=UpstreamResponse())
    def test_duplicate_lengths_rejected_before_upstream(self, upstream):
        connection = http.client.HTTPConnection(*self.server.server_address, timeout=1)
        self.addCleanup(connection.close)
        connection.putrequest('POST', '/login/')
        connection.putheader('Content-Length', '0')
        connection.putheader('Content-Length', '1')
        connection.endheaders()
        response = connection.getresponse()
        self.assertEqual(response.status, 400)
        response.read()
        upstream.assert_not_called()

    def test_huge_numeric_length_returns_413_without_integer_conversion_error(self):
        response = self.request('POST', '/login/', {'Content-Length': '9' * 5000})
        self.assertEqual(response.status, 413)
        response.read()

    @patch('gateway.urllib.request.urlopen', return_value=UpstreamResponse())
    def test_checkout_idempotency_header_crosses_edge_and_preflight(self, upstream):
        response = self.request('POST', '/api/orders/checkout/', {'X-Idempotency-Key': 'qa-retry-key'})
        response.read()
        headers = {key.lower(): value for key, value in upstream.call_args.args[0].header_items()}
        self.assertEqual(headers.get('x-idempotency-key'), 'qa-retry-key')
        preflight = self.request('OPTIONS', '/api/orders/checkout/')
        self.assertIn('X-Idempotency-Key', preflight.getheader('Access-Control-Allow-Headers'))
        preflight.read()

    @patch('gateway.urllib.request.urlopen')
    def test_unavailable_service_makes_aggregate_health_unready(self, upstream):
        upstream.side_effect = [OSError('unavailable')] + [UpstreamResponse() for _ in range(4)]
        response = self.request('GET', '/health/')
        self.assertEqual(response.status, 503)
        self.assertEqual(json.loads(response.read())['status'], 'degraded')


if __name__ == '__main__':
    unittest.main()
