// Builds the POST /api/orders/checkout/ body from the checkout draft.
//
// Contract verified against the active deployment:
//   services/orders/orders/views.py  OrdersListCreateAPIView.post
//   services/orders/orders/urls.py    api/orders/checkout/
//   services/orders/orders/saga.py    execute_cod_checkout_saga
//   services/catalog/catalog/views.py CatalogQuoteAPIView.post
//
// The service takes authoritative pricing from catalog, so the client must NOT
// send prices, totals, status or a product FK — it sends variant ids, the
// delivery zone, COD, an idempotency key and the shipping address.
const PAYMENT_METHOD = 'COD';
const checkoutAttempts = new WeakMap();
let attemptSequence = 0;
class CheckoutPayloadError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CheckoutPayloadError';
  }
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

/**
 * Strictly positive integer, or null. Never truncates and never substitutes a
 * default: catalog rejects a non-positive quantity and silently mis-prices a
 * fractional one, so an unusable value has to fail here instead.
 */
function strictPositiveInt(value) {
  if (typeof value === 'boolean' || value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const text = value.trim();
    if (!/^\d+$/.test(text)) return null;
    const n = Number(text);
    return Number.isSafeInteger(n) && n >= 1 ? n : null;
  }
  if (typeof value !== 'number') return null;
  return Number.isSafeInteger(value) && value >= 1 ? value : null;
}

export function buildOrderItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new CheckoutPayloadError('Your cart is empty. Add an item before checking out.');
  }

  return items.map((item, index) => {
    const label = item?.name ? `"${clean(item.name)}"` : `#${index + 1}`;

    const variantId = strictPositiveInt(item?.variantId ?? item?.variant_id);
    if (variantId === null) {
      throw new CheckoutPayloadError(`Cart item ${label} is not linked to a specific product variant and cannot be ordered.`);
    }

    const quantity = strictPositiveInt(item?.quantity);
    if (quantity === null) {
      throw new CheckoutPayloadError(`Cart item ${label} has an invalid quantity. Choose a whole number of 1 or more.`);
    }

    return { variant_id: variantId, quantity };
  });
}

/**
 * Split the checkout form's address into the discrete fields the saga stores.
 * When the draft already carries `city` and `zone` those win; a joined
 * "line, city, zone" address is only re-split when neither key is present.
 */
export function splitShippingAddress(draft = {}) {
  const { address, city, zone } = draft;
  let line1 = clean(address);
  const hasCity = Object.prototype.hasOwnProperty.call(draft, 'city');
  const hasZone = Object.prototype.hasOwnProperty.call(draft, 'zone');
  let outCity = clean(city);
  let outState = clean(zone);

  if (!hasZone && !outState) {
    const segments = line1.split(',').map((s) => s.trim()).filter(Boolean);
    if (segments.length >= 3) {
      const tail = segments.slice(-2);
      outState = tail[1];
      if (!hasCity || !outCity) outCity = tail[0];
      line1 = segments.slice(0, -2).join(', ');
    }
  }

  for (const suffixValue of [outState, outCity]) {
    if (!line1 || !suffixValue) continue;
    const suffix = `, ${suffixValue}`;
    if (line1.toLowerCase().endsWith(suffix.toLowerCase())) {
      line1 = line1.slice(0, line1.length - suffix.length).trim();
    }
  }

  return { address_line1: line1, city: outCity, state: outState };
}

export function buildIdempotencyKey(draft, items) {
  const address = splitShippingAddress(draft);
  const fingerprint = JSON.stringify({
    items,
    name: clean(draft?.fullName),
    phone: clean(draft?.mobile),
    address: address.address_line1,
    city: address.city,
    state: address.state,
    addressLine2: clean(draft?.addressLine2),
    postalCode: clean(draft?.postalCode),
    deliveryZone: clean(draft?.zone ?? draft?.delivery_zone),
  });
  const previous = checkoutAttempts.get(draft);
  if (previous?.fingerprint === fingerprint) return previous.key;
  // Retries share a draft; a new purchase of identical items must get a new key.
  const key = `md-${Date.now().toString(36)}-${(++attemptSequence).toString(36)}-${Math.random().toString(36).slice(2)}`;
  checkoutAttempts.set(draft, { fingerprint, key });
  return key;
}

export function buildOrderPayload(draft) {
  const items = buildOrderItems(draft?.items);
  const address = splitShippingAddress(draft);

  const name = clean(draft?.fullName);
  const phone = clean(draft?.mobile);
  const deliveryZone = clean(draft?.zone ?? draft?.delivery_zone);

  if (!name) throw new CheckoutPayloadError('A recipient name is required to place this order.');
  if (!address.address_line1) throw new CheckoutPayloadError('A delivery address is required to place this order.');
  if (!address.city) throw new CheckoutPayloadError('A delivery city is required to place this order.');
  // The form exposes one zone field that feeds both state and delivery_zone, so
  // name that field in the error rather than a key the user cannot see.
  if (!address.state) throw new CheckoutPayloadError('A delivery zone is required to place this order.');
  if (!deliveryZone) throw new CheckoutPayloadError('A delivery zone is required to place this order.');
  if (!phone) throw new CheckoutPayloadError('A contact mobile number is required to place this order.');

  return {
    items,
    delivery_zone: deliveryZone,
    payment_method: PAYMENT_METHOD,
    idempotency_key: buildIdempotencyKey(draft, items),
    shipping_address: {
      name,
      address_line1: address.address_line1,
      address_line2: clean(draft?.addressLine2) || '',
      city: address.city,
      state: address.state,
      postal_code: clean(draft?.postalCode) || '',
      phone,
    },
  };
}

// The saga prices from catalog and ignores client money, so no totals, status
// or product FK belong in this body.
export { CheckoutPayloadError };
