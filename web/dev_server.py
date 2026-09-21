import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

class DevHTTPRequestHandler(SimpleHTTPRequestHandler):
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
        elif clean_path.startswith(('/admin/css/', '/merchant/css/')):
            path = path.replace('/admin/css/', '/css/').replace('/merchant/css/', '/css/')
        elif clean_path.startswith(('/admin/js/', '/merchant/js/')):
            path = path.replace('/admin/js/', '/js/').replace('/merchant/js/', '/js/')
        elif clean_path.startswith(('/admin/Registration/', '/merchant/Registration/')):
            path = path.replace('/admin/Registration/', '/Registration/').replace('/merchant/Registration/', '/Registration/')
        elif clean_path.startswith(('/admin/assets/', '/merchant/assets/')):
            path = path.replace('/admin/assets/', '/assets/').replace('/merchant/assets/', '/assets/')
        return super().translate_path(path)

    def do_POST(self):
        if self.path == '/save-favicon':
            import json, base64, os
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length).decode('utf-8')
            payload = json.loads(body)
            filename = payload.get('filename')
            data_b64 = payload.get('data')
            if filename and data_b64:
                header, encoded = data_b64.split(',', 1)
                data = base64.b64decode(encoded)
                out_path = os.path.join(os.path.dirname(__file__), 'assets', filename)
                with open(out_path, 'wb') as f:
                    f.write(data)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'ok', 'saved': filename}).encode('utf-8'))
                return
        self.send_response(404)
        self.end_headers()

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
    server_address = ('', port)
    httpd = HTTPServer(server_address, DevHTTPRequestHandler)
    print(f"Dev server running on http://localhost:{port}/ with no-cache headers...")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nDev server stopped.")
