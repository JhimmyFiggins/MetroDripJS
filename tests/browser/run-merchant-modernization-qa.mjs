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
  console.log(`[BROWSER ${msg.type()}]`, msg.text());
  if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource:')) {
    consoleErrors.push(msg.text());
  }
});
page.on('pageerror', (err) => {
  consoleErrors.push(err.message);
});

let bulkCalls = [];
let productCreatedPayload = null;
let productEditedPayload = null;

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
    is_active: false,
    status: 'Inactive',
  },
  {
    id: 3,
    name: 'Tactical Cargo Pants',
    category: 'Bottoms › Denim',
    category_id: 3,
    sku: 'MD-CARGO-001',
    variants_count: 2,
    stock: 30,
    total_stock: 30,
    reserved_stock: 2,
    available_stock: 28,
    price: 1899,
    price_formatted: '₱1,899',
    image_url: '',
    is_active: true,
    status: 'Active',
  },
];

const mockProductDetail = {
  id: 1,
  name: 'Drip Zip-Up Hoodie',
  category: 'Tops › Hoodies',
  category_id: 1,
  sku: 'MD-ZIP-001',
  price: 1249,
  price_formatted: '₱1,249',
  stock: 25,
  total_stock: 25,
  reserved_stock: 5,
  available_stock: 20,
  image_url: '/media/products/2026/10/hoodie.jpg',
  media: [],
  is_active: true,
  status: 'Active',
  description: 'Heavyweight streetwear zip-up hoodie.',
  variants: [
    {
      id: 101,
      sku: 'MD-ZIP-001-S',
      attributes: { Size: 'S', Color: 'Black' },
      price_adjustment: '0.00',
      effective_price: 1249,
      price_override: null,
      stock: 10,
      reserved_stock: 2,
      available_stock: 8,
      is_active: true,
    },
    {
      id: 102,
      sku: 'MD-ZIP-001-M',
      attributes: { Size: 'M', Color: 'Black' },
      price_adjustment: '50.00',
      effective_price: 1299,
      price_override: 1299,
      stock: 15,
      reserved_stock: 3,
      available_stock: 12,
      is_active: true,
    },
  ],
};

const mockCategories = [
  { id: 1, name: 'Tops › Hoodies', is_active: true },
  { id: 2, name: 'Tops › T-Shirts', is_active: true },
  { id: 3, name: 'Bottoms › Denim', is_active: true },
  { id: 4, name: 'Archived Line', is_active: false },
];

await page.route('**/api/merchant/**', async (route) => {
  const url = route.request().url();
  const method = route.request().method();
  console.log(`[MOCK ROUTE] ${method} ${url}`);

  if (url.includes('/api/merchant/products/bulk/')) {
    const payload = JSON.parse(route.request().postData() || '{}');
    bulkCalls.push(payload);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        action: payload.action,
        affected_count: payload.product_ids?.length || 0,
        message: `Bulk ${payload.action} executed.`,
      }),
    });
  }

  if (url.includes('/api/merchant/products/1/')) {
    if (method === 'PATCH') {
      productEditedPayload = JSON.parse(route.request().postData() || '{}');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockProductDetail,
          ...productEditedPayload,
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockProductDetail),
    });
  }

  if (url.includes('/api/merchant/products/')) {
    if (method === 'POST') {
      productCreatedPayload = JSON.parse(route.request().postData() || '{}');
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 4,
          ...productCreatedPayload,
          stock: productCreatedPayload.stock || 20,
          status: 'Active',
          variants_count: productCreatedPayload.variants?.length || 1,
        }),
      });
    }
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
      body: JSON.stringify(mockCategories),
    });
  }

  if (url.includes('/api/merchant/reviews/')) {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  }

  if (url.includes('/api/merchant/inventory/movements/')) {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  }

  return route.continue();
});

console.log(`Starting Modernization E2E QA tests on ${base}/merchant/catalog.html ...`);

await page.goto(`${base}/merchant/catalog.html`);
await page.evaluate(() => {
  sessionStorage.setItem('metrodrip_active_user', JSON.stringify({
    id: 1,
    name: 'Test Merchant',
    email: 'merchant@metrodrip.ph',
    role: 'merchant',
    is_staff: true,
    access_token: 'test-qa-merchant-token',
  }));
});

await page.goto(`${base}/merchant/catalog.html`, { waitUntil: 'networkidle' });
await page.waitForSelector('#products-tbody tr[data-product-id]');

