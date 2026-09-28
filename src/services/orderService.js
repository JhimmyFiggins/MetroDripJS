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
