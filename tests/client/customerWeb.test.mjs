import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCheckoutPayload,
  normalizeCapabilities,
  normalizeCart,
  parseCustomerPath,
  safeCustomerPath,
  toCentavos,
  trustedCheckoutUrl,
  usableImageUrl,
  variantLabel,
} from '../../web/customer/contracts.js';

test('customer routes stay namespaced and reject unsafe next paths', () => {
  assert.equal(parseCustomerPath('/customer/products/15').name, 'product');
  assert.equal(parseCustomerPath('/customer/products/15').id, '15');
  assert.equal(parseCustomerPath('/products/15').name, 'outside');
  assert.equal(parseCustomerPath('/customer/nope').name, 'not-found');
  assert.equal(safeCustomerPath('https://evil.example/customer/cart'), '/customer/');
  assert.equal(safeCustomerPath('/customer/orders/4'), '/customer/orders/4');
});

test('payment redirects accept only the PayMongo hosted checkout origin', () => {
  assert.equal(trustedCheckoutUrl('https://checkout.paymongo.com/cs_test'), true);
  assert.equal(trustedCheckoutUrl('http://checkout.paymongo.com/cs_test'), false);
  assert.equal(trustedCheckoutUrl('https://checkout.paymongo.com.evil.example/cs_test'), false);
  assert.equal(trustedCheckoutUrl('https://attacker@checkout.paymongo.com/cs_test'), false);
});

test('capabilities fail closed when a hosted rail is not explicitly available', () => {
  const options = normalizeCapabilities({
    methods: [
      { id: 'cod', available: true, type: 'offline' },
      { id: 'gcash', available: false, type: 'hosted', unavailable_code: 'method_not_enabled' },
    ],
  });
  assert.equal(options.find((option) => option.id === 'cod').enabled, true);
  assert.equal(options.find((option) => option.id === 'gcash').enabled, false);
  assert.equal(options.find((option) => option.id === 'card').enabled, false);
});

test('cart drafts keep only bounded variant lines and expire', () => {
  const now = 1_000;
  assert.deepEqual(normalizeCart({
    expires_at: now + 10,
    lines: [
      { variant_id: 4, quantity: 2, name: 'Tee' },
      { variant_id: 4, quantity: 1, name: 'Duplicate' },
      { variant_id: 0, quantity: 1 },
      { variant_id: 9, quantity: 9 },
    ],
  }, now).map((line) => line.variant_id), [4]);
  assert.deepEqual(normalizeCart({ expires_at: now, lines: [{ variant_id: 4, quantity: 1 }] }, now), []);
});

test('checkout payload excludes client prices and rejects incomplete delivery', () => {
  const payload = buildCheckoutPayload({
    lines: [{ variant_id: 8, quantity: 1 }],
    address: {
      name: 'A Buyer',
      address_line1: '12 Street',
      city: 'Quezon City',
      state: 'NCR',
      phone: '09170000000',
    },
    zoneName: 'NCR (Metro Manila)',
    method: 'cod',
    idempotencyKey: 'web-abcdef12',
  });
  assert.equal(payload.payment_method, 'cod');
  assert.equal('total' in payload, false);
  assert.equal('price' in payload.items[0], false);
  assert.throws(() => buildCheckoutPayload({
    lines: [{ variant_id: 8, quantity: 1 }],
    address: { name: 'A Buyer' },
    zoneName: 'NCR (Metro Manila)',
    method: 'cod',
    idempotencyKey: 'web-abcdef12',
  }));
});

test('variant labels and images do not invent missing attributes or Figma hosts', () => {
  assert.equal(variantLabel({ id: 3, sku: 'SKU-3', attributes: {} }), 'SKU SKU-3');
  assert.equal(variantLabel({ id: 3, attributes: { size: 'L', color: 'Ink' }, color_name: 'Ink' }), 'Ink · size: L · color: Ink');
  assert.equal(usableImageUrl('https://www.figma.com/file/temp.png'), '');
  assert.equal(usableImageUrl('/assets/favicon.svg'), '/assets/favicon.svg');
  assert.equal(toCentavos('85.00'), 8500);
  assert.equal(toCentavos('85.009'), null);
});
