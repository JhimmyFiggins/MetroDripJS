// Regressions for the cart arithmetic that feeds the create-order payload.
// Before the fix, `Math.min(n, item.stock)` against a missing `stock` produced
// NaN, which serialized to `null` and made DRF reject every order line.
import './helpers/loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const { clampQuantity, cartSubtotal, cartTotals, FLAT_SHIPPING_FEE } = await import(
  '../../mobile/context/cartLogic.js'
);

const noStock = { id: '1', price: 1249, quantity: 1 }; // exactly what ProductDetails.jsx adds
const withStock = { id: '2', price: 899, quantity: 2, stock: 3 };

test('increment works when the line carries no stock figure', () => {
  const next = clampQuantity(noStock, 1);
  assert.equal(next, 2);
  assert.ok(Number.isFinite(next), 'quantity must never become NaN');
});

test('decrement stops at 1 instead of going negative or NaN', () => {
  assert.equal(clampQuantity(noStock, -1), 1);
  assert.equal(clampQuantity({ ...noStock, quantity: 3 }, -10), 1);
});

test('increment is capped by a reported stock level', () => {
  assert.equal(clampQuantity(withStock, 1), 3);
  assert.equal(clampQuantity(withStock, 5), 3);
});

test('a corrupt stored quantity is repaired instead of propagating NaN', () => {
  // NaN/null repair to 1 first, so the subsequent +1 is the first real increment.
  assert.equal(clampQuantity({ ...noStock, quantity: NaN }, 1), 2);
  assert.equal(clampQuantity({ ...noStock, quantity: null }, 1), 2);
  assert.equal(clampQuantity({ ...noStock, quantity: '3' }, 1), 4);
});

test('a missing or non-numeric amount argument is a no-op', () => {
  assert.equal(clampQuantity(noStock, undefined), 1);
  assert.equal(clampQuantity(noStock, NaN), 1);
  assert.equal(clampQuantity(undefined, 5), 1);
});

test('the whole quantity-change cycle stays finite and JSON-serializable', () => {
  let line = { ...noStock };
  for (let i = 0; i < 5; i += 1) line = { ...line, quantity: clampQuantity(line, 1) };
  for (let i = 0; i < 5; i += 1) line = { ...line, quantity: clampQuantity(line, -1) };

  assert.equal(line.quantity, 1);
  // The exact failure mode: JSON.stringify turns NaN into null, and DRF's
  // PositiveIntegerField then answers 400 for the whole order.
  const encoded = JSON.parse(JSON.stringify({ quantity: line.quantity }));
  assert.equal(encoded.quantity, 1);
  assert.notEqual(encoded.quantity, null);
});

test('subtotal ignores malformed lines rather than returning NaN', () => {
  assert.equal(cartSubtotal([]), 0);
  assert.equal(cartSubtotal(undefined), 0);
  assert.equal(cartSubtotal([{ price: 100, quantity: 2 }, { price: 'x', quantity: NaN }]), 200);
});

test('totals add flat shipping only for a non-empty cart', () => {
  assert.deepEqual(cartTotals([]), { subtotal: 0, shipping: 0, discount: 0, total: 0 });
  assert.deepEqual(cartTotals([{ price: 1249, quantity: 1 }]), {
    subtotal: 1249,
    shipping: FLAT_SHIPPING_FEE,
    discount: 0,
    total: 1249 + FLAT_SHIPPING_FEE,
  });
});

test('a discount can never exceed the subtotal and drive the total negative', () => {
  const totals = cartTotals([{ price: 100, quantity: 1 }], { discount: 500 });
  assert.equal(totals.discount, 100);
  assert.equal(totals.total, 150);
  assert.ok(totals.total >= 0);
});

test('a NaN quantity from any source cannot zero out the displayed total', () => {
  const totals = cartTotals([{ price: 1249, quantity: NaN }]);
  assert.equal(totals.subtotal, 1249);
  assert.equal(totals.shipping, FLAT_SHIPPING_FEE);
});
