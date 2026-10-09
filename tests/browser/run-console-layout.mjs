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
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
};

const apiState = {
  adminGet: 'success',
  adminPatch: 'failure',
  adminDelay: 0,
  merchantGet: 'success',
  merchantDetail: 'success',
  merchantPatch: 'failure',
  merchantDelay: 0,
};

const adminUsers = [
  { id: 3, name: 'Store Merchant', email: 'merch@metrodrip.ph', role: 'merchant', status: 'Active', date_joined: '2026-01-12T00:00:00Z' },
  { id: 4, name: 'Admin User', email: 'admin@metrodrip.ph', role: 'admin', status: 'Active', date_joined: '2026-01-01T00:00:00Z' },
];

const merchantOrders = [
  { id: 318, order_no: 'MD-2026-00318', customer: 'Juan Dela Cruz', total: '₱2,632', pay: 'GCASH', payment_status: 'paid', status: 'Unfulfilled', raw_status: 'unfulfilled', created_at: '2026-09-19 15:42' },
];

async function installFocusedApiRoutes() {
  await context.unroute('**/*');
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === base) return route.continue();
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
      return route.fulfill({
        status: apiState.merchantDetail === 'success' ? 200 : 503,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify(apiState.merchantDetail === 'success' ? {
          id: 318,
          order_no: 'MD-2026-00318',
          status: 'Unfulfilled',
          raw_status: 'unfulfilled',
          subtotal: 2547,
          shipping: 85,
          total: 2632,
          payment_method: 'GCASH',
          shipping_address: { name: 'Juan Dela Cruz', line1: 'QA address', city: 'Taguig', state: 'Metro Manila', postal_code: '1634' },
          lines: [{ product_name: 'QA Hoodie', variant_desc: 'Black · M', quantity: 1, unit_price: 2547 }],
        } : { error: 'QA simulated detail outage' }),
      });
    }
    if (/^\/api\/merchant\/orders\/\d+\/$/.test(url.pathname) && request.method() === 'PATCH') {
      return route.fulfill({
        status: apiState.merchantPatch === 'success' ? 200 : 500,
        contentType: 'application/json',
        headers: corsHeaders,
        body: JSON.stringify(apiState.merchantPatch === 'success'
          ? { id: 318, status: 'Packed', raw_status: 'packed' }
          : { error: 'QA simulated write failure' }),
      });
    }
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
  if (!(await page.locator('tr[data-order-id="MD-2026-00318"]').getByText('Unfulfilled', { exact: true }).isVisible())) {
    throw new Error('Failed merchant write changed the rendered fulfillment state');
  }
  apiState.merchantPatch = 'success';
  await page.locator('#btn-mark-packed').click();
  await page.locator('tr[data-order-id="MD-2026-00318"]').getByText('Packed', { exact: true }).waitFor();
  if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))) {
    throw new Error('Merchant order workspace overflows at 320px');
  }

  apiState.merchantGet = 'failure';
  await page.goto(`${base}/merchant/orders.html`);
  await page.getByText('Orders are unavailable', { exact: true }).waitFor();
  apiState.merchantGet = 'success';
  await page.locator('#btn-retry-orders').click();
  await page.locator('tr[data-order-id="MD-2026-00318"]').waitFor();
  console.log('Browser console states: loading, default, empty, partial, failed-write, retry, fixture and narrow layouts passed');
} catch (err) {
  console.error('Browser test failed:', err.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
