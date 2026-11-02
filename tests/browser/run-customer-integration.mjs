import AxeBuilder from '@axe-core/playwright';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function assertAccessible(page, label) {
  // Contrast remains enabled. Automated scans are not screen-reader coverage.
  const result = await new AxeBuilder({ page }).analyze();
  const issues = result.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map(({ target, failureSummary }) => ({ target, failureSummary })),
  }));
  assert.equal(issues.length, 0, `${label}: axe violations\n${JSON.stringify(issues, null, 2)}`);
  return { label, violations: 0, incomplete: result.incomplete.length };
}

export async function runCustomerSmoke(page, base) {
  const checks = [];
  for (const [path, selector, label] of [
    ['/', '.homepage-hero', 'Homepage'],
    ['/shop', '.page.shop-page', 'Shop'],
    ['/cart', '.page.cart-page', 'Cart'],
    ['/sign-in', '.page.auth-page', 'Sign-in'],
    ['/sign-up', '.page.auth-page', 'Sign-up'],
  ]) {
    await page.goto(`${base}/customer${path}`, { waitUntil: 'networkidle' });
    await page.locator(selector).waitFor();
    await page.evaluate(() => document.fonts.ready);
    checks.push(await assertAccessible(page, `Public-page smoke: ${label}`));
  }
  return checks;
}

export async function runNavigationChecks(page, base) {
  const categoryResponse = await page.request.get(`${base}/categories/`);
  assert.equal(categoryResponse.status(), 200, 'Category API must respond.');
  const categories = await categoryResponse.json();
  assert.ok(Array.isArray(categories), 'Category API must return a list.');
  const active = categories.filter((category) => category.is_active !== false);
  const checks = [];
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/customer/`, { waitUntil: 'networkidle' });
    await page.locator('.homepage-hero').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}px page overflows`);
    if (width < 861) {
      const menu = page.locator('#menu-button');
      await menu.click();
      assert.equal(await menu.getAttribute('aria-expanded'), 'true');
      await page.locator('.mobile-nav-group summary').first().click();
      assert.equal(await page.locator('#mobile-categories a').count(), active.length);
      await page.keyboard.press('Escape');
      assert.equal(await menu.getAttribute('aria-expanded'), 'false');
      assert.equal(await menu.evaluate((node) => document.activeElement === node), true);
      await menu.click();
      await page.locator('#mobile-catalog-search').fill('hoodie');
      await page.locator('#mobile-search button').click();
      await page.waitForURL(/\/customer\/shop\?search=hoodie/);
    } else {
      await page.locator('#desktop-shop summary').click();
      assert.equal(await page.locator('#desktop-categories a').count(), active.length + 1);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#desktop-shop').evaluate((node) => node.open), false);
      await page.locator('#desktop-discover summary').click();
      await page.locator('#desktop-discover a[href="/customer/shop?featured=1"]').click();
      await page.waitForURL(/\/customer\/shop\?featured=1/);
      const featuredResponse = await page.request.get(`${base}/products/?featured=1`);
      assert.equal(featuredResponse.status(), 200);
      assert.equal((await featuredResponse.json()).every((product) => product.is_featured), true);
    }
    checks.push(`${width}px navigation`);
  }
  return checks;
}

export async function runMockAccountChecks(page, base) {
  let profileName = 'Disposable browser customer';
  let closureCalls = 0;
  await page.route('**/login/', (route) => route.fulfill({ json: {
    id: 7001, name: profileName, email: 'disposable@example.test', role: 'customer',
    token: 'browser-only-disposable-token-0000000000000001',
  } }));
  await page.route('**/profile/', async (route) => {
    if (route.request().method() === 'PUT') {
      profileName = route.request().postDataJSON().name;
    }
    await route.fulfill({ json: {
      id: 7001, name: profileName, email: 'disposable@example.test', phone: '', addresses: {}, role: 'customer',
    } });
  });
  await page.route('**/notifications/', (route) => route.fulfill({ json: { results: [], unread_count: 0 } }));
  await page.route('**/account/close/', async (route) => {
    closureCalls += 1;
    assert.equal(route.request().postDataJSON().confirmation, 'CLOSE MY ACCOUNT');
    await route.fulfill({ json: { message: 'Account closed.', erasure_complete: false } });
  });
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(`${base}/customer/sign-in`, { waitUntil: 'networkidle' });
  await page.locator('.auth-form-card input[name="email"]').fill('disposable@example.test');
  await page.locator('.auth-form-card input[name="password"]').fill('disposable-password');
  await page.locator('.auth-form-card button[type="submit"]').click();
  await page.locator('#menu-button').click();
  await page.locator('#site-nav a[href="/customer/account"]').click();
  await page.locator('#account-settings').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator('#personal-information input[name="name"]').fill('Updated browser customer');
  const previousNameInput = await page.locator('#personal-information input[name="name"]').elementHandle();
  await page.locator('#personal-information button[type="submit"]').click();
  await page.waitForFunction((previous) => document.querySelector('#personal-information input[name="name"]') !== previous, previousNameInput);
  assert.equal(await page.locator('#personal-information input[name="name"]').inputValue(), 'Updated browser customer');
  await page.locator('#account-settings input[name="password"]').fill('disposable-password');
  await page.locator('#account-settings input[name="confirmation"]').fill('CLOSE MY ACCOUNT');
  await page.locator('#account-settings button[type="submit"]').click();
  await page.locator('dialog button', { hasText: 'Cancel' }).click();
  assert.equal(closureCalls, 0, 'Cancellation must not call the closure API.');
  await page.locator('#account-settings button[type="submit"]').click();
  await page.locator('dialog button', { hasText: 'Confirm' }).click();
  await page.waitForURL(`${base}/customer/`);
  assert.equal(closureCalls, 1);
  assert.equal(await page.locator('#account-link').getAttribute('href'), '/customer/sign-in');
  return ['mock profile update', 'mock closure cancellation', 'mock closure completion'];
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const base = process.env.QA_WEB_BASE || 'http://127.0.0.1:3000';
  let browser;
  try {
    const url = new URL(base);
    assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Smoke requires an explicitly owned loopback server.');
    assert.equal(url.protocol, 'http:');
    browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHROME_CHANNEL || 'chrome', headless: true });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    console.log(`Customer public-page smoke at ${base}/customer/ (not full E2E).`);
    const checks = await runCustomerSmoke(page, base);
    const navigationChecks = await runNavigationChecks(page, base);
    const accountChecks = await runMockAccountChecks(page, base);
    assert.deepEqual(errors, [], 'Public-page smoke console/page errors');
    console.log(`PASS: ${checks.length} public-page smoke scans, ${navigationChecks.length} responsive navigation checks, ${accountChecks.length} mocked account checks. Real authentication, checkout and provider behavior are NOT tested by this script.`);
  } catch (error) {
    console.error('Customer public-page smoke FAILED:', error);
    process.exitCode = 1;
  } finally {
    await browser?.close();
  }
}
