import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relativePath) =>
  fs.readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

const history = read('mobile/Orders/OrderHistory.jsx');
const tracking = read('mobile/Orders/OrderTracking.jsx');
const navigation = read('mobile/navigation/AppNavigator.jsx');

test('order history exposes loading, empty, error, stale-data and default states', () => {
  assert.match(history, /function LoadingState/);
  assert.match(history, /No orders yet/);
  assert.match(history, /function StateCard/);
  assert.match(history, /refreshError/);
  assert.match(history, /orders\.map\(renderOrder\)/);
  assert.match(history, /loadOrders\(\{ preserveData: true \}\)/);
});

test('history uses active server items and separate payment/fulfillment badges', () => {
  assert.match(history, /orderItemCount\(order\)/);
  assert.match(history, /paymentBadge\(order\)/);
  assert.match(history, /fulfillmentBadge\(order\)/);
  assert.doesNotMatch(history, /order\.lines|order\?\.lines/);
});

test('history actions meet the minimum touch target and route session errors safely', () => {
  assert.match(history, /minHeight:\s*44/);
  assert.match(history, /error\?\.kind\s*===\s*'session'/);
  assert.match(history, /navigation\.navigate\('Login'\)/);
  assert.match(history, /error\?\.kind\s*===\s*'permission'/);
});

test('tracking has explicit skeleton, fatal, partial and refresh recovery states', () => {
  assert.match(tracking, /function TrackingSkeleton/);
  assert.match(tracking, /function FatalState/);
  assert.match(tracking, /refreshError/);
  assert.match(tracking, /Showing the last loaded tracking details/);
  assert.match(tracking, /loadTracking\(\{ preserveData: true \}\)/);
});

test('tracking does not fabricate order years, courier brands or expected timestamps', () => {
  assert.doesNotMatch(tracking, /MD-2026-/);
  assert.doesNotMatch(tracking, /J&T|NinjaVan|Lalamove/);
  assert.doesNotMatch(tracking, /formatExpected|Expected \$\{/);
  assert.match(tracking, /event\.timestamp\s*\|\|\s*\(done \? 'Completed' : 'Awaiting update'\)/);
  assert.match(tracking, /shipment\?\.courier/);
});

test('tracking keeps the last good response when a refresh fails', () => {
  assert.match(tracking, /trackingRef\.current\s*=\s*data/);
  assert.match(tracking, /preserveData\s*&&\s*trackingRef\.current/);
  assert.match(tracking, /setRefreshError\(safeError\)/);
});

test('order history and tracking are addressable through navigation', () => {
  assert.match(navigation, /History:\s*'orders'/);
  assert.match(navigation, /path:\s*'orders\/:orderId'/);
  assert.match(navigation, /parse:\s*\{\s*orderId:\s*normalizeOrderId\s*\}/);
});
