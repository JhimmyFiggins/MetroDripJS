// Contract tests for the POST /api/orders/checkout/ body.
//
// Asserted against the ACTIVE deployment, not the legacy monolith:
//   services/orders/orders/views.py  OrdersListCreateAPIView.post
//   services/orders/orders/saga.py    execute_cod_checkout_saga
//   services/catalog/catalog/views.py CatalogQuoteAPIView.post
//
// The saga prices from catalog, so the client must send no money, no status and
// no product FK, and must never let a fractional or non-positive quantity
// through as something catalog would silently mis-price.
import './helpers/loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const { buildOrderPayload, buildOrderItems, splitShippingAddress, buildIdempotencyKey, CheckoutPayloadError } =
  await import('../../mobile/Checkout/src/data/buildOrderPayload.js');

const cartItem = {
  id: '7-Black-M-Regular',
  variantId: 42,
  name: 'Drip Zip-Up Hoodie',
  price: 1249,
  quantity: 1,
};

const draft = {
  fullName: 'Juan R. Dela Cruz',
  mobile: '0917 555 0143',
  email: 'juan@email.com',
  address: 'Unit 4B, 21 Maginhawa St., Teachers Village',
  city: 'Quezon City',
  zone: 'Metro Manila (NCR)',
  items: [cartItem],
};

test('the body carries exactly the keys the orders service reads', () => {
  assert.deepEqual(Object.keys(buildOrderPayload(draft)).sort(), [
    'delivery_zone',
    'idempotency_key',
    'items',
    'payment_method',
    'shipping_address',
  ]);
});

test('no client money, status or product FK is sent', () => {
  const body = buildOrderPayload({ ...draft, total: 1, subtotal: 1, status: 'paid' });
  for (const key of ['subtotal', 'shipping', 'discount', 'total', 'tax', 'status', 'customer_id', 'currency', 'lines']) {
    assert.equal(key in body, false, `body must not contain "${key}"; the saga prices authoritatively`);
  }
  const wire = JSON.parse(JSON.stringify(body));
  assert.doesNotMatch(JSON.stringify(wire), /unit_price|"price"/);
});

test('items use variant_id and quantity, which is what views.py forwards to catalog', () => {
  const { items } = buildOrderPayload(draft);
  assert.deepEqual(items, [{ variant_id: 42, quantity: 1 }]);
  assert.equal('product' in items[0], false);
  assert.equal('variant' in items[0], false);
});

test('a cart row with only a product id and no variant is rejected', () => {
  // ProductDetails.jsx builds rows from the catalog product, so the variant link
  // is the piece that decides whether an order can be placed at all.
  const noVariant = { ...draft, items: [{ id: '7-Black-M', productId: 7, name: 'Drip Zip-Up Hoodie', price: 1249, quantity: 1 }] };
  assert.throws(() => buildOrderPayload(noVariant), (err) => {
    assert.ok(err instanceof CheckoutPayloadError);
    assert.match(err.message, /Drip Zip-Up Hoodie/);
    return true;
  });
});

test('the cart row id is never used as a variant id', () => {
  assert.throws(() => buildOrderItems([{ id: '42', name: 'x', quantity: 1 }]), /not linked to a specific product variant/);
});

test('payment_method is COD, the only value orders accepts', () => {
  assert.equal(buildOrderPayload(draft).payment_method, 'COD');
});

test('delivery_zone comes from the selected zone', () => {
  assert.equal(buildOrderPayload(draft).delivery_zone, 'Metro Manila (NCR)');
  assert.equal(buildOrderPayload({ ...draft, zone: 'Mindanao' }).delivery_zone, 'Mindanao');
  assert.throws(() => buildOrderPayload({ ...draft, zone: '   ' }), /delivery zone/i);
});

test('the shipping address uses the entered city and region', () => {
  const other = buildOrderPayload({ ...draft, address: '12 Katipunan Ave', city: 'Davao City', zone: 'Mindanao' });
  assert.equal(other.shipping_address.city, 'Davao City');
  assert.equal(other.shipping_address.state, 'Mindanao');
  assert.equal(other.shipping_address.address_line1, '12 Katipunan Ave');
  assert.notEqual(other.shipping_address.city, 'Quezon City');
});

test('a combined "address, city, zone" string is split into discrete fields', () => {
  const split = splitShippingAddress({ address: '12 Katipunan Ave, Davao City, Mindanao' });
  assert.equal(split.address_line1, '12 Katipunan Ave');
  assert.equal(split.city, 'Davao City');
  assert.equal(split.state, 'Mindanao');
});

test('a redundant city and region tail is not duplicated into address_line1', () => {
  const split = splitShippingAddress({
    address: 'Unit 4B, 21 Maginhawa St., Teachers Village, Quezon City, Metro Manila (NCR)',
    city: 'Quezon City',
    zone: 'Metro Manila (NCR)',
  });
  assert.equal(split.address_line1, 'Unit 4B, 21 Maginhawa St., Teachers Village');
  assert.equal(split.city, 'Quezon City');
  assert.equal(split.state, 'Metro Manila (NCR)');
});

