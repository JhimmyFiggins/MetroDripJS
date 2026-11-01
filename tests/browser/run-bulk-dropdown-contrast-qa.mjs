import AxeBuilder from '@axe-core/playwright';
import { chromium } from '@playwright/test';

const base = process.env.QA_WEB_BASE || 'http://127.0.0.1:3000';

function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const val = c / 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function parseRgb(colorStr) {
  const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return { r: 0, g: 0, b: 0 };
  return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
}

function getContrastRatio(rgb1, rgb2) {
  const l1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const l2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

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

const mockProducts = [
  {
    id: 1,
    name: 'Drip Zip-Up Hoodie',
    category: 'Tops › Hoodies',
    category_id: 1,
    sku: 'MD-ZIP-001',
    variants_count: 3,
    stock: 25,
    total_stock: 25,
    reserved_stock: 5,
    available_stock: 20,
    price: 1249,
    price_formatted: '₱1,249',
    image_url: '/media/products/2026/10/hoodie.jpg',
    is_active: true,
    status: 'Active',
  },
  {
    id: 2,
    name: 'Metro Core Boxy Tee',
    category: 'Tops › T-Shirts',
    category_id: 2,
    sku: 'MD-TEE-001',
    variants_count: 1,
    stock: 46,
    total_stock: 46,
    reserved_stock: 0,
    available_stock: 46,
    price: 649,
    price_formatted: '₱649',
    image_url: '',
    is_active: true,
    status: 'Active',
  },
];

await page.route('**/api/merchant/**', async (route) => {
  const url = route.request().url();
  if (url.includes('/api/merchant/products/')) {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockProducts),
    });
  }
  if (url.includes('/api/merchant/categories/')) {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 1, name: 'Tops › Hoodies', is_active: true },
        { id: 2, name: 'Tops › T-Shirts', is_active: true },
      ]),
    });
  }
  if (url.includes('/api/merchant/reviews/')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  }
  if (url.includes('/api/merchant/inventory/movements/')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  }
  return route.continue();
});

// Set session
await page.goto(base);
await page.evaluate(() => {
  sessionStorage.setItem('metrodrip_active_user', JSON.stringify({
    id: 99,
    name: 'Merchant Tester',
    email: 'merchant@metrodrip.ph',
    role: 'merchant',
    is_staff: true,
    access_token: 'qa-fixture-token',
  }));
});

console.log('--- Testing Bulk Actions Dropdown Contrast & Accessibility ---');

