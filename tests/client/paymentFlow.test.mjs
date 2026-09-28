import './helpers/loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';

const {
  getHostedCheckoutUrl,
  isOnlinePaymentMethod,
  isPaymentPaid,
  openHostedCheckout,
  paymentFlowState,
} = await import('../../mobile/Checkout/src/data/paymentFlow.js');

test('online methods use the hosted flow while COD does not', () => {
  for (const method of ['gcash', 'maya', 'card']) assert.equal(isOnlinePaymentMethod(method), true);
  assert.equal(isOnlinePaymentMethod('cod'), false);
});

test('only an exact PayMongo HTTPS checkout origin is trusted', () => {
  const action = { type: 'redirect', url: 'https://checkout.paymongo.com/cs_test_123?source=app' };
  assert.equal(getHostedCheckoutUrl(action), action.url);

  for (const url of [
    'http://checkout.paymongo.com/cs_test_123',
    'https://checkout.paymongo.com.evil.example/cs_test_123',
    'https://evil.example/?next=https://checkout.paymongo.com',
    'javascript:alert(1)',
  ]) {
    assert.throws(() => getHostedCheckoutUrl({ type: 'redirect', url }), /invalid|untrusted/i);
  }
  assert.throws(() => getHostedCheckoutUrl({ type: 'display', url: action.url }), /not available/i);
});

test('hosted checkout validates support before opening the external URL', async () => {
  const calls = [];
  const linking = {
    async canOpenURL(url) { calls.push(['canOpenURL', url]); return true; },
    async openURL(url) { calls.push(['openURL', url]); },
  };
  const action = { type: 'redirect', url: 'https://checkout.paymongo.com/cs_test_456' };
  await openHostedCheckout(action, linking);
  assert.deepEqual(calls.map(([name]) => name), ['canOpenURL', 'openURL']);
});

test('a redirect or order status is never accepted as payment proof', () => {
  assert.equal(isPaymentPaid({ status: 'paid', payment_status: 'awaiting_payment' }), false);
  assert.equal(isPaymentPaid({ payment_status: 'paid' }), true);
  assert.equal(paymentFlowState({ payment_status: 'awaiting_payment' }), 'pending');
  assert.equal(paymentFlowState({ payment_status: 'failed' }), 'failed');
  assert.equal(paymentFlowState({ payment_status: 'paid' }), 'paid');
});
