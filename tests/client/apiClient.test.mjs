// Contract tests for src/services/apiClient.js — the single place the clients
// attach identity headers, timeouts and error shapes.
//
// Identity rules come from the ACTIVE deployment, not the legacy monolith:
//   services/orders/orders/views.py _resolve_customer_id resolves the customer
//   only from an authenticated principal; a raw X-Customer-ID from an
//   unauthenticated caller is ignored, and the gateway strips the header and
//   refuses it through CORS. So the client must stop sending it entirely.
import './helpers/loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { installFetch, headerOf } from './helpers/fetchRecorder.mjs';

const { apiFetch, setAuthToken, clearCustomer, getAuthToken, BASE_URL, ApiError } =
  await import('../../src/services/apiClient.js');

test.beforeEach(() => {
  clearCustomer();
});

test('BASE_URL falls back to the platform loopback default when nothing is configured', () => {
  assert.equal(BASE_URL, 'http://127.0.0.1:8000');
});

test('authed requests send only the bearer token from module state', async () => {
  const fetch = installFetch().reply({ ok: true });
  setAuthToken('tok-abc');

  await apiFetch('/profile/');

  assert.equal(headerOf(fetch.last, 'Authorization'), 'Bearer tok-abc');
  assert.equal(fetch.last.url, `${BASE_URL}/profile/`);
  assert.equal(getAuthToken(), 'tok-abc');
});

test('no customer-id header is ever emitted', async () => {
  // The gateway strips X-Customer-ID and does not allow it through CORS, and
  // services/orders ignores it from an unauthenticated caller. Emitting it is
  // dead weight that implies an identity model the deployment does not have.
  const fetch = installFetch().reply({ ok: true });
  setAuthToken('tok-abc');

  await apiFetch('/orders/');
  await apiFetch('/api/orders/checkout/', { method: 'POST', body: { items: [] } });

  for (const record of [fetch.calls[0], fetch.calls[1]]) {
    const sent = Object.keys(record.init.headers).map((k) => k.toLowerCase());
    assert.equal(sent.includes('x-customer-id'), false, `unexpected X-Customer-ID in ${JSON.stringify(record.init.headers)}`);
    assert.equal(sent.includes('x-user-id'), false, 'X-User-ID is the mesh header and must not be forged by a client');
    assert.equal(sent.includes('x-internal-token'), false, 'X-Internal-Token is a server secret and must never be sent');
  }
});

test('a null token sends no Authorization header rather than "Bearer null"', async () => {
  const fetch = installFetch().reply({ ok: true });
  setAuthToken(null);

  await apiFetch('/profile/');

  assert.equal(headerOf(fetch.last, 'Authorization'), undefined);
});

test('auth:false omits the identity header (login/signup must not leak a stale session)', async () => {
  const fetch = installFetch().reply({ id: 1 });
  setAuthToken('stale-token');

  await apiFetch('/login/', { method: 'POST', body: { email: 'a@b.com', password: 'x' }, auth: false });

  assert.equal(headerOf(fetch.last, 'Authorization'), undefined);
});

test('clearCustomer drops the stored token', async () => {
  const fetch = installFetch().reply({ ok: true });
  setAuthToken('tok-abc');
  clearCustomer();

  await apiFetch('/profile/');

  assert.equal(getAuthToken(), null);
  assert.equal(headerOf(fetch.last, 'Authorization'), undefined);
});

test('a JSON body is serialized and typed; an absent body sends none', async () => {
  const fetch = installFetch().reply({ ok: true });

  await apiFetch('/orders/', { method: 'POST', body: { status: 'pending' } });
  assert.equal(fetch.last.init.body, '{"status":"pending"}');
  assert.equal(headerOf(fetch.last, 'Content-Type'), 'application/json');

  await apiFetch('/orders/');
  assert.equal(fetch.last.init.body, undefined);
  assert.equal(headerOf(fetch.last, 'Content-Type'), undefined);
});

