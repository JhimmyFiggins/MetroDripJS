import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

class DevHTTPRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Force browsers to never cache static assets during development
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

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
