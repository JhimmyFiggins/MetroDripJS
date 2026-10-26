import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = new URL('../../web/', import.meta.url);
const types = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
};

const mockUsers = [
  {
    id: 1,
    email: 'verified.customer@example.com',
    name: 'Maria Clara',
    role: 'customer',
    status: 'Active',
    two_factor_status: 'enabled',
    mfa_enabled: true,
    last_active: '2026-10-25T14:30:00Z',
    last_active_recorded: true,
    date_joined: '2026-08-15T09:00:00Z',
  },
  {
    id: 2,
    email: 'unverified.customer@example.com',
    name: 'Crisostomo Ibarra',
    role: 'customer',
    status: 'Active',
    two_factor_status: 'pending_setup',
    mfa_enabled: false,
    last_active: null,
    last_active_recorded: false,
    date_joined: '2026-10-20T10:00:00Z',
  },
  {
    id: 3,
    email: 'merchant.user@metrodrip.ph',
    name: 'Elias Store',
    role: 'merchant',
    status: 'Active',
    two_factor_status: 'disabled',
    mfa_enabled: false,
    last_active: '2026-10-24T08:15:00Z',
    last_active_recorded: true,
    date_joined: '2026-05-01T08:00:00Z',
  },
  {
    id: 4,
    email: 'admin.security@metrodrip.ph',
    name: 'Sisa Admin',
    role: 'admin',
    status: 'Active',
    two_factor_status: 'enabled',
    mfa_enabled: true,
    last_active: '2026-10-26T01:00:00Z',
    last_active_recorded: true,
    date_joined: '2026-01-10T00:00:00Z',
  },
  {
    id: 5,
    email: 'suspended.user@example.com',
    name: 'Damaso Suspended',
    role: 'customer',
    status: 'Suspended',
    two_factor_status: 'disabled',
    mfa_enabled: false,
    last_active: null,
    last_active_recorded: false,
    date_joined: '2026-09-01T12:00:00Z',
  },
];

