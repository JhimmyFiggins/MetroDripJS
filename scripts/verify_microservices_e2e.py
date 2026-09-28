"""
End-to-End Microservices Verification Script
Starts all 5 Django microservices and the API Gateway,
runs the complete customer COD checkout saga and merchant console verification,
and asserts all invariants from the Release Acceptance Matrix.
"""

import os
import sys
import time
import json
import subprocess
import urllib.request
import urllib.error
import secrets
import socket
import sqlite3
import tempfile
from contextlib import closing
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
PYTHON_EXE = sys.executable
GATEWAY_URL = None

SERVICES = [
    ('identity', ROOT_DIR / 'services' / 'identity', 8001),
    ('catalog', ROOT_DIR / 'services' / 'catalog', 8002),
    ('orders', ROOT_DIR / 'services' / 'orders', 8003),
    ('fulfillment', ROOT_DIR / 'services' / 'fulfillment', 8004),
    ('content', ROOT_DIR / 'services' / 'content', 8005),
]


def isolated_environment(directory, ports):
    env = {key: value for key, value in os.environ.items()
           if key.upper() not in ('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'DATABASE_URL', 'DJANGO_SETTINGS_MODULE')}
    env.update(DEBUG='False', ALLOWED_HOSTS='127.0.0.1,localhost', BIND_HOST='127.0.0.1',
               INTERNAL_TOKEN=secrets.token_urlsafe(32), SECRET_KEY=secrets.token_urlsafe(32),
               QA_PASSWORD=secrets.token_urlsafe(24), PYTHONDONTWRITEBYTECODE='1',
               PYTHONIOENCODING='utf-8')
    for name, port in ports.items():
        env[f'{name.upper()}_SERVICE_URL'] = f'http://127.0.0.1:{port}'
        env[f'{name.upper()}_URL'] = f'http://127.0.0.1:{port}'
    return env


def prepare_database(name, directory, env):
    env = dict(env, DATABASE_URL='sqlite:///' + (Path(directory) / f'{name}.sqlite3').as_posix())
    fixtures = {
        'identity': """
import os
from identity.models import AccountsCustomer
from django.utils import timezone
for role in ('customer', 'merchant', 'admin'):
    user = AccountsCustomer(email=f'{role}@example.invalid', name=f'QA {role}', role=role,
        is_active=True, is_staff=role != 'customer', is_superuser=role == 'admin',
        date_joined=timezone.now(), addresses=[])
    user.set_password(os.environ['QA_PASSWORD'])
    user.save()
""",
        'catalog': """
from catalog.models import CatalogCategory, CatalogProduct, CatalogProductVariant, InventoryStockEntry
c = CatalogCategory.objects.create(name='QA Category', slug='qa-category')
p = CatalogProduct.objects.create(sku='QA-001', name='QA Product', category=c, base_price=1249, currency='PHP')
v = CatalogProductVariant.objects.create(product=p, sku='QA-001-M', attributes={'size': 'M'}, price_adjustment=0)
InventoryStockEntry.objects.create(product=p, variant=v, warehouse_id=1, quantity=5, reserved_quantity=0)
""",
        'fulfillment': """
from fulfillment.models import ShippingShippingZone
for name, fee in [('NCR (Metro Manila)',85),('North & South Luzon',120),('Visayas & Mindanao (VisMin)',150)]:
    ShippingShippingZone.objects.create(name=name, fee=fee, is_active=True)
""",
        'content': """
from content.models import CmsHomepageBanner
CmsHomepageBanner.objects.create(title='QA Banner', image_url='/qa.png', link_url='/shop', is_active=True, order=1)
""",
    }
    commands = [['migrate', '--noinput']]
    if name in fixtures:
        commands.append(['shell', '-c', fixtures[name]])
    for args in commands:
        result = subprocess.run([PYTHON_EXE, 'manage.py', *args], cwd=ROOT_DIR / 'services' / name,
                                env=env, capture_output=True, text=True, timeout=60)
        if result.returncode:
            raise RuntimeError(f'Isolated {name} database setup failed: {result.stderr[-1200:]}')
    return env

def make_request(url, method='GET', data=None, headers=None):
    if GATEWAY_URL is None:
        raise RuntimeError('Requests require the isolated gateway to be configured')
    url = url.replace('http://127.0.0.1:8000', GATEWAY_URL, 1)
    hdrs = {'Accept': 'application/json', 'User-Agent': 'MetroDrip-E2E-Verifier'}
    if headers:
        hdrs.update(headers)
    req_body = None
    if data is not None:
        hdrs['Content-Type'] = 'application/json'
        req_body = json.dumps(data).encode('utf-8')

    req = urllib.request.Request(url, data=req_body, headers=hdrs, method=method)
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(req, timeout=15.0) as resp:
            body = resp.read().decode('utf-8')
            return resp.status, json.loads(body) if body else {}, dict(resp.getheaders())
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        try:
            parsed = json.loads(body)
        except Exception:
            parsed = {'raw': body}
        return e.code, parsed, dict(e.headers.items())


def main():
    global GATEWAY_URL
    print("=" * 70)
    print("METRODRIP-JS: END-TO-END MICROSERVICES INTEGRATION VERIFICATION")
    print("=" * 70)
    print(f"Working directory: {ROOT_DIR}")
    print(f"Python interpreter: {PYTHON_EXE}")

    processes = []
    temporary = tempfile.TemporaryDirectory(prefix='metrodrip-qa-')
    try:
        # Reserve distinct loopback ports together; never reuse an existing listener.
        sockets = []
        for _ in range(6):
            listener = socket.socket()
            listener.bind(('127.0.0.1', 0))
            sockets.append(listener)
        ports = {name: sockets[index].getsockname()[1] for index, (name, _, _) in enumerate(SERVICES)}
        gateway_port = sockets[-1].getsockname()[1]
        GATEWAY_URL = f'http://127.0.0.1:{gateway_port}'
        for listener in sockets:
            listener.close()
        base_env = isolated_environment(temporary.name, ports)
        # 1. Start all 5 microservices
        for name, svc_dir, _ in SERVICES:
            port = ports[name]
            print(f"[*] Starting {name} service on port {port}...")
            env = prepare_database(name, temporary.name, base_env)
            env['PORT'] = str(port)
            proc = subprocess.Popen(
                [str(PYTHON_EXE), 'manage.py', 'runserver', f'127.0.0.1:{port}', '--noreload'],
                cwd=str(svc_dir),
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            processes.append((name, proc))

        # 2. Start Gateway
        print(f"[*] Starting Gateway on port {gateway_port}...")
        gw_proc = subprocess.Popen(
            [str(PYTHON_EXE), str(ROOT_DIR / 'gateway' / 'gateway.py')],
            cwd=str(ROOT_DIR),
            env=dict(base_env, PORT=str(gateway_port)),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        processes.append(('gateway', gw_proc))

        # 3. Wait for all services to become healthy via Gateway
        print("[*] Waiting for all services to report healthy on Gateway...")
        gateway_healthy = False
        for attempt in range(25):
            time.sleep(1.0)
            if any(proc.poll() is not None for _, proc in processes):
                raise RuntimeError('Owned service exited during startup; refusing to use another listener')
            try:
                status, data, _ = make_request('http://127.0.0.1:8000/health/')
                if status == 200 and data.get('gateway') == 'ok':
                    services_status = data.get('services', {})
                    all_ok = all(v == 'healthy' for v in services_status.values()) and len(services_status) == 5
                    if all_ok:
                        gateway_healthy = True
                        print(f"    [+] Gateway and all 5 services healthy after {attempt+1}s!")
                        break
            except Exception:
                pass

        if not gateway_healthy:
            print("[-] Gateway health check timed out. Checking individual services...")
            for name, _, _ in SERVICES:
                port = ports[name]
                try:
                    s, d, _ = make_request(f'http://127.0.0.1:{port}/health/')
                    print(f"    - {name} ({port}): {s} {d}")
                except Exception as e:
                    print(f"    - {name} ({port}): FAILED ({e})")
            sys.exit(1)

        print("\n" + "-" * 70)
        print("PHASE 1: SECURITY & AUTHENTICATION")
        print("-" * 70)
        # 1. Test Customer Signup
        signup_email = 'signup@example.invalid'
        signup_status, signup_data, _ = make_request('http://127.0.0.1:8000/signup/', method='POST', data={
            'name': 'E2E Test Customer',
            'email': signup_email,
            'password': 'SecureE2EPassword2026!',
        })
        assert signup_status == 201, f"Signup failed: {signup_data}"
        print(f"[+] Customer Signup successful: {signup_email} (ID: {signup_data['id']})")

        # 2. Test Customer Login
        login_status, login_data, _ = make_request('http://127.0.0.1:8000/login/', method='POST', data={
            'email': 'customer@example.invalid',
            'password': base_env['QA_PASSWORD'],
        })
        assert login_status == 200, f"Login failed: {login_data}"
        assert 'token' in login_data, "Token missing in login response"
        assert 'password' not in login_data, "Plaintext password disclosed in response"
        token = login_data['token']
        customer_id = login_data['id']
        print('[+] Customer login returned a token; credential values omitted')

        # 2. Authenticated Profile access via Bearer Token
        prof_status, prof_data, _ = make_request('http://127.0.0.1:8000/profile/', headers={
            'Authorization': f'Bearer {token}',
        })
        assert prof_status == 200, f"Profile failed: {prof_data}"
        assert prof_data.get('email') == 'customer@example.invalid'
        print(f"[+] Verifiable Token authentication verified: {prof_data['name']} ({prof_data['role']})")

        # 3. Unauthenticated access rejected
        unauth_status, _, _ = make_request('http://127.0.0.1:8000/profile/')
        assert unauth_status in (401, 403), f"Unauthenticated profile returned {unauth_status}"
        print("[+] Unauthenticated request properly rejected (HTTP 401)")

        authorization_failures = []
        for path, method, data, headers in [
            ('/api/catalog/reserve/', 'POST', {}, {}),
            ('/api/fulfillment/events/order-placed/', 'POST', {}, {}),
            ('/api/merchant/banners/', 'GET', None, {}),
            ('/notifications/', 'GET', None, {'X-User-ID': str(customer_id)}),
            ('/orders/', 'GET', None, {'X-User-ID': str(customer_id)}),
        ]:
            result, _, _ = make_request(GATEWAY_URL + path, method=method, data=data, headers=headers)
            if result not in (401, 403):
                authorization_failures.append(path)
                print(f'[FAIL] Authorization boundary {path}: HTTP {result}')
            else:
                print(f'[PASS] Authorization boundary {path}: HTTP {result}')

        print("\n" + "-" * 70)
        print("PHASE 2: CATALOG & INVENTORY")
        print("-" * 70)
        # 1. Fetch public products
        prod_status, products, _ = make_request('http://127.0.0.1:8000/products/')
        assert prod_status == 200, f"Products failed: {products}"
        assert len(products) > 0, "No products found"
        first_prod = products[0]
        prod_id = first_prod['id']
        
        # Fetch product detail to get its variants
        detail_status, prod_detail, _ = make_request(f'http://127.0.0.1:8000/products/{prod_id}/')
        assert detail_status == 200, f"Product detail failed: {prod_detail}"
        assert len(prod_detail.get('variants', [])) > 0, "No variants for product"
        first_variant = prod_detail['variants'][0]
        variant_id = first_variant['id']
        prod_price = first_variant['final_price']
        assert isinstance(prod_price, int), f"Price {prod_price} is not integer whole PHP peso"
        print(f"[+] Catalog products retrieved: '{first_prod['name']}' · ₱{prod_price} (Variant ID: {variant_id})")

        # 2. Server quote contract
        quote_status, quote_data, _ = make_request('http://127.0.0.1:8000/api/catalog/quote/', method='POST', data={
            'items': [{'variant_id': variant_id, 'quantity': 1}],
        })
        assert quote_status == 200, f"Quote failed: {quote_data}"
        fingerprint = quote_data['fingerprint']
        quote_subtotal = quote_data['subtotal']
        assert quote_subtotal == prod_price
        print(f"[+] Authoritative server quote generated: Subtotal=₱{quote_subtotal}, fingerprint={fingerprint[:12]}...")

        print("\n" + "-" * 70)
        print("PHASE 3: COD CHECKOUT SAGA & DATA ISOLATION")
        print("-" * 70)
        # 1. Submit COD Order with tampered client price (1 peso)
        # The saga MUST ignore the tampered price and use authoritative server pricing
        idempotency_key = f"e2e-test-checkout-{int(time.time())}"
        order_status, order_res, _ = make_request('http://127.0.0.1:8000/api/orders/checkout/', method='POST', data={
            'idempotency_key': idempotency_key,
            'items': [{'variant_id': variant_id, 'quantity': 1, 'price': 1}], # Tampered price
            'delivery_zone': 'NCR (Metro Manila)',
            'payment_method': 'COD',
            'shipping_address': {
                'name': 'Juan Dela Cruz',
                'address_line1': 'Unit 1204 Ayala Tower',
                'city': 'Makati City',
                'state': 'Metro Manila (NCR)',
                'phone': '+639171234567',
            }
        }, headers={'Authorization': f'Bearer {token}'})

        if order_status != 201:
            err_html = order_res.get('raw', '') if isinstance(order_res, dict) else str(order_res)
            import re
            m = re.search(r'Exception Value:\s*</th>\s*<td><pre[^>]*>(.*?)</pre>', err_html, re.DOTALL)
            t = re.search(r'<title>(.*?)</title>', err_html, re.DOTALL)
            print(f"[-] Checkout Saga FAILED with status {order_status}!")
            print("    Title:", t.group(1).strip() if t else 'Unknown')
            print("    Exc:", m.group(1).strip() if m else err_html[:300])
            sys.exit(1)

        order_no = order_res['order_no']
        order_total = order_res['total']
        order_subtotal = order_res['subtotal']
        order_shipping = order_res['shipping']
        assert order_subtotal == prod_price, f"Server allowed client tampered price! subtotal={order_subtotal}, expected={prod_price}"
        assert order_res['payment_status'] == 'pending_collection', "COD order must be pending_collection, never paid"
        assert order_res['status'] == 'placed', "Order status must be placed"
        print(f"[+] COD Checkout Saga completed successfully:")
        print(f"    - Order No: {order_no}")
        print(f"    - Subtotal: ₱{order_subtotal} (Tampered client price overridden by server)")
        print(f"    - Shipping: ₱{order_shipping} (Authoritative Fulfillment quote)")
        print(f"    - Total:    ₱{order_total}")
        print(f"    - Payment:  {order_res['payment_status']} (COD)")

        # 2. Idempotency test (replay same checkout)
        replay_status, replay_res, _ = make_request('http://127.0.0.1:8000/api/orders/checkout/', method='POST', data={
            'idempotency_key': idempotency_key,
            'items': [{'variant_id': variant_id, 'quantity': 1}],
            'delivery_zone': 'NCR (Metro Manila)',
            'payment_method': 'COD',
        }, headers={'Authorization': f'Bearer {token}'})
        assert replay_status == 200, f"Replay failed: {replay_res}"
        assert replay_res['order_no'] == order_no, "Replay did not return existing order"
        assert replay_res.get('is_replay') is True, "Replay flag not set"
        print("[+] Replay protection verified: Identical request returned existing order without re-holding stock")

        print("\n" + "-" * 70)
        print("PHASE 4: MERCHANT API PARITY (SYNTHETIC FIXTURES)")
        print("-" * 70)
        # 1. Fetch merchant orders
        merchant_status, merchant, _ = make_request('http://127.0.0.1:8000/login/', method='POST', data={
            'email': 'merchant@example.invalid', 'password': base_env['QA_PASSWORD'],
        })
        assert merchant_status == 200, 'Merchant fixture login failed'
        merchant_headers = {'Authorization': f"Bearer {merchant['token']}"}
        for path in ['/api/merchant/products/', '/inventory/', '/shipments/', '/api/merchant/banners/', '/api/merchant/contact-messages/']:
            allowed, _, _ = make_request(GATEWAY_URL + path, headers=merchant_headers)
            denied, _, _ = make_request(GATEWAY_URL + path, headers={'Authorization': f'Bearer {token}'})
            assert allowed == 200 and denied in (401, 403), f'Role boundary failed for {path}: merchant={allowed}, customer={denied}'
        print('[+] Five merchant endpoints accepted verified merchant tokens and rejected customer tokens')
        m_status, m_orders, _ = make_request('http://127.0.0.1:8000/api/merchant/orders/', headers=merchant_headers)
        assert m_status == 200, f"Merchant orders failed: {m_orders}"
        assert isinstance(m_orders, list), "Merchant orders response is not an array"
        matching_order = next((o for o in m_orders if o['order_no'] == order_no or o['id'] == order_no), None)
        assert matching_order is not None, f"Newly created order {order_no} not found in merchant orders!"
        assert matching_order['total'] == f"₱{order_total:,}", f"Merchant total {matching_order['total']} != ₱{order_total:,}"
        print(f"[+] Merchant API returned the persisted order:")
        print(f"    - Found newly placed order {matching_order['id']} on merchant console")
        print(f"    - Customer: {matching_order['customer']}")
        print(f"    - Total: {matching_order['total']}")
        print(f"    - Fulfillment: {matching_order['fulfillment']}")

        # 2. Update order status from merchant console
        target_id = matching_order.get('order_id') or order_no
        patch_status, patch_res, _ = make_request(f'http://127.0.0.1:8000/api/merchant/orders/{target_id}/', method='PATCH', data={
            'status': 'packed',
        }, headers=merchant_headers)
        assert patch_status == 200, f"Merchant order patch failed (HTTP {patch_status}): {patch_res}"
        assert patch_res['status'] == 'Packed'
        print(f"[+] Merchant marked order as Packed: {patch_res['message']}")

        print("\n" + "-" * 70)
        print("PHASE 5: CONTENT & FULFILLMENT VERIFICATION")
        print("-" * 70)
        # 1. Fulfillment zones
        fz_status, fz_data, _ = make_request('http://127.0.0.1:8000/shipping-zones/')
        assert fz_status == 200 and len(fz_data) >= 3
        print(f"[+] Fulfillment service: {len(fz_data)} shipping zones active")

        # 2. Content banners
        cb_status, cb_data, _ = make_request('http://127.0.0.1:8000/banners/')
        assert cb_status == 200 and len(cb_data) >= 1
        print(f"[+] Content service: {len(cb_data)} public active banners verified")

        print("\n" + "=" * 70)
        with closing(sqlite3.connect(Path(temporary.name) / 'catalog.sqlite3')) as db:
            stock = db.execute('SELECT quantity, reserved_quantity FROM inventory_stockentry').fetchone()
            assert stock == (4, 0), f'Stock must decrement exactly once, observed {stock}'
        print('[+] Persisted stock decremented exactly once across checkout replay')
        with closing(sqlite3.connect(Path(temporary.name) / 'orders.sqlite3')) as db:
            assert db.execute('PRAGMA foreign_key_check').fetchall() == [], 'Orders contains orphaned relations'
            rows = db.execute('SELECT payload, state FROM orders_outboxmessage').fetchall()
            assert len(rows) == 1, 'Checkout replay duplicated outbox event'
            event = json.loads(rows[0][0])
            print(f'[+] One durable outbox record; dispatch state: {rows[0][1]}')
        # Explicit delivery tests the consumer, not an automatic outbox publisher.
        for _ in range(2):
            event_status, _, _ = make_request(
                f"{base_env['FULFILLMENT_SERVICE_URL']}/api/fulfillment/events/order-placed/",
                method='POST', data=event, headers={'X-Internal-Token': base_env['INTERNAL_TOKEN']})
            assert event_status == 200, f'Event consumer returned {event_status}'
        with closing(sqlite3.connect(Path(temporary.name) / 'fulfillment.sqlite3')) as db:
            assert db.execute('SELECT COUNT(*) FROM shipping_shipment').fetchone()[0] == 1
            assert db.execute('SELECT COUNT(*) FROM notifications_notification').fetchone()[0] == 1
        print('[+] Manual duplicate event delivery produced one shipment and one notification')
        note_status, notes, _ = make_request(GATEWAY_URL + '/notifications/', headers={'Authorization': f'Bearer {token}'})
        assert note_status == 200 and len(notes) == 1, 'Customer bearer notification access failed'
        cascade_check = """
from django.db import transaction
from orders.models import OrdersOrder, OrdersOrderLine, OrdersShippingAddress, OrdersPayment, OrdersStockHold, OrdersIdempotencyRecord
models = (OrdersOrder, OrdersOrderLine, OrdersShippingAddress, OrdersPayment, OrdersStockHold, OrdersIdempotencyRecord)
assert all(model.objects.count() == 1 for model in models)
with transaction.atomic():
    OrdersOrder.objects.first().delete()
    assert all(model.objects.count() == 0 for model in models)
    transaction.set_rollback(True)
assert all(model.objects.count() == 1 for model in models)
"""
        result = subprocess.run([PYTHON_EXE, 'manage.py', 'shell', '-c', cascade_check],
            cwd=ROOT_DIR / 'services' / 'orders', capture_output=True, text=True, timeout=30,
            env=dict(base_env, DATABASE_URL='sqlite:///' + (Path(temporary.name) / 'orders.sqlite3').as_posix()))
        assert result.returncode == 0, f'Isolated cascade/rollback check failed: {result.stderr[-1000:]}'
        print('[+] ORM deletion cascaded to five related tables; transaction rollback restored all six tables')
        print('[!] Automatic outbox delivery/reconciliation is not verified by this runner')
        assert not authorization_failures, f'Authorization checks failed: {authorization_failures}'
        print("ALL 5 ISOLATED API INTEGRATION PHASES PASSED (not browser or native E2E)")
        print("=" * 70)

    finally:
        print("\n[*] Terminating all microservices and gateway processes...")
        for name, proc in processes:
            try:
                proc.terminate()
                proc.wait(timeout=2.0)
            except Exception:
                try:
                    proc.kill()
                    proc.wait(timeout=5.0)
                except Exception:
                    pass
        print("[+] All processes terminated cleanly.")
        GATEWAY_URL = None
        temporary.cleanup()


if __name__ == '__main__':
    main()
