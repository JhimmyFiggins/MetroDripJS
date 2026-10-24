import assert from 'node:assert/strict';
import test from 'node:test';
import { api, ApiError, getAuthSnapshot, getAuthToken, isAuthCurrent, setAuthToken } from '../../web/customer/api.js';

import {
  buildCheckoutPayload,
  normalizeCapabilities,
  normalizeCart,
  cartFingerprint,
  parseCustomerPath,
  purchasableStock,
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
  assert.equal(parseCustomerPath('/customer/forgot-password').name, 'forgot-password');
  assert.equal(parseCustomerPath('/customer/reset-password').name, 'reset-password');
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

test('purchasable stock is the fullest warehouse, not the sum', () => {
  assert.equal(purchasableStock([{ available_stock: 0 }, { available_stock: 5 }]), 5);
  assert.equal(purchasableStock([{ available_stock: 2 }, { available_stock: 3 }]), 3);
  assert.equal(purchasableStock([]), 0);
  assert.equal(cartFingerprint([{ variant_id: 2, quantity: 1 }, { variant_id: 1, quantity: 2 }]), '1:2|2:1');
});

test('variant labels and images do not invent missing attributes or Figma hosts', () => {
  assert.equal(variantLabel({ id: 3, sku: 'SKU-3', attributes: {} }), 'SKU SKU-3');
  assert.equal(variantLabel({ id: 3, attributes: { size: 'L', color: 'Ink' }, color_name: 'Ink' }), 'Ink · size: L · color: Ink');
  assert.equal(usableImageUrl('https://www.figma.com/file/temp.png'), '');
  assert.equal(usableImageUrl('/assets/favicon.svg'), '/assets/favicon.svg');
  assert.equal(toCentavos('85.00'), 8500);
  assert.equal(toCentavos('85.009'), null);
});

function mockApi(t, fetch) {
  const location = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { configurable: true, value: { origin: 'https://shop.example' } });
  t.after(() => {
    setAuthToken(null);
    if (location) Object.defineProperty(globalThis, 'location', location);
    else delete globalThis.location;
  });
  return t.mock.method(globalThis, 'fetch', fetch);
}

test('API rejects authority, credentials, backslashes and malformed paths before fetch', async (t) => {
  const fetch = mockApi(t, () => { throw new Error('Fetch must not be called'); });
  setAuthToken('fixture-a');
  for (const path of [
    null, {}, '', 'profile/', 'https://shop.example/profile/',
    'https://user:password@shop.example/profile/', '//user:password@shop.example/profile/',
    '//shop.example/profile/', '//other.example/profile/', '///other.example/',
    '/\\other.example/', '/%5cother.example/', '/%2fother.example/',
    '/\t/other.example/', '/profile/\u0000', '/profile/#fragment', '/profile/ space',
    '/profile/%', '/profile/%GG', '/profile/%FF', '/profile/%0a',
  ]) {
    await assert.rejects(api(path), { name: 'ApiError', status: 0, message: /same-origin path/ });
  }
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(getAuthToken(), 'fixture-a');
});

test('API uses the actual origin and omits ambient credentials and redirects', async (t) => {
  const fetch = mockApi(t, async () => new Response('{"ok":true}'));
  setAuthToken('fixture-a');
  assert.deepEqual(await api('/products/?search=red%20shoe'), { ok: true });
  const [url, options] = fetch.mock.calls[0].arguments;
  assert.equal(url, 'https://shop.example/products/?search=red%20shoe');
  assert.equal(options.headers.Authorization, 'Bearer fixture-a');
  assert.equal(options.mode, 'same-origin');
  assert.equal(options.credentials, 'omit');
  assert.equal(options.redirect, 'error');
  await api('/products/', { auth: false });
  assert.equal(fetch.mock.calls[1].arguments[1].headers.Authorization, undefined);
});

test('API fails closed when no trusted page origin exists', async (t) => {
  const fetch = mockApi(t, () => { throw new Error('Fetch must not be called'); });
  globalThis.location.origin = 'null';
  await assert.rejects(api('/profile/'), { name: 'ApiError', status: 0 });
  delete globalThis.location;
  await assert.rejects(api('/profile/'), { name: 'ApiError', status: 0 });
  assert.equal(fetch.mock.callCount(), 0);
});

test('auth snapshots expire on every transition, including reuse of the same token', () => {
  setAuthToken('fixture-a');
  const first = getAuthSnapshot();
  assert.equal(Object.isFrozen(first), true);
  assert.equal(isAuthCurrent(first), true);
  setAuthToken(null);
  const signedOut = getAuthSnapshot();
  setAuthToken('fixture-a');
  assert.equal(isAuthCurrent(first), false);
  assert.equal(isAuthCurrent(signedOut), false);
  assert.equal(isAuthCurrent(getAuthSnapshot()), true);
  assert.equal(isAuthCurrent(null), false);
  setAuthToken(null);
});

