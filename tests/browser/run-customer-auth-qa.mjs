import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';

const base = process.env.QA_WEB_BASE || 'http://127.0.0.1:3000';

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

console.log('--- Testing Customer Storefront Sign In UI/UX & Accessibility ---');

// 1. Desktop Layout (1440px)
console.log('\n[1] Verifying Large Desktop (1440px) Layout & Proportions...');
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${base}/customer/sign-in`);
await page.waitForSelector('.auth-workspace');

const brandBox1440 = await page.locator('.auth-brand-panel').boundingBox();
const formBox1440 = await page.locator('.auth-form-card').boundingBox();

console.log(`  Brand Panel: x=${brandBox1440.x.toFixed(1)}, y=${brandBox1440.y.toFixed(1)}, w=${brandBox1440.width.toFixed(1)}, h=${brandBox1440.height.toFixed(1)}`);
console.log(`  Form Card:   x=${formBox1440.x.toFixed(1)}, y=${formBox1440.y.toFixed(1)}, w=${formBox1440.width.toFixed(1)}, h=${formBox1440.height.toFixed(1)}`);

// Brand panel on left, Form on right
assert.ok(brandBox1440.x < formBox1440.x, 'Brand panel must be positioned to the left of the Form card');

// Upper edges aligned
assert.ok(Math.abs(brandBox1440.y - formBox1440.y) <= 2, `Upper edges must align: brand.y=${brandBox1440.y}, form.y=${formBox1440.y}`);

// Not forced to equal heights (natural height!)
assert.ok(brandBox1440.height < formBox1440.height - 80, `Brand panel (h=${brandBox1440.height}) should not be forced to equal Form height (h=${formBox1440.height})`);

// Proportional width: Form card is wider than or equal to brand panel
assert.ok(formBox1440.width >= brandBox1440.width, `Form card width (${formBox1440.width}) should be >= Brand panel width (${brandBox1440.width})`);

// Brand artwork dimensions
const logoBox = await page.locator('.auth-brand-badge-img').boundingBox();
console.log(`  Logo Image: w=${logoBox.width.toFixed(1)}, h=${logoBox.height.toFixed(1)}`);
assert.ok(logoBox.width <= 180, `Logo width (${logoBox.width}) must be reasonably proportioned (<=180px)`);

// Minimum touch targets (44px) on form controls
const btnSignIn = await page.locator('.auth-form-card button[type="submit"]').boundingBox();
const btnBrowse = await page.locator('.auth-form-card button:has-text("Browse without signing in")').boundingBox();
const emailInput = await page.locator('.auth-form-card input[name="email"]').boundingBox();
const tabSignIn = await page.locator('.auth-tab-btn.is-active').boundingBox();

assert.ok(btnSignIn.height >= 44, `Sign in button height (${btnSignIn.height}) must be >= 44px`);
assert.ok(btnBrowse.height >= 44, `Browse button height (${btnBrowse.height}) must be >= 44px`);
assert.ok(emailInput.height >= 44, `Email input height (${emailInput.height}) must be >= 44px`);
assert.ok(tabSignIn.height >= 42, `Tab button height (${tabSignIn.height}) must be >= 42px`);

console.log('  ✓ Desktop two-column layout, upper edge alignment, and control sizing passed!');

// 2. Desktop (1024px) Layout
console.log('\n[2] Verifying Desktop (1024px) Layout...');
await page.setViewportSize({ width: 1024, height: 900 });
await page.waitForTimeout(100);
const brandBox1024 = await page.locator('.auth-brand-panel').boundingBox();
const formBox1024 = await page.locator('.auth-form-card').boundingBox();

assert.ok(brandBox1024.x < formBox1024.x, 'At 1024px, Brand panel must still be to the left of the Form card');
assert.ok(Math.abs(brandBox1024.y - formBox1024.y) <= 2, 'At 1024px, upper edges must align');
console.log(`  ✓ 1024px maintains balanced two-column layout without premature stacking`);

// 3. Tablet (768px) Layout
console.log('\n[3] Verifying Tablet (768px) Layout...');
await page.setViewportSize({ width: 768, height: 900 });
await page.waitForTimeout(100);
const brandBox768 = await page.locator('.auth-brand-panel').boundingBox();
const formBox768 = await page.locator('.auth-form-card').boundingBox();

console.log(`  Tablet 768px Brand: x=${brandBox768.x.toFixed(1)}, y=${brandBox768.y.toFixed(1)}, w=${brandBox768.width.toFixed(1)}`);
console.log(`  Tablet 768px Form:   x=${formBox768.x.toFixed(1)}, y=${formBox768.y.toFixed(1)}, w=${formBox768.width.toFixed(1)}`);
assert.ok(brandBox768.x < formBox768.x, 'At 768px, Brand panel is positioned alongside the Form card');
assert.ok(Math.abs(brandBox768.y - formBox768.y) <= 2, 'At 768px, upper edges align');
console.log('  ✓ Tablet 768px maintains clean adapted two-column layout');

// 4. Mobile (375px & 360px) Prioritizing Form
console.log('\n[4] Verifying Mobile Layout (375px) Prioritizing Sign In Form...');
await page.setViewportSize({ width: 375, height: 800 });
await page.waitForTimeout(100);

const brandBox375 = await page.locator('.auth-brand-panel').boundingBox();
const formBox375 = await page.locator('.auth-form-card').boundingBox();

console.log(`  Mobile 375px Form:  y=${formBox375.y.toFixed(1)}, h=${formBox375.height.toFixed(1)}`);
console.log(`  Mobile 375px Brand: y=${brandBox375.y.toFixed(1)}, h=${brandBox375.height.toFixed(1)}`);

// Critical requirement: Form is FIRST, Brand panel is BELOW
assert.ok(formBox375.y < brandBox375.y, `On mobile, Form card (y=${formBox375.y}) must be prioritized above Brand panel (y=${brandBox375.y})`);
assert.ok(brandBox375.y >= formBox375.y + formBox375.height, 'Brand panel must render below the bottom of the Form card');
console.log('  ✓ On mobile, Form is prioritized at the top of the viewport and brand panel sits cleanly below!');

// 5. Sweep all required viewports for horizontal overflow
console.log('\n[5] Verifying 0 Horizontal Overflow Across Viewports (360px to 1920px)...');
for (const w of [360, 375, 390, 768, 1024, 1280, 1440, 1920]) {
  await page.setViewportSize({ width: w, height: 850 });
  await page.waitForTimeout(50);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const innerWidth = await page.evaluate(() => window.innerWidth);
  assert.ok(scrollWidth <= innerWidth + 1, `Horizontal scroll overflow detected at ${w}px: scrollWidth=${scrollWidth}, innerWidth=${innerWidth}`);
  console.log(`  ✓ Viewport ${w}px: 0 overflow (scrollWidth=${scrollWidth})`);
}

// 6. Accessibility Audit (Light and Dark Mode)
console.log('\n[6] Running AxeBuilder WCAG 2.1 / 2.2 AA Audits...');
for (const theme of ['light', 'dark']) {
  console.log(`  Auditing theme: ${theme.toUpperCase()}`);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/customer/sign-in`);
  await page.evaluate((th) => {
    document.documentElement.setAttribute('data-theme', th);
    document.documentElement.dataset.theme = th;
    localStorage.setItem('metrodrip.customer.theme', th);
    localStorage.setItem('theme', th);
  }, theme);
  await page.waitForTimeout(100);

  const axeResults = await new AxeBuilder({ page })
    .include('.auth-workspace')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  if (axeResults.violations.length > 0) {
    const details = axeResults.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.html).join(', ')})`);
    throw new Error(`Axe accessibility violations in ${theme} mode:\n${details.join('\n')}`);
  }
  console.log(`  ✓ AxeBuilder passed with 0 violations in ${theme} mode on auth workspace!`);
}

// 7. Functional Navigation Checks
console.log('\n[7] Verifying Navigation & Interactive Behavior...');
await page.goto(`${base}/customer/sign-in`);
await page.waitForSelector('.auth-workspace');

// Tab click -> navigate to /sign-up
await page.locator('.auth-tab-btn:has-text("Create account")').click();
await page.waitForURL('**/customer/sign-up');
assert.ok(page.url().includes('/customer/sign-up'), 'Clicking Create account tab must navigate to /sign-up');
console.log('  ✓ Create account tab navigation works');

// From /sign-up click Sign in tab -> navigate back to /sign-in
await page.locator('.auth-tab-btn:has-text("Sign in")').click();
await page.waitForURL('**/customer/sign-in');
assert.ok(page.url().includes('/customer/sign-in'), 'Clicking Sign in tab must navigate to /sign-in');
console.log('  ✓ Return to Sign in tab navigation works');

// Forgot password link
await page.locator('.auth-forgot-link').click();
await page.waitForURL('**/customer/forgot-password');
assert.ok(page.url().includes('/customer/forgot-password'), 'Forgot password link must navigate to /forgot-password');
console.log('  ✓ Forgot password link navigation works');

// Browse without signing in
await page.goto(`${base}/customer/sign-in`);
await page.locator('button:has-text("Browse without signing in")').click();
await page.waitForURL('**/customer/shop');
assert.ok(page.url().includes('/customer/shop'), 'Browse without signing in must navigate to /shop');
console.log('  ✓ Browse without signing in navigation works');

// Check console errors
assert.equal(consoleErrors.length, 0, `Browser console errors detected: ${consoleErrors.join(', ')}`);

console.log('\nALL Customer Sign In UI/UX & Accessibility Tests PASSED!');
await browser.close();
