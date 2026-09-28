import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(
  new URL('../../mobile/Checkout/src/screens/PaymentDetailsScreen.jsx', import.meta.url),
  'utf8',
);

test('the submit handler closes the same-tick duplicate request window', () => {
  const handler = source.slice(source.indexOf('const handlePay ='), source.indexOf('const statusCard ='));
  const lock = handler.indexOf('if (submitInFlight.current) return');
  const request = handler.indexOf('await createOrder(orderBody)');
  const release = handler.indexOf('submitInFlight.current = false');

  assert.ok(lock >= 0, 'handler must synchronously reject a duplicate tap');
  assert.ok(request > lock, 'lock must be acquired before the request starts');
  assert.ok(release > request, 'lock must be released after the request settles');
  assert.match(handler, /finally\s*\{/);
});

test('cart clearing is delegated to verified completion, not the redirect path', () => {
  const openCheckout = source.slice(source.indexOf('const openCheckout ='), source.indexOf('const handlePay ='));
  const finishOrder = source.slice(source.indexOf('const finishOrder ='), source.indexOf('const refreshPaymentStatus ='));

  assert.doesNotMatch(openCheckout, /clearCart\s*\(/);
  assert.match(finishOrder, /clearCart\s*\(/);
});
