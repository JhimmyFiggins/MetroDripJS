import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../../web/', import.meta.url);
const rootPath = fileURLToPath(root);
const types = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};

const mockRoles = [
  {
    role: 'admin',
    title: 'Administrator',
    description: 'Full access to user management, platform configurations, financial reports, and audit logs.',
    user_count: 2,
    permissions: ['manage_users', 'delete_users', 'manage_roles', 'manage_settings', 'audit_trail', 'export_users', 'manage_shipping'],
    capabilities: [
      { id: 'manage_users', label: 'User administration', default: 'allow' },
      { id: 'delete_users', label: 'User deletion', default: 'allow' },
      { id: 'manage_roles', label: 'Assign roles & permissions', default: 'allow' },
      { id: 'manage_settings', label: 'Platform settings', default: 'allow' },
      { id: 'audit_trail', label: 'Audit trail (view / export)', default: 'allow' },
      { id: 'export_users', label: 'Export user directory', default: 'allow' },
      { id: 'manage_shipping', label: 'Shipping zones & rates', default: 'allow' },
    ],
    is_custom: false,
  },
  {
    role: 'merchant',
    title: 'Store Merchant',
    description: 'Manage product catalog, inventory restock, fulfillment orders, and respond to customer reviews.',
    user_count: 3,
    permissions: ['manage_catalog', 'view_inventory', 'adjust_stock', 'view_orders', 'manage_orders', 'manage_shipments', 'edit_shipping_zones', 'reply_reviews', 'publish_content'],
    capabilities: [
      { id: 'manage_catalog', label: 'Catalog & product management', default: 'allow' },
      { id: 'view_inventory', label: 'View inventory', default: 'allow' },
      { id: 'adjust_stock', label: 'Adjust stock & restock', default: 'allow' },
      { id: 'view_orders', label: 'View orders', default: 'allow' },
      { id: 'manage_orders', label: 'Order management', default: 'allow' },
      { id: 'manage_shipments', label: 'Manage shipments', default: 'allow' },
      { id: 'edit_shipping_zones', label: 'Shipping zones & rates', default: 'allow' },
      { id: 'reply_reviews', label: 'Customer reviews (view / reply)', default: 'allow' },
      { id: 'publish_content', label: 'Publish marketing content', default: 'allow' },
    ],
    is_custom: false,
  },
  {
    role: 'customer',
    title: 'Customer',
    description: 'Browse catalog, place drops and orders, save shipping addresses, and submit product reviews.',
    user_count: 50,
    permissions: ['manage_profile', 'browse_catalog', 'create_orders', 'view_own_orders', 'submit_reviews'],
    capabilities: [
      { id: 'manage_profile', label: 'Profile management & addresses', default: 'allow' },
      { id: 'browse_catalog', label: 'Browse catalog & products', default: 'allow' },
      { id: 'create_orders', label: 'Create orders & checkout', default: 'allow' },
      { id: 'view_own_orders', label: 'View personal orders', default: 'allow' },
      { id: 'submit_reviews', label: 'Submit product reviews', default: 'allow' },
    ],
    is_custom: false,
  },
];

