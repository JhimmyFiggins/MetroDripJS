import './helpers/loader.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const { productImageUrl, resolveProductImageUrl } = await import(
  `../../src/services/productImage.js?test=${Date.now()}`
);

test('API-relative product media resolves against the configured mobile API origin', () => {
  assert.equal(
    resolveProductImageUrl('/media/products/2026/10/hoodie.webp'),
    'http://127.0.0.1:8000/media/products/2026/10/hoodie.webp',
  );
});

test('absolute HTTPS storage URLs remain usable', () => {
  assert.equal(
    resolveProductImageUrl('https://cdn.example.test/products/hoodie.webp'),
    'https://cdn.example.test/products/hoodie.webp',
  );
});

test('the primary media record is used when the cached image URL is absent', () => {
  assert.equal(
    productImageUrl({
      media: [
        { url: '/media/products/back.webp', is_primary: false },
        { url: '/media/products/front.webp', is_primary: true },
      ],
    }),
    'http://127.0.0.1:8000/media/products/front.webp',
  );
});

test('invalid and unsupported image values fail closed to the local fallback', () => {
  assert.equal(resolveProductImageUrl(''), null);
  assert.equal(resolveProductImageUrl('file:///tmp/product.webp'), null);
  assert.equal(resolveProductImageUrl('javascript:alert(1)'), null);
  assert.equal(productImageUrl({ media: [] }), null);
});

test('merchant product creation reports image-upload partial failure', () => {
  const merchantSource = readFileSync(
    new URL('../../web/merchant/merchant.js', import.meta.url),
    'utf8',
  );

  assert.match(merchantSource, /if \(!uploadRes\.ok\)/);
  assert.match(merchantSource, /mediaUploadError/);
  assert.match(merchantSource, /but the image upload failed/);
  assert.doesNotMatch(merchantSource, /console\.warn\('Image upload deferred:'/);
});
