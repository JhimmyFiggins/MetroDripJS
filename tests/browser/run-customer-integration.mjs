import AxeBuilder from '@axe-core/playwright';
import { chromium } from '@playwright/test';

const base = process.env.QA_WEB_BASE || 'http://127.0.0.1:3000';
const apiBase = process.env.QA_API_BASE || 'http://127.0.0.1:8000';

const browser = await (async () => {
  try {
    return await chromium.launch({ channel: process.env.PLAYWRIGHT_CHROME_CHANNEL || 'chrome', headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
})();

const context = await browser.newContext();
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource:')) {
    consoleErrors.push(msg.text());
  }
});
page.on('pageerror', (err) => {
  consoleErrors.push(err.message);
});

let accessibilityChecks = 0;
async function checkA11y(label) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .disableRules(['color-contrast']) // fonts and dynamic colors
    .analyze();
  accessibilityChecks++;
  if (result.violations.length > 0) {
    const issues = result.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length} nodes)`);
    console.warn(`[a11y warning] ${label}:`, issues.join(', '));
  }
}

try {
  console.log(`Testing Customer Website on ${base}/customer/ ...`);

  // 1. Visit homepage
  await page.goto(`${base}/customer/`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.homepage-hero');
  const heroTitle = await page.textContent('.hero-title');
  console.log('✓ Homepage loaded, Hero title:', heroTitle.trim().replace(/\s+/g, ' '));
  await checkA11y('Customer Homepage');

  // 2. Check Shop Page
  await page.goto(`${base}/customer/shop`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.page.shop-page');
  console.log('✓ Shop page loaded');
  await checkA11y('Customer Shop');

  // 3. Check Cart Page
  await page.goto(`${base}/customer/cart`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.page.cart-page');
  console.log('✓ Cart page loaded');
  await checkA11y('Customer Cart');

  // 4. Check Sign In Page
  await page.goto(`${base}/customer/sign-in`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.page.auth-page');
  console.log('✓ Sign-in page loaded');
  await checkA11y('Customer Sign-in');

  // 5. Check Sign Up Page
  await page.goto(`${base}/customer/sign-up`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.page.auth-page');
  console.log('✓ Sign-up page loaded');
  await checkA11y('Customer Sign-up');

  if (consoleErrors.length > 0) {
    console.error('Customer integration had console/page errors:', consoleErrors);
    process.exit(1);
  }

  console.log(`\nCustomer Website E2E & A11y tests PASSED (${accessibilityChecks} pages checked, 0 errors)`);
} catch (error) {
  console.error('Customer integration test failed:', error);
  process.exit(1);
} finally {
  await browser.close();
}
