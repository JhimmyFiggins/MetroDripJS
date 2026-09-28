import { apiFetch } from './apiClient';

// Active checkout lives in services/orders behind the gateway:
//   services/orders/orders/urls.py   api/orders/checkout/  (OrdersListCreateAPIView)
//   services/orders/orders/views.py  POST reads items[{variant_id, quantity}],
//   delivery_zone, payment_method (cod only) and idempotency_key, then runs
//   execute_cod_checkout_saga, which prices authoritatively from catalog.
// No prices, totals, status or customer_id belong in the request: the caller is
// identified by the Authorization header and the saga recomputes the money.

// Response rows: { id, order_no, status, subtotal, shipping, total, currency,
// payment_status, is_replay, created_at, items: [...] }.
export async function getOrders() {
  return apiFetch('/orders/');
}

// 404 { error: 'Order not found.' } for a missing order or one owned by
// another customer (the service answers 404 rather than 403 to avoid leaking
// that the order exists).
export async function getOrder(id) {
  return apiFetch(`/orders/${id}/`);
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
  return apiFetch(`/orders/${id}/tracking/`);
}
