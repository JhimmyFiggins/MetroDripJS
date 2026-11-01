import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../../web/', import.meta.url);
const rootPath = fileURLToPath(root);

const viewports = [
  { name: 'mobile', width: 360, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
];

const types = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};

// Mock order fixtures for the 6 distinct states
const mockOrders = {
  '101': {
    id: 101,
    order_no: 'MD-2026-00101',
    status: 'paid',
    payment_status: 'paid',
    payment_method: 'gcash',
    subtotal: '2490.00',
    shipping: '100.00',
    tax: '0.00',
    discount: '0.00',
    total: '2590.00',
    currency: 'PHP',
    reconciliation_status: 'reconciled',
    created_at: '2026-11-01T12:00:00Z',
    shipping_address: {
      name: 'Maria Santos',
      phone: '09171234567',
      address_line1: '123 Ayala Avenue',
      address_line2: 'Unit 4B',
      city: 'Makati City',
      state: 'Metro Manila',
      postal_code: '1226',
      country: 'Philippines',
    },
    items: [
      {
        product_ref: 1,
        variant_ref: 1,
        product_name: 'Metro Heavyweight Oversized Tee',
        sku: 'TSH-METRO-BLK-L',
        variant_desc: 'BLACK · L · RELAXED',
        quantity: 2,
        unit_price: '1245.00',
        total_price: '2490.00',
      },
    ],
  },
  '102': {
    id: 102,
    order_no: 'MD-2026-00102',
    status: 'pending_payment',
    payment_status: 'awaiting_payment',
    payment_method: 'maya',
    subtotal: '1850.00',
    shipping: '100.00',
    tax: '0.00',
    discount: '0.00',
    total: '1950.00',
    currency: 'PHP',
    reconciliation_status: 'not_required',
    payment_action: {
      type: 'redirect',
      url: 'https://checkout.paymongo.com/cs_test_102#test',
      provider: 'paymongo',
    },
    created_at: '2026-11-01T12:05:00Z',
    shipping_address: {
      name: 'Juan Dela Cruz',
      phone: '09181234567',
      address_line1: '456 BGC High Street',
      city: 'Taguig City',
      state: 'Metro Manila',
      postal_code: '1634',
      country: 'Philippines',
    },
    items: [
      {
        product_ref: 2,
        variant_ref: 3,
        product_name: 'Urban Cargo Pants',
        sku: 'PNT-URBAN-GRN-M',
        variant_desc: 'OLIVE · M',
        quantity: 1,
        unit_price: '1850.00',
        total_price: '1850.00',
      },
    ],
  },
  '103': {
    id: 103,
    order_no: 'MD-2026-00103',
    status: 'cancelled',
    payment_status: 'cancelled',
    payment_method: 'card',
    subtotal: '3200.00',
    shipping: '100.00',
    tax: '0.00',
    discount: '0.00',
    total: '3300.00',
    currency: 'PHP',
    reconciliation_status: 'not_required',
    created_at: '2026-11-01T12:10:00Z',
    shipping_address: {
      name: 'Elena Ramos',
      phone: '09191234567',
      address_line1: '789 Ortigas Center',
      city: 'Pasig City',
      state: 'Metro Manila',
      postal_code: '1605',
      country: 'Philippines',
    },
    items: [],
  },
  '104': {
    id: 104,
    order_no: 'MD-2026-00104',
    status: 'payment_expired',
    payment_status: 'expired',
    payment_method: 'qrph',
    subtotal: '1500.00',
    shipping: '100.00',
    tax: '0.00',
    discount: '0.00',
    total: '1600.00',
    currency: 'PHP',
    reconciliation_status: 'not_required',
    created_at: '2026-11-01T12:15:00Z',
    items: [],
  },
  '105': {
    id: 105,
    order_no: 'MD-2026-00105',
    status: 'pending_payment',
    payment_status: 'awaiting_payment',
    payment_method: 'gcash',
    subtotal: '2100.00',
    shipping: '100.00',
    tax: '0.00',
    discount: '0.00',
    total: '2200.00',
    currency: 'PHP',
    reconciliation_status: 'deferred',
    created_at: '2026-11-01T12:20:00Z',
    items: [],
  },
  '106': {
    id: 106,
    order_no: 'MD-2026-00106',
    status: 'payment_review',
    payment_status: 'paid',
    payment_method: 'card',
    subtotal: '4500.00',
    shipping: '100.00',
    tax: '0.00',
    discount: '0.00',
    total: '4600.00',
    currency: 'PHP',
    reconciliation_status: 'reconciled',
    created_at: '2026-11-01T12:25:00Z',
    items: [],
  },
};