test('a caller-supplied header is forwarded alongside the token', async () => {
  // The gateway forwards X-Idempotency-Key; the service also accepts the key in
  // the body, so either route is legal.
  const fetch = installFetch().reply({ ok: true });
  setAuthToken('tok-abc');

  await apiFetch('/api/orders/checkout/', {
    method: 'POST',
    body: { idempotency_key: 'md-abc' },
    headers: { 'X-Idempotency-Key': 'md-abc' },
  });

  assert.equal(headerOf(fetch.last, 'X-Idempotency-Key'), 'md-abc');
  assert.equal(headerOf(fetch.last, 'Authorization'), 'Bearer tok-abc');
});

test('absolute URLs bypass BASE_URL so a caller can pin an explicit host', async () => {
  const fetch = installFetch().reply({ ok: true });

  await apiFetch('http://example.test/ping/');

  assert.equal(fetch.last.url, 'http://example.test/ping/');
});

test('an empty 200 body resolves to null instead of throwing on JSON.parse', async () => {
  installFetch().reply(undefined, 200);
  assert.equal(await apiFetch('/orders/'), null);
});

test('non-JSON error bodies surface as a readable string, not a parse crash', async () => {
  installFetch().respond(() => ({ status: 502, text: 'Bad Gateway' }));

  await assert.rejects(apiFetch('/orders/'), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 502);
    // The server's plain-text reason beats a bare status string in the UI.
    assert.equal(err.message, 'Bad Gateway');
    assert.equal(err.data, 'Bad Gateway');
    return true;
  });
});

test('an empty error body still falls back to a status line', async () => {
  installFetch().respond(() => ({ status: 500, text: '' }));

  await assert.rejects(apiFetch('/orders/'), (err) => {
    assert.equal(err.message, 'Request failed with status 500.');
    return true;
  });
});

test('DRF field errors are flattened into a message a login form can show', async () => {
  installFetch().reply({ email: ['Enter a valid email address.'] }, 400);

  await assert.rejects(apiFetch('/signup/', { method: 'POST', body: {} }), (err) => {
    assert.equal(err.status, 400);
    // Must not collapse to "[object Object]" — that is what the form renders.
    assert.match(err.message, /Enter a valid email address\./);
    assert.doesNotMatch(err.message, /\[object Object\]/);
    return true;
  });
});

test('the single {"error": "..."} shape the services return is used verbatim', async () => {
  // views.py answers { 'error': 'Authentication required.' } rather than DRF errors.
  installFetch().reply({ error: 'Authentication required.' }, 401);

  await assert.rejects(apiFetch('/orders/'), (err) => {
    assert.equal(err.message, 'Authentication required.');
    return true;
  });
});

test('a provider checkout error is shown to the user, not swallowed', async () => {
  installFetch().reply(
    { error: 'Secure checkout could not be created. Please try again.' },
    400
  );

  await assert.rejects(apiFetch('/api/orders/checkout/', { method: 'POST', body: {} }), (err) => {
    assert.match(err.message, /Secure checkout could not be created/);
    return true;
  });
});

test('a flat field error keeps the raw response reachable on error.data', async () => {
  installFetch().reply({ password: ['This field may not be blank.'] }, 400);

  await assert.rejects(apiFetch('/signup/', { method: 'POST', body: {} }), (err) => {
    assert.deepEqual(err.data, { password: ['This field may not be blank.'] });
    return true;
  });
});

test('a network failure becomes a status-0 ApiError with a retryable message', async () => {
  installFetch().fail('socket hang up');

  await assert.rejects(apiFetch('/orders/'), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 0);
    assert.match(err.message, /Network request failed/);
    return true;
  });
});

test('an aborted request reports a timeout rather than a generic network error', async () => {
  installFetch().fail('aborted', 'AbortError');

  await assert.rejects(apiFetch('/orders/'), (err) => {
    assert.equal(err.status, 0);
    assert.match(err.message, /timed out/i);
    return true;
  });
});

test('the request carries an AbortSignal so a hung backend cannot wedge the UI', async () => {
  const fetch = installFetch().reply({ ok: true });
  await apiFetch('/orders/');
  assert.ok(fetch.last.init.signal, 'expected an AbortSignal on the request init');
});
