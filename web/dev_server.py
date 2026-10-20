import base64
import binascii
import json
import os
import re
import sys
from functools import partial
from http.server import HTTPServer, SimpleHTTPRequestHandler
import urllib.request
import urllib.error
from urllib.parse import urlsplit

# /save-favicon writes into web/assets. Only these names may be written, so a
# crafted filename cannot escape the assets directory or overwrite arbitrary
# files in the repository. Note: nothing in the repo currently calls this route;
# it is kept only so a favicon tool that already posts here still works.
ALLOWED_FAVICON_NAMES = re.compile(
    r'^(?:favicon(?:-[0-9]{1,3}x[0-9]{1,3})?|apple-touch-icon(?:-precomposed)?|site)\.(?:ico|png|svg)$'
)
MAX_FAVICON_BYTES = 1024 * 1024
ASSETS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets')

BACKEND_URL = os.environ.get('BACKEND_URL', 'http://127.0.0.1:8000').rstrip('/')
BACKEND_PATH_PREFIXES = (
    '/api/',
    '/media/',
    '/users/',
    '/products/',
    '/categories/',
    '/variants/',
    '/orders/',
    '/wishlist/',
    '/notifications/',
    '/profile/',
    '/signup/',
    '/forgot-password/',
    '/password-reset/',
    '/payment/',
)
BACKEND_PATHS = {'/login/', '/logout/'}
CUSTOMER_STATIC_SUFFIXES = {'.css', '.html', '.ico', '.js', '.png', '.svg'}

