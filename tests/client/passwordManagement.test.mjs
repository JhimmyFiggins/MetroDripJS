import './helpers/loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { installFetch, sentBody, headerOf } from './helpers/fetchRecorder.mjs';

const { setAuthToken, clearCustomer, BASE_URL } = await import('../../src/services/apiClient.js');
const auth = await import('../../src/services/authService.js');

let fetch;

test.beforeEach(() => {
  clearCustomer();
  fetch = installFetch().reply({ ok: true, status: 'accepted', success: true });
});

const pathOf = (call) => call.url.slice(BASE_URL.length);
const methodOf = (call) => call.init.method || 'GET';

test('forgotPassword posts email payload to /forgot-password/ without auth headers', async () => {
  await auth.forgotPassword('juan@example.com');
  assert.equal(pathOf(fetch.last), '/forgot-password/');
  assert.equal(methodOf(fetch.last), 'POST');
  assert.deepEqual(sentBody(fetch.last), { email: 'juan@example.com' });
  assert.equal(headerOf(fetch.last, 'Authorization'), undefined);
});

test('resetPasswordConfirm posts token and passwords to /password-reset/confirm/', async () => {
  await auth.resetPasswordConfirm('tok-xyz123', 'NewPass1234!', 'NewPass1234!');
  assert.equal(pathOf(fetch.last), '/password-reset/confirm/');
  assert.equal(methodOf(fetch.last), 'POST');
  assert.deepEqual(sentBody(fetch.last), {
    token: 'tok-xyz123',
    new_password: 'NewPass1234!',
    confirm_password: 'NewPass1234!',
  });
  assert.equal(headerOf(fetch.last, 'Authorization'), undefined);
});

test('verifyResetToken sends GET request to /password-reset/verify/ with token query parameter', async () => {
  await auth.verifyResetToken('sec-token-999');
  assert.equal(pathOf(fetch.last), '/password-reset/verify/?token=sec-token-999');
  assert.equal(methodOf(fetch.last), 'GET');
  assert.equal(headerOf(fetch.last, 'Authorization'), undefined);
});

test('changePassword posts current and new password to /users/me/password/ with bearer token', async () => {
  setAuthToken('bearer-token-123');
  await auth.changePassword('OldTempPass1!', 'NewPermPass2!');
  assert.equal(pathOf(fetch.last), '/users/me/password/');
  assert.equal(methodOf(fetch.last), 'POST');
  assert.deepEqual(sentBody(fetch.last), {
    current_password: 'OldTempPass1!',
    new_password: 'NewPermPass2!',
  });
  assert.equal(headerOf(fetch.last, 'Authorization'), 'Bearer bearer-token-123');
});
