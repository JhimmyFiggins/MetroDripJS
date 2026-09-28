// Endpoint contract tests: every service module must hit the path, method and
// body shape the ACTIVE deployment declares. A silent drift here is the
// difference between a working screen and a 404/405 in QA.
//
// Reference sources:
//   services/orders/orders/urls.py       /api/orders/checkout/, /api/orders/<pk>/
//   services/orders/orders/views.py      OrdersListCreateAPIView
//   services/identity/identity/urls.py   /login/ /signup/ /profile/
import './helpers/loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { installFetch, sentBody, headerOf } from './helpers/fetchRecorder.mjs';

const { setAuthToken, clearCustomer, BASE_URL } = await import('../../src/services/apiClient.js');
const auth = await import('../../src/services/authService.js');
const orders = await import('../../src/services/orderService.js');
const { productService } = await import('../../src/services/productService.js');
const wishlist = await import('../../src/services/wishlistService.js');
const notifications = await import('../../src/services/notificationService.js');

let fetch;

test.beforeEach(() => {
  clearCustomer();
  setAuthToken('tok-test');
  fetch = installFetch().reply({ ok: true });
});

const pathOf = (call) => call.url.slice(BASE_URL.length);
const methodOf = (call) => call.init.method || 'GET';

test('login posts credentials to /login/ without an identity header', async () => {
  await auth.login('juan@email.com', 'hunter22');
  assert.equal(pathOf(fetch.last), '/login/');
  assert.equal(methodOf(fetch.last), 'POST');
  assert.deepEqual(sentBody(fetch.last), { email: 'juan@email.com', password: 'hunter22' });
  assert.equal(headerOf(fetch.last, 'Authorization'), undefined);
});

test('login trims nothing itself — the screen owns that, so a stray space is visible', async () => {
  await auth.login(' juan@email.com ', 'hunter22');
  assert.equal(sentBody(fetch.last).email, ' juan@email.com ');
});

test('signup posts name, email and password to /signup/ without an identity header', async () => {
  await auth.signup({ name: 'Bea', email: 'bea@email.com', password: 'hunter22' });
  assert.equal(pathOf(fetch.last), '/signup/');
  assert.equal(headerOf(fetch.last, 'Authorization'), undefined);
});

test('forgot-password posts the email to /forgot-password/', async () => {
  await auth.forgotPassword('juan@email.com');
  assert.equal(pathOf(fetch.last), '/forgot-password/');
  assert.equal(methodOf(fetch.last), 'POST');
  assert.deepEqual(sentBody(fetch.last), { email: 'juan@email.com' });
});

test('profile reads and updates are both scoped to /profile/', async () => {
  await auth.getProfile();
  assert.equal(pathOf(fetch.last), '/profile/');
  assert.equal(methodOf(fetch.last), 'GET');

  await auth.updateProfile({ phone: '0917 555 0143' });
  assert.equal(pathOf(fetch.last), '/profile/');
  assert.equal(methodOf(fetch.last), 'PUT');
  assert.equal(headerOf(fetch.last, 'Authorization'), 'Bearer tok-test');
});

test('order reads use the trailing-slash routes the service declares', async () => {
  await orders.getOrders();
  assert.equal(pathOf(fetch.last), '/orders/');

  await orders.getOrder(12);
  assert.equal(pathOf(fetch.last), '/orders/12/');

  await orders.getOrderTracking(12);
  assert.equal(pathOf(fetch.last), '/orders/12/tracking/');
});

test('createOrder posts to the saga checkout route, not the legacy orders collection', async () => {
  // services/orders/orders/urls.py: api/orders/checkout/ -> OrdersListCreateAPIView.post
  const payload = { items: [{ variant_id: 42, quantity: 1 }] };
  await orders.createOrder(payload);
  assert.equal(pathOf(fetch.last), '/api/orders/checkout/');
  assert.equal(methodOf(fetch.last), 'POST');
  assert.deepEqual(sentBody(fetch.last), payload);
});

test('createOrder forwards the caller body untouched so the builder stays in charge', async () => {
  // No client-side massaging here: re-deriving totals would duplicate the saga's
  // authoritative pricing and let the two disagree.
  const payload = {
    items: [{ variant_id: 42, quantity: 2 }],
    delivery_zone: 'Metro Manila (NCR)',
    payment_method: 'COD',
    idempotency_key: 'md-abc',
    shipping_address: { name: 'Juan R. Dela Cruz' },
  };
  await orders.createOrder(payload);
  assert.deepEqual(sentBody(fetch.last), payload);
});

