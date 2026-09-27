"""
MetroDripJS API Gateway (Python implementation for development & local orchestration)
Routes requests across 5 independent microservices with correlation ID tracing.
"""

import os
import sys
import json
import uuid
import re
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
import urllib.request
import urllib.error

PORT = int(os.environ.get('PORT', 8000))
IDENTITY_URL = os.environ.get('IDENTITY_URL', 'http://127.0.0.1:8001')
CATALOG_URL = os.environ.get('CATALOG_URL', 'http://127.0.0.1:8002')
ORDERS_URL = os.environ.get('ORDERS_URL', 'http://127.0.0.1:8003')
FULFILLMENT_URL = os.environ.get('FULFILLMENT_URL', 'http://127.0.0.1:8004')
CONTENT_URL = os.environ.get('CONTENT_URL', 'http://127.0.0.1:8005')

# Routing table: regex pattern -> upstream base URL
ROUTE_RULES = [
    # 1. Identity Service
    (re.compile(r'^/(signup|login|profile|wishlist|api/admin|api/identity)(/|$)'), IDENTITY_URL),
    
    # 2. Content Service (specific merchant endpoints before catalog fallback)
    (re.compile(r'^/(banners|contact|api/content)(/|$)'), CONTENT_URL),
    (re.compile(r'^/api/merchant/(banners|contact-messages)(/|$)'), CONTENT_URL),

    # 3. Fulfillment Service
    (re.compile(r'^/(shipping-zones|shipments|notifications|api/fulfillment)(/|$)'), FULFILLMENT_URL),

    # 4. Orders Service
    (re.compile(r'^/(orders|api/orders|reviews|api/reviews)(/|$)'), ORDERS_URL),
    (re.compile(r'^/api/merchant/(orders|analytics)(/|$)'), ORDERS_URL),

    # 5. Catalog Service
    (re.compile(r'^/(categories|products|variants|colors|cart|api/catalog)(/|$)'), CATALOG_URL),
    (re.compile(r'^/api/merchant/(products|inventory|categories)(/|$)'), CATALOG_URL),
]

def resolve_upstream(path):
    for pattern, upstream in ROUTE_RULES:
        if pattern.search(path):
            return upstream
    return None


class ThreadingHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


class GatewayRequestHandler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Correlation-ID, X-User-ID, X-User-Role')

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.end_headers()

    def handle_health(self):
        services = {
            'identity': IDENTITY_URL + '/health/',
            'catalog': CATALOG_URL + '/health/',
            'orders': ORDERS_URL + '/health/',
            'fulfillment': FULFILLMENT_URL + '/health/',
            'content': CONTENT_URL + '/health/',
        }
        health_status = {'gateway': 'ok', 'services': {}}
        for name, url in services.items():
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'MetroDrip-Gateway'})
                with urllib.request.urlopen(req, timeout=1.5) as resp:
                    health_status['services'][name] = 'healthy' if resp.status == 200 else f'status_{resp.status}'
            except Exception as e:
                health_status['services'][name] = f'unreachable ({str(e.__class__.__name__)})'

        body = json.dumps(health_status, indent=2).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self._proxy_request('GET')

    def do_POST(self):
        self._proxy_request('POST')

    def do_PUT(self):
        self._proxy_request('PUT')

    def do_PATCH(self):
        self._proxy_request('PATCH')

    def do_DELETE(self):
        self._proxy_request('DELETE')

    def _proxy_request(self, method):
        if self.path == '/health/' or self.path == '/health':
            self.handle_health()
            return

        upstream_base = resolve_upstream(self.path)
        if not upstream_base:
            body = json.dumps({
                'error': f'Route not found on Gateway: {self.path}',
                'status': 404,
            }).encode('utf-8')
            self.send_response(404)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(body)
            return

        target_url = f"{upstream_base}{self.path}"
        correlation_id = self.headers.get('X-Correlation-ID') or str(uuid.uuid4())

        # Read request body if present
        content_length = int(self.headers.get('Content-Length', 0))
        req_data = self.rfile.read(content_length) if content_length > 0 else None

        # Build upstream request
        req = urllib.request.Request(target_url, data=req_data, method=method)
        req.add_header('X-Correlation-ID', correlation_id)

        # Forward safe headers
        for h in ['Authorization', 'Content-Type', 'Accept', 'X-User-ID', 'X-User-Role']:
            val = self.headers.get(h)
            if val:
                req.add_header(h, val)

        try:
            with urllib.request.urlopen(req, timeout=10.0) as resp:
                resp_data = resp.read()
                self.send_response(resp.status)
                for header, val in resp.getheaders():
                    if header.lower() not in ('content-length', 'server', 'date', 'transfer-encoding', 'access-control-allow-origin'):
                        self.send_header(header, val)
                self.send_header('X-Correlation-ID', correlation_id)
                self.send_header('Content-Length', str(len(resp_data)))
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(resp_data)
        except urllib.error.HTTPError as e:
            err_data = e.read()
            self.send_response(e.code)
            for header, val in e.headers.items():
                if header.lower() not in ('content-length', 'server', 'date', 'transfer-encoding', 'access-control-allow-origin'):
                    self.send_header(header, val)
            self.send_header('X-Correlation-ID', correlation_id)
            self.send_header('Content-Length', str(len(err_data)))
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(err_data)
        except Exception as e:
            err_body = json.dumps({
                'error': f'Gateway upstream connection failed: {str(e)}',
                'target': target_url,
                'status': 502,
                'correlation_id': correlation_id,
            }).encode('utf-8')
            self.send_response(502)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(err_body)))
            self.send_header('X-Correlation-ID', correlation_id)
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(err_body)


def run_gateway(port=PORT):
    server = ThreadingHTTPServer(('0.0.0.0', port), GatewayRequestHandler)
    print(f"[MetroDrip Gateway] Listening on http://0.0.0.0:{port}")
    print(f"  -> Identity:    {IDENTITY_URL}")
    print(f"  -> Catalog:     {CATALOG_URL}")
    print(f"  -> Orders:      {ORDERS_URL}")
    print(f"  -> Fulfillment: {FULFILLMENT_URL}")
    print(f"  -> Content:     {CONTENT_URL}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down Gateway...")
        server.server_close()


if __name__ == '__main__':
    run_gateway()