function startServer() {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/api/admin/users/') {
      response.writeHead(200, {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
      });
      response.end(JSON.stringify(mockUsers));
      return;
    }
    let path = url.pathname;
    const file = normalize(join(root.pathname, path));
    if (!file.startsWith(root.pathname)) {
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
  await page.route('**/api/admin/users/**', async route => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
      },
      body: JSON.stringify(mockUsers),
    });
  });

  await page.addInitScript(() => {
    sessionStorage.setItem('metrodrip_active_user', JSON.stringify({
      id: 4,
      name: 'Sisa Admin',
      email: 'admin.security@metrodrip.ph',
      role: 'admin',
      is_staff: true,
      access_token: 'qa-admin-test-token',
      token: 'qa-admin-test-token',
    }));
  });

  // 1. Initial Load in Light Mode (1280px Desktop)
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`http://127.0.0.1:${port}/admin/users.html`, { waitUntil: 'networkidle' });

  // Verify headers and structure
  const headerTexts = await page.locator('#users-directory-table thead th').allTextContents();
  assert.deepEqual(
    headerTexts.map(t => t.trim()),
    ['NAME / EMAIL', 'ROLE', 'STATUS', '2FA', 'LAST ACTIVE'],
    'Table headers must match specification'
  );

  // Wait for rows to render
  const rows = page.locator('#users-directory-table tbody tr');
  await rows.first().waitFor();
  assert.equal(await rows.count(), 5, 'Should render 5 user rows');

  // Verify 2FA status pills in Light Mode
  const row1_2fa = rows.nth(0).locator('td[data-label="2FA"] .status-pill');
  assert.equal((await row1_2fa.textContent()).trim(), 'Enabled');
  assert.ok((await row1_2fa.getAttribute('class')).includes('active'), 'Enabled should have active class');

  const row2_2fa = rows.nth(1).locator('td[data-label="2FA"] .status-pill');
  assert.equal((await row2_2fa.textContent()).trim(), 'Pending Setup');
  assert.ok((await row2_2fa.getAttribute('class')).includes('pending'), 'Pending Setup should have pending class');

  const row3_2fa = rows.nth(2).locator('td[data-label="2FA"] .status-pill');
  assert.equal((await row3_2fa.textContent()).trim(), 'Disabled');
  assert.ok((await row3_2fa.getAttribute('class')).includes('inactive'), 'Disabled should have inactive class');

  // Verify Last Active column
  const row1_active = await rows.nth(0).locator('td[data-label="Last active"]').textContent();
  assert.ok(!row1_active.includes('No activity recorded'), 'User 1 should display formatted activity date');
  assert.match(row1_active, /Oct\s+25/i, 'User 1 date should match Oct 25');

  const row2_active = (await rows.nth(1).locator('td[data-label="Last active"]').textContent()).trim();
  assert.equal(row2_active, 'No activity recorded', 'User 2 with no recorded activity must display exact text');

  const row5_active = (await rows.nth(4).locator('td[data-label="Last active"]').textContent()).trim();
  assert.equal(row5_active, 'No activity recorded', 'User 5 with no recorded activity must display exact text');

  // Verify Detail Sidebar selection
  await rows.nth(1).click();
  const detailName2 = (await page.locator('#detail-user-name').textContent()).trim();
  assert.equal(detailName2, 'Crisostomo Ibarra');
  const detail2fa2 = (await page.locator('#detail-user-2fa').textContent()).trim();
  assert.ok(detail2fa2.includes('Pending Setup'), 'Detail sidebar 2FA should show Pending Setup');
  const detailActivity2 = (await page.locator('#detail-user-activity').textContent()).trim();
  assert.ok(detailActivity2.includes('No activity recorded'), 'Detail activity should indicate No activity recorded');

  // Select User 1
  await rows.nth(0).click();
  const detailName1 = (await page.locator('#detail-user-name').textContent()).trim();
  assert.equal(detailName1, 'Maria Clara');
  const detail2fa1 = (await page.locator('#detail-user-2fa').textContent()).trim();
  assert.ok(detail2fa1.includes('Enabled'), 'Detail sidebar 2FA should show Enabled');

  // Verify Metrics Cards
  const totalCustomers = (await page.locator('#metric-total-customers').textContent()).trim();
  assert.equal(totalCustomers, '3', 'Total customers count should be 3');
  const staffAccounts = (await page.locator('#metric-staff-accounts').textContent()).trim();
  assert.equal(staffAccounts, '2', 'Staff accounts count should be 2');
  const suspendedCount = (await page.locator('#metric-suspended').textContent()).trim();
  assert.equal(suspendedCount, '1', 'Suspended accounts count should be 1');

  // 2. Dark Mode Switching & Rendering Verification
  const darkBtn = page.locator('.theme-toggle-btn[data-theme-option="dark"]');
  await darkBtn.click();
  await page.waitForTimeout(100);

  const themeAttr = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  assert.equal(themeAttr, 'dark', 'document.documentElement data-theme should be dark');

  // Verify dark mode computed colors
  const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.ok(darkBg.includes('18') || darkBg.includes('15') || darkBg.includes('26') || darkBg.includes('0, 0, 0'), `Dark mode background should be dark surface, got ${darkBg}`);

  // Verify status pills remain rendered and styled in dark mode
  const darkRow1Pill = rows.nth(0).locator('td[data-label="2FA"] .status-pill');
  assert.equal((await darkRow1Pill.textContent()).trim(), 'Enabled');
  assert.ok(await darkRow1Pill.isVisible(), '2FA pill must remain visible in dark mode');

  // Switch back to light theme
  const lightBtn = page.locator('.theme-toggle-btn[data-theme-option="light"]');
  await lightBtn.click();
  await page.waitForTimeout(100);
  const themeAttrLight = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  assert.equal(themeAttrLight, 'light', 'document.documentElement data-theme should revert to light');

  // 3. Mobile Responsive Viewport (390px Mobile)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  assert.ok(!overflow, 'Admin users page must have zero horizontal overflow at 390px mobile viewport');

  console.log('PASS: Admin console users directory QA (light/dark themes, 2FA pills, last active formatting, responsive layout).');
} finally {
  await browser.close();
  server.close();
}
