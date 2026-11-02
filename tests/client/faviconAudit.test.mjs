import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

function readPngDimensions(filePath) {
  const buf = fs.readFileSync(filePath);
  assert.equal(buf.slice(0, 8).toString('hex'), '89504e470d0a1a0a', `${filePath} is not a valid PNG`);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

test('all required favicon assets exist with authentic brand dimensions', () => {
  const assets = [
    { file: 'web/assets/favicon.png', w: 512, h: 512 },
    { file: 'web/assets/favicon-16x16.png', w: 16, h: 16 },
    { file: 'web/assets/favicon-32x32.png', w: 32, h: 32 },
    { file: 'web/assets/favicon-64x64.png', w: 64, h: 64 },
    { file: 'web/assets/favicon-192x192.png', w: 192, h: 192 },
    { file: 'web/assets/apple-touch-icon.png', w: 180, h: 180 },
  ];

  for (const item of assets) {
    const full = path.join(repoRoot, item.file);
    assert.ok(fs.existsSync(full), `${item.file} must exist`);
    const { width, height } = readPngDimensions(full);
    assert.equal(width, item.w, `${item.file} width mismatch`);
    assert.equal(height, item.h, `${item.file} height mismatch`);
  }
});

test('favicon.ico is valid multi-resolution ICO and matches web/assets/favicon.ico', () => {
  const rootIco = path.join(repoRoot, 'web', 'favicon.ico');
  const assetIco = path.join(repoRoot, 'web', 'assets', 'favicon.ico');

  assert.ok(fs.existsSync(rootIco), 'web/favicon.ico must exist');
  assert.ok(fs.existsSync(assetIco), 'web/assets/favicon.ico must exist');

  const buf1 = fs.readFileSync(rootIco);
  const buf2 = fs.readFileSync(assetIco);
  assert.ok(buf1.equals(buf2), 'web/favicon.ico and web/assets/favicon.ico must be identical');

  assert.equal(buf1.readUInt16LE(0), 0, 'ICO reserved word must be 0');
  assert.equal(buf1.readUInt16LE(2), 1, 'ICO type must be 1');
  const count = buf1.readUInt16LE(4);
  assert.ok(count >= 3, 'ICO must have multiple embedded resolution tiers');
});

test('web/assets/favicon.svg embeds self-contained logo-emblem-dark.png data URI', () => {
  const svgPath = path.join(repoRoot, 'web', 'assets', 'favicon.svg');
  assert.ok(fs.existsSync(svgPath), 'favicon.svg must exist');
  const content = fs.readFileSync(svgPath, 'utf8');

  assert.match(content, /fill: #141414/, 'SVG favicon must maintain dark tile background');
  assert.match(content, /logo-emblem-dark\.png/, 'SVG favicon must preserve source emblem reference');
  assert.match(content, /href="data:image\/png;base64,/, 'SVG favicon must embed self-contained data URI to prevent subresource blocking');
  assert.doesNotMatch(content, /href="\/assets\//, 'SVG favicon must not contain unbundled external subresource paths');
});

test('all web HTML entry points declare complete, valid favicon link set', () => {
  const htmlFiles = [
    'web/customer/index.html',
    'web/index.html',
    'web/admin/index.html',
    'web/admin/users.html',
    'web/admin/roles.html',
    'web/admin/audit.html',
    'web/admin/settings.html',
    'web/admin/account-settings.html',
    'web/merchant/index.html',
    'web/merchant/catalog.html',
    'web/merchant/inventory.html',
    'web/merchant/orders.html',
    'web/merchant/shipments.html',
    'web/merchant/shipping-zones.html',
    'web/merchant/reviews.html',
    'web/merchant/content.html',
    'web/merchant/analytics.html',
    'web/merchant/account-settings.html',
    'web/Registration/screens/AdminLoginScreen.html',
    'web/Registration/screens/MerchantLoginScreen.html',
    'web/Registration/screens/AdminForgotPasswordScreen.html',
    'web/Registration/screens/MerchantForgotPasswordScreen.html',
    'web/Registration/screens/ResetPasswordScreen.html',
  ];

  for (const rel of htmlFiles) {
    const full = path.join(repoRoot, rel);
    assert.ok(fs.existsSync(full), `${rel} must exist`);
    const content = fs.readFileSync(full, 'utf8');

    assert.match(content, /<link[^>]+href=["']\/assets\/favicon\.svg["'][^>]*>/i, `${rel} missing favicon.svg link`);
    assert.match(content, /<link[^>]+href=["']\/assets\/favicon-32x32\.png["'][^>]*>/i, `${rel} missing favicon-32x32.png link`);
    assert.match(content, /<link[^>]+href=["']\/assets\/favicon-16x16\.png["'][^>]*>/i, `${rel} missing favicon-16x16.png link`);
    assert.match(content, /<link[^>]+href=["']\/favicon\.ico["'][^>]*>/i, `${rel} missing favicon.ico link`);
    assert.match(content, /<link[^>]+href=["']\/assets\/apple-touch-icon\.png["'][^>]*>/i, `${rel} missing apple-touch-icon.png link`);
  }
});

test('PaymentReturnAPIView HTML head declares the complete favicon suite', () => {
  const viewsPath = path.join(repoRoot, 'metrodrip_backend', 'orders', 'views.py');
  const content = fs.readFileSync(viewsPath, 'utf8');

  assert.match(content, /\/assets\/favicon\.svg/, 'PaymentReturnAPIView missing favicon.svg');
  assert.match(content, /\/assets\/favicon-32x32\.png/, 'PaymentReturnAPIView missing favicon-32x32.png');
  assert.match(content, /\/assets\/favicon-16x16\.png/, 'PaymentReturnAPIView missing favicon-16x16.png');
  assert.match(content, /\/favicon\.ico/, 'PaymentReturnAPIView missing favicon.ico');
  assert.match(content, /\/assets\/apple-touch-icon\.png/, 'PaymentReturnAPIView missing apple-touch-icon.png');
});

test('dev_server.py routes /favicon.ico to assets/favicon.ico and /favicon.svg to assets/favicon.svg', () => {
  const devServerPath = path.join(repoRoot, 'web', 'dev_server.py');
  const content = fs.readFileSync(devServerPath, 'utf8');

  assert.match(content, /clean_path == '\/favicon\.ico':\s+path = '\/assets\/favicon\.ico'/);
  assert.match(content, /clean_path in \('\/favicon\.svg',\):\s+path = '\/assets\/favicon\.svg'/);
});

