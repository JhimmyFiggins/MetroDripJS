const FULFILLMENT_LABELS = {
  pending: 'Order placed',
  awaiting_payment: 'Awaiting payment',
  paid: 'Payment confirmed',
  processing: 'Processing',
  packed: 'Packed',
  shipped: 'Shipped',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  completed: 'Delivered',
  cancelled: 'Cancelled',
  canceled: 'Cancelled',
};

const PAYMENT_LABELS = {
  pending_collection: 'Pay on delivery',
  awaiting_payment: 'Payment pending',
  pending: 'Payment pending',
  paid: 'Paid',
  captured: 'Paid',
  completed: 'Paid',
  confirmed: 'Paid',
  failed: 'Payment failed',
  setup_failed: 'Payment setup failed',
  cancelled: 'Payment cancelled',
  canceled: 'Payment cancelled',
  expired: 'Payment expired',
  refunded: 'Refunded',
};

const POSITIVE_FULFILLMENT = new Set(['delivered', 'completed']);
const ACTIVE_FULFILLMENT = new Set(['shipped', 'in_transit', 'out_for_delivery']);
const FAILED_FULFILLMENT = new Set(['cancelled', 'canceled']);
const POSITIVE_PAYMENT = new Set(['paid', 'captured', 'completed', 'confirmed']);
const FAILED_PAYMENT = new Set(['failed', 'setup_failed', 'cancelled', 'canceled', 'expired']);

const normalizedStatus = (value) => String(value || '').trim().toLowerCase();

export function extractOrders(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.results)) return response.results;
  if (Array.isArray(response?.orders)) return response.orders;
  return [];
}

export function orderItemCount(order) {
  if (!Array.isArray(order?.items)) return 0;
  return order.items.reduce((total, item) => {
    const quantity = Number(item?.quantity);
    return Number.isSafeInteger(quantity) && quantity > 0 ? total + quantity : total;
  }, 0);
}

export function formatOrderNumber(order) {
  const serverNumber = String(order?.order_no || '').trim();
  if (serverNumber) return serverNumber;
  return order?.id != null ? `Order #${order.id}` : 'Order reference unavailable';
}

export function formatOrderMoney(value, currency = 'PHP') {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'Total unavailable';
  try {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: String(currency || 'PHP').toUpperCase(),
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

export function formatKnownDate(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatKnownTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
  })} · ${date.toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

export function fulfillmentBadge(order) {
  const status = normalizedStatus(order?.status);
  let tone = 'neutral';
  if (POSITIVE_FULFILLMENT.has(status)) tone = 'success';
  else if (ACTIVE_FULFILLMENT.has(status)) tone = 'active';
  else if (FAILED_FULFILLMENT.has(status)) tone = 'danger';
  return {
    label: FULFILLMENT_LABELS[status] || 'Status unavailable',
    tone,
  };
}

export function paymentBadge(order) {
  const status = normalizedStatus(order?.payment_status);
  let tone = 'neutral';
  if (POSITIVE_PAYMENT.has(status)) tone = 'success';
  else if (FAILED_PAYMENT.has(status)) tone = 'danger';
  else if (status === 'awaiting_payment' || status === 'pending') tone = 'attention';
  return {
    label: PAYMENT_LABELS[status] || 'Payment status unavailable',
    tone,
  };
}

export function trackingHeadline(tracking) {
  const eta = String(tracking?.shipment?.eta_label || '').trim();
  if (eta) return eta;
  return fulfillmentBadge(tracking?.order).label;
}

export function trackingOrderNumber(tracking, fallbackId) {
  const serverNumber = String(tracking?.order?.number || '').trim();
  if (serverNumber) return serverNumber;
  const id = tracking?.order?.id ?? fallbackId;
  return id != null && String(id).trim() ? `Order #${id}` : 'Order details';
}

export function trackingEvents(tracking) {
  if (!Array.isArray(tracking?.events)) return [];
  return tracking.events
    .filter((event) => event && String(event.title || '').trim())
    .map((event, index) => ({
      key: event.key || `event-${index}`,
      title: String(event.title).trim(),
      state: event.state === 'done' ? 'done' : 'pending',
      timestamp: formatKnownTimestamp(event.timestamp),
    }));
}

export function trackingItems(tracking) {
  if (!Array.isArray(tracking?.order?.items)) return [];
  return tracking.order.items.filter((item) => item && Number(item.quantity) > 0);
}

export function classifyOrderError(error, resource = 'orders') {
  const status = Number(error?.status) || 0;
  const tracking = resource === 'tracking';

  if (status === 401) {
    return {
      kind: 'session',
      title: 'Session expired',
      message: `Sign in again to view ${tracking ? 'this order' : 'your orders'}.`,
      actionLabel: 'Sign in',
    };
  }
  if (status === 403) {
    return {
      kind: 'permission',
      title: 'Access unavailable',
      message: `Your account does not have permission to view ${tracking ? 'this order' : 'orders'}.`,
      actionLabel: tracking ? 'Go back' : 'Return to shop',
    };
  }
  if (tracking && status === 404) {
    return {
      kind: 'not_found',
      title: 'Order unavailable',
      message: 'This order is not available in your account.',
      actionLabel: 'Go back',
    };
  }
  if (status === 0 || /network|offline|connection|timed out/i.test(String(error?.message || ''))) {
    return {
      kind: 'offline',
      title: 'You appear to be offline',
      message: `Reconnect to refresh ${tracking ? 'tracking details' : 'your orders'}.`,
      actionLabel: 'Try again',
    };
  }
  return {
    kind: 'error',
    title: tracking ? 'Tracking is temporarily unavailable' : 'Orders are temporarily unavailable',
    message: 'Nothing was changed. Please try again in a moment.',
    actionLabel: 'Try again',
  };
}