for (const theme of ['light', 'dark']) {
  console.log(`\nTesting theme: ${theme.toUpperCase()} MODE`);
  await page.goto(`${base}/merchant/catalog.html`);
  await page.evaluate((th) => {
    document.documentElement.setAttribute('data-theme', th);
    localStorage.setItem('theme', th);
  }, theme);

  await page.waitForSelector('#products-tbody tr[data-product-id="1"]');

  // Verify initial state: 0 selected, bulk actions button disabled
  const bulkBtn = page.locator('#btn-bulk-actions');
  const countSpan = page.locator('#bulk-selection-count');
  if (await bulkBtn.isEnabled()) throw new Error('Bulk actions button should be disabled with 0 products selected');
  if (await countSpan.isVisible()) throw new Error('Selection counter should be hidden with 0 products selected');

  // Select 1 product
  await page.click('#products-tbody tr[data-product-id="1"] .product-row-select');
  if (!await bulkBtn.isEnabled()) throw new Error('Bulk actions button should be enabled with 1 product selected');
  if (!await countSpan.isVisible()) throw new Error('Selection counter should be visible with 1 product selected');

  // Helper to find effective background color traversing up parent elements
  const countColors = await countSpan.evaluate((el) => {
    function findBg(node) {
      let cur = node;
      while (cur) {
        const bg = window.getComputedStyle(cur).backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
        cur = cur.parentElement;
      }
      return 'rgb(255, 255, 255)';
    }
    const style = window.getComputedStyle(el);
    return { color: style.color, bg: findBg(el) };
  });
  const countContrast = getContrastRatio(parseRgb(countColors.color), parseRgb(countColors.bg));
  console.log(`[${theme}] Selection counter contrast: ${countContrast.toFixed(2)}:1 (Color: ${countColors.color}, Bg: ${countColors.bg})`);
  if (countContrast < 4.5) {
    throw new Error(`Selection counter contrast ${countContrast.toFixed(2)}:1 is below WCAG AA 4.5:1 in ${theme} mode`);
  }

  // Open Bulk Actions Menu
  await bulkBtn.click();
  const menu = page.locator('#menu-bulk-actions');
  if (!await menu.isVisible()) throw new Error('Bulk actions menu should be visible after clicking button');
  if (await bulkBtn.getAttribute('aria-expanded') !== 'true') throw new Error('Bulk actions button aria-expanded should be true');

  // Evaluate menu background & item colors
  const menuBg = await menu.evaluate((el) => window.getComputedStyle(el).backgroundColor);
  const items = await page.locator('#menu-bulk-actions .dropdown-item').all();

  for (const item of items) {
    const text = (await item.textContent()).trim();
    const action = await item.getAttribute('data-action');
    const isDestructive = action === 'delete';

    // Normal state
    const styles = await item.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return { color: s.color, bg: s.backgroundColor, opacity: s.opacity };
    });
    const effectiveBg = styles.bg === 'rgba(0, 0, 0, 0)' || styles.bg === 'transparent' ? menuBg : styles.bg;
    const ratio = getContrastRatio(parseRgb(styles.color), parseRgb(effectiveBg));
    console.log(`  [${theme}] Item "${text}" default: ${ratio.toFixed(2)}:1 (Color: ${styles.color}, Bg: ${effectiveBg})`);
    if (ratio < 4.5) {
      throw new Error(`Item "${text}" contrast ${ratio.toFixed(2)}:1 in ${theme} mode is below WCAG AA 4.5:1`);
    }

    // Hover state
    await item.hover();
    const hoverStyles = await item.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return { color: s.color, bg: s.backgroundColor };
    });
    const effectiveHoverBg = hoverStyles.bg === 'rgba(0, 0, 0, 0)' || hoverStyles.bg === 'transparent' ? menuBg : hoverStyles.bg;
    const hoverRatio = getContrastRatio(parseRgb(hoverStyles.color), parseRgb(effectiveHoverBg));
    console.log(`  [${theme}] Item "${text}" hover: ${hoverRatio.toFixed(2)}:1 (Color: ${hoverStyles.color}, Bg: ${effectiveHoverBg})`);
    if (hoverRatio < 4.5) {
      throw new Error(`Item "${text}" hover contrast ${hoverRatio.toFixed(2)}:1 in ${theme} mode is below WCAG AA 4.5:1`);
    }

    // Focus state
    await item.focus();
    const focusOutline = await item.evaluate((el) => window.getComputedStyle(el).outlineStyle);
    if (focusOutline === 'none') {
      throw new Error(`Item "${text}" missing accessible outline in focus state`);
    }

    if (isDestructive) {
      const rgb = parseRgb(styles.color);
      // Red semantic component check (r significantly higher than g and b)
      if (rgb.r <= rgb.g || rgb.r <= rgb.b) {
        throw new Error(`Destructive item "${text}" does not have red semantic color: ${styles.color}`);
      }
    }
  }

  // Accessibility audit with menu open
  console.log(`  [${theme}] Running AxeBuilder on open menu...`);
  const axeResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .exclude('#toast-container')
    .analyze();

  if (axeResults.violations.length > 0) {
    const details = axeResults.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.html).join(', ')})`);
    throw new Error(`Axe accessibility violations in ${theme} mode:\n${details.join('\n')}`);
  }
  console.log(`  ✓ AxeBuilder passed with 0 violations in ${theme} mode`);

  // Close menu with Escape
  await page.keyboard.press('Escape');
  if (await menu.isVisible()) throw new Error('Menu should close on Escape');
  if (await page.evaluate(() => document.activeElement === document.getElementById('btn-bulk-actions')) !== true) {
    throw new Error('Focus should return to Bulk actions button on Escape');
  }
}

// --- Keyboard Navigation Tests ---
console.log('\nTesting Bulk Actions Keyboard Navigation...');
await page.setViewportSize({ width: 1280, height: 800 });

// Focus bulk actions button
const bulkBtn = page.locator('#btn-bulk-actions');
await bulkBtn.focus();
await page.keyboard.press('ArrowDown');

const menu = page.locator('#menu-bulk-actions');
if (!await menu.isVisible()) throw new Error('ArrowDown on bulk button should open menu');

// First item should be focused
let activeText = await page.evaluate(() => document.activeElement.textContent.trim());
if (activeText !== 'Activate selected') throw new Error(`Expected 'Activate selected' focused, got '${activeText}'`);
console.log('✓ ArrowDown on button opened menu and focused first item: "Activate selected"');

// ArrowDown through menu
await page.keyboard.press('ArrowDown');
activeText = await page.evaluate(() => document.activeElement.textContent.trim());
if (activeText !== 'Deactivate selected') throw new Error(`Expected 'Deactivate selected' focused, got '${activeText}'`);

await page.keyboard.press('ArrowDown');
activeText = await page.evaluate(() => document.activeElement.textContent.trim());
if (activeText !== 'Change category…') throw new Error(`Expected 'Change category…' focused, got '${activeText}'`);

await page.keyboard.press('ArrowDown');
activeText = await page.evaluate(() => document.activeElement.textContent.trim());
if (activeText !== 'Update stock…') throw new Error(`Expected 'Update stock…' focused, got '${activeText}'`);

await page.keyboard.press('ArrowDown');
activeText = await page.evaluate(() => document.activeElement.textContent.trim());
if (activeText !== 'Delete selected…') throw new Error(`Expected 'Delete selected…' focused, got '${activeText}'`);

// Wrap around with ArrowDown
await page.keyboard.press('ArrowDown');
activeText = await page.evaluate(() => document.activeElement.textContent.trim());
if (activeText !== 'Activate selected') throw new Error(`Expected wrap around to 'Activate selected', got '${activeText}'`);
console.log('✓ ArrowDown navigation and wrap-around verified');

// Wrap backwards with ArrowUp
await page.keyboard.press('ArrowUp');
activeText = await page.evaluate(() => document.activeElement.textContent.trim());
if (activeText !== 'Delete selected…') throw new Error(`Expected backward wrap to 'Delete selected…', got '${activeText}'`);
console.log('✓ ArrowUp navigation and backward wrap verified');

// Home and End keys
await page.keyboard.press('Home');
activeText = await page.evaluate(() => document.activeElement.textContent.trim());
if (activeText !== 'Activate selected') throw new Error(`Expected Home to focus first item, got '${activeText}'`);

await page.keyboard.press('End');
activeText = await page.evaluate(() => document.activeElement.textContent.trim());
if (activeText !== 'Delete selected…') throw new Error(`Expected End to focus last item, got '${activeText}'`);
console.log('✓ Home and End navigation verified');

// Tab key closes menu
await page.keyboard.press('Tab');
if (await menu.isVisible()) throw new Error('Tab should close menu');
console.log('✓ Tab key closed menu');

// --- Viewport Responsiveness Tests ---
console.log('\nTesting Responsive Viewports (320px, 375px, 768px, 1280px)...');
for (const width of [320, 375, 768, 1280]) {
  await page.setViewportSize({ width, height: 750 });
  await bulkBtn.click();
  if (!await menu.isVisible()) throw new Error(`Menu failed to open at ${width}px`);

  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflows) throw new Error(`Horizontal overflow detected at viewport width ${width}px`);

  const menuBounds = await menu.boundingBox();
  if (!menuBounds || menuBounds.x < 0 || menuBounds.x + menuBounds.width > width + 2) {
    throw new Error(`Menu clipped outside viewport at ${width}px: bounds=${JSON.stringify(menuBounds)}`);
  }
  console.log(`✓ Viewport ${width}px: menu positioned within bounds without page overflow`);
  await page.keyboard.press('Escape');
}

// Check console errors
if (consoleErrors.length > 0) {
  throw new Error(`Browser console errors detected: ${consoleErrors.join(', ')}`);
}

console.log('\nALL Bulk Actions Dropdown Contrast & Accessibility Tests PASSED!');
await browser.close();
