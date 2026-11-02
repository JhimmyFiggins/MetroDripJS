import html
import re

from django.conf import settings
from django.http import HttpResponse
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.renderers import JSONRenderer
from rest_framework.permissions import IsAuthenticated

from .models import OrdersOrder, OrdersPayment
from fulfillment.models import ShippingShipment
from identity.authentication import CustomerTokenAuthentication
from identity.throttling import DatabaseScopedRateThrottle
from .capabilities import payment_capabilities
from .checkout import (
    CheckoutError,
    cancel_checkout,
    execute_checkout,
    expire_one_stale_checkout,
    reconcile_payment,
    serialize_checkout,
)
from .paymongo import PayMongoError
from .webhooks import WebhookError, process_paymongo_webhook, verify_paymongo_signature


class HealthAPIView(APIView):
    authentication_classes = []
    permission_classes = []
    renderer_classes = [JSONRenderer]

    def get(self, request):
        return Response({'status': 'ok'}, status=status.HTTP_200_OK)

class PaymentCapabilitiesAPIView(APIView):
    authentication_classes = []
    permission_classes = []
    renderer_classes = [JSONRenderer]

    def get(self, request):
        return Response(payment_capabilities(), status=status.HTTP_200_OK)



class CreateOrderAPIView(APIView):
    authentication_classes = [CustomerTokenAuthentication]
    permission_classes = [IsAuthenticated]
    renderer_classes = [JSONRenderer]

    def get(self, request):
        orders = OrdersOrder.objects.filter(customer_id=request.user.id).order_by('-created_at')[:50]
        response = []
        for order in orders:
            payment = order.payments.order_by('-created_at').first()
            if payment:
                response.append(serialize_checkout(order, payment))
        return Response(response)

    def post(self, request):
        return Response(
            {
                'error': 'This order-creation route has been retired because it accepted client prices. Use /api/orders/checkout/.',
                'code': 'legacy_checkout_retired',
            },
            status=status.HTTP_410_GONE,
        )


