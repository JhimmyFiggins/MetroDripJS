// Runs mocked console layout checks and the Add User dialog keyboard regression.
// Requires the dev server to be running: npm run dev
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..', '..');

const layoutSource = readFileSync(join(repoRoot, 'tests/browser/console-layout.js'), 'utf8');
// The file is an async (page) => { ... } expression; wrap and evaluate it.
const layoutTest = new Function('page', `"use strict"; return (${layoutSource})`)();

const browser = await (async () => {
  try {
    return await chromium.launch({ channel: process.env.PLAYWRIGHT_CHROME_CHANNEL || 'chrome', headless: true });
  } catch {
    return await chromium.launch({ headless: true });
  }
})();
const context = await browser.newContext();
const page = await context.newPage();

const base = 'http://127.0.0.1:3000';
const corsHeaders = {
  'Access-Control-Allow-Origin': base,
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

const apiState = {
  adminGet: 'success',
  adminPatch: 'failure',
  adminDelay: 0,
  merchantGet: 'success',
  merchantDetail: 'success',
  merchantPatch: 'failure',
  merchantCancelPatch: 'failure',
  merchantDelay: 0,
  merchantDetailGets: new Map(),
  lastMerchantPatch: null,
};

const adminUsers = [
  { id: 3, name: 'Store Merchant', email: 'merch@metrodrip.ph', role: 'merchant', status: 'Active', date_joined: '2026-01-12T00:00:00Z' },
  { id: 4, name: 'Admin User', email: 'admin@metrodrip.ph', role: 'admin', status: 'Active', date_joined: '2026-01-01T00:00:00Z' },
];

const merchantOrders = [
  { id: 318, order_no: 'MD-2026-00318', customer: 'Juan Dela Cruz', total: '₱2,632', pay: 'GCASH', payment_status: 'paid', status: 'Placed', raw_status: 'placed', can_cancel: false, cancel_unavailable_code: 'refund_required', cancel_unavailable_reason: 'Paid orders require the refund workflow before cancellation.', created_at: '2026-09-19 15:42' },
  { id: 319, order_no: 'MD-2026-00319', customer: 'Maria Santos', total: '₱1,249', pay: 'GCASH', payment_status: 'awaiting_payment', status: 'Pending payment', raw_status: 'pending_payment', can_cancel: true, cancel_unavailable_code: null, cancel_unavailable_reason: null, created_at: '2026-09-20 10:15' },
];

const merchantDetails = {
  318: {
    subtotal: 2547,
    shipping: 85,
    total: 2632,
    payment_method: 'GCASH',
    shipping_address: { name: 'Juan Dela Cruz', line1: 'QA address', city: 'Taguig', state: 'Metro Manila', postal_code: '1634' },
    lines: [{ product_name: 'QA Hoodie', variant_desc: 'Black · M', quantity: 1, unit_price: 2547 }],
    payment_transitions: [{ id: 1, from_status: 'awaiting_payment', to_status: 'paid', actor_type: 'system_webhook', reason: 'Verified payment', created_at: '2026-09-19T15:43:00Z' }],
  },
  319: {
    subtotal: 1164,
    shipping: 85,
    total: 1249,
    payment_method: 'GCASH',
    shipping_address: { name: 'Maria Santos', line1: 'QA address 2', city: 'Makati', state: 'Metro Manila', postal_code: '1200' },
    lines: [{ product_name: 'QA Tee', variant_desc: 'Blue · L', quantity: 1, unit_price: 1164 }],
    payment_transitions: [{ id: 2, from_status: 'none', to_status: 'awaiting_payment', actor_type: 'customer', reason: 'Order checkout initiated', created_at: '2026-09-20T10:15:00Z' }],
  },
};

async function installFocusedApiRoutes() {
  await context.unroute('**/*');
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: corsHeaders, body: '' });
    }

    if (url.pathname === '/api/admin/users/' && request.method() === 'GET') {
      if (apiState.adminDelay) await new Promise(resolve => setTimeout(resolve, apiState.adminDelay));
      return route.fulfill({
        status: apiState.adminGet === 'success' ? 200 : (apiState.adminGet === 'denied' ? 403 : 503),
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify(apiState.adminGet === 'success'
          ? adminUsers
          : { error: apiState.adminGet === 'denied' ? 'QA simulated permission denial' : 'QA simulated admin outage' }),
      });
    }
    if (/^\/api\/admin\/users\/\d+\/$/.test(url.pathname) && request.method() === 'PATCH') {
      const body = request.postDataJSON();
      return route.fulfill({
        status: apiState.adminPatch === 'success' ? 200 : 500,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify(apiState.adminPatch === 'success'
          ? { ...adminUsers[0], role: body.role || adminUsers[0].role, status: body.is_active === false ? 'Suspended' : 'Active' }
          : { error: 'QA simulated write failure' }),
      });
    }
    if (/^\/api\/admin\/users\/\d+\/reset-password\/$/.test(url.pathname)) {
      return route.fulfill({ status: 200, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify({ message: 'accepted' }) });
    }
    if (url.pathname === '/api/admin/users/' && request.method() === 'POST') {
      const body = request.postDataJSON();
      return route.fulfill({ status: 201, contentType: 'application/json', headers: corsHeaders, body: JSON.stringify({ id: 9, ...body, status: 'Active' }) });
    }

    if (url.pathname === '/api/merchant/orders/' && request.method() === 'GET') {
      if (apiState.merchantDelay) await new Promise(resolve => setTimeout(resolve, apiState.merchantDelay));
      return route.fulfill({
        status: apiState.merchantGet === 'success' ? 200 : 503,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify(apiState.merchantGet === 'success' ? merchantOrders : { error: 'QA simulated merchant outage' }),
      });
    }
    if (/^\/api\/merchant\/orders\/\d+\/$/.test(url.pathname) && request.method() === 'GET') {
      const orderId = Number(url.pathname.match(/orders\/(\d+)\//)?.[1]);
      const summary = merchantOrders.find(order => order.id === orderId);
      apiState.merchantDetailGets.set(orderId, (apiState.merchantDetailGets.get(orderId) || 0) + 1);
      return route.fulfill({
        status: apiState.merchantDetail === 'success' && summary ? 200 : 503,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify(apiState.merchantDetail === 'success' && summary
          ? { ...summary, ...merchantDetails[orderId] }
          : { error: 'QA simulated detail outage' }),
      });
    }
    if (/^\/api\/merchant\/orders\/\d+\/$/.test(url.pathname) && request.method() === 'PATCH') {
      const orderId = Number(url.pathname.match(/orders\/(\d+)\//)?.[1]);
      const body = request.postDataJSON();
      apiState.lastMerchantPatch = {
        orderId,
        body,
        authorization: request.headers().authorization,
      };
      if (body.status === 'cancelled') {
        if (apiState.merchantCancelPatch !== 'success') {
          return route.fulfill({
            status: 503,
            contentType: 'application/json',
            headers: corsHeaders,
            body: JSON.stringify({ error: 'QA simulated provider rejection', code: 'provider_unavailable' }),
          });
        }
        const order = merchantOrders.find(item => item.id === orderId);
        Object.assign(order, {
          payment_status: 'cancelled',
          status: 'Cancelled',
          raw_status: 'cancelled',
          can_cancel: false,
          cancel_unavailable_code: 'already_cancelled',
          cancel_unavailable_reason: 'This order is already cancelled.',
        });
        merchantDetails[orderId].payment_transitions.unshift({
          id: 3,
          from_status: 'awaiting_payment',
          to_status: 'cancelled',
          actor_type: 'merchant',
          reason: 'Order cancelled by store staff',
          created_at: '2026-09-20T10:20:00Z',
        });
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: corsHeaders,
          body: JSON.stringify({ ...order, message: `Order ${order.order_no} is now cancelled.` }),
        });
      }
      const order = merchantOrders.find(item => item.id === orderId);
      if (apiState.merchantPatch === 'success') {
        Object.assign(order, {
          status: 'Packed',
          raw_status: 'packed',
          can_cancel: false,
          cancel_unavailable_code: 'order_already_fulfilled',
          cancel_unavailable_reason: 'Packed or dispatched orders cannot be cancelled here.',
        });
      }
      return route.fulfill({
        status: apiState.merchantPatch === 'success' ? 200 : 500,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify(apiState.merchantPatch === 'success'
          ? order
          : { error: 'QA simulated write failure' }),
      });
    }
    const isBackendPath = (
      url.pathname.startsWith('/api/')
      || url.pathname.startsWith('/users/')
      || ['/login/', '/logout/'].includes(url.pathname)
    );
    if (url.origin === base && isBackendPath) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: `Unexpected mocked API request: ${request.method()} ${url.pathname}` }),
      });
    }
    if (url.origin === base) return route.continue();
    return route.abort();
  });
}

