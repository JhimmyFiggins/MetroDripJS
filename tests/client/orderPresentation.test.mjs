import './helpers/loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const {
  classifyOrderError,
  extractOrders,
  formatKnownDate,
  formatKnownTimestamp,
  formatOrderMoney,
  formatOrderNumber,
  fulfillmentBadge,
  orderItemCount,
  paymentBadge,
  trackingEvents,
  trackingHeadline,
  trackingItems,
  trackingOrderNumber,
} = await import('../../mobile/Orders/orderPresentation.js');

test('order collections accept the active array response and safe paginated variants', () => {
  const rows = [{ id: 1 }];
  assert.equal(extractOrders(rows), rows);
  assert.equal(extractOrders({ results: rows }), rows);
  assert.equal(extractOrders({ orders: rows }), rows);
  assert.deepEqual(extractOrders(null), []);
});

test('history counts the active items key and never falls back to legacy lines', () => {
  assert.equal(orderItemCount({ items: [{ quantity: 2 }, { quantity: 1 }] }), 3);
  assert.equal(orderItemCount({ items: [{ quantity: 0 }, { quantity: 'bad' }] }), 0);
  assert.equal(orderItemCount({ lines: [{ quantity: 99 }] }), 0);
});

test('order labels use server references and honest fallbacks', () => {
  assert.equal(formatOrderNumber({ id: 7, order_no: 'MD-2026-00007' }), 'MD-2026-00007');
  assert.equal(formatOrderNumber({ id: 7 }), 'Order #7');
  assert.equal(formatOrderNumber({}), 'Order reference unavailable');
  assert.equal(formatOrderMoney('not-money'), 'Total unavailable');
  assert.match(formatOrderMoney('1234.50', 'PHP'), /1,234\.50/);
  assert.equal(formatKnownDate(null), 'Date unavailable');
});

test('payment and fulfillment badges do not collapse distinct states', () => {
  assert.deepEqual(paymentBadge({ payment_status: 'pending_collection' }), {
    label: 'Pay on delivery',
    tone: 'neutral',
  });
  assert.deepEqual(paymentBadge({ payment_status: 'awaiting_payment' }), {
    label: 'Payment pending',
    tone: 'attention',
  });
  assert.deepEqual(paymentBadge({ payment_status: 'paid' }), {
    label: 'Paid',
    tone: 'success',
  });
  assert.deepEqual(fulfillmentBadge({ status: 'shipped' }), {
    label: 'Shipped',
    tone: 'active',
  });
  assert.deepEqual(fulfillmentBadge({ status: 'cancelled' }), {
    label: 'Cancelled',
    tone: 'danger',
  });
});

test('session, permission, not-found and offline errors use non-leaking messages', () => {
  assert.equal(classifyOrderError({ status: 401 }, 'orders').kind, 'session');
  assert.match(classifyOrderError({ status: 401 }, 'orders').message, /Sign in again/);
  assert.equal(classifyOrderError({ status: 403 }, 'tracking').kind, 'permission');
  const missing = classifyOrderError({ status: 404 }, 'tracking');
  assert.equal(missing.kind, 'not_found');
  assert.doesNotMatch(missing.message, /belongs to another|exists/i);
  assert.equal(classifyOrderError({ status: 0, message: 'Network request failed' }, 'tracking').kind, 'offline');
});

test('tracking presentation never invents order years or missing timestamps', () => {
  assert.equal(trackingOrderNumber({ order: { number: 'MD-2026-00012' } }, 12), 'MD-2026-00012');
  assert.equal(trackingOrderNumber({ order: { id: 12 } }, 12), 'Order #12');
  assert.equal(formatKnownTimestamp(null), null);
  assert.equal(formatKnownTimestamp('not-a-date'), null);

  const events = trackingEvents({
    events: [
      { key: 'placed', title: 'Order placed', state: 'done', timestamp: null },
      { key: 'shipped', title: 'Shipped', state: 'pending', timestamp: 'invalid' },
    ],
  });
  assert.deepEqual(events.map((event) => event.timestamp), [null, null]);
});

test('tracking uses supplied shipment/status data and active item keys only', () => {
  assert.equal(trackingHeadline({ shipment: { eta_label: 'Delivered' } }), 'Delivered');
  assert.equal(trackingHeadline({ order: { status: 'packed' } }), 'Packed');
  assert.deepEqual(trackingItems({ order: { items: [{ name: 'Tee', quantity: 1 }] } }), [
    { name: 'Tee', quantity: 1 },
  ]);
  assert.deepEqual(trackingItems({ order: { lines: [{ name: 'Legacy', quantity: 1 }] } }), []);
});