test('late 401 cannot clear a newer login, including an identical-token login', async (t) => {
  let finish;
  const fetch = mockApi(t, () => new Promise((resolve) => { finish = resolve; }));
  for (const nextToken of ['fixture-b', 'fixture-a']) {
    const invalidatedA = t.mock.fn();
    const invalidatedB = t.mock.fn();
    setAuthToken('fixture-a', invalidatedA);
    const pending = assert.rejects(api('/profile/'), { name: 'ApiError', status: 401 });
    setAuthToken(null);
    setAuthToken(nextToken, invalidatedB);
    finish(new Response('{"detail":"Expired A"}', { status: 401 }));
    await pending;
    assert.equal(getAuthToken(), nextToken);
    assert.equal(invalidatedA.mock.callCount(), 0);
    assert.equal(invalidatedB.mock.callCount(), 0);
  }
  assert.equal(fetch.mock.calls[0].arguments[1].headers.Authorization, 'Bearer fixture-a');
});

test('current authenticated 401 invalidates reads and writes once', async (t) => {
  mockApi(t, async () => new Response('{"detail":"Expired"}', { status: 401 }));
  for (const method of ['GET', 'PUT', 'POST', 'DELETE']) {
    const invalidated = t.mock.fn();
    setAuthToken('fixture-a', invalidated);
    const snapshot = getAuthSnapshot();
    await assert.rejects(api('/profile/', { method }), { name: 'ApiError', status: 401 });
    assert.equal(getAuthToken(), null);
    assert.equal(isAuthCurrent(snapshot), false);
    assert.equal(invalidated.mock.callCount(), 1);
    await assert.rejects(api('/profile/', { method, authSnapshot: snapshot }), { status: 401 });
    assert.equal(invalidated.mock.callCount(), 1);
  }
});

test('403 and unauthenticated login 401 preserve the current session', async (t) => {
  mockApi(t, async (_url, options) => new Response('{}', { status: options.headers.Authorization ? 403 : 401 }));
  const invalidated = t.mock.fn();
  setAuthToken('fixture-a', invalidated);
  const snapshot = getAuthSnapshot();
  for (const method of ['GET', 'PUT', 'POST', 'DELETE']) {
    await assert.rejects(api('/profile/', { method }), { status: 403 });
  }
  await assert.rejects(api('/login/', { method: 'POST', auth: false }), { status: 401 });
  assert.equal(isAuthCurrent(snapshot), true);
  assert.equal(invalidated.mock.callCount(), 0);
});

test('captured logout revokes only the old token and cannot invalidate the new session', async (t) => {
  const fetch = mockApi(t, async () => new Response('{}', { status: 401 }));
  setAuthToken('fixture-a');
  const captured = getAuthSnapshot();
  setAuthToken(null);
  const invalidated = t.mock.fn();
  setAuthToken('fixture-b', invalidated);
  await assert.rejects(api('/logout/', { method: 'POST', authSnapshot: captured }), { status: 401 });
  assert.equal(fetch.mock.calls[0].arguments[1].headers.Authorization, 'Bearer fixture-a');
  assert.equal(getAuthToken(), 'fixture-b');
  assert.equal(invalidated.mock.callCount(), 0);
});

test('API timeout stays active through stalled response body consumption', async (t) => {
  let expire;
  const timer = {};
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => {
    assert.equal(delay, 60000);
    expire = callback;
    return timer;
  });
  const clear = t.mock.method(globalThis, 'clearTimeout', (handle) => assert.equal(handle, timer));
  mockApi(t, async (_url, { signal }) => ({
    ok: true,
    status: 200,
    text: () => new Promise((_resolve, reject) => {
      assert.equal(clear.mock.callCount(), 0, 'headers must not clear the body timeout');
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      expire();
    }),
  }));
  await assert.rejects(api('/profile/'), (error) => error instanceof ApiError && error.status === 0 && /timed out/.test(error.message));
  assert.equal(clear.mock.callCount(), 1);
});

test('body read failures become bounded API errors rather than raw stream errors', async (t) => {
  const clear = t.mock.method(globalThis, 'clearTimeout');
  mockApi(t, async () => ({ ok: true, status: 200, text: async () => { throw new TypeError('Broken stream'); } }));
  await assert.rejects(api('/profile/'), { name: 'ApiError', status: 0, message: /Network request failed/ });
  assert.equal(clear.mock.callCount(), 1);
});
