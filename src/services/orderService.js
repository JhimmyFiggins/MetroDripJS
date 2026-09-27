import { apiFetch } from './apiClient';

// Response: array of OrderSerializer rows for the current customer.
export async function getOrders() {
  return apiFetch('/orders/');
}

// Response: single OrderSerializer row, or 404 { error: 'Order not found.' }.
export async function getOrder(id) {
  return apiFetch(`/orders/${id}/`);
}

// Payload matches orders/serializers.py OrderSerializer input; customer_id is
// filled in server-side from the X-Customer-ID header when omitted.
export async function createOrder(payload) {
  return apiFetch('/orders/', {
    method: 'POST',
    body: payload,
  });
}

// New endpoint (in progress backend-side). Contract:
// { order: { id, number, placed_at, status, total, items: [...] },
//   shipment: { courier, tracking_number, eta_label, status } | null,
//   events: [{ key, title, timestamp, state: 'done' | 'pending' }] }
export async function getOrderTracking(id) {
  return apiFetch(`/orders/${id}/tracking/`);
}