// --- FEATURE 3: DYNAMIC CATEGORY DROPDOWN ---
console.log('Verifying Feature 3: Dynamic Category Dropdown & Filters...');
const categorySelect = page.locator('#select-category-filter');
const options = await categorySelect.locator('option').allTextContents();
console.log(`✓ Category filter options: ${JSON.stringify(options)}`);

if (!options.includes('All categories') || !options.includes('Tops › Hoodies') || !options.includes('Bottoms › Denim')) {
  throw new Error('Category filter missing expected active categories');
}
if (options.includes('Archived Line')) {
  throw new Error('Inactive category "Archived Line" should not be included in filter options');
}

// Filter by Category = 1 (Tops › Hoodies)
await categorySelect.selectOption('1');
let visibleRows = await page.locator('#products-tbody tr[data-product-id]:visible').count();
if (visibleRows !== 1) throw new Error(`Expected 1 row visible for category 1, got ${visibleRows}`);
console.log('✓ Category filtering by stable ID works correctly');

// Filter by Status = inactive
await categorySelect.selectOption('all');
const statusSelect = page.locator('#select-status-filter');
await statusSelect.selectOption('inactive');
visibleRows = await page.locator('#products-tbody tr[data-product-id]:visible').count();
if (visibleRows !== 1) throw new Error(`Expected 1 row visible for inactive status, got ${visibleRows}`);
console.log('✓ Status filtering works correctly');

// Reset filters to all
await statusSelect.selectOption('all');
visibleRows = await page.locator('#products-tbody tr[data-product-id]:visible').count();
if (visibleRows !== 3) throw new Error(`Expected 3 rows visible, got ${visibleRows}`);

// --- FEATURE 1: BULK ACTIONS & SELECTION ---
console.log('Verifying Feature 1: Bulk Actions & Checkbox Selection...');

const bulkBtn = page.locator('#btn-bulk-actions');
const selectAllCb = page.locator('#select-all-products');
const countEl = page.locator('#bulk-selection-count');
const clearBtn = page.locator('#btn-bulk-deselect');

// Initially disabled
if (await bulkBtn.isEnabled()) throw new Error('Bulk actions button should be disabled initially');

// Select first row
await page.click('#products-tbody tr:first-child .product-row-select');
if (!await bulkBtn.isEnabled()) throw new Error('Bulk actions button should be enabled after selecting a row');
let countText = await countEl.textContent();
if (!countText.includes('1 selected')) throw new Error(`Expected "1 selected", got "${countText}"`);
console.log('✓ Single row selection enabled bulk actions and updated counter');

// Check indeterminate state on header checkbox
let isIndeterminate = await selectAllCb.evaluate((el) => el.indeterminate);
if (!isIndeterminate) throw new Error('Header checkbox should be indeterminate when 1 of 3 selected');
console.log('✓ Header checkbox reflects indeterminate state');

// Click Select All
await selectAllCb.click();
countText = await countEl.textContent();
if (!countText.includes('3 selected')) throw new Error(`Expected "3 selected", got "${countText}"`);
isIndeterminate = await selectAllCb.evaluate((el) => el.indeterminate);
if (isIndeterminate) throw new Error('Header checkbox should NOT be indeterminate when all selected');
console.log('✓ Select All selects all visible rows');

// Test Clear button
await clearBtn.click();
if (await bulkBtn.isEnabled()) throw new Error('Bulk actions button should be disabled after Clear');
countText = await countEl.evaluate((el) => el.style.display);
if (countText !== 'none') throw new Error('Selection counter should be hidden after Clear');
console.log('✓ Clear button deselects all products');

// Select 2 products and test Bulk Actions Menu
await page.click('#products-tbody tr:nth-child(1) .product-row-select');
await page.click('#products-tbody tr:nth-child(2) .product-row-select');
await bulkBtn.click();
const menu = page.locator('#menu-bulk-actions');
if (!await menu.isVisible()) throw new Error('Bulk actions menu should be visible');

// Test Bulk Update Stock dialog
await page.click('#menu-bulk-actions button[data-action="update_stock"]');
await page.waitForSelector('#modal-bulk-stock:not([hidden])');
await page.selectOption('#bulk-stock-mode', 'increase');
await page.fill('#bulk-stock-qty', '15');
await page.click('#btn-submit-bulk-stock');
await page.waitForSelector('#modal-bulk-stock', { state: 'hidden' });

if (bulkCalls.length !== 1 || bulkCalls[0].action !== 'update_stock' || bulkCalls[0].params.quantity !== 15) {
  throw new Error(`Unexpected bulk call payload: ${JSON.stringify(bulkCalls[0])}`);
}
console.log('✓ Bulk Update Stock modal submitted correct payload');

