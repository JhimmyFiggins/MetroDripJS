import AxeBuilder from '@axe-core/playwright';
import { chromium } from '@playwright/test';

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

const mockZones = [
  { id: 1, name: 'NCR (Metro Manila)', fee: 900, formatted_fee: '₱900', is_active: true },
  { id: 2, name: 'North & South Luzon', fee: 120, formatted_fee: '₱120', is_active: true },
  { id: 3, name: 'Visayas & Mindanao (VisMin)', fee: 150, formatted_fee: '₱150', is_active: true },
];

await page.route('**/api/merchant/**', async (route) => {
  const url = route.request().url();
  const method = route.request().method();

  if (url.includes('/api/merchant/shipping-zones/eligibility/')) {
    return route.fulfill({
      status: 501,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'Address eligibility is unavailable until a matcher is configured.',
        code: 'shipping_eligibility_unconfigured',
      }),
    });
  }

  if (url.includes('/api/merchant/shipping-zones/1/')) {
    if (method === 'PATCH') {
      const data = JSON.parse(route.request().postData() || '{}');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 1,
          name: 'NCR (Metro Manila)',
          fee: data.fee,
          formatted_fee: `₱${data.fee}`,
          is_active: data.is_active,
        }),
      });
    }
  }

  if (url.includes('/api/merchant/shipping-zones/')) {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockZones),
    });
  }

  return route.continue();
});

// Setup merchant session
await page.goto(base);
await page.evaluate(() => {
  sessionStorage.setItem('metrodrip_active_user', JSON.stringify({
    id: 99,
    name: 'Archim',
    email: 'archim@metrodrip.ph',
    role: 'merchant',
    is_staff: true,
    access_token: 'qa-fixture-token',
  }));
});

console.log('--- Testing Shipping Zones Responsive UI & Accessibility ---');

for (const theme of ['dark', 'light']) {
  console.log(`\nTesting theme: ${theme.toUpperCase()} MODE`);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/merchant/shipping-zones.html`);
  await page.evaluate((th) => {
    document.documentElement.setAttribute('data-theme', th);
    localStorage.setItem('theme', th);
  }, theme);

  await page.waitForSelector('tr[data-zone-id="1"]');

  // Verify Table Alignment and Columns
  console.log(`[${theme}] Verifying table columns and header alignment...`);
  const firstRowCells = await page.locator('tr[data-zone-id="1"] td').allTextContents();
  console.log(`  Row 1 contents:`, firstRowCells);
  if (firstRowCells[0] !== 'NCR (Metro Manila)') throw new Error(`Expected zone name in col 0, got ${firstRowCells[0]}`);
  if (firstRowCells[1] !== '₱900') throw new Error(`Expected standard fee '₱900' in col 1, got ${firstRowCells[1]}`);
  if (firstRowCells[2] !== '#1') throw new Error(`Expected ID '#1' in col 2, got ${firstRowCells[2]}`);
  if (!firstRowCells[3].includes('Active')) throw new Error(`Expected Status 'Active' in col 3, got ${firstRowCells[3]}`);
  console.log(`  ✓ Table column headers align correctly with values (Zone, Fee, ID, Status)`);

  // Verify Check an Address Component
  console.log(`[${theme}] Verifying 'Check an address' component layout & alignment...`);
  const card = page.locator('#card-check-address');
  const label = page.locator('label[for="calc-address"]');
  const textarea = page.locator('#calc-address');
  const btn = page.locator('#btn-check-shipping');
  const pill = page.locator('#calc-result-box');

  const cardBox = await card.boundingBox();
  const labelBox = await label.boundingBox();
  const textareaBox = await textarea.boundingBox();
  const btnBox = await btn.boundingBox();
  const pillBox = await pill.boundingBox();

  console.log(`  Card: w=${cardBox.width.toFixed(1)}, h=${cardBox.height.toFixed(1)}`);
  console.log(`  Label: x=${labelBox.x.toFixed(1)}, y=${labelBox.y.toFixed(1)}`);
  console.log(`  Textarea: x=${textareaBox.x.toFixed(1)}, y=${textareaBox.y.toFixed(1)}, w=${textareaBox.width.toFixed(1)}, h=${textareaBox.height.toFixed(1)}`);
  console.log(`  Button: x=${btnBox.x.toFixed(1)}, y=${btnBox.y.toFixed(1)}`);
  console.log(`  Pill: x=${pillBox.x.toFixed(1)}, y=${pillBox.y.toFixed(1)}, w=${pillBox.width.toFixed(1)}`);

  // 1. Label directly above textarea
  if (labelBox.y >= textareaBox.y) {
    throw new Error(`Label (y=${labelBox.y}) must be directly above textarea (y=${textareaBox.y})`);
  }
  // 2. Left-aligned
  if (Math.abs(labelBox.x - textareaBox.x) > 2) {
    throw new Error(`Label (x=${labelBox.x}) and textarea (x=${textareaBox.x}) are not left-aligned`);
  }
  if (Math.abs(labelBox.x - btnBox.x) > 2) {
    throw new Error(`Button (x=${btnBox.x}) is not left-aligned with form controls (x=${labelBox.x})`);
  }
  if (Math.abs(labelBox.x - pillBox.x) > 2) {
    throw new Error(`Result pill (x=${pillBox.x}) is not left-aligned with form controls (x=${labelBox.x})`);
  }
  // 3. Textarea utilizes available horizontal space (card width minus padding)
  const availableWidth = cardBox.width - 36; // 18px padding each side
  if (Math.abs(textareaBox.width - availableWidth) > 4) {
    throw new Error(`Textarea width (${textareaBox.width}) does not occupy available container width (${availableWidth})`);
  }
  // 4. Button below textarea
  if (btnBox.y < textareaBox.y + textareaBox.height) {
    throw new Error(`Button (y=${btnBox.y}) must be below textarea (bottom=${textareaBox.y + textareaBox.height})`);
  }
  // 5. Pill below button
  if (pillBox.y < btnBox.y + btnBox.height) {
    throw new Error(`Pill (y=${pillBox.y}) must be below button (bottom=${btnBox.y + btnBox.height})`);
  }
  console.log(`  ✓ Check an address component vertically stacked, full-width, and left-aligned!`);

  // Run Axe accessibility audit on the shipping zones main console
  console.log(`[${theme}] Running AxeBuilder WCAG 2.1 AA audit on main.console-main...`);
  const axeResults = await new AxeBuilder({ page })
    .include('main.console-main')
    .withTags(['wcag2a', 'wcag2aa'])
    .exclude('#toast-container')
    .analyze();

  if (axeResults.violations.length > 0) {
    const details = axeResults.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.html).join(', ')})`);
    throw new Error(`Axe accessibility violations in ${theme} mode:\n${details.join('\n')}`);
  }
  console.log(`  ✓ AxeBuilder passed with 0 violations in ${theme} mode on main.console-main!`);
}

