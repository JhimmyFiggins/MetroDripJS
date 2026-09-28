import { normalizeOrderId } from '../../../../src/services/orderService';

const ONLINE_METHODS = new Set(['gcash', 'maya', 'card']);

function firstDefined(source, keys) {
  for (const key of keys) {
    if (source?.[key] !== undefined && source?.[key] !== null) return source[key];
  }
  return undefined;
}

function finiteMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function normalizeItem(line, index) {
  const name = String(line?.product_name || '').trim();
  const quantity = Number(line?.quantity);
  const unitPrice = finiteMoney(line?.unit_price);
  const serverTotal = finiteMoney(line?.total_price);
  if (!name || !Number.isSafeInteger(quantity) || quantity < 1 || unitPrice === null) return null;

  return {
    id: String(line?.sku || line?.variant_ref || `line-${index}`),
    name,
    sku: String(line?.sku || '').trim(),
    variant: String(line?.variant_desc || '').trim(),
    quantity,
    unitPrice,
    totalPrice: serverTotal ?? unitPrice * quantity,
  };
}

function normalizeShippingAddress(value) {
  if (!value || typeof value !== 'object') return null;
  const fields = {
    name: String(value.name || '').trim(),
    addressLine1: String(value.address_line1 || '').trim(),
    addressLine2: String(value.address_line2 || '').trim(),
    city: String(value.city || '').trim(),
    state: String(value.state || '').trim(),
    postalCode: String(value.postal_code || '').trim(),
    country: String(value.country || '').trim().toUpperCase(),
    phone: String(value.phone || '').trim(),
  };
  if (
    !fields.name ||
    !fields.addressLine1 ||
    !fields.city ||
    !fields.state ||
    fields.country !== 'PH' ||
    !fields.phone
  ) {
    return null;
  }
  return fields;
}

export function createServerConfirmation(savedOrder) {
  if (!savedOrder || typeof savedOrder !== 'object') return null;
  const orderId = normalizeOrderId(savedOrder.id);
  const refNo = String(firstDefined(savedOrder, ['order_no', 'order_number']) || '').trim();
  const paymentMethod = String(savedOrder.payment_method || '').trim().toLowerCase();
  const paymentStatus = String(savedOrder.payment_status || '').trim().toLowerCase();
  const orderStatus = String(savedOrder.status || '').trim().toLowerCase();
  const subtotal = finiteMoney(savedOrder.subtotal);
  const shipping = finiteMoney(firstDefined(savedOrder, ['shipping', 'shipping_fee']));
  const total = finiteMoney(firstDefined(savedOrder, ['total', 'total_amount']));
  const createdAt = new Date(savedOrder.created_at || '');
  const shippingAddress = normalizeShippingAddress(savedOrder.shipping_address);
  const items = Array.isArray(savedOrder.items)
    ? savedOrder.items.map(normalizeItem).filter(Boolean)
    : [];

  const validPaymentState =
    (paymentMethod === 'cod' && paymentStatus === 'pending_collection' && orderStatus === 'placed') ||
    (ONLINE_METHODS.has(paymentMethod) && paymentStatus === 'paid' && ['placed', 'payment_review'].includes(orderStatus));
  if (
    !orderId ||
    !refNo ||
    !validPaymentState ||
    subtotal === null ||
    shipping === null ||
    total === null ||
    Number.isNaN(createdAt.getTime()) ||
    !shippingAddress ||
    items.length === 0 ||
    items.length !== savedOrder.items.length
  ) {
    return null;
  }

  return {
    source: 'server_checkout',
    confirmationVersion: 1,
    orderId,
    refNo,
    subtotal,
    shipping,
    total,
    createdAt: createdAt.toISOString(),
    paymentMethod,
    paymentStatus,
    orderStatus,
    shippingAddress,
    items,
  };
}

export function validateConfirmationRoute(value) {
  if (
    value?.source !== 'server_checkout' ||
    value?.confirmationVersion !== 1 ||
    !normalizeOrderId(value?.orderId) ||
    typeof value?.refNo !== 'string' ||
    !value.refNo.trim() ||
    finiteMoney(value?.subtotal) === null ||
    finiteMoney(value?.shipping) === null ||
    finiteMoney(value?.total) === null ||
    !Array.isArray(value?.items) ||
    value.items.length === 0 ||
    !value.shippingAddress ||
    typeof value.shippingAddress.name !== 'string' ||
    !value.shippingAddress.name.trim() ||
    typeof value.shippingAddress.addressLine1 !== 'string' ||
    !value.shippingAddress.addressLine1.trim() ||
    typeof value.shippingAddress.city !== 'string' ||
    !value.shippingAddress.city.trim() ||
    typeof value.shippingAddress.state !== 'string' ||
    !value.shippingAddress.state.trim() ||
    value.shippingAddress.country !== 'PH' ||
    typeof value.shippingAddress.phone !== 'string' ||
    !value.shippingAddress.phone.trim()
  ) {
    return null;
  }

  const validState =
    (value.paymentMethod === 'cod' && value.paymentStatus === 'pending_collection' && value.orderStatus === 'placed') ||
    (ONLINE_METHODS.has(value.paymentMethod) && value.paymentStatus === 'paid' && ['placed', 'payment_review'].includes(value.orderStatus));
  const createdAt = new Date(value.createdAt || '');
  if (!validState || Number.isNaN(createdAt.getTime())) return null;

  const validItems = value.items.every(
    (item) =>
      item &&
      typeof item.name === 'string' &&
      item.name.trim() &&
      Number.isSafeInteger(item.quantity) &&
      item.quantity > 0 &&
      finiteMoney(item.unitPrice) !== null &&
      finiteMoney(item.totalPrice) !== null,
  );
  return validItems ? value : null;
}

export function formatConfirmationDate(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })} · ${date.toLocaleTimeString('en-PH', {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}