test('missing required address parts are named in the error, not sent as blanks', () => {
  assert.throws(() => buildOrderPayload({ ...draft, city: '', zone: '' }), /city|region/i);
  assert.throws(() => buildOrderPayload({ ...draft, fullName: '   ' }), /recipient name/i);
  assert.throws(() => buildOrderPayload({ ...draft, mobile: '' }), /mobile number/i);
  assert.throws(() => buildOrderPayload({ ...draft, address: '' }), /delivery address/i);
});

test('address_line2 and postal_code are empty strings, never null, because the model is not nullable there', () => {
  const body = buildOrderPayload(draft);
  assert.equal(body.shipping_address.address_line2, '');
  assert.equal(body.shipping_address.postal_code, '');
  const wire = JSON.parse(JSON.stringify(body));
  assert.equal(wire.shipping_address.address_line2, '');
});

// --- quantity and variant id strictness -------------------------------------
// catalog CatalogQuoteAPIView returns 400 "Invalid quantity" for qty <= 0 and
// would otherwise accept a float and price it as a truncated count.

test('a zero, negative or fractional quantity is rejected, never truncated or defaulted', () => {
  for (const quantity of [0, -1, 1.5, '1.5', 'abc', NaN, Infinity, null, true, '']) {
    assert.throws(
      () => buildOrderItems([{ ...cartItem, quantity }]),
      /invalid quantity/i,
      `quantity ${String(quantity)} must be rejected`
    );
  }
});

test('a numeric string quantity is accepted because JSON payloads carry strings', () => {
  assert.deepEqual(buildOrderItems([{ ...cartItem, quantity: '3' }]), [{ variant_id: 42, quantity: 3 }]);
});

test('a zero, negative or fractional variant id is rejected', () => {
  for (const variantId of [0, -5, 2.7, '2.7', 'x', null, undefined, false, '']) {
    assert.throws(
      () => buildOrderItems([{ ...cartItem, variantId }]),
      /not linked to a specific product variant/,
      `variantId ${String(variantId)} must be rejected`
    );
  }
});

test('an invalid line fails the whole payload before any request is spent', () => {
  assert.throws(() => buildOrderPayload({ ...draft, items: [cartItem, { ...cartItem, variantId: 9, quantity: 0 }] }), /invalid quantity/i);
});

test('an empty cart is rejected with an actionable message', () => {
  assert.throws(() => buildOrderPayload({ ...draft, items: [] }), /cart is empty/i);
  assert.throws(() => buildOrderPayload({ ...draft, items: undefined }), /cart is empty/i);
});

// --- idempotency -------------------------------------------------------------

test('the idempotency key is stable across retries of the same draft', () => {
  const a = buildOrderPayload(draft);
  const b = buildOrderPayload(draft);
  assert.equal(a.idempotency_key, b.idempotency_key);
  assert.ok(a.idempotency_key.length > 0);
});

test('the key ignores the display-only draft fields the saga never reads', () => {
  const attempt = { ...draft };
  const base = buildOrderPayload(attempt).idempotency_key;
  Object.assign(attempt, { orderId: 'display', total: 99999, email: 'qa@example.invalid' });
  assert.equal(buildOrderPayload(attempt).idempotency_key, base);
});

test('separate purchases of an identical cart do not replay a previous order', () => {
  assert.notEqual(buildOrderPayload({ ...draft }).idempotency_key, buildOrderPayload({ ...draft }).idempotency_key);
});

test('a changed quantity, item, or address produces a different key', () => {
  const base = buildOrderPayload(draft).idempotency_key;
  const items = buildOrderItems(draft.items);

  assert.notEqual(buildOrderPayload({ ...draft, items: [{ ...cartItem, quantity: 2 }] }).idempotency_key, base);
  assert.notEqual(buildOrderPayload({ ...draft, items: [{ ...cartItem, variantId: 43 }] }).idempotency_key, base);
  assert.notEqual(buildOrderPayload({ ...draft, mobile: '0917 000 0000' }).idempotency_key, base);
  assert.notEqual(buildOrderPayload({ ...draft, address: '9 Kalachuchi St' }).idempotency_key, base);
  assert.notEqual(buildOrderPayload({ ...draft, zone: 'Visayas' }).idempotency_key, base);
  assert.equal(buildIdempotencyKey(draft, items), base);
});

test('the key is a plain string the gateway forwards untouched', () => {
  const key = buildOrderPayload(draft).idempotency_key;
  assert.equal(typeof key, 'string');
  assert.match(key, /^[A-Za-z0-9._~-]+$/, 'must be a valid HTTP header value');
  assert.ok(key.length <= 64);
});