function renderPaymentReturnHtml(result, orderId) {
  const cancelled = result === 'cancelled';
  const heading = cancelled ? 'Checkout Not Completed' : (orderId ? 'Verifying Your Payment' : 'Payment Session Ended');
  const badgeLabel = cancelled ? 'CHECKOUT INCOMPLETE' : (orderId ? 'VERIFYING PAYMENT STATUS' : 'PAYMENT SESSION ENDED');
  const badgeClass = cancelled ? 'badge-cancelled' : (orderId ? 'badge-verifying' : 'badge-neutral');
  const lede = cancelled
    ? 'You returned from PayMongo without completing payment.'
    : (orderId ? 'Connecting with PayMongo to confirm your transaction…' : 'You have returned to MetroDrip from the payment provider.');
  const bodyText = cancelled
    ? 'Your payment session was cancelled and no charges were made to your account.'
    : (orderId ? 'Please hold on while we verify your transaction directly with PayMongo.' : 'No specific order reference was associated with this return session.');

  const orderBox = orderId ? `
    <div class="ref-card">
      <div class="ref-item">
        <span class="ref-label">Order Reference</span>
        <span class="ref-number mono">MD-${orderId}</span>
      </div>
      <p class="ref-privacy-note">Private order details, items, and receipts require customer account authentication.</p>
    </div>
  ` : '';

  const actions = orderId ? (
    cancelled ? `
      <div class="actions">
        <a href="/customer/orders/${orderId}?payment_return=cancelled" class="btn btn-primary" id="continue-action">Review Order &amp; Try Again</a>
        <a href="/customer/shop" class="btn btn-secondary">Continue Shopping</a>
      </div>
    ` : `
      <div class="actions">
        <a href="/customer/orders/${orderId}?payment_return=success" class="btn btn-primary" id="continue-action">Continue to Order Confirmation</a>
        <a href="/customer/orders" class="btn btn-secondary">View All Orders</a>
      </div>
    `
  ) : `
    <div class="actions">
      <a href="/customer/orders" class="btn btn-primary" id="continue-action">View My Orders</a>
      <a href="/customer/shop" class="btn btn-secondary">Return to Store</a>
    </div>
  `;

  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>MetroDrip · ${heading}</title>
  <style>
    :root {
      --ink: #141414; --paper: #f4f4f2; --card: #ffffff; --border: #e4e4df;
      --volt: #d3ee42; --volt-hover: #c4df35; --volt-ink: #141414; --muted: #63635c;
      --warn: #b45309; --warn-bg: #fffbeb; --ok: #2e7d32; --ok-bg: #f0fdf4;
    }
    :root[data-theme="dark"] {
      --ink: #f4f4f2; --paper: #0e0e0e; --card: #181816; --border: #2e2e2a;
      --volt: #d3ee42; --volt-hover: #e0f854; --volt-ink: #141414; --muted: #9c9c94;
      --warn: #fbbf24; --warn-bg: #2d2400; --ok: #4ade80; --ok-bg: #123318;
    }
    body { font-family: sans-serif; background: var(--paper); color: var(--ink); margin: 0; padding: 16px; }
    .site-nav { max-width: 600px; margin: 0 auto 20px; display: flex; justify-content: space-between; align-items: center; }
    .brand-link { font-weight: bold; font-size: 20px; text-decoration: none; color: var(--ink); }
    .theme-toggle { background: transparent; border: 1px solid var(--border); border-radius: 999px; padding: 6px 14px; color: var(--ink); cursor: pointer; }
    .return-card { max-width: 600px; margin: 0 auto; background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 32px; display: flex; flex-direction: column; gap: 16px; }
    .badge { display: inline-flex; align-items: center; gap: 8px; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: bold; width: fit-content; }
    .badge-verifying { background: var(--ok-bg); color: var(--ok); }
    .badge-cancelled { background: var(--warn-bg); color: var(--warn); }
    .badge-neutral { background: var(--paper); color: var(--muted); }
    .actions { display: flex; gap: 10px; margin-top: 10px; }
    .btn { padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: 600; text-align: center; flex: 1; }
    .btn-primary { background: var(--volt); color: var(--volt-ink); }
    .btn-secondary { border: 1px solid var(--border); color: var(--ink); }
    .security-notice { border-top: 1px solid var(--border); padding-top: 14px; font-size: 12px; color: var(--muted); }
  </style>
</head>
<body>
  <nav class="site-nav">
    <a href="/customer/" class="brand-link">METRO<span>DRIP</span></a>
    <button type="button" class="theme-toggle" id="theme-btn">
      <span id="theme-icon">☼</span> <span id="theme-label">Theme</span>
    </button>
  </nav>
  <main>
    <section class="return-card">
      <span class="badge ${badgeClass}">${badgeLabel}</span>
      <h1 class="card-title">${heading}</h1>
      <p class="card-lede">${lede}</p>
      <p class="card-desc">${bodyText}</p>
      ${orderBox}
      ${actions}
      <div class="security-notice">
        <p>Security Notice: This return redirect does not confirm payment. Official confirmation is verified directly with PayMongo via server reconciliation and webhooks.</p>
      </div>
    </section>
  </main>
  <script>
    (function() {
      var btn = document.getElementById('theme-btn');
      if (btn) {
        btn.addEventListener('click', function() {
          var cur = document.documentElement.getAttribute('data-theme') || 'dark';
          var next = cur === 'dark' ? 'light' : 'dark';
          document.documentElement.setAttribute('data-theme', next);
          document.getElementById('theme-label').textContent = next === 'dark' ? 'Dark' : 'Light';
        });
      }
    })();
  </script>
</body>
</html>`;
}

function startServer() {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');

    // Return Django endpoint for /payment/return
    if (url.pathname === '/payment/return') {
      const result = url.searchParams.get('result') || '';
      const orderId = url.searchParams.get('order_id') || '';
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
        'content-security-policy': "default-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com data:;",
      });
      response.end(renderPaymentReturnHtml(result, orderId));
      return;
    }

    // Auth mock for /login/
    if (url.pathname === '/login/') {
      response.writeHead(200, {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
      });
      response.end(JSON.stringify({
        role: 'customer',
        access_token: 'mock-customer-token',
        id: 1,
        name: 'Maria Santos',
        email: 'maria@example.com',
      }));
      return;
    }

    // API order detail mocks
    if (url.pathname.startsWith('/orders/') && !url.pathname.includes('/tracking/')) {
      const parts = url.pathname.split('/').filter(Boolean);
      const id = parts[1];
      const found = mockOrders[id];
      if (found) {
        response.writeHead(200, {
          'content-type': 'application/json',
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
        });
        response.end(JSON.stringify(found));
        return;
      }
    }

    if (url.pathname.includes('/tracking/')) {
      response.writeHead(200, {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
      });
      response.end(JSON.stringify({
        order: { id: 101, status: 'paid' },
        events: [
          { key: 'placed', title: 'Order placed', state: 'done' },
          { key: 'payment_confirmed', title: 'Payment confirmed', state: 'done' },
        ],
      }));
      return;
    }

    if (url.pathname === '/notifications/unread/') {
      response.writeHead(200, {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
      });
      response.end(JSON.stringify({ unread_count: 0 }));
      return;
    }

    // Static files or fallback to /customer/index.html
    let path = url.pathname.startsWith('/customer') && !extname(url.pathname)
      ? '/customer/index.html'
      : url.pathname;
    const file = normalize(join(rootPath, path));
    if (!file.startsWith(rootPath)) {
      response.writeHead(403);
      response.end();
      return;
    }
    try {
      const body = await readFile(file);
      response.writeHead(200, {
        'content-type': types[extname(file)] || 'application/octet-stream',
        'access-control-allow-origin': '*',
      });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const server = await startServer();
const { port } = server.address();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const failures = [];

try {
  // Test 1: Payment Return Page - Success State across all viewports
  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(`http://127.0.0.1:${port}/payment/return?result=success&order_id=101`, { waitUntil: 'domcontentloaded' });

    const heading = await page.locator('h1').innerText();
    assert.equal(heading, 'Verifying Your Payment');

    const badge = await page.locator('.badge-verifying').innerText();
    assert.match(badge, /VERIFYING PAYMENT STATUS/);

    const ref = await page.locator('.ref-number').innerText();
    assert.equal(ref, 'MD-101');

    const continueBtn = page.locator('#continue-action');
    await assert.doesNotReject(async () => await continueBtn.waitFor({ state: 'visible' }));

    // Check responsive horizontal overflow
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    if (overflow) failures.push(`Payment return page overflow at ${vp.width}px`);

    // Verify touch target size
    const box = await continueBtn.boundingBox();
    if (!box || box.width < 44 || box.height < 40) {
      failures.push(`Continue button below touch target size at ${vp.width}px`);
    }
  }

  // Test 2: Theme Toggle on Return Page
  await page.goto(`http://127.0.0.1:${port}/payment/return?result=success&order_id=101`, { waitUntil: 'domcontentloaded' });
  const themeBtn = page.locator('#theme-btn');
  await themeBtn.click();
  const themeAttr = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  assert.equal(themeAttr, 'light', 'Theme toggle should toggle data-theme to light');

  // Test 3: Cancelled Return Page
  await page.goto(`http://127.0.0.1:${port}/payment/return?result=cancelled&order_id=102`, { waitUntil: 'domcontentloaded' });
  const cancelledHeading = await page.locator('h1').innerText();
  assert.equal(cancelledHeading, 'Checkout Not Completed');
  const cancelledBadge = await page.locator('.badge-cancelled').innerText();
  assert.match(cancelledBadge, /CHECKOUT INCOMPLETE/);

  // Test 4: Neutral Return Page (No Order ID)
  await page.goto(`http://127.0.0.1:${port}/payment/return`, { waitUntil: 'domcontentloaded' });
  const neutralHeading = await page.locator('h1').innerText();
  assert.equal(neutralHeading, 'Payment Session Ended');

  // Authenticate customer session via standard login flow
  await page.goto(`http://127.0.0.1:${port}/customer/sign-in?next=${encodeURIComponent('/customer/orders/101')}`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="email"]', 'maria@example.com');
  await page.fill('input[name="password"]', 'Password123!');
  await page.click('.auth-form-card button[type="submit"]');

  // Wait for navigation to order 101
  await page.waitForSelector('.order-confirmation-hero');

  // Test 5: Customer Storefront Confirmation - State 1: Confirmed
  const heroState1 = await page.locator('.order-state-confirmed').isVisible();
  assert.ok(heroState1, 'State 1 should have .order-state-confirmed');
  const heroTitle1 = await page.locator('.order-hero-title').innerText();
  assert.match(heroTitle1, /Payment Verified & Confirmed/i);

  // Helper to navigate within authenticated SPA session
  async function navigateSpa(path) {
    await page.evaluate((target) => {
      history.pushState({}, '', target);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, path);
  }

  // Test 6: State 2: Pending with Polling
  await navigateSpa('/customer/orders/102');
  await page.waitForSelector('.order-state-pending');
  const pollingBox = await page.locator('.polling-status-box').isVisible();
  assert.ok(pollingBox, 'State 2 should display polling status box');
  const checkStatusBtn = await page.locator('button:has-text("Check Status Now")').isVisible();
  assert.ok(checkStatusBtn, 'State 2 should display "Check Status Now" button');

  // Test 7: State 3: Cancelled
  await navigateSpa('/customer/orders/103');
  await page.waitForSelector('.order-state-cancelled');
  const heroTitle3 = await page.locator('.order-hero-title').innerText();
  assert.match(heroTitle3, /Payment Incomplete or Cancelled/i);

  // Test 8: State 4: Expired
  await navigateSpa('/customer/orders/104');
  await page.waitForSelector('.order-state-expired');
  const heroTitle4 = await page.locator('.order-hero-title').innerText();
  assert.match(heroTitle4, /Payment Window Expired/i);

  // Test 9: State 5: Deferred / Provider Delayed
  await navigateSpa('/customer/orders/105');
  await page.waitForSelector('.order-state-deferred');
  const heroTitle5 = await page.locator('.order-hero-title').innerText();
  assert.match(heroTitle5, /Payment Provider Verification Delayed/i);

  // Test 10: State 6: Manual Review
  await navigateSpa('/customer/orders/106');
  await page.waitForSelector('.order-state-review');
  const heroTitle6 = await page.locator('.order-hero-title').innerText();
  assert.match(heroTitle6, /Payment Received — Manual Review in Progress/i);

  console.log('All payment return and confirmation QA checks passed!');
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  throw new Error(failures.join('\n'));
}
