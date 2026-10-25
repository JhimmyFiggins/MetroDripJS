import './helpers/loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const {
  findExactVariant,
  initialVariantSelection,
  selectPurchasableStock,
} = await import('../../mobile/Products/productVariantLogic.js');
const productDetails = fs.readFileSync(
  new URL('../../mobile/Products/ProductDetails.jsx', import.meta.url),
  'utf8',
);

const variants = [
  { id: 11, color_name: 'Black', attributes: { size: 'M', fit: 'Regular' } },
  { id: 12, color_name: 'Black', attributes: { size: 'L', fit: 'Oversized' } },
];

test('variant selection resolves the exact canonical SKU', () => {
  assert.equal(findExactVariant(variants, { color: 'black', size: 'M', fit: 'Regular' }).id, 11);
  assert.equal(findExactVariant(variants, { color: 'Black', size: 'L', fit: 'Oversized' }).id, 12);
  assert.equal(findExactVariant(variants, { color: 'Black', size: 'M', fit: 'Oversized' }), null);
});

test('initial selection comes from the same first variant used as the default', () => {
  assert.deepEqual(initialVariantSelection(variants), {
    color: 'Black',
    size: 'M',
    fit: 'Regular',
  });
});

test('stock selection rejects mismatched rows and chooses the fullest exact row', () => {
  const rows = [
    { variant: 99, available_stock: 500 },
    { variant: 11, available_stock: 3 },
    { variant: 11, available_stock: 7, max_order_quantity: 5 },
  ];
  assert.deepEqual(selectPurchasableStock(rows, 11), rows[2]);
  assert.equal(selectPurchasableStock(rows, 12), null);
});

test('product detail ignores stock responses after the requested variant changes', () => {
  assert.match(productDetails, /const requestedVariantId = selectedVariant\?\.id/);
  assert.match(productDetails, /if \(cancelled\) return;[\s\S]*selectPurchasableStock\(data, requestedVariantId\)/);
  assert.match(productDetails, /return \(\) => \{\s*cancelled = true;/);
  assert.match(productDetails, /Number\(stock\?\.variant\) === Number\(selectedVariant\.id\)/);
  assert.match(productDetails, /if \(!stockMatchesSelectedVariant\)/);
});