// --- FEATURE 2: PRODUCT VARIATION MANAGEMENT ---
console.log('Verifying Feature 2: Product Variation Management...');

// 2a. Add Product with Variations
await page.click('#btn-open-add-product');
await page.waitForSelector('#modal-add-product:not([hidden])');

await page.fill('#add-prod-name', 'Streetwear Bomber Jacket');
await page.fill('#add-prod-sku', 'MD-BOMBER-001');
await page.fill('#add-prod-price', '2499');

// Toggle variations
const addVariantsToggle = page.locator('#add-prod-has-variants');
await addVariantsToggle.check();
const addVariantsSection = page.locator('#add-prod-variants-section');
if (!await addVariantsSection.isVisible()) throw new Error('Variation section should be visible after toggle');

// Check default attribute Size (S, M, L)
let combosPreview = await page.locator('#add-prod-combos-preview').textContent();
console.log(`✓ Initial combos preview: ${combosPreview}`);

// Add Color attribute
await page.click('#btn-add-attr-add-prod');
const attrRows = page.locator('#add-prod-attributes-container .attr-row');
const secondAttr = attrRows.nth(1);
await secondAttr.locator('.attr-name').fill('Color');
await secondAttr.locator('.attr-values').fill('Black, Olive');

combosPreview = await page.locator('#add-prod-combos-preview').textContent();
console.log(`✓ Combos preview with Color added: ${combosPreview}`);
if (!combosPreview.includes('6 combinations')) throw new Error(`Expected 6 combinations, got: ${combosPreview}`);

// Click Generate Variations
await page.click('#btn-generate-add-variants');
const generatedRows = await page.locator('#add-prod-variants-tbody tr').count();
if (generatedRows !== 6) throw new Error(`Expected 6 generated variant rows, got ${generatedRows}`);
console.log(`✓ Generated ${generatedRows} variant rows in table`);

// Submit Add Product Form
await page.click('#btn-submit-product');
await page.waitForSelector('#modal-add-product', { state: 'hidden' });

if (!productCreatedPayload?.variants || productCreatedPayload.variants.length !== 6) {
  throw new Error(`Expected 6 variants in payload, got: ${JSON.stringify(productCreatedPayload?.variants)}`);
}
console.log('✓ Add Product submitted valid variations payload to backend');

// 2b. Edit Product Modal with Variations
await page.click('#products-tbody tr[data-product-id="1"] .btn-edit-product');
await page.waitForSelector('#modal-edit-product:not([hidden])');

const editVariantsToggle = page.locator('#edit-prod-has-variants');
const isChecked = await editVariantsToggle.isChecked();
if (!isChecked) throw new Error('Edit product variations toggle should be pre-checked for multi-variant product');

const editVarRows = await page.locator('#edit-prod-variants-tbody tr').count();
if (editVarRows !== 2) throw new Error(`Expected 2 existing variants in Edit modal, got ${editVarRows}`);
console.log(`✓ Edit Product loaded ${editVarRows} existing variants`);

// Modify stock on first variant and save
const firstStockInput = page.locator('#edit-prod-variants-tbody tr:first-child .var-stock');
await firstStockInput.fill('40');
await page.click('#btn-save-edit-product');
await page.waitForSelector('#modal-edit-product', { state: 'hidden' });

if (!productEditedPayload?.variants || productEditedPayload.variants[0].stock !== 40) {
  throw new Error(`Expected variant stock updated to 40, got: ${JSON.stringify(productEditedPayload?.variants)}`);
}
console.log('✓ Edit Product submitted updated variant stock');

// Accessibility audit on the final page state
console.log('Auditing modernized Merchant Console with AxeBuilder...');
const accessibilityResults = await new AxeBuilder({ page })
  .withTags(['wcag2a', 'wcag2aa'])
  .exclude('#toast-container')
  .analyze();

if (accessibilityResults.violations.length > 0) {
  console.error('Accessibility violations found:');
  accessibilityResults.violations.forEach((v) => {
    console.error(`- [${v.id}] ${v.help}: ${v.nodes.map((n) => n.target).join(', ')}`);
  });
  throw new Error(`Axe detected ${accessibilityResults.violations.length} accessibility violation(s)`);
}

console.log('✓ AxeBuilder WCAG 2.1 AA accessibility audit passed with 0 violations!');
console.log('\nALL Modernization E2E QA Tests PASSED successfully!');

await browser.close();
