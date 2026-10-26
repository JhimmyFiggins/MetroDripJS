import tempfile
from pathlib import Path

from django.http import Http404
from django.test import RequestFactory, SimpleTestCase, override_settings

from metrodrip_backend.console_views import console_file


class ConsoleFileViewIntegrationTests(SimpleTestCase):
    databases = {'default'}

    def test_console_home_and_role_dashboards_are_served(self):
        cases = (
            ('/', b'Console & Staff Portal'),
            ('/admin/', b'Administrator Console'),
            ('/merchant/', b'Merchant Console'),
            ('/customer/', b'MetroDrip customer'),
            ('/customer/shop', b'MetroDrip customer'),
            ('/customer/products/12', b'MetroDrip customer'),
        )

        for url, expected_content in cases:
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response['Cache-Control'], 'no-store')
                self.assertIn('text/html', response['Content-Type'])
                self.assertIn(expected_content, b''.join(response.streaming_content))

    def test_clean_console_urls_fall_back_to_html_files(self):
        cases = (
            ('/admin/users', b'User Accounts'),
            ('/merchant/orders', b'Orders'),
            ('/admin/account/settings', b'Account Management'),
            ('/merchant/account/settings/', b'Account Management'),
        )

        for url, expected_content in cases:
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, 200)
                self.assertIn(expected_content, b''.join(response.streaming_content))

    def test_public_asset_is_served_with_a_bounded_cache_policy(self):
        response = self.client.get('/Registration/AppLogin.js')

        self.assertEqual(response.status_code, 200)
        self.assertIn('javascript', response['Content-Type'])
        self.assertEqual(response['Cache-Control'], 'public, max-age=300')

    def test_non_public_and_missing_files_return_not_found(self):
        for url in (
            '/dev_server.py',
            '/consoles_figma_texts.json',
            '/assets/',
            '/admin/missing.html',
            '/admin/hidden.py',
        ):
            with self.subTest(url=url):
                self.assertEqual(self.client.get(url).status_code, 404)

    def test_console_route_does_not_shadow_api_routes(self):
        response = self.client.get('/health/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok'})

    def test_static_files_reject_unsafe_methods(self):
        response = self.client.post('/admin/index.html')

        self.assertEqual(response.status_code, 405)
        self.assertEqual(response['Allow'], 'GET, HEAD')


class ConsoleFileViewSecurityTests(SimpleTestCase):
    def setUp(self):
        self.request = RequestFactory().get('/')

    def test_traversal_and_unsupported_files_are_rejected(self):
        for unsafe_path in (
            '../web/index.html',
            'admin/../index.html',
            'admin\\index.html',
            'admin/.hidden.html',
            'admin/index.py',
            'admin/index.html\x00.css',
        ):
            with self.subTest(path=unsafe_path):
                with self.assertRaises(Http404):
                    console_file(self.request, unsafe_path)

    def test_symlink_cannot_escape_console_root(self):
        with tempfile.TemporaryDirectory() as console_dir, tempfile.TemporaryDirectory() as private_dir:
            console_root = Path(console_dir)
            private_file = Path(private_dir) / 'private.html'
            private_file.write_text('private', encoding='utf-8')
            (console_root / 'admin').mkdir()
            (console_root / 'admin' / 'escape.html').symlink_to(private_file)

            with override_settings(CONSOLE_ROOT=console_root):
                with self.assertRaises(Http404):
                    console_file(self.request, 'admin/escape.html')