class DevHTTPRequestHandler(SimpleHTTPRequestHandler):
    def _send_json(self, status_code, payload):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _is_backend_request(self):
        path = urlsplit(self.path).path
        return path in BACKEND_PATHS or path.startswith(BACKEND_PATH_PREFIXES)

    def end_headers(self):
        # Force browsers to never cache static assets during development
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def translate_path(self, path):
        # Route rewrite for clean URLs like /admin/account/settings
        clean_path = path.split('?', 1)[0].rstrip('/')
        if clean_path in ('/admin/account/settings', '/admin/account-settings'):
            path = '/admin/account-settings.html'
        elif clean_path in ('/merchant/account/settings', '/merchant/account-settings'):
            path = '/merchant/account-settings.html'
        elif clean_path in ('/account/settings', '/account-settings'):
            path = '/merchant/account-settings.html'
        elif clean_path in ('/favicon.ico', '/favicon.png'):
            path = '/assets/favicon.png'
        elif clean_path in ('/favicon.svg',):
            path = '/assets/favicon.svg'
        elif clean_path == '/customer' or clean_path.startswith('/customer/'):
            suffix = os.path.splitext(clean_path)[1].lower()
            if suffix not in CUSTOMER_STATIC_SUFFIXES:
                path = '/customer/index.html'
        elif clean_path.startswith(('/admin/css/', '/merchant/css/')):
            path = path.replace('/admin/css/', '/css/').replace('/merchant/css/', '/css/')
        elif clean_path.startswith(('/admin/js/', '/merchant/js/')):
            path = path.replace('/admin/js/', '/js/').replace('/merchant/js/', '/js/')
        elif clean_path.startswith(('/admin/Registration/', '/merchant/Registration/')):
            path = path.replace('/admin/Registration/', '/Registration/').replace('/merchant/Registration/', '/Registration/')
        elif clean_path.startswith(('/admin/assets/', '/merchant/assets/')):
            path = path.replace('/admin/assets/', '/assets/').replace('/merchant/assets/', '/assets/')
        return super().translate_path(path)

    def _proxy_to_backend(self, method):
        try:
            length = int(self.headers.get('Content-Length') or 0)
            if length < 0:
                raise ValueError
        except ValueError:
            self._send_json(400, {'error': 'Invalid Content-Length'})
            return

        target_url = f"{BACKEND_URL}{self.path}"
        body = self.rfile.read(length) if length > 0 else None
        req = urllib.request.Request(target_url, data=body, method=method)
        for key, value in self.headers.items():
            if key.lower() not in ('host', 'content-length'):
                req.add_header(key, value)
        req.add_header('Host', urlsplit(target_url).netloc)

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                resp_data = resp.read()
                self.send_response(resp.status)
                for header, val in resp.getheaders():
                    if header.lower() not in ('content-length', 'transfer-encoding', 'connection'):
                        self.send_header(header, val)
                self.send_header('Content-Length', str(len(resp_data)))
                self.end_headers()
                self.wfile.write(resp_data)
        except urllib.error.HTTPError as e:
            err_data = e.read()
            self.send_response(e.code)
            for header, val in e.headers.items():
                if header.lower() not in ('content-length', 'transfer-encoding', 'connection'):
                    self.send_header(header, val)
            self.send_header('Content-Length', str(len(err_data)))
            self.end_headers()
            self.wfile.write(err_data)
        except Exception as e:
            self._send_json(502, {'error': f'Failed to proxy request: {str(e)}'})

    def do_GET(self):
        if self._is_backend_request():
            self._proxy_to_backend('GET')
            return
        super().do_GET()

    def do_POST(self):
        if self._is_backend_request():
            self._proxy_to_backend('POST')
            return
        if self.path.split('?', 1)[0] != '/save-favicon':
            self._send_json(404, {'error': 'Not found'})
            return

        try:
            length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            self._send_json(400, {'error': 'Invalid Content-Length'})
            return
        if length <= 0 or length > MAX_FAVICON_BYTES:
            self._send_json(400, {'error': 'Invalid payload size'})
            return

        raw = self.rfile.read(length)
        if len(raw) != length:
            self._send_json(400, {'error': 'Incomplete request body'})
            return

        try:
            payload = json.loads(raw.decode('utf-8'))
        except (UnicodeDecodeError, ValueError):
            self._send_json(400, {'error': 'Invalid JSON payload'})
            return
        if not isinstance(payload, dict):
            self._send_json(400, {'error': 'Invalid JSON payload'})
            return

        filename = payload.get('filename')
        data_b64 = payload.get('data')
        if not isinstance(filename, str) or not ALLOWED_FAVICON_NAMES.match(filename):
            self._send_json(400, {'error': 'Filename is not an allowed favicon asset'})
            return
        if not isinstance(data_b64, str) or ',' not in data_b64:
            self._send_json(400, {'error': 'Invalid favicon data'})
            return

        try:
            data = base64.b64decode(data_b64.split(',', 1)[1], validate=True)
        except (binascii.Error, ValueError):
            self._send_json(400, {'error': 'Favicon data is not valid base64'})
            return
        if not data or len(data) > MAX_FAVICON_BYTES:
            self._send_json(400, {'error': 'Invalid favicon data'})
            return

        out_path = os.path.join(ASSETS_DIR, filename)
        if os.path.dirname(os.path.abspath(out_path)) != ASSETS_DIR:
            self._send_json(400, {'error': 'Filename is not an allowed favicon asset'})
            return

        with open(out_path, 'wb') as f:
            f.write(data)
        self._send_json(200, {'status': 'ok', 'saved': filename})

    def do_PUT(self):
        if self._is_backend_request():
            self._proxy_to_backend('PUT')
            return
        self._send_json(405, {'error': 'Method not allowed'})

    def do_PATCH(self):
        if self._is_backend_request():
            self._proxy_to_backend('PATCH')
            return
        self._send_json(405, {'error': 'Method not allowed'})

    def do_DELETE(self):
        if self._is_backend_request():
            self._proxy_to_backend('DELETE')
            return
        self._send_json(405, {'error': 'Method not allowed'})

    def guess_type(self, path):
        if path.endswith('.html'):
            return 'text/html; charset=utf-8'
        if path.endswith('.js'):
            return 'application/javascript; charset=utf-8'
        if path.endswith('.css'):
            return 'text/css; charset=utf-8'
        if path.endswith('.json'):
            return 'application/json; charset=utf-8'
        return super().guess_type(path)

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
    # Loopback by default: this is a development static server and it accepts a
    # write request, so it must not be reachable from the local network.
    host = os.environ.get('BIND_HOST', '127.0.0.1')
    # SimpleHTTPRequestHandler serves from the current working directory, but
    # `npm run dev` starts this script from the repo root. Pin the document root
    # to the web/ directory so /index.html and /admin/index.html resolve the
    # same way regardless of where the command was launched.
    web_root = os.path.dirname(os.path.abspath(__file__))
    handler = partial(DevHTTPRequestHandler, directory=web_root)
    httpd = HTTPServer((host, port), handler)
    print(
        f"Dev server serving {web_root} on http://{host}:{port}/ with no-cache headers; "
        f"proxying console API requests to {BACKEND_URL}..."
    )
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nDev server stopped.")
