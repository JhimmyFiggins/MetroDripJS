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

const mockProducts = [
  {
    id: 1,
    name: 'Drip Zip-Up Hoodie',
    category: 'Tops › Hoodies',
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
  media: [
    {
      id: 101,
      url: '/media/products/2026/10/hoodie.jpg',
      alt_text: 'Drip Zip-Up Hoodie Front View',
      sort_order: 0,
      is_primary: true,
      mime_type: 'image/jpeg',
      byte_size: 45000,
    },
    {
      id: 102,
      url: '/media/products/2026/10/hoodie-back.jpg',
      alt_text: 'Drip Zip-Up Hoodie Back View',
      sort_order: 1,
      is_primary: false,
      mime_type: 'image/jpeg',
      byte_size: 52000,
    },
  ],
  is_active: true,
  status: 'Active',
  description: 'Heavyweight streetwear zip-up hoodie.',
};

const mockCategories = [
  { id: 1, name: 'Tops › Hoodies' },
  { id: 2, name: 'Tops › T-Shirts' },
  { id: 3, name: 'Bottoms › Denim' },
];

await page.route('**/api/merchant/**', async (route) => {
  const url = route.request().url();
  const method = route.request().method();

  if (url.includes('/api/merchant/products/1/media/')) {
    if (method === 'POST') {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 103,
          url: '/media/products/2026/10/hoodie-side.jpg',
          alt_text: 'Product gallery image',
          sort_order: 2,
          is_primary: false,
          mime_type: 'image/jpeg',
          byte_size: 38000,
        }),
      });
    }
  }

  if (url.includes('/api/merchant/products/1/')) {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockProductDetail),
    });
  }

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

console.log(`Testing Merchant Console Catalog & Media on ${base}/merchant/catalog.html ...`);

// Establish authenticated merchant session in sessionStorage
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

// Reload to initialize with session
await page.goto(`${base}/merchant/catalog.html`, { waitUntil: 'networkidle' });

await page.waitForSelector('#products-tbody tr[data-product-id]');

// 1. Verify table rows and image thumbnails
const tableRows = await page.locator('#products-tbody tr[data-product-id]').count();
console.log(`✓ Products table rendered with ${tableRows} rows`);
if (tableRows !== 2) throw new Error(`Expected 2 product rows, got ${tableRows}`);

const firstRowImg = await page.locator('#products-tbody tr:first-child img').getAttribute('src');
console.log(`✓ First row rendered primary thumbnail: ${firstRowImg}`);
if (!firstRowImg?.includes('hoodie.jpg')) throw new Error(`Unexpected thumbnail: ${firstRowImg}`);

const secondRowLetter = await page.locator('#products-tbody tr:nth-child(2) .product-thumb-letter').textContent();
console.log(`✓ Second row without image rendered fallback letter: "${secondRowLetter?.trim()}"`);
if (secondRowLetter?.trim() !== 'M') throw new Error(`Unexpected fallback letter: ${secondRowLetter}`);

// 2. Test Add Product Modal
console.log('Testing Add Product modal...');
await page.click('#btn-open-add-product');
await page.waitForSelector('#modal-add-product:not([hidden])');
const mediaInputVisible = await page.locator('#add-prod-media').isVisible();
console.log(`✓ Add Product modal opened, media input visible: ${mediaInputVisible}`);
if (!mediaInputVisible) throw new Error('Add Product media input should be visible');
await page.click('#btn-close-product-modal');
await page.waitForSelector('#modal-add-product', { state: 'hidden' });
console.log('✓ Add Product modal closed successfully');

// 3. Test Edit Product Modal with Gallery Manager
console.log('Testing Edit Product modal with Gallery Manager...');
await page.click('#products-tbody tr:first-child .btn-edit-product');
await page.waitForSelector('#modal-edit-product:not([hidden])');
await page.waitForSelector('#edit-prod-gallery-grid .edit-media-card');

const galleryCards = await page.locator('#edit-prod-gallery-grid .edit-media-card').count();
console.log(`✓ Edit Product modal opened, gallery rendered ${galleryCards} image cards`);
if (galleryCards !== 2) throw new Error(`Expected 2 gallery cards, got ${galleryCards}`);

const primaryBadge = await page.locator('#edit-prod-gallery-grid .edit-media-card:first-child').textContent();
console.log(`✓ First image has primary badge: ${primaryBadge.includes('Primary')}`);
if (!primaryBadge.includes('Primary')) throw new Error('First image card should indicate Primary');

const uploadBtnVisible = await page.locator('#btn-upload-product-image').isVisible();
console.log(`✓ Upload Image button is visible: ${uploadBtnVisible}`);
if (!uploadBtnVisible) throw new Error('Upload Image button should be visible');

await page.click('#btn-close-edit-product');
await page.waitForSelector('#modal-edit-product', { state: 'hidden' });
console.log('✓ Edit Product modal closed successfully');

// 4. Accessibility Audit
console.log('Auditing Catalog page accessibility with AxeBuilder...');
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
console.log('\nALL Merchant Catalog & Media E2E Tests PASSED successfully!');

await browser.close();