async function installSession() {
  await page.goto(base);
  await page.evaluate(() => {
    sessionStorage.setItem('metrodrip_active_user', JSON.stringify({
      id: 999999,
      name: 'QA Fixture',
      email: 'qa@example.invalid',
      role: 'admin',
      is_staff: true,
      access_token: 'qa-browser-fixture',
    }));
  });
}

try {
  const result = await layoutTest(page);
  console.log(`Browser layout: ${result.passed} passed (${result.mode})`);
  await installFocusedApiRoutes();
  await installSession();

  apiState.adminDelay = 250;
  await page.goto(`${base}/admin/users.html`);
  await page.locator('#users-directory-tbody[aria-busy="true"] .skeleton-line').first().waitFor();
  await page.locator('tr[data-user-id="3"]').waitFor();
  apiState.adminDelay = 0;
  if ((await page.locator('#users-source-status').textContent()).trim() !== 'API CONNECTED') {
    throw new Error('Admin directory did not reach the API-connected default state');
  }

  await page.locator('#btn-open-add-user').click();
  if (await page.locator('#modal-add-user').getAttribute('hidden') !== null) {
    throw new Error('Add User dialog did not open');
  }
  await page.keyboard.press('Escape');
  if (await page.locator('#modal-add-user').getAttribute('hidden') === null) {
    throw new Error('Escape did not close Add User dialog');
  }
  if (!(await page.locator('#btn-open-add-user').evaluate(element => element === document.activeElement))) {
    throw new Error('Closing Add User dialog did not restore focus');
  }
  await page.locator('#btn-open-add-user').click();
  await page.locator('#btn-submit-add-user').focus();
  await page.keyboard.press('Tab');
  if (!(await page.locator('#btn-close-modal').evaluate(element => element === document.activeElement))) {
    throw new Error('Tab escaped the Add User dialog');
  }
  await page.keyboard.press('Shift+Tab');
  if (!(await page.locator('#btn-submit-add-user').evaluate(element => element === document.activeElement))) {
    throw new Error('Shift+Tab escaped the Add User dialog');
  }
  await page.keyboard.press('Escape');
  console.log('Browser Add User dialog: Escape, focus return and Tab containment passed');

  await page.locator('#search-users-input').fill('no-account-will-match');
  await page.getByText('No matching accounts', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.locator('tr[data-user-id="3"]').waitFor();

  apiState.adminGet = 'failure';
  await page.locator('#btn-refresh-users').click();
  await page.getByText('Could not refresh every account', { exact: true }).waitFor();
  await page.locator('tr[data-user-id="3"]').waitFor();
  apiState.adminGet = 'success';
  await page.locator('#btn-retry-users').click();
  await page.locator('#users-source-status').filter({ hasText: 'API CONNECTED' }).waitFor();

  await page.locator('#detail-user-role').selectOption('administrator');
  await page.locator('#btn-save-user-role').click();
  await page.getByText('Account change was not saved', { exact: true }).waitFor();
  if ((await page.locator('tr[data-user-id="3"] td').nth(1).textContent()).trim() !== 'Merchant') {
    throw new Error('Failed admin write changed the rendered role');
  }
  apiState.adminPatch = 'success';
  await page.locator('#detail-user-role').selectOption('administrator');
  await page.locator('#btn-save-user-role').click();
  await page.locator('tr[data-user-id="3"] td').nth(1).filter({ hasText: 'Administrator' }).waitFor();

  await page.setViewportSize({ width: 320, height: 844 });
  if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))) {
    throw new Error('Admin user directory overflows at 320px');
  }

  await page.goto(`${base}/admin/users.html?fixture=users`);
  await page.getByText('Read-only development fixture', { exact: true }).waitFor();
  if (!(await page.locator('#btn-open-add-user').isDisabled())) {
    throw new Error('Development fixture mode allowed an admin write');
  }

  apiState.adminGet = 'failure';
  await page.goto(`${base}/admin/users.html`);
  await page.getByText('User accounts are unavailable', { exact: true }).waitFor();
  apiState.adminGet = 'success';
  await page.locator('#btn-retry-users').click();
  await page.locator('tr[data-user-id="3"]').waitFor();

  apiState.adminGet = 'denied';
  await page.goto(`${base}/admin/users.html`);
  await page.getByText('Administrator access required', { exact: true }).waitFor();
  if (!(await page.locator('#users-state-signin').isVisible())) {
    throw new Error('Permission-denied state did not expose the sign-in recovery action');
  }
  apiState.adminGet = 'success';

  apiState.merchantDelay = 250;
  await page.goto(`${base}/merchant/orders.html`);
  await page.locator('#all-orders-tbody[aria-busy="true"] .skeleton-line').first().waitFor();
  await page.locator('tr[data-order-id="MD-2026-00318"]').waitFor();
  await page.getByText('QA Hoodie · Black · M', { exact: true }).waitFor();
  if (!(await page.locator('#btn-cancel-order').isDisabled())) {
    throw new Error('Paid merchant order exposed cancellation without the refund workflow');
  }
  await page.getByText('Paid orders require the refund workflow before cancellation.', { exact: true }).waitFor();
  apiState.merchantDelay = 0;

  await page.locator('#search-orders-input').fill('no-order-will-match');
  await page.getByText('No matching orders', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.locator('tr[data-order-id="MD-2026-00318"]').waitFor();

  apiState.merchantGet = 'failure';
  await page.locator('#btn-refresh-orders').click();
  await page.getByText('Could not refresh every order', { exact: true }).waitFor();
  await page.locator('tr[data-order-id="MD-2026-00318"]').waitFor();
  apiState.merchantGet = 'success';
  await page.locator('#btn-retry-orders').click();
  await page.locator('#orders-source-status').filter({ hasText: 'API CONNECTED' }).waitFor();

  await page.locator('#btn-mark-packed').click();
  await page.getByText('Order was not updated', { exact: true }).waitFor();
  if (!(await page.locator('tr[data-order-id="MD-2026-00318"]').getByText('Placed', { exact: true }).isVisible())) {
    throw new Error('Failed merchant write changed the rendered fulfillment state');
  }
  apiState.merchantPatch = 'success';
  await page.locator('#btn-mark-packed').click();
  await page.locator('tr[data-order-id="MD-2026-00318"]').getByText('Packed', { exact: true }).waitFor();

  await page.locator('tr[data-order-id="MD-2026-00319"]').click();
  await page.getByText('QA Tee · Blue · L', { exact: true }).waitFor();
  if (await page.locator('#btn-cancel-order').isDisabled()) {
    throw new Error('Eligible pending order did not expose cancellation');
  }
  const detailGetsBeforeCancel = apiState.merchantDetailGets.get(319);
  await page.locator('#btn-cancel-order').click();
  await page.locator('#btn-modal-confirm').click();
  await page.getByText('Order was not cancelled', { exact: true }).waitFor();
  await page.locator('#toast-container .toast').filter({ hasText: 'Order was not cancelled: QA simulated provider rejection' }).waitFor();
  if (await page.locator('#step-up-modal').getAttribute('hidden') !== null) {
    throw new Error('Failed cancellation unexpectedly closed the confirmation modal');
  }
  await page.waitForFunction(() => !document.querySelector('#btn-modal-confirm')?.disabled);
  if (apiState.merchantDetailGets.get(319) !== detailGetsBeforeCancel) {
    throw new Error('Failed cancellation refetched and replaced the verified detail state');
  }
  if (!(await page.locator('tr[data-order-id="MD-2026-00319"]').getByText('Pending payment', { exact: true }).isVisible())) {
    throw new Error('Failed cancellation changed the rendered fulfillment state');
  }

  apiState.merchantCancelPatch = 'success';
  await page.locator('#btn-modal-confirm').click();
  await page.locator('tr[data-order-id="MD-2026-00319"]').getByText('Cancelled', { exact: true }).waitFor();
  await page.locator('tr[data-order-id="MD-2026-00319"]').getByText('GCASH · cancelled', { exact: true }).waitFor();
  await page.getByText('awaiting_payment → cancelled', { exact: true }).waitFor();
  if (apiState.merchantDetailGets.get(319) <= detailGetsBeforeCancel) {
    throw new Error('Successful cancellation did not invalidate and refetch cached order details');
  }
  if (JSON.stringify(apiState.lastMerchantPatch?.body) !== JSON.stringify({ status: 'cancelled' })) {
    throw new Error('Merchant cancellation sent an unexpected request body');
  }
  if (apiState.lastMerchantPatch?.authorization !== 'Bearer qa-browser-fixture') {
    throw new Error('Merchant cancellation omitted bearer authorization');
  }
  if (!(await page.locator('#btn-cancel-order').isDisabled())) {
    throw new Error('Cancelled order left its cancellation control enabled');
  }
  if (await page.locator('#step-up-modal').getAttribute('hidden') === null) {
    throw new Error('Successful cancellation did not close the confirmation modal');
  }
  if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))) {
    throw new Error('Merchant order workspace overflows at 320px');
  }

  apiState.merchantGet = 'failure';
  await page.goto(`${base}/merchant/orders.html`);
  await page.getByText('Orders are unavailable', { exact: true }).waitFor();
  apiState.merchantGet = 'success';
  await page.locator('#btn-retry-orders').click();
  await page.locator('tr[data-order-id="MD-2026-00318"]').waitFor();
  console.log('Browser console states: loading, default, empty, partial, failed-write, cancellation/refetch, retry, fixture and narrow layouts passed');
} catch (err) {
  console.error('Browser test failed:', err.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
