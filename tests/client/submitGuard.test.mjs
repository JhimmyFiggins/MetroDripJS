import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Execute the actual handler without pretending to render React Native or JSX.
const source = fs.readFileSync(new URL('../../mobile/Checkout/src/screens/PaymentDetailsScreen.jsx', import.meta.url), 'utf8');
const handler = source.slice(source.indexOf('const handlePay ='), source.indexOf('// Reusable custom Checkbox component'));

test('two same-tick submissions execute one pending order request', async () => {
  let calls = 0;
  let resolveRequest;
  const request = new Promise(resolve => { resolveRequest = resolve; });
  const scheduled = [];
  const deps = {
    isProcessing: false, submitInFlight: { current: false }, selectedMethod: 'cod',
    currentMethodObj: { title: 'COD' }, orderDraft: { items: [], mobile: 'fixture' },
    setIsProcessing() {}, buildOrderPayload() { return {}; },
    async createOrder() { calls += 1; return request; },
    setTimeout(fn) { scheduled.push(fn()); },
    clearCart() {}, navigation: { navigate() {} },
    Platform: { OS: 'test' }, Alert: { alert() {} }, CheckoutPayloadError: Error,
  };
  const pay = new Function(...Object.keys(deps), `${handler}; return handlePay;`)(...Object.values(deps));
  await pay();
  await pay();
  assert.equal(calls, 1);
  resolveRequest({ id: 1, order_no: 'QA', subtotal: 100, shipping: 85, total: 185, items: [] });
  await Promise.all(scheduled);
});
