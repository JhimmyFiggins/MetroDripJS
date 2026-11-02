import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from '@playwright/test';

// The seed script and these local servers must use the same disposable SQLite file.
const base = process.env.QA_WEB_BASE || 'http://127.0.0.1:3011';
const url = new URL(base);
assert.equal(url.protocol, 'http:');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
assert.equal(process.env.QA_DISPOSABLE_DB, '1');

const email = `checkout-${Date.now()}@example.test`;
const password = 'MetroDrip-E2E-2026!';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  const signup = await page.request.post(`${base}/signup/`, {
    data: { name: 'Disposable checkout customer', email, password },
  });
  assert.equal(signup.status(), 201, await signup.text());
  await page.goto(`${base}/customer/sign-in`);
  await page.locator('.auth-form-card input[name="email"]').fill(email);
  await page.locator('.auth-form-card input[name="password"]').fill(password);
  await page.locator('.auth-form-card button[type="submit"]').click();
  await page.locator('#account-link[href="/customer/account"]').waitFor();
  const token = await page.evaluate(async () => (await import('/customer/api.js')).getAuthToken());
  assert.ok(token);

  // Browse the real catalog, choose a stocked variant, and inspect the cart estimate.
  await page.locator('#desktop-shop summary').click();
  await page.locator('#desktop-shop a[href="/customer/shop"]').click();
  await page.locator('.product-card', { hasText: 'Disposable Browser Hoodie' }).click();
  await page.locator('.pdp-add-btn:enabled').waitFor();
  await page.locator('.pdp-add-btn').click();
  await page.locator('#bag-link').click();
  await page.locator('.cart-page').waitFor();
  assert.equal(await page.getByText('Calculated at checkout').count(), 1);
  assert.equal(await page.getByText('Guest checkout available').count(), 0);
  const cartAccessibility = await new AxeBuilder({ page }).analyze();
  assert.deepEqual(cartAccessibility.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) })), []);
  await page.locator('.cart-page a[href="/customer/checkout"]').click();
  await page.locator('.checkout-form-card').waitFor();
  const checkoutAccessibility = await new AxeBuilder({ page }).analyze();
  assert.deepEqual(checkoutAccessibility.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) })), []);

  // The browser sends COD details, while Django computes the final shipping and total.
  const form = page.locator('.checkout-form-card');
  await form.locator('input[name="phone"]').fill('09171234567');
  await form.locator('input[name="address_line1"]').fill('21 Disposable Street');
  await form.locator('input[name="city"]').fill('Quezon City');
  await form.locator('input[name="state"]').fill('Metro Manila');
  await form.locator('input[name="postal_code"]').fill('1101');
  await form.locator('select[name="delivery_zone"]').selectOption('NCR (Metro Manila)');
  await form.locator('input[name="payment_method"][value="cod"]').check();
  await form.locator('button[type="submit"]').click();
  await page.waitForURL(/\/customer\/orders\/\d+$/);
  const orderId = Number(new URL(page.url()).pathname.split('/').at(-1));
  const orderResponse = await page.request.get(`${base}/orders/${orderId}/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(orderResponse.status(), 200, await orderResponse.text());
  const order = await orderResponse.json();
  assert.equal(order.payment_method, 'cod');
  assert.equal(Number(order.shipping), 85);
  assert.equal(Number(order.total), 185);
  console.log('PASS: real browser product, variant, stock, cart estimate, COD checkout, and authoritative order total on disposable SQLite.');
} finally {
  await browser.close();
}
