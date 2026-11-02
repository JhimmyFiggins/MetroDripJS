import assert from 'node:assert/strict';
import AxeBuilder from '@axe-core/playwright';
import { chromium } from '@playwright/test';

// Run this only against a disposable loopback database with email OTP disabled.
const base = process.env.QA_WEB_BASE || 'http://127.0.0.1:3011';
const url = new URL(base);
assert.equal(url.protocol, 'http:');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
assert.equal(process.env.QA_DISPOSABLE_DB, '1', 'Explicit disposable database marker is required.');

// A unique customer avoids relying on fixtures or altering an existing account.
const email = `browser-${Date.now()}@example.test`;
const password = 'MetroDrip-E2E-2026!';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  const signup = await page.request.post(`${base}/signup/`, {
    data: { name: 'Disposable browser customer', email, password },
  });
  assert.equal(signup.status(), 201, await signup.text());

  // Exercise the actual sign-in form and the Django-backed account view.
  await page.goto(`${base}/customer/sign-in`);
  await page.locator('.auth-form-card input[name="email"]').fill(email);
  await page.locator('.auth-form-card input[name="password"]').fill(password);
  await page.locator('.auth-form-card button[type="submit"]').click();
  await page.locator('#account-link[href="/customer/account"]').waitFor();
  await page.locator('#account-link').click();
  await page.locator('#account-settings').waitFor();
  const accountAccessibility = await new AxeBuilder({ page }).analyze();
  assert.deepEqual(accountAccessibility.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) })), []);
  await page.locator('#personal-information input[name="name"]').fill('Updated disposable customer');
  const previousNameInput = await page.locator('#personal-information input[name="name"]').elementHandle();
  await page.locator('#personal-information button[type="submit"]').click();
  await page.waitForFunction((previous) => document.querySelector('#personal-information input[name="name"]') !== previous, previousNameInput);
  assert.equal(await page.locator('#personal-information input[name="name"]').inputValue(), 'Updated disposable customer');

  // The owned-review endpoint must be proxied even when the customer has none.
  const token = await page.evaluate(async () => (await import('/customer/api.js')).getAuthToken());
  assert.ok(token, 'Browser sign-in must persist a customer token.');
  const reviews = await page.request.get(`${base}/reviews/mine/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(reviews.status(), 200, await reviews.text());
  assert.deepEqual(await reviews.json(), []);

  // Cancellation must preserve the customer; confirmation must close it server-side.
  await page.locator('#account-settings input[name="password"]').fill(password);
  await page.locator('#account-settings input[name="confirmation"]').fill('CLOSE MY ACCOUNT');
  await page.locator('#account-settings button[type="submit"]').click();
  await page.locator('dialog button', { hasText: 'Cancel' }).click();
  const profileBefore = await page.request.get(`${base}/profile/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(profileBefore.status(), 200);
  await page.locator('#account-settings button[type="submit"]').click();
  await page.locator('dialog button', { hasText: 'Confirm' }).click();
  await page.waitForURL(`${base}/customer/`);
  const profileAfter = await page.request.get(`${base}/profile/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(profileAfter.status(), 401);
  const loginAfter = await page.request.post(`${base}/login/`, { data: { email, password } });
  assert.ok(loginAfter.status() >= 400);
  console.log('PASS: real browser sign-in, profile update, owned reviews, closure cancellation, closure, and token revocation on disposable SQLite.');
} finally {
  await browser.close();
}