// --- Summary Cards Responsive Stacking ---
console.log('\n--- Verifying Summary Cards Responsive Stacking ---');

// Desktop 1440px -> 3 columns
await page.setViewportSize({ width: 1440, height: 900 });
const card1 = await page.locator('.stat-cards-grid article.stat-card').nth(0).boundingBox();
const card2 = await page.locator('.stat-cards-grid article.stat-card').nth(1).boundingBox();
const card3 = await page.locator('.stat-cards-grid article.stat-card').nth(2).boundingBox();

if (Math.abs(card1.y - card2.y) > 2 || Math.abs(card2.y - card3.y) > 2) {
  throw new Error(`At 1440px desktop, all 3 summary cards must be in a single row (y1=${card1.y}, y2=${card2.y}, y3=${card3.y})`);
}
console.log('✓ Desktop 1440px: Summary cards render in 3 columns');

// Tablet 768px -> 2 columns (cards 1 and 2 on row 1, card 3 on row 2)
await page.setViewportSize({ width: 768, height: 900 });
const tCard1 = await page.locator('.stat-cards-grid article.stat-card').nth(0).boundingBox();
const tCard2 = await page.locator('.stat-cards-grid article.stat-card').nth(1).boundingBox();
const tCard3 = await page.locator('.stat-cards-grid article.stat-card').nth(2).boundingBox();

if (Math.abs(tCard1.y - tCard2.y) > 2 || tCard3.y <= tCard1.y) {
  throw new Error(`At 768px tablet, summary cards should be 2 columns (y1=${tCard1.y}, y2=${tCard2.y}, y3=${tCard3.y})`);
}
console.log('✓ Tablet 768px: Summary cards render in 2 columns');

// Mobile 375px -> 1 column stacked
await page.setViewportSize({ width: 375, height: 900 });
const mCard1 = await page.locator('.stat-cards-grid article.stat-card').nth(0).boundingBox();
const mCard2 = await page.locator('.stat-cards-grid article.stat-card').nth(1).boundingBox();
const mCard3 = await page.locator('.stat-cards-grid article.stat-card').nth(2).boundingBox();

if (mCard2.y <= mCard1.y || mCard3.y <= mCard2.y) {
  throw new Error(`At 375px mobile, summary cards must stack in 1 column (y1=${mCard1.y}, y2=${mCard2.y}, y3=${mCard3.y})`);
}
console.log('✓ Mobile 375px: Summary cards stack in 1 column');

// --- Viewports Sweep (360px, 375px, 390px, 768px, 1024px, 1280px, 1440px, 1920px) ---
console.log('\n--- Verifying Viewports (No horizontal page scroll or clipping) ---');
const viewports = [360, 375, 390, 768, 1024, 1280, 1440, 1920];

for (const width of viewports) {
  await page.setViewportSize({ width, height: 850 });
  await page.waitForTimeout(100);

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const innerWidth = await page.evaluate(() => window.innerWidth);

  if (scrollWidth > innerWidth + 1) {
    throw new Error(`Horizontal scroll overflow at ${width}px: scrollWidth=${scrollWidth}, innerWidth=${innerWidth}`);
  }

  // Check form controls inside cards fit within bounds
  const textareaBox = await page.locator('#calc-address').boundingBox();
  if (textareaBox.x < 0 || textareaBox.x + textareaBox.width > width) {
    throw new Error(`Textarea clipped outside screen at ${width}px: x=${textareaBox.x}, w=${textareaBox.width}`);
  }

  const btnBox = await page.locator('#btn-check-shipping').boundingBox();
  if (btnBox.x < 0 || btnBox.x + btnBox.width > width) {
    throw new Error(`Check shipping button clipped at ${width}px`);
  }

  console.log(`✓ Viewport ${width}px: 0 page overflow, controls fit naturally`);
}

// Check console errors
if (consoleErrors.length > 0) {
  throw new Error(`Browser console errors detected: ${consoleErrors.join(', ')}`);
}

console.log('\nALL Shipping Zones Responsive UI & Accessibility Tests PASSED!');
await browser.close();
