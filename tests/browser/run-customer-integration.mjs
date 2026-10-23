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
    assert.deepEqual(errors, [], 'Public-page smoke console/page errors');
    console.log(`PASS: ${checks.length} public-page smoke scans, including contrast. Authentication, mutations, checkout and provider behavior are NOT tested by this script.`);
  } catch (error) {
    console.error('Customer public-page smoke FAILED:', error);
    process.exitCode = 1;
  } finally {
    await browser?.close();
  }
}
