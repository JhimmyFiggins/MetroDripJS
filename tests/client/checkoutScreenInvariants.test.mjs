// Reads the real screen files as text and asserts structural facts that a unit
// test on an extracted helper cannot see: which functions each screen calls,
// which fields the confirmation screen trusts, and which fixtures still describe
// the legacy monolith.
//
// The checkout path under test is POST /api/orders/checkout/.
import './helpers/loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const paymentScreen = read('mobile/Checkout/src/screens/PaymentDetailsScreen.jsx');
const checkoutScreen = read('mobile/Checkout/src/screens/CheckoutScreen.jsx');
const confirmationScreen = read('mobile/Checkout/src/screens/OrderConfirmationScreen.jsx');
const confirmationData = read('mobile/Checkout/src/data/orderConfirmation.js');
const cartLogic = read('mobile/context/cartLogic.js');
const cartContext = read('mobile/context/CartContext.js');
const orderService = read('src/services/orderService.js');
const appNavigator = read('mobile/navigation/AppNavigator.jsx');
const authContext = read('mobile/context/AuthContext.jsx');
const devServer = read('web/dev_server.py');
const loginScreen = read('mobile/Registration/screens/LoginScreen.js');

// --- submit path -------------------------------------------------------------

test('the submit path posts the new builder output, not a hand-built legacy body', () => {
  assert.match(paymentScreen, /buildOrderPayload\s*\(/);
  // The pre-correction body carried product ids and a client total.
  assert.doesNotMatch(paymentScreen, /orderBody\s*=\s*\{[\s\S]*?productId/);
});

test('the confirmation reads the server total returned by the saga, not the local cart', () => {
  // The backend prices from catalog; the validator constructs the entire receipt.
  assert.match(paymentScreen, /createServerConfirmation\s*\(savedOrder\)/);
  assert.match(confirmationData, /firstDefined\(savedOrder, \['total', 'total_amount'\]\)/);
  assert.doesNotMatch(paymentScreen, /total:\s*orderBody\.total/);
  assert.doesNotMatch(paymentScreen, /refNo:\s*`PM-\$\{/);
});

test('online checkout uses a hosted redirect and waits for backend payment proof', () => {
  assert.match(paymentScreen, /openHostedCheckout\s*\(/);
  assert.match(paymentScreen, /paymentFlowState\s*\(savedOrder\)/);
  assert.match(paymentScreen, /refreshPaymentStatus/);
  assert.doesNotMatch(paymentScreen, /selectedMethod\s*!==\s*'cod'/);
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

test('checkout offers every canonical payment method', () => {
  const checkoutData = read('mobile/Checkout/src/data/checkout.ts');
  const types = read('mobile/Checkout/src/types/checkout.ts');
  for (const method of ['cod', 'gcash', 'maya', 'card']) {
    assert.match(checkoutData, new RegExp(`id:\\s*'${method}'`));
    assert.match(paymentScreen, new RegExp(`id:\\s*'${method}'`));
  }
  assert.match(types, /PaymentMethod\s*=\s*'cod'\s*\|\s*'gcash'\s*\|\s*'maya'\s*\|\s*'card'/);
});

test('MetroDrip never collects wallet or card credentials', () => {
  assert.doesNotMatch(paymentScreen, /CARD NUMBER|CVV|EXPIRY|GCASH MOBILE NUMBER|MAYA MOBILE NUMBER/);
  assert.doesNotMatch(paymentScreen, /4111 1111 1111 1111|09 \/ 28|888/);
  assert.doesNotMatch(paymentScreen, /saveGcash|saveMaya|saveCard|cardNumber|cardCvv|cardExpiry/);
  assert.match(paymentScreen, /checkout\.paymongo\.com/);
});

test('the confirmation distinguishes COD amount due from verified online amount paid', () => {
  assert.match(confirmationScreen, /CASH ON DELIVERY/);
  assert.match(confirmationScreen, /Amount due on delivery/);
  assert.match(confirmationScreen, /AMOUNT DUE/);
  assert.match(confirmationScreen, /ONLINE PAYMENT CONFIRMED/);
  assert.match(confirmationScreen, /Amount paid/);
  assert.match(confirmationScreen, /AMOUNT PAID/);
});

test('the app accepts the configured return scheme and refreshes on foreground', () => {
  assert.match(appNavigator, /metrodripjs:\/\//);
  assert.match(paymentScreen, /AppState\.addEventListener\(\s*'change'/);
  assert.match(paymentScreen, /nextState\s*===\s*'active'/);
});

test('the receipt shows the server subtotal and shipping, not total minus a hardcoded fee', () => {
  assert.doesNotMatch(confirmationScreen, /order\.total\s*-\s*100/);
  assert.doesNotMatch(confirmationScreen, /formatPeso\(100\)/);
  assert.match(confirmationScreen, /order\.subtotal/);
  assert.match(confirmationScreen, /order\.shipping/);
});

test('the confirmation does not promise a delivery date the service never computed', () => {
  // Checkout assigns no courier or ETA, so the confirmation only points to later tracking updates.
  assert.doesNotMatch(paymentScreen, /Arriving in 2–3 days/);
  assert.match(confirmationScreen, /Tracking updates will appear after dispatch/);
});

test('the confirmation has no mock fallback or fabricated courier and date', () => {
  assert.match(confirmationScreen, /validateConfirmationRoute\(route\.params\?\.order\)/);
  assert.match(confirmationScreen, /We could not verify this order/);
  assert.doesNotMatch(confirmationScreen, /route\.params\?\.order\s*\|\|\s*\{/);
  assert.doesNotMatch(confirmationScreen, /courier:\s*'J&T/);
  assert.doesNotMatch(confirmationScreen, /Arriving Jul 20/);
  assert.doesNotMatch(confirmationScreen, /Arriving in 2–3 days/);
  assert.doesNotMatch(confirmationScreen, /MD-2026-00318|PM-8H2K19XQ|juan@email\.com/);
});

test('the confirmation maps the service line keys instead of reading price/name', () => {
  // checkout.py returns product_name, variant_desc, unit_price and sku.
  assert.match(confirmationData, /line\?\.product_name/);
  assert.match(confirmationData, /line\?\.unit_price/);
  assert.match(confirmationScreen, /it\.totalPrice/);
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
