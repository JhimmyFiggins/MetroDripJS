const ONLINE_METHODS = new Set(['gcash', 'maya', 'card']);
const PAYMONGO_CHECKOUT_ORIGIN = 'https://checkout.paymongo.com';
const FAILED_STATUSES = new Set(['failed', 'cancelled', 'canceled', 'expired']);
const SETUP_FAILED_STATUSES = new Set(['setup_failed', 'payment_setup_failed']);

export function isOnlinePaymentMethod(method) {
  return ONLINE_METHODS.has(String(method || '').toLowerCase());
}

export function isPaymentPaid(order) {
  // Only the backend's webhook-backed payment status is proof of payment.
  return String(order?.payment_status || '').toLowerCase() === 'paid';
}

export function isPaymentFailed(order) {
  return FAILED_STATUSES.has(String(order?.payment_status || '').toLowerCase());
}

export function isPaymentSetupFailed(order) {
  const paymentStatus = String(order?.payment_status || '').toLowerCase();
  const orderStatus = String(order?.status || '').toLowerCase();
  return SETUP_FAILED_STATUSES.has(paymentStatus) || SETUP_FAILED_STATUSES.has(orderStatus);
}

export function getHostedCheckoutUrl(paymentAction) {
  if (paymentAction?.type !== 'redirect' || typeof paymentAction?.url !== 'string') {
    throw new Error('The secure checkout link is not available yet. Check payment status and try again.');
  }

  let parsed;
  try {
    parsed = new URL(paymentAction.url);
  } catch {
    throw new Error('The payment provider returned an invalid checkout link.');
  }

  // Restrict navigation to PayMongo's hosted origin so a compromised response
  // cannot turn the checkout handoff into an arbitrary external redirect.
  if (parsed.origin !== PAYMONGO_CHECKOUT_ORIGIN || parsed.username || parsed.password) {
    throw new Error('The payment provider returned an untrusted checkout link.');
  }

  return parsed.toString();
}

export async function openHostedCheckout(paymentAction, linking) {
  const url = getHostedCheckoutUrl(paymentAction);
  if (typeof linking?.canOpenURL === 'function' && !(await linking.canOpenURL(url))) {
    throw new Error('This device cannot open the secure checkout page.');
  }
  if (typeof linking?.openURL !== 'function') {
    throw new Error('Secure checkout is unavailable on this device.');
  }
  await linking.openURL(url);
  return url;
}

export function paymentFlowState(order) {
  if (isPaymentPaid(order)) return 'paid';
  if (isPaymentSetupFailed(order)) return 'setup_failed';
  if (isPaymentFailed(order)) return 'failed';
  return 'pending';
}

export function cartAttemptFingerprint(items) {
  if (!Array.isArray(items)) return '[]';
  const normalized = items.map((item) => ({
    key: String(item?.variantId ?? item?.variant_id ?? item?.id ?? ''),
    quantity: Number(item?.quantity),
  }));
  normalized.sort((left, right) => left.key.localeCompare(right.key));
  return JSON.stringify(normalized);
}

export function canClearCartForAttempt(attempt, order, currentCartItems) {
  if (!attempt || order?.id == null || String(attempt.orderId) !== String(order.id)) return false;
  if (!attempt.cartFingerprint || attempt.cartFingerprint === '[]') return false;
  return attempt.cartFingerprint === cartAttemptFingerprint(currentCartItems);
}