class CheckoutAPIView(APIView):
    authentication_classes = [CustomerTokenAuthentication]
    permission_classes = [IsAuthenticated]
    renderer_classes = [JSONRenderer]
    throttle_classes = [DatabaseScopedRateThrottle]
    throttle_scope = 'checkout'

    def get(self, request):
        key = request.query_params.get('idempotency_key')
        if not isinstance(key, str) or not 8 <= len(key) <= 128 or not re.fullmatch(r'[A-Za-z0-9._:-]+', key):
            return Response(
                {'error': 'A valid idempotency key is required.', 'code': 'invalid_idempotency_key'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        order = OrdersOrder.objects.filter(
            customer_id=request.user.id,
            checkout_idempotency_key=key,
        ).first()
        payment = order.payments.order_by('-created_at').first() if order else None
        if not payment:
            return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Recovery observes the saved outcome; only explicit checkout/payment
        # operations may create sessions, reconcile payments, or expire holds.
        return Response(serialize_checkout(order, payment), status=status.HTTP_200_OK)

    def post(self, request):
        try:
            # One bounded cleanup per checkout avoids a paid worker/cron while
            # keeping the free-tier deployment from accumulating stale holds.
            expire_one_stale_checkout()
            order, payment, is_replay = execute_checkout(request.user, request.data)
        except CheckoutError as error:
            return Response(
                {'error': error.message, 'code': error.code},
                status=error.status_code,
            )
        return Response(
            serialize_checkout(order, payment, is_replay=is_replay),
            status=status.HTTP_200_OK if is_replay else status.HTTP_201_CREATED,
        )


class OrderDetailAPIView(APIView):
    authentication_classes = [CustomerTokenAuthentication]
    permission_classes = [IsAuthenticated]
    renderer_classes = [JSONRenderer]
    throttle_classes = [DatabaseScopedRateThrottle]
    throttle_scope = 'payment_status'

    def get(self, request, order_id):
        order = OrdersOrder.objects.filter(id=order_id, customer_id=request.user.id).first()
        if not order:
            return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

        payment = order.payments.order_by('-created_at').first()
        if not payment:
            return Response({'error': 'Order payment not found.'}, status=status.HTTP_409_CONFLICT)
        reconciliation = 'not_required'
        if payment.status in {'awaiting_payment', 'setup_failed'}:
            try:
                reconciliation = reconcile_payment(payment)
                order.refresh_from_db()
                payment.refresh_from_db()
            except PayMongoError:
                reconciliation = 'deferred'
        response = serialize_checkout(order, payment)
        response['reconciliation_status'] = reconciliation
        return Response(response, status=status.HTTP_200_OK)


class CancelCheckoutAPIView(APIView):
    authentication_classes = [CustomerTokenAuthentication]
    permission_classes = [IsAuthenticated]
    renderer_classes = [JSONRenderer]
    throttle_classes = [DatabaseScopedRateThrottle]
    throttle_scope = 'payment_status'

    def post(self, request, order_id):
        order = OrdersOrder.objects.filter(id=order_id, customer_id=request.user.id).first()
        if not order:
            return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            order, payment = cancel_checkout(order)
        except CheckoutError as error:
            return Response({'error': error.message, 'code': error.code}, status=error.status_code)
        except PayMongoError:
            return Response(
                {
                    'error': 'Cancellation could not be confirmed. The checkout remains pending.',
                    'code': 'provider_unavailable',
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return Response(serialize_checkout(order, payment), status=status.HTTP_200_OK)


class PayMongoWebhookAPIView(APIView):
    authentication_classes = []
    permission_classes = []
    renderer_classes = [JSONRenderer]
    throttle_classes = [DatabaseScopedRateThrottle]
    throttle_scope = 'payment_webhook'

    def post(self, request):
        raw_body = request.body
        if len(raw_body) > settings.PAYMONGO_WEBHOOK_MAX_BYTES:
            return Response(
                {'error': 'Webhook payload is too large.', 'code': 'payload_too_large'},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )
        signature = (
            request.headers.get('Paymongo-Signature')
            or request.headers.get('X-Paymongo-Signature')
            or ''
        )
        try:
            verify_paymongo_signature(raw_body, signature)
            result = process_paymongo_webhook(raw_body)
        except WebhookError as error:
            return Response({'error': error.message, 'code': error.code}, status=error.status_code)
        return Response({'received': True, 'result': result}, status=status.HTTP_200_OK)


class PaymentReturnAPIView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        result = request.query_params.get('result', '').strip().lower()
        cancelled = (result == 'cancelled')
        raw_order_id = request.query_params.get('order_id', '').strip()

        order_id = None
        if raw_order_id.isdigit():
            val = int(raw_order_id)
            if 0 < val < 10**18:
                order_id = val

        safe_order_id = html.escape(str(order_id)) if order_id else ''
        safe_result = html.escape(result)

        if cancelled:
            badge_label = 'CHECKOUT INCOMPLETE'
            badge_class = 'badge-cancelled'
            heading = 'Checkout Not Completed'
            lede = 'You returned from PayMongo without completing payment.'
            body_text = (
                'Your payment session was cancelled and no charges were made to your account. '
                'If you wish to complete your purchase, you can review your order to try again or select another payment method.'
            )
            icon_markup = (
                '<div class="status-icon icon-cancelled" aria-hidden="true">'
                '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'
                '<circle cx="12" cy="12" r="10"></circle>'
                '<line x1="12" y1="8" x2="12" y2="12"></line>'
                '<line x1="12" y1="16" x2="12.01" y2="16"></line>'
                '</svg>'
                '</div>'
            )
        elif order_id is not None:
            badge_label = 'VERIFYING PAYMENT STATUS'
            badge_class = 'badge-verifying'
            heading = 'Verifying Your Payment'
            lede = 'Connecting with PayMongo to confirm your transaction…'
            body_text = (
                'Please hold on while we verify your transaction directly with PayMongo. '
                'Once confirmed, your order confirmation, receipt, and delivery tracking will update automatically.'
            )
            icon_markup = (
                '<div class="status-icon icon-verifying" aria-hidden="true">'
                '<svg class="spin-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">'
                '<circle cx="12" cy="12" r="10" stroke-opacity="0.2"></circle>'
                '<path d="M12 2a10 10 0 0 1 10 10"></path>'
                '</svg>'
                '</div>'
            )
        else:
            badge_label = 'PAYMENT SESSION ENDED'
            badge_class = 'badge-neutral'
            heading = 'Payment Session Ended'
            lede = 'You have returned to MetroDrip from the payment provider.'
            body_text = (
                'No specific order reference was associated with this return session. '
                'You can review your order history or return to shopping below.'
            )
            icon_markup = (
                '<div class="status-icon icon-neutral" aria-hidden="true">'
                '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
                '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>'
                '<line x1="3" y1="6" x2="21" y2="6"></line>'
                '<path d="M16 10a4 4 0 0 1-8 0"></path>'
                '</svg>'
                '</div>'
            )

        if order_id:
            order_ref_box = f'''
            <div class="ref-card">
              <div class="ref-item">
                <span class="ref-label">Order Reference</span>
                <span class="ref-number mono">MD-{safe_order_id}</span>
              </div>
              <p class="ref-privacy-note">Private order details, items, and receipts require customer account authentication.</p>
            </div>
            '''
            target_url = f'/customer/orders/{safe_order_id}?payment_return={safe_result}'
            if cancelled:
                action_buttons = f'''
                <div class="actions">
                  <a href="{target_url}" class="btn btn-primary" id="continue-action">Review Order &amp; Try Again</a>
                  <a href="/customer/shop" class="btn btn-secondary">Continue Shopping</a>
                </div>
                '''
                auto_js = f'''
                try {{
                  sessionStorage.setItem('metrodrip_payment_return', JSON.stringify({{
                    orderId: {order_id},
                    result: 'cancelled',
                    timestamp: Date.now()
                  }}));
                }} catch (e) {{}}
                '''
            else:
                action_buttons = f'''
                <div class="actions">
                  <a href="{target_url}" class="btn btn-primary" id="continue-action">Continue to Order Confirmation</a>
                  <a href="/customer/orders" class="btn btn-secondary">View All Orders</a>
                </div>
                '''
                auto_js = f'''
                try {{
                  sessionStorage.setItem('metrodrip_payment_return', JSON.stringify({{
                    orderId: {order_id},
                    result: '{safe_result}',
                    timestamp: Date.now()
                  }}));
                }} catch (e) {{}}
                setTimeout(function() {{
                  window.location.replace('{target_url}');
                }}, 1200);
                '''
        else:
            order_ref_box = ''
            action_buttons = '''
            <div class="actions">
              <a href="/customer/orders" class="btn btn-primary" id="continue-action">View My Orders</a>
              <a href="/customer/shop" class="btn btn-secondary">Return to Store</a>
            </div>
            '''
            auto_js = ''

        html_body = f'''<!doctype html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MetroDrip · {heading}</title>
  <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="/assets/favicon-16x16.png">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Anton&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script>
    (function() {{
      try {{
        var t = localStorage.getItem('metrodrip.customer.theme');
        if (t === 'light' || t === 'dark') {{
          document.documentElement.setAttribute('data-theme', t);
        }} else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {{
          document.documentElement.setAttribute('data-theme', 'light');
        }} else {{
          document.documentElement.setAttribute('data-theme', 'dark');
        }}
      }} catch (e) {{}}
    }})();
  </script>
  <style>
    :root {{
      color-scheme: light dark;
      --font-display: 'Anton', Impact, 'Arial Narrow', sans-serif;
      --font-body: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --font-mono: 'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace;
      --ink: #141414;
      --paper: #f4f4f2;
      --card: #ffffff;
      --border: #e4e4df;
      --volt: #d3ee42;
      --volt-hover: #c4df35;
      --volt-ink: #141414;
      --muted: #63635c;
      --danger: #c2282d;
      --danger-bg: #fdf2f2;
      --ok: #2e7d32;
      --ok-bg: #f0fdf4;
      --info: #143861;
      --info-bg: #eaf2ff;
      --warn: #b45309;
      --warn-bg: #fffbeb;
      --shadow: 0 10px 30px rgba(0,0,0,0.06);
    }}
    :root[data-theme="dark"] {{
      color-scheme: dark;
      --ink: #f4f4f2;
      --paper: #0e0e0e;
      --card: #181816;
      --border: #2e2e2a;
      --volt: #d3ee42;
      --volt-hover: #e0f854;
      --volt-ink: #141414;
      --muted: #9c9c94;
      --danger: #ff6b70;
      --danger-bg: #331214;
      --ok: #4ade80;
      --ok-bg: #123318;
      --info: #93c5fd;
      --info-bg: #17283f;
      --warn: #fbbf24;
      --warn-bg: #2d2400;
      --shadow: 0 12px 36px rgba(0,0,0,0.35);
    }}
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: var(--font-body);
      background-color: var(--paper);
      color: var(--ink);
      line-height: 1.5;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0 16px 40px;
    }}
    .mono {{ font-family: var(--font-mono); }}
    .site-nav {{
      width: 100%;
      max-width: 600px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 24px 0 16px;
    }}
    .brand-link {{
      display: inline-flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
      color: var(--ink);
    }}
    .brand-logo-emblem {{
      width: 32px;
      height: 32px;
      display: inline-block;
      flex-shrink: 0;
    }}
    .brand-logo-text {{
      font-family: var(--font-display);
      font-size: 24px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      line-height: 1;
    }}
    .brand-logo-text span {{ color: var(--volt); }}
    .theme-toggle {{
      background: transparent;
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 6px 14px;
      font-size: 13px;
      font-family: var(--font-body);
      font-weight: 500;
      color: var(--ink);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background-color 0.15s ease, border-color 0.15s ease;
    }}
    .theme-toggle:hover {{ background-color: var(--card); border-color: var(--volt); }}
    .container {{
      width: 100%;
      max-width: 600px;
      margin: auto 0;
    }}
    .return-card {{
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 36px 32px;
      box-shadow: var(--shadow);
      display: flex;
      flex-direction: column;
      gap: 20px;
    }}
    @media (max-width: 480px) {{
      .return-card {{ padding: 28px 20px; gap: 16px; }}
    }}
    .card-top {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }}
    .badge {{
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }}
    .badge-verifying {{
      background: var(--ok-bg);
      color: var(--ok);
      border: 1px solid var(--ok);
    }}
    .badge-cancelled {{
      background: var(--warn-bg);
      color: var(--warn);
      border: 1px solid var(--warn);
    }}
    .badge-neutral {{
      background: var(--paper);
      color: var(--muted);
      border: 1px solid var(--border);
    }}
    .badge-dot {{
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
    }}
    .badge-verifying .badge-dot {{
      animation: pulse 1.6s infinite ease-in-out;
    }}
    @keyframes pulse {{
      0%, 100% {{ transform: scale(0.9); opacity: 0.6; }}
      50% {{ transform: scale(1.2); opacity: 1; }}
    }}
    .status-icon {{
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }}
    .icon-verifying {{ background: var(--ok-bg); color: var(--ok); }}
    .icon-cancelled {{ background: var(--warn-bg); color: var(--warn); }}
    .icon-neutral {{ background: var(--paper); color: var(--muted); }}
    .spin-icon {{ animation: spin 1.8s linear infinite; }}
    @keyframes spin {{ to {{ transform: rotate(360deg); }} }}
    .card-title {{
      font-family: var(--font-display);
      font-size: 32px;
      line-height: 1.1;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }}
    @media (max-width: 480px) {{
      .card-title {{ font-size: 26px; }}
    }}
    .card-lede {{
      font-size: 16px;
      font-weight: 500;
      color: var(--ink);
    }}
    .card-desc {{
      font-size: 14px;
      color: var(--muted);
      line-height: 1.6;
    }}
    .ref-card {{
      background: var(--paper);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }}
    .ref-item {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 14px;
    }}
    .ref-label {{ color: var(--muted); font-size: 13px; }}
    .ref-number {{ font-weight: 600; font-size: 15px; color: var(--ink); }}
    .ref-privacy-note {{ font-size: 12px; color: var(--muted); line-height: 1.4; }}
    .actions {{
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 8px;
    }}
    @media (min-width: 480px) {{
      .actions {{ flex-direction: row; }}
    }}
    .btn {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 12px 22px;
      border-radius: 8px;
      font-family: var(--font-body);
      font-size: 14px;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      transition: all 0.15s ease;
      text-align: center;
      flex: 1;
    }}
    .btn-primary {{
      background: var(--volt);
      color: var(--volt-ink);
      border: 1px solid var(--volt);
    }}
    .btn-primary:hover {{
      background: var(--volt-hover);
      border-color: var(--volt-hover);
    }}
    .btn-secondary {{
      background: transparent;
      color: var(--ink);
      border: 1px solid var(--border);
    }}
    .btn-secondary:hover {{
      background: var(--paper);
      border-color: var(--ink);
    }}
    .security-notice {{
      border-top: 1px solid var(--border);
      padding-top: 16px;
      margin-top: 4px;
      display: flex;
      align-items: flex-start;
      gap: 10px;
      font-size: 12px;
      color: var(--muted);
      line-height: 1.45;
    }}
    .security-icon {{
      flex-shrink: 0;
      color: var(--muted);
      margin-top: 2px;
    }}
  </style>
</head>
<body>
  <nav class="site-nav" aria-label="Storefront">
    <a href="/customer/" class="brand-link" aria-label="MetroDrip Home">
      <svg class="brand-logo-emblem" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="50" cy="50" r="48" stroke="currentColor" stroke-width="4"/>
        <path d="M26 70V30L50 56L74 30V70" stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="50" cy="50" r="10" fill="var(--volt)"/>
      </svg>
      <span class="brand-logo-text">METRO<span>DRIP</span></span>
    </a>
    <button type="button" class="theme-toggle" id="theme-btn" aria-label="Toggle light or dark theme">
      <span id="theme-icon" aria-hidden="true">☼</span>
      <span id="theme-label">Theme</span>
    </button>
  </nav>

  <main class="container" id="main-content">
    <section class="return-card">
      <div class="card-top">
        <span class="badge {badge_class}">
          <span class="badge-dot" aria-hidden="true"></span>
          {badge_label}
        </span>
        {icon_markup}
      </div>

      <h1 class="card-title">{heading}</h1>
      <p class="card-lede">{lede}</p>
      <p class="card-desc">{body_text}</p>

      {order_ref_box}

      {action_buttons}

      <div class="security-notice">
        <svg class="security-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
        </svg>
        <p>Security Notice: This return redirect does not confirm payment. Official confirmation is verified directly with PayMongo via server reconciliation and webhooks.</p>
      </div>
    </section>
  </main>

  <script>
    (function() {{
      var btn = document.getElementById('theme-btn');
      var icon = document.getElementById('theme-icon');
      var label = document.getElementById('theme-label');

      function updateThemeUI(t) {{
        if (icon) icon.textContent = t === 'dark' ? '☾' : '☼';
        if (label) label.textContent = t === 'dark' ? 'Dark' : 'Light';
        if (btn) btn.setAttribute('aria-pressed', String(t === 'dark'));
      }}

      var current = document.documentElement.getAttribute('data-theme') || 'dark';
      updateThemeUI(current);

      if (btn) {{
        btn.addEventListener('click', function() {{
          var cur = document.documentElement.getAttribute('data-theme') || 'dark';
          var next = cur === 'dark' ? 'light' : 'dark';
          document.documentElement.setAttribute('data-theme', next);
          try {{
            localStorage.setItem('metrodrip.customer.theme', next);
          }} catch (e) {{}}
          updateThemeUI(next);
        }});
      }}

      {auto_js}
    }})();
  </script>
</body>
</html>'''

        response = HttpResponse(html_body, content_type='text/html; charset=utf-8')
        response['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response['Pragma'] = 'no-cache'
        response['Content-Security-Policy'] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com data:; "
            "img-src 'self' data:; "
            "base-uri 'none'; "
            "frame-ancestors 'none'"
        )
        return response


TRACKING_STAGES = [
    ('placed', 'Order placed'),
    ('payment_confirmed', 'Payment confirmed'),
    ('packed', 'Packed'),
    ('shipped', 'Shipped'),
    ('out_for_delivery', 'Out for delivery'),
    ('delivered', 'Delivered'),
]

PAID_PAYMENT_STATUSES = {'paid', 'captured', 'completed', 'confirmed', 'success', 'succeeded'}

# Furthest timeline stage implied by an order status (index into TRACKING_STAGES).
ORDER_STATUS_STAGE = {
    'pending': 0,
    'paid': 1,
    'processing': 2,
    'packed': 2,
    'shipped': 3,
    'out_for_delivery': 4,
    'delivered': 5,
    'completed': 5,
    'cancelled': 0,
}

# Furthest timeline stage implied by a shipment status.
SHIPMENT_STATUS_STAGE = {
    'booked': 2,
    'picked_up': 3,
    'shipped': 3,
    'in_transit': 3,
    'out_for_delivery': 4,
    'delivered': 5,
}

class OrderTrackingAPIView(APIView):
    authentication_classes = [CustomerTokenAuthentication]
    permission_classes = [IsAuthenticated]
    renderer_classes = [JSONRenderer]

    def get(self, request, order_id):
        order = OrdersOrder.objects.filter(id=order_id, customer_id=request.user.id).first()
        if not order:
            return Response({'error': 'Order not found.'}, status=status.HTTP_404_NOT_FOUND)

        placed_at = order.created_at
        order_number = 'MD-{}-{:05d}'.format(placed_at.year, order.id)

        items = []
        for line in order.lines.select_related('product', 'variant', 'variant__color'):
            variant_label = None
            variant = line.variant
            if variant:
                attributes = variant.attributes or {}
                color = attributes.get('color') or (variant.color.name if variant.color else None)
                parts = [
                    str(part).upper()
                    for part in (color, attributes.get('size'), attributes.get('fit'))
                    if part
                ]
                variant_label = ' · '.join(parts) or None
            items.append({
                'name': line.product.name if line.product else None,
                'variant_label': variant_label,
                'quantity': line.quantity,
            })

        shipment = ShippingShipment.objects.filter(order_ref=order.id).order_by('counter').first()

        payment = OrdersPayment.objects.filter(
            order=order,
            status__in=PAID_PAYMENT_STATUSES,
        ).order_by('created_at').first()

        furthest = ORDER_STATUS_STAGE.get((order.status or '').lower(), 0)
        if payment:
            furthest = max(furthest, 1)
        if shipment:
            furthest = max(furthest, SHIPMENT_STATUS_STAGE.get((shipment.status or '').lower(), 2))

        observed_timestamps = {0: (placed_at, 'orders_order.created_at')}
        if payment and payment.paid_at:
            observed_timestamps[1] = (payment.paid_at, 'orders_payment.paid_at')

        events = []
        for index, (key, title) in enumerate(TRACKING_STAGES):
            if index <= furthest:
                observed = observed_timestamps.get(index)
                events.append({
                    'key': key,
                    'title': title,
                    'timestamp': observed[0].isoformat() if observed else None,
                    'timestamp_source': observed[1] if observed else 'unavailable',
                    'state': 'done',
                })
            else:
                events.append({
                    'key': key,
                    'title': title,
                    'timestamp': None,
                    'timestamp_source': 'unavailable',
                    'state': 'pending',
                })

        shipment_data = None
        if shipment:
            shipment_data = {
                'courier': None,
                'courier_source': 'unavailable',
                'tracking_number': shipment.tracking_no,
                'eta_label': None,
                'eta_source': 'unavailable',
                'status': shipment.status,
                'booked_at': shipment.booked_at.isoformat() if shipment.booked_at else None,
            }

        return Response({
            'order': {
                'id': order.id,
                'number': order_number,
                'placed_at': placed_at.isoformat(),
                'status': order.status,
                'total': str(order.total),
                'items': items,
            },
            'shipment': shipment_data,
            'events': events,
        }, status=status.HTTP_200_OK)
