import { apiFetch } from './apiClient';

// Active checkout lives in the modular Django backend. The POST reads
// items[{variant_id, quantity}], delivery_zone, a canonical payment_method and
// idempotency_key, then prices authoritatively from catalog. Online methods
// return a hosted redirect action.
// No prices, totals, status or customer_id belong in the request: the caller is
// identified by the Authorization header and the saga recomputes the money.

// Response rows: { id, order_no, status, subtotal, shipping, total, currency,
// payment_status, payment_action, is_replay, created_at, items: [...] }.
export async function getOrders() {
  return apiFetch('/orders/');
}

export async function getPaymentCapabilities() {
  return apiFetch('/api/payments/capabilities/', { auth: false });
}

export function mapPaymentCapabilities(options, capabilities) {
  const methods = Array.isArray(capabilities?.methods) ? capabilities.methods : [];
  const methodById = new Map(methods.map((method) => [method.id, method]));

  return options.map((option) => {
    const method = methodById.get(option.id);
    const enabled = method ? method.available === true : option.id === 'cod';
    const unavailableCode = method?.unavailable_code || method?.unavailableCode || null;
    let unavailableReason;
    if (!enabled) {
      const reasonByCode = {
        provider_not_configured: 'Online payments are not configured.',
        method_not_enabled: 'This payment method is not enabled for the PayMongo account.',
        merchant_disabled: 'This payment method is disabled by the store.',
      };
      unavailableReason = method
        ? method.unavailable_reason || method.unavailableReason || reasonByCode[method.unavailable_code] || 'Temporarily unavailable.'
        : 'Availability could not be confirmed.';
    }

    return {
      ...option,
      enabled,
      requiresRedirect: method ? method.type === 'hosted' : option.id !== 'cod',
      unavailable_code: unavailableCode,
      unavailable_reason: unavailableReason || null,
      unavailableCode,
      unavailableReason,
    };
  });
}

export function normalizeOrderId(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return /^[1-9]\d*$/.test(normalized) && Number.isSafeInteger(Number(normalized))
    ? normalized
    : null;
}

function orderPath(value) {
  const orderId = normalizeOrderId(value);
  if (!orderId) throw new TypeError('A valid order ID is required.');
  return encodeURIComponent(orderId);
}

// 404 { error: 'Order not found.' } for a missing order or one owned by
// another customer (the service answers 404 rather than 403 to avoid leaking
// that the order exists).
export async function getOrder(id) {
  return apiFetch(`/orders/${orderPath(id)}/`);
}

// 200 on an idempotent replay, 201 on a fresh order.
export async function createOrder(payload) {
  return apiFetch('/api/orders/checkout/', {
    method: 'POST',
    body: payload,
  });
}

// { order: { id, number, status, total, placed_at }, shipment: {...} | null,
//   events: [{ key, title, state }] }
export async function getOrderTracking(id) {
  return apiFetch(`/orders/${orderPath(id)}/tracking/`);
}

// Owner scoping and final eligibility are enforced again by Django. The body is
// intentionally empty because the server derives the payment and reservations.
export async function cancelOrder(id) {
  return apiFetch(`/orders/${orderPath(id)}/cancel/`, {
    method: 'POST',
  });
}
