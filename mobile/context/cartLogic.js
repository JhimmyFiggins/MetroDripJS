// Pure cart arithmetic, kept out of the React context so the rules are testable
// and so the cart screen and checkout screen cannot disagree on a total.

export const DEFAULT_MAX_QUANTITY_PER_VARIANT = 5;

/** Read a field as a finite non-negative number, else fall back. */
function toFinite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Read a field as a finite number (negatives allowed), else fall back. */
function toDelta(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Read a stored quantity as a positive integer, else fall back to 1. */
function toQuantity(value) {
  const n = toFinite(value, 1);
  return Math.max(1, Math.trunc(n));
}

function toPositiveInteger(value) {
  if (typeof value === 'boolean' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

/**
 * The checkout service owns the per-variant business limit. Catalog responses
 * copy that value onto cart rows as `maxQuantity`; older/offline rows use the
 * deliberately matching safe fallback. Stock can only lower the result.
 */
export function configuredQuantityLimit(item) {
  return (
    toPositiveInteger(item?.maxQuantity) ??
    toPositiveInteger(item?.max_order_quantity) ??
    toPositiveInteger(item?.maxOrderQuantity) ??
    DEFAULT_MAX_QUANTITY_PER_VARIANT
  );
}

export function quantityLimit(item) {
  const configured = configuredQuantityLimit(item);
  const stock = toFinite(item?.stock, Number.POSITIVE_INFINITY);
  return Math.max(0, Math.min(configured, Math.trunc(stock)));
}

export function quantityLimitMessage(item) {
  const configured = configuredQuantityLimit(item);
  const limit = quantityLimit(item);
  if (limit < 1) return 'This variant is currently out of stock. Remove it from your cart and choose another variant.';
  if (limit < configured) {
    return `Only ${limit} ${limit === 1 ? 'item is' : 'items are'} currently available for this variant.`;
  }
  return `You can order up to ${limit} ${limit === 1 ? 'item' : 'items'} of this variant per order.`;
}

/** Canonical identity used when display labels differ for the same variant. */
export function cartVariantKey(item) {
  const variantId = toPositiveInteger(item?.variantId ?? item?.variant_id);
  if (variantId !== null) return `variant:${variantId}`;
  const fallback = item?.id == null ? '' : String(item.id).trim();
  return fallback ? `item:${fallback}` : null;
}

/** Refresh variant metadata while treating the incoming quantity as an addend. */
export function mergeCartVariant(existingItem, newItem) {
  const incomingQuantity = toQuantity(newItem?.quantity);
  const refreshed = {
    ...existingItem,
    ...newItem,
    id: existingItem?.id ?? newItem?.id,
    quantity: toQuantity(existingItem?.quantity),
  };
  return {
    ...refreshed,
    quantity: clampQuantity(refreshed, incomingQuantity),
  };
}

/**
 * Apply a quantity delta and clamp the result to [1, min(stock, order max)].
 *
 * `requested` is a delta, matching how CartScreen calls changeQuantity(id, ±1).
 *
 * `stock` is optional. Missing server-limit metadata uses the backend-matching
 * fallback above; neither case may produce NaN.
 */
export function clampQuantity(item, requested) {
  // No line means no quantity to adjust; never invent one from a stray delta.
  if (!item || typeof item !== 'object') return 1;
  const current = toQuantity(item.quantity);
  const delta = toDelta(requested, 0);
  const limit = quantityLimit(item);
  if (limit < 1) return 1;
  return Math.max(1, Math.min(current + Math.trunc(delta), limit));
}

/** Sum of price x quantity across the cart, ignoring any malformed line. */
export function cartSubtotal(cart) {
  if (!Array.isArray(cart)) return 0;
  return cart.reduce((total, item) => {
    const price = toFinite(item?.price, 0);
    return total + price * toQuantity(item?.quantity);
  }, 0);
}

/**
 * Single source of truth for the money the client displays and submits.
 * Mirrors the flat-rate shipping used across the cart and checkout screens.
 */
export const FLAT_SHIPPING_FEE = 150;

export function cartTotals(cart, { shipping = FLAT_SHIPPING_FEE, discount = 0 } = {}) {
  const subtotal = cartSubtotal(cart);
  const appliedDiscount = Math.min(toFinite(discount, 0), subtotal);
  const shippingFee = subtotal > 0 ? toFinite(shipping, 0) : 0;
  return {
    subtotal,
    shipping: shippingFee,
    discount: appliedDiscount,
    total: Math.max(0, subtotal + shippingFee - appliedDiscount),
  };
}