test('the client never puts customer_id in the checkout body; the token identifies the caller', async () => {
  await orders.createOrder({ items: [{ variant_id: 1, quantity: 1 }] });
  assert.equal('customer_id' in sentBody(fetch.last), false);
  assert.equal(headerOf(fetch.last, 'X-Customer-ID'), undefined);
  assert.equal(headerOf(fetch.last, 'Authorization'), 'Bearer tok-test');
});

test('product listing builds a filtered, encoded query string', async () => {
  await productService.getAllProducts();
  assert.equal(pathOf(fetch.last), '/products/');

  await productService.getAllProducts({ search: 'hoodie', size: 'L', sort: 'price_asc' });
  assert.equal(pathOf(fetch.last), '/products/?search=hoodie&size=L&sort=price_asc');
});

test('product filters are encoded and empty values are dropped', async () => {
  await productService.getAllProducts({ search: 'black & white', category: '', size: null });
  assert.equal(pathOf(fetch.last), '/products/?search=black%20%26%20white');
});

test('an unknown filter key is ignored rather than forwarded to the server', async () => {
  await productService.getAllProducts({ sort: 'newest', admin: 'true' });
  assert.equal(pathOf(fetch.last), '/products/?sort=newest');
});

test('wishlist writes use product_ref, which is what the backend serializer reads', async () => {
  await wishlist.addToWishlist(7);
  assert.equal(pathOf(fetch.last), '/wishlist/');
  assert.equal(methodOf(fetch.last), 'POST');
  assert.deepEqual(sentBody(fetch.last), { product_ref: 7 });
});

test('wishlist removal targets /wishlist/ because no /<id>/ route exists', async () => {
  await wishlist.removeFromWishlist(7);
  assert.equal(pathOf(fetch.last), '/wishlist/');
  assert.equal(methodOf(fetch.last), 'DELETE');
  assert.deepEqual(sentBody(fetch.last), { product_ref: 7 });
});

test('notification read receipts post to the per-item and bulk routes', async () => {
  await notifications.markRead(5);
  assert.equal(pathOf(fetch.last), '/notifications/5/read/');
  assert.equal(methodOf(fetch.last), 'POST');

  await notifications.markAllRead();
  assert.equal(pathOf(fetch.last), '/notifications/read-all/');
  assert.equal(methodOf(fetch.last), 'POST');
});

test('the unread count degrades to 0 instead of NaN on a partial response', async () => {
  installFetch().reply({ results: [] });
  assert.equal(await notifications.getUnreadCount(), 0);

  installFetch().reply({ unread_count: 4, results: [] });
  assert.equal(await notifications.getUnreadCount(), 4);
});

test('a 404 order surfaces the service message, not a generic failure', async () => {
  installFetch().reply({ error: 'Order not found.' }, 404);
  await assert.rejects(orders.getOrder(999), (err) => {
    assert.equal(err.status, 404);
    assert.equal(err.message, 'Order not found.');
    return true;
  });
});

test('an unauthenticated checkout 401 keeps the service wording for the login prompt', async () => {
  installFetch().reply({ error: 'Authentication required.' }, 401);
  await assert.rejects(orders.createOrder({ items: [] }), (err) => {
    assert.equal(err.status, 401);
    assert.equal(err.message, 'Authentication required.');
    return true;
  });
});

test('every authenticated service call carries the bearer token', async () => {
  for (const call of [
    () => orders.getOrders(),
    () => orders.getOrder(1),
    () => orders.getOrderTracking(1),
    () => orders.createOrder({ items: [{ variant_id: 1, quantity: 1 }] }),
    () => auth.getProfile(),
    () => wishlist.getWishlist(),
    () => notifications.getNotifications(),
    () => productService.getAllProducts(),
  ]) {
    await call();
    assert.equal(headerOf(fetch.last, 'Authorization'), 'Bearer tok-test', `missing token on ${pathOf(fetch.last)}`);
    assert.equal(headerOf(fetch.last, 'X-Customer-ID'), undefined, `spoofable header on ${pathOf(fetch.last)}`);
  }
});

test('after logout no request carries a stale token', async () => {
  clearCustomer();
  await orders.getOrders();
  assert.equal(headerOf(fetch.last, 'Authorization'), undefined);
  assert.equal(headerOf(fetch.last, 'X-Customer-ID'), undefined);
});

// Guards against a service module being added without a smoke-level assertion.
test('every service module under src/services is covered by this file', async () => {
  const { readdir } = await import('node:fs/promises');
  const files = await readdir(new URL('../../src/services/', import.meta.url));
  const covered = new Set([
    'apiClient.js', 'authService.js', 'orderService.js', 'productService.js',
    'wishlistService.js', 'notificationService.js', 'categoryService.js',
  ]);
  const missing = files.filter((f) => f.endsWith('.js') && !covered.has(f));
  assert.deepEqual(missing, [], `uncovered service modules: ${missing.join(', ')}`);
});
