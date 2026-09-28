// Pure cart arithmetic, kept out of the React context so the rules are testable
// and so the cart screen and checkout screen cannot disagree on a total.

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

/**
 * Apply a quantity delta and clamp the result to [1, stock].
 *
 * `requested` is a delta, matching how CartScreen calls changeQuantity(id, ±1).
 *
 * `stock` is optional: most product sources do not report a stock figure, and
 * clamping against `undefined` used to yield NaN, which silently produced a
 * zero-total order and a null quantity in the create-order payload.
 */
export function clampQuantity(item, requested) {
  // No line means no quantity to adjust; never invent one from a stray delta.
  if (!item || typeof item !== 'object') return 1;
  const current = toQuantity(item.quantity);
  const delta = toDelta(requested, 0);
  const stock = toFinite(item.stock, Number.POSITIVE_INFINITY);
  return Math.max(1, Math.min(current + Math.trunc(delta), stock));
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
