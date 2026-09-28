import './helpers/loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const { createServerConfirmation, validateConfirmationRoute } = await import(
  '../../mobile/Checkout/src/data/orderConfirmation.js'
);

const validOrder = {
  id: 42,
  order_no: 'MD-2026-00042',
  status: 'placed',
  subtotal: '1499.00',
  shipping: '100.00',
  total: '1599.00',
  payment_method: 'gcash',
  payment_status: 'paid',
  created_at: '2026-09-28T12:00:00Z',
  shipping_address: {
    name: 'Juan Dela Cruz',
    address_line1: '21 Maginhawa Street',
    address_line2: '',
    city: 'Quezon City',
    state: 'Metro Manila',
    postal_code: '1101',
    country: 'PH',
    phone: '09170000000',
  },
  items: [
    {
      product_name: 'Metro Core Tee',
      variant_ref: 7,
      sku: 'TEE-BLK-M',
      variant_desc: 'BLACK · M',
      quantity: 1,
      unit_price: '1499.00',
      total_price: '1499.00',
    },
  ],
};

test('a paid server order becomes a validated confirmation without client-priced fields', () => {
  const confirmation = createServerConfirmation(validOrder);
  assert.equal(confirmation.total, 1599);
  assert.equal(confirmation.paymentMethod, 'gcash');
  assert.equal(confirmation.paymentStatus, 'paid');
  assert.equal(confirmation.items[0].name, 'Metro Core Tee');
  assert.equal(confirmation.items[0].totalPrice, 1499);
  assert.equal(confirmation.shippingAddress.city, 'Quezon City');
  assert.equal(validateConfirmationRoute(confirmation), confirmation);
});

test('legacy response aliases remain accepted during the additive API migration', () => {
  const confirmation = createServerConfirmation({
    ...validOrder,
    order_no: undefined,
    order_number: validOrder.order_no,
    shipping: undefined,
    shipping_fee: validOrder.shipping,
    total: undefined,
    total_amount: validOrder.total,
  });
  assert.equal(confirmation.refNo, validOrder.order_no);
  assert.equal(confirmation.shipping, 100);
  assert.equal(confirmation.total, 1599);
});

test('unpaid online orders and incomplete server data never render as confirmed', () => {
  assert.equal(
    createServerConfirmation({ ...validOrder, payment_status: 'awaiting_payment' }),
    null,
  );
  assert.equal(
    createServerConfirmation({ ...validOrder, shipping_address: null }),
    null,
  );
  assert.equal(
    createServerConfirmation({ ...validOrder, items: [{ ...validOrder.items[0], unit_price: 'NaN' }] }),
    null,
  );
});

test('a late paid order is labeled for review instead of falsely claiming fulfillment', () => {
  const confirmation = createServerConfirmation({ ...validOrder, status: 'payment_review' });
  assert.equal(confirmation.orderStatus, 'payment_review');
  assert.equal(validateConfirmationRoute(confirmation), confirmation);
});