function startServer() {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/api/admin/roles/') {
      response.writeHead(200, {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
      });
      response.end(JSON.stringify(mockRoles));
      return;
    }
    let path = url.pathname;
    const file = normalize(join(rootPath, path));
    if (!file.startsWith(rootPath)) {
      response.writeHead(403);
      response.end();
      return;
    }
    try {
      const body = await readFile(file);
      response.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const server = await startServer();
const { port } = server.address();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext();
const page = await context.newPage();

try {
  await page.route('**/api/admin/roles/**', async route => {
    if (route.request().method() === 'POST') {
      const postData = JSON.parse(route.request().postData());
      const newRole = {
        id: 99,
        role: postData.title.toLowerCase().replace(/\s+/g, '_'),
        title: postData.title,
        base_role: postData.base_role,
        permissions: postData.permissions,
        user_count: 0,
        is_custom: true,
      };
      mockRoles.push(newRole);
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify(newRole),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(mockRoles),
    });
  });

  await page.addInitScript(() => {
    sessionStorage.setItem('metrodrip_active_user', JSON.stringify({
      id: 1,
      name: 'Admin User',
      email: 'admin@metrodrip.ph',
      role: 'admin',
      is_staff: true,
      access_token: 'qa-admin-test-token',
      token: 'qa-admin-test-token',
    }));
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`http://127.0.0.1:${port}/admin/roles.html`, { waitUntil: 'networkidle' });

  // 1. Check Base Role Dropdown Options
  const baseOptions = await page.locator('#custom-role-base option').allTextContents();
  assert.deepEqual(
    baseOptions.map(t => t.trim()),
    ['Merchant', 'Administrator', 'Customer'],
    'Based On dropdown must offer Merchant, Administrator, and Customer'
  );

  // 2. Default is Merchant: Check Merchant Permissions rendered
  const permContainer = page.locator('#custom-role-permissions-container');
  await permContainer.waitFor();
  let permLabels = await permContainer.locator('span').allTextContents();
  assert.ok(permLabels.some(l => l.includes('Catalog & product management')), 'Merchant must show catalog management');
  assert.ok(permLabels.some(l => l.includes('Manage shipments')), 'Merchant must show manage shipments');
  assert.ok(permLabels.some(l => l.includes('View orders')), 'Merchant must show view orders');
  assert.ok(!permLabels.some(l => l.includes('User administration')), 'Merchant must not show user administration');

  // 3. Switch Base Role to Administrator: Dynamically loads Administrator Permissions
  await page.locator('#custom-role-base').selectOption('administrator');
  await page.waitForTimeout(50);
  permLabels = await permContainer.locator('span').allTextContents();
  assert.ok(permLabels.some(l => l.includes('User administration')), 'Admin must show user administration');
  assert.ok(permLabels.some(l => l.includes('User deletion')), 'Admin must show user deletion');
  assert.ok(permLabels.some(l => l.includes('Platform settings')), 'Admin must show platform settings');
  assert.ok(permLabels.some(l => l.includes('Audit trail')), 'Admin must show audit trail');
  assert.ok(!permLabels.some(l => l.includes('Catalog & product management')), 'Admin must not show merchant catalog management');

  // Verify all Administrator controls default to Allow
  const adminSelects = await permContainer.locator('.matrix-toggle-select').all();
  for (const sel of adminSelects) {
    const val = await sel.inputValue();
    assert.equal(val, 'allow', 'Default Administrator permission must be allow');
  }

  // 4. Switch Base Role to Customer: Dynamically loads Customer Permissions
  await page.locator('#custom-role-base').selectOption('customer');
  await page.waitForTimeout(50);
  permLabels = await permContainer.locator('span').allTextContents();
  assert.ok(permLabels.some(l => l.includes('Browse catalog & products')), 'Customer must show browse catalog');
  assert.ok(permLabels.some(l => l.includes('Create orders & checkout')), 'Customer must show create orders');
  assert.ok(permLabels.some(l => l.includes('Submit product reviews')), 'Customer must show submit reviews');
  assert.ok(!permLabels.some(l => l.includes('User administration')), 'Customer must not show user administration');
  assert.ok(!permLabels.some(l => l.includes('Manage shipments')), 'Customer must not show manage shipments');

  // 5. Customize Permission and Create Custom Role
  await page.locator('#custom-role-base').selectOption('merchant');
  await page.waitForTimeout(50);
  await page.locator('#custom-role-name').fill('Fulfillment Staff');

  // Toggle some permissions to Deny
  const catalogSelect = permContainer.locator('.matrix-toggle-select[data-perm="manage_catalog"]');
  await catalogSelect.selectOption('deny');
  assert.ok((await catalogSelect.getAttribute('class')).includes('deny'), 'Select class must update to deny');

  const contentSelect = permContainer.locator('.matrix-toggle-select[data-perm="publish_content"]');
  await contentSelect.selectOption('deny');

  // Submit form
  await page.locator('#btn-submit-custom-role').click();
  await page.waitForTimeout(200);

  // Verify toast notification
  const toast = page.locator('#toast-container .toast');
  assert.ok(await toast.isVisible(), 'Toast notification must be shown on successful custom role creation');
  const toastText = await toast.textContent();
  assert.ok(toastText.includes('Fulfillment Staff'), 'Toast must mention created custom role');

  console.log('PASS: Admin console roles & permissions QA (dynamic base role switching, default permissions, custom creation).');
} finally {
  await browser.close();
  server.close();
}
