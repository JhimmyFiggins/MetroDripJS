// Reads the real screen files as text and asserts structural facts that a unit
// test on an extracted helper cannot see: which functions each screen calls,
// which fields the confirmation screen trusts, and which fixtures still describe
// the legacy monolith.
//
// The checkout path under test is POST /api/orders/checkout/ in services/orders.
import './helpers/loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const paymentScreen = read('mobile/Checkout/src/screens/PaymentDetailsScreen.jsx');
const checkoutScreen = read('mobile/Checkout/src/screens/CheckoutScreen.jsx');
const confirmationScreen = read('mobile/Checkout/src/screens/OrderConfirmationScreen.jsx');
const cartLogic = read('mobile/context/cartLogic.js');
const cartContext = read('mobile/context/CartContext.js');
const orderService = read('src/services/orderService.js');
const authContext = read('mobile/context/AuthContext.jsx');
const legacyBackend = path.join(root, 'metrodrip_backend');
const devServer = read('web/dev_server.py');
const loginScreen = read('mobile/Registration/screens/LoginScreen.js');

// --- submit path -------------------------------------------------------------

test('the submit path posts the new builder output, not a hand-built legacy body', () => {
  assert.match(paymentScreen, /buildOrderPayload\s*\(/);
  // The pre-correction body carried product ids and a client total.
  assert.doesNotMatch(paymentScreen, /orderBody\s*=\s*\{[\s\S]*?productId/);
});

test('the confirmation reads the server total returned by the saga, not the local cart', () => {
  // services/orders saga.py prices from catalog; savedOrder.total is that figure.
  assert.match(paymentScreen, /total:\s*Number\(savedOrder\.total\)/);
  assert.doesNotMatch(paymentScreen, /total:\s*orderBody\.total/);
  assert.doesNotMatch(paymentScreen, /total:\s*savedOrder\.total\s*\?\?/);
  assert.doesNotMatch(paymentScreen, /refNo:\s*`PM-\$\{/);
});

test('a method the orders service would reject is refused before a request is spent', () => {
  // views.py answers 400 for any payment_method other than cod.
  assert.match(paymentScreen, /selectedMethod\s*!==\s*'cod'/);
});

test('a failed checkout leaves the button usable so the customer can retry', () => {
  assert.match(paymentScreen, /finally\s*\{/);
  assert.match(paymentScreen, /setIsProcessing\(false\)/);
});

test('submit handler uses a synchronous ref gate alongside loading state', () => {
  assert.match(paymentScreen, /if\s*\(submitInFlight\.current\)\s*return/);
  assert.match(paymentScreen, /submitInFlight\.current\s*=\s*true/);
  assert.match(paymentScreen, /setIsProcessing\(true\)/);
});

// --- checkout handoff ---------------------------------------------------------

test('the checkout handoff still passes the draft, and no longer fabricates cart rows', () => {
  assert.match(checkoutScreen, /navigation\.navigate\(\s*'PaymentDetails'/);
  // A deep link with an empty cart used to invent two priced demo lines, which
  // the saga would then reject or silently mis-price.
  assert.doesNotMatch(checkoutScreen, /Drip Zip-Up Hoodie/);
  assert.doesNotMatch(checkoutScreen, /Metro Core Boxy Tee/);
});

test('the handoff keeps city and zone discrete for the shipping_address fields', () => {
  assert.match(checkoutScreen, /city:\s*address\.city/);
  assert.match(checkoutScreen, /zone:\s*address\.zone/);
});

// --- cart arithmetic ----------------------------------------------------------

test('cart arithmetic still refuses to produce a NaN total', () => {
  assert.match(cartLogic, /Number\.isFinite/);
  assert.doesNotMatch(cartLogic, /const\s+total\s*=\s*cart\.reduce/);
  // CartContext keeps routing quantity updates through the shared helper.
  assert.match(cartContext, /clampQuantity/);
  assert.match(cartContext, /from\s+'\.\/cartLogic'/);
});

// --- payment method surface ---------------------------------------------------

test('only a method the orders service settles is offered', () => {
  const checkoutData = read('mobile/Checkout/src/data/checkout.ts');
  const types = read('mobile/Checkout/src/types/checkout.ts');
  assert.match(checkoutData, /id:\s*'cod'/);
  assert.doesNotMatch(checkoutData, /id:\s*'gcash'/);
  assert.doesNotMatch(checkoutData, /id:\s*'maya'/);
  assert.doesNotMatch(checkoutData, /id:\s*'card'/);
  assert.doesNotMatch(paymentScreen, /id:\s*'(gcash|maya|card)'/);
  assert.match(types, /PaymentMethod\s*=\s*'cod'/);
});

test('the confirmation fixture no longer advertises a wallet that is never charged', () => {
  assert.doesNotMatch(confirmationScreen, /paymentMethod:\s*'GCash'/);
  assert.doesNotMatch(confirmationScreen, /paymentDetail:\s*'GCash/);
});

test('the confirmation does not claim money was collected for a cash-on-delivery order', () => {
  // The saga settles COD later, so "paid" and "TOTAL PAID" are false claims.
  assert.doesNotMatch(confirmationScreen, /PAYMENT SUCCESSFUL/);
  assert.doesNotMatch(confirmationScreen, /TOTAL PAID/);
  assert.doesNotMatch(confirmationScreen, /Amount paid/);
  assert.match(confirmationScreen, /CASH ON DELIVERY/);
  assert.match(confirmationScreen, /Amount due on delivery/);
  assert.match(confirmationScreen, /AMOUNT DUE/);
});

test('the receipt shows the server subtotal and shipping, not total minus a hardcoded fee', () => {
  assert.doesNotMatch(confirmationScreen, /order\.total\s*-\s*100/);
  assert.doesNotMatch(confirmationScreen, /formatPeso\(100\)/);
  assert.match(confirmationScreen, /order\.subtotal/);
  assert.match(confirmationScreen, /order\.shipping/);
});

test('the confirmation does not promise a delivery date the service never computed', () => {
  // saga.py assigns no courier and no ETA; a hardcoded date is a fabricated promise.
  assert.doesNotMatch(paymentScreen, /Arriving in 2–3 days/);
  assert.match(paymentScreen, /courier:\s*'To be assigned'/);
});

test('the confirmation fallback itself does not advertise a fabricated courier or date', () => {
  // The OrderConfirmation fallback is Figma-only preview data, but it must not
  // promise a specific courier or delivery date the saga never assigns, so QA and
  // designers previewing the screen in isolation see the same honest contract.
  assert.doesNotMatch(confirmationScreen, /courier:\s*'J&T/);
  assert.doesNotMatch(confirmationScreen, /Arriving Jul 20/);
  assert.doesNotMatch(confirmationScreen, /Arriving in 2–3 days/);
  assert.doesNotMatch(confirmationScreen, /eta:\s*'Arriving/);
  assert.match(confirmationScreen, /courier:\s*'To be assigned'/);
  assert.match(confirmationScreen, /eta:\s*'Delivery schedule is assigned after dispatch'/);
  // Rendering must not crash if the order omits courier.
  assert.match(confirmationScreen, /order\.courier\s*\|\|\s*'To be assigned'/);
});

test('the confirmation maps the service line keys instead of reading price/name', () => {
  // views.py returns product_name, variant_desc, unit_price, sku.
  assert.match(paymentScreen, /product_name/);
  assert.match(paymentScreen, /unit_price/);
  assert.doesNotMatch(paymentScreen, /items:\s*savedOrder\.items\s*\|\|\s*orderDraft\.items/);
});

// --- auth ---------------------------------------------------------------------

test('the mobile auth context stores the token the identity service returns', () => {
  // services/identity returns { token, id, name, email, phone } from /login/ and /signup/.
  assert.match(authContext, /setAuthToken\(\s*customer\?\.token\s*\?\?\s*null\s*\)/);
  assert.doesNotMatch(authContext, /setCustomerId/);
});

test('the login screen shows a readable server message instead of a crash', () => {
  assert.match(loginScreen, /\.message|errorDetail|flattenErrors/);
});

// --- service wiring -----------------------------------------------------------

test('checkout calls the gateway checkout route, not the legacy orders collection', () => {
  assert.match(orderService, /'\/api\/orders\/checkout\/'/);
  assert.doesNotMatch(orderService, /apiFetch\('\/orders\/',\s*\{\s*method:\s*'POST'/);
});

// --- legacy backend is left alone ---------------------------------------------

test('legacy backend runtime sources were not edited', () => {
  // Keep the original runtime-scope guard while allowing the repository cleanup
  // to delete generated bytecode and the verified empty inspectdb scaffold.
  if (!fs.existsSync(legacyBackend)) return;
  const dirty = execFileSync('git', ['status', '--porcelain', '--', 'metrodrip_backend'], {
    cwd: root,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter(Boolean);
  const unexpected = dirty.filter((entry) => {
    const status = entry.slice(0, 2);
    const path = entry.slice(3).replaceAll('\\', '/');
    const deletedBytecode = status.includes('D') && path.includes('/__pycache__/') && path.endsWith('.pyc');
    const deletedInspectDbStub = status.includes('D') && path === 'metrodrip_backend/models_existing.py';
    return !deletedBytecode && !deletedInspectDbStub;
  });
  assert.deepEqual(unexpected, [], 'legacy backend runtime sources must stay untouched');
});

// --- dev server ---------------------------------------------------------------

test('the dev server binds loopback by default', () => {
  assert.match(devServer, /BIND_HOST/);
  assert.doesNotMatch(devServer, /server_address\s*=\s*\('',\s*port\)/);
});

test('the favicon upload endpoint cannot traverse out of web/assets', () => {
  assert.match(devServer, /ALLOWED_FAVICON_NAMES/);
  assert.doesNotMatch(devServer, /os\.path\.join\(os\.path\.dirname\(__file__\),\s*'assets',\s*filename\)/);
});

test('a malformed favicon payload is a 400, not a traceback or a 404', () => {
  assert.match(devServer, /400/);
  assert.match(devServer, /json\.JSONDecodeError|ValueError/);
});
