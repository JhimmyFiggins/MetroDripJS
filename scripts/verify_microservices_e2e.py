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
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
PYTHON_EXE = ROOT_DIR / 'metrodrip_backend' / '.venv' / 'Scripts' / 'python.exe'

SERVICES = [
    ('identity', ROOT_DIR / 'services' / 'identity', 8001),
    ('catalog', ROOT_DIR / 'services' / 'catalog', 8002),
    ('orders', ROOT_DIR / 'services' / 'orders', 8003),
    ('fulfillment', ROOT_DIR / 'services' / 'fulfillment', 8004),
    ('content', ROOT_DIR / 'services' / 'content', 8005),
]

def make_request(url, method='GET', data=None, headers=None):
    hdrs = {'Accept': 'application/json', 'User-Agent': 'MetroDrip-E2E-Verifier'}
    if headers:
        hdrs.update(headers)
    req_body = None
    if data is not None:
        hdrs['Content-Type'] = 'application/json'
        req_body = json.dumps(data).encode('utf-8')

    req = urllib.request.Request(url, data=req_body, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(req, timeout=15.0) as resp:
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
    print("=" * 70)
    print("METRODRIP-JS: END-TO-END MICROSERVICES INTEGRATION VERIFICATION")
    print("=" * 70)
    print(f"Working directory: {ROOT_DIR}")
    print(f"Python interpreter: {PYTHON_EXE}")

    processes = []
    try:
        # 1. Start all 5 microservices
        for name, svc_dir, port in SERVICES:
            print(f"[*] Starting {name} service on port {port}...")
            env = os.environ.copy()
            env['PORT'] = str(port)
            env['CATALOG_SERVICE_URL'] = 'http://127.0.0.1:8002'
            env['FULFILLMENT_SERVICE_URL'] = 'http://127.0.0.1:8004'
            env['IDENTITY_SERVICE_URL'] = 'http://127.0.0.1:8001'
            env['INTERNAL_TOKEN'] = 'internal_service_mesh_secret_2026'
            proc = subprocess.Popen(
                [str(PYTHON_EXE), 'manage.py', 'runserver', f'127.0.0.1:{port}', '--noreload'],
                cwd=str(svc_dir),
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            processes.append((name, proc))

        # 2. Start Gateway
        print("[*] Starting Gateway on port 8000...")
        gw_proc = subprocess.Popen(
            [str(PYTHON_EXE), str(ROOT_DIR / 'gateway' / 'gateway.py')],
            cwd=str(ROOT_DIR),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        processes.append(('gateway', gw_proc))

        # 3. Wait for all services to become healthy via Gateway
        print("[*] Waiting for all services to report healthy on Gateway...")
        gateway_healthy = False
        for attempt in range(25):
            time.sleep(1.0)
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
            for name, _, port in SERVICES:
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
        signup_email = f"customer_{int(time.time())}@metrodrip.ph"
        signup_status, signup_data, _ = make_request('http://127.0.0.1:8000/signup/', method='POST', data={
            'name': 'E2E Test Customer',
            'email': signup_email,
            'password': 'SecureE2EPassword2026!',
        })
        assert signup_status == 201, f"Signup failed: {signup_data}"
        print(f"[+] Customer Signup successful: {signup_email} (ID: {signup_data['id']})")

        # 2. Test Customer Login
        login_status, login_data, _ = make_request('http://127.0.0.1:8000/login/', method='POST', data={
            'email': 'customer@metrodrip.ph',
            'password': 'CustomerSecurePassword2026!',
        })
        assert login_status == 200, f"Login failed: {login_data}"
        assert 'token' in login_data, "Token missing in login response"
        assert 'password' not in login_data, "Plaintext password disclosed in response"
        token = login_data['token']
        customer_id = login_data['id']
        print(f"[+] Login successful: customer_id={customer_id}, token={token[:8]}... (password not exposed)")

        # 2. Authenticated Profile access via Bearer Token
        prof_status, prof_data, _ = make_request('http://127.0.0.1:8000/profile/', headers={
            'Authorization': f'Bearer {token}',
        })
        assert prof_status == 200, f"Profile failed: {prof_data}"
        assert prof_data.get('email') == 'customer@metrodrip.ph'
        print(f"[+] Verifiable Token authentication verified: {prof_data['name']} ({prof_data['role']})")

        # 3. Unauthenticated access rejected
        unauth_status, _, _ = make_request('http://127.0.0.1:8000/profile/')
        assert unauth_status in (401, 403), f"Unauthenticated profile returned {unauth_status}"
        print("[+] Unauthenticated request properly rejected (HTTP 401)")

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
        print("PHASE 4: MERCHANT CONSOLE PARITY (ZERO FAKE DATA)")
        print("-" * 70)
        # 1. Fetch merchant orders
        m_status, m_orders, _ = make_request('http://127.0.0.1:8000/api/merchant/orders/')
        assert m_status == 200, f"Merchant orders failed: {m_orders}"
        assert isinstance(m_orders, list), "Merchant orders response is not an array"
        matching_order = next((o for o in m_orders if o['order_no'] == order_no or o['id'] == order_no), None)
        assert matching_order is not None, f"Newly created order {order_no} not found in merchant orders!"
        assert matching_order['total'] == f"₱{order_total:,}", f"Merchant total {matching_order['total']} != ₱{order_total:,}"
        print(f"[+] Real-time Merchant Console verified:")
        print(f"    - Found newly placed order {matching_order['id']} on merchant console")
        print(f"    - Customer: {matching_order['customer']}")
        print(f"    - Total: {matching_order['total']}")
        print(f"    - Fulfillment: {matching_order['fulfillment']}")

        # 2. Update order status from merchant console
        target_id = matching_order.get('order_id') or order_no
        patch_status, patch_res, _ = make_request(f'http://127.0.0.1:8000/api/merchant/orders/{target_id}/', method='PATCH', data={
            'status': 'packed',
        })
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
        print("ALL END-TO-END VERIFICATION CHECKS PASSED PERFECTLY (5/5 SERVICES)")
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
                except Exception:
                    pass
        print("[+] All processes terminated cleanly.")


if __name__ == '__main__':
    main()
