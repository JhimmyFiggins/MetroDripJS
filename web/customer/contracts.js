export const CUSTOMER_BASE = '/customer';
export const MAX_QUANTITY = 5;
export const CART_TTL_MS = 12 * 60 * 60 * 1000;
export const CART_STORAGE_KEY = 'metrodrip.customer.cart.v1';
export const THEME_STORAGE_KEY = 'metrodrip.customer.theme';
export const CHECKOUT_ATTEMPT_KEY = 'metrodrip.customer.checkout-attempt.v1';

const PAYMENT_OPTIONS = [
  { id: 'cod', name: 'Cash on Delivery', detail: 'Due when the order arrives. Not marked paid.' },
  { id: 'gcash', name: 'GCash', detail: 'Hosted PayMongo checkout. MetroDrip never collects the wallet PIN.' },
  { id: 'maya', name: 'Maya', detail: 'Hosted PayMongo checkout. MetroDrip never collects the wallet password.' },
  { id: 'card', name: 'Credit / debit card', detail: 'Hosted PayMongo checkout. MetroDrip never collects the card number or CVV.' },
];

export function safeBannerDestination(url) {
  if (typeof url !== 'string') return '';
  const value = url.trim();
  if (!value || value.startsWith('//') || /[\s\\]/.test(value)) return '';
  if (value.startsWith('/') && !value.startsWith('/customer/')) return value;
  if (value.startsWith('/customer/')) return value.slice('/customer'.length) || '/';
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) return parsed.toString();
  } catch {
    return '';
  }
  return '';
}

export function normalizeBannerList(payload) {
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.banners) ? payload.banners : null;
  if (!rows) return null;
  return rows
    .filter((row) => row && typeof row === 'object' && typeof row.placement === 'string')
    .map((row) => ({
      id: row.id,
      title: String(row.title || ''),
      headline: String(row.headline || row.title || ''),
      subtext: String(row.subtext || ''),
      button_label: String(row.button_label || 'Shop Now'),
      placement: row.placement,
      link_url: safeBannerDestination(row.link_url),
      image_url: typeof row.image_url === 'string' ? row.image_url : '',
      order: Number(row.order) || 0,
      artwork_mode: row.artwork_mode === 'image' ? 'image' : 'graphic',
      graphic_text_main: String(row.graphic_text_main || ''),
      graphic_text_tagline: String(row.graphic_text_tagline || ''),
      graphic_text_sub: String(row.graphic_text_sub || ''),
      graphic_bg_color: String(row.graphic_bg_color || ''),
      graphic_text_color: String(row.graphic_text_color || ''),
      graphic_accent_color: String(row.graphic_accent_color || ''),
      graphic_alignment: ['left', 'center', 'right'].includes(row.graphic_alignment) ? row.graphic_alignment : 'left',
      graphic_font_size: ['small', 'normal', 'large'].includes(row.graphic_font_size) ? row.graphic_font_size : 'normal',
      image_fit: row.image_fit === 'contain' ? 'contain' : 'cover',
    }))
    .sort((a, b) => a.order - b.order || Number(a.id) - Number(b.id));
}

export function bannersForPlacement(list, placement) {
  return (Array.isArray(list) ? list : []).filter((banner) => banner.placement === placement);
}

export function trustedCheckoutUrl(url) {
  if (typeof url !== 'string' || url.trim() === '') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:'
      && parsed.hostname === 'checkout.paymongo.com'
      && parsed.username === ''
      && parsed.password === ''
      && (parsed.port === '' || parsed.port === '443');
  } catch {
    return false;
  }
}

export function usableImageUrl(url) {
  if (typeof url !== 'string' || url.trim() === '') return '';
  try {
    const parsed = new URL(url, 'http://127.0.0.1');
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'figma.com'
      || host.endsWith('.figma.com')
      || host.endsWith('.amazonaws.com')
    ) {
      return '';
    }
    if (url.startsWith('/') && !url.startsWith('//')) return url;
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return url;
  } catch {
    return '';
  }
  return '';
}

export function purchasableStock(rows) {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((highest, row) => {
    const available = Number(row?.available_stock);
    return Number.isFinite(available) && available > highest ? available : highest;
  }, 0);
}

export function cartFingerprint(lines) {
  return [...(Array.isArray(lines) ? lines : [])]
    .map((line) => `${Number(line?.variant_id)}:${Number(line?.quantity)}`)
    .sort()
    .join('|');
}

export function toCentavos(value) {
  const text = String(value ?? '').trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) return null;
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = text.slice(negative ? 1 : 0).split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2));
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

export function formatCentavos(cents) {
  if (!Number.isSafeInteger(cents)) return 'Price unavailable';
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const text = `${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
  return `${negative ? '-' : ''}PHP ${text}`;
}

export function normalizeCapabilities(payload) {
  const methods = Array.isArray(payload?.methods) ? payload.methods : [];
  const byId = new Map(methods.map((method) => [method.id, method]));
  return PAYMENT_OPTIONS.map((option) => {
    const method = byId.get(option.id);
    const enabled = method ? method.available === true : option.id === 'cod';
    let reason = '';
    if (!enabled) {
      if (method?.unavailable_code === 'provider_not_configured') {
        reason = 'Online payments are not configured.';
      } else if (method?.unavailable_code === 'method_not_enabled') {
        reason = 'This payment method is not enabled.';
      } else if (method) {
        reason = 'Temporarily unavailable.';
      } else {
        reason = 'Availability could not be confirmed.';
      }
    }
    return {
      ...option,
      enabled,
      reason,
      requiresRedirect: method ? method.type === 'hosted' : option.id !== 'cod',
    };
  });
}

export function normalizeCart(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.lines)) return [];
  if (typeof raw.expires_at === 'number' && raw.expires_at <= now) return [];
  const lines = [];
  const seen = new Set();
  for (const line of raw.lines) {
    const variantId = Number(line?.variant_id);
    const quantity = Number(line?.quantity);
    if (!Number.isInteger(variantId) || variantId <= 0 || seen.has(variantId)) continue;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) continue;
    seen.add(variantId);
    const productId = Number(line.product_id);
    lines.push({
      variant_id: variantId,
      product_id: Number.isInteger(productId) && productId > 0 ? productId : null,
      quantity,
      name: cleanLabel(line.name, 'Saved item'),
      label: cleanLabel(line.label, ''),
      unit_hint: cleanLabel(line.unit_hint, ''),
    });
  }
  return lines;
}

export function cartRecord(lines, now = Date.now()) {
  return {
    expires_at: now + CART_TTL_MS,
    lines: normalizeCart({ lines, expires_at: now + CART_TTL_MS }, now),
  };
}

function cleanLabel(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.replace(/\s+/g, ' ').trim().slice(0, 180);
  return cleaned || fallback;
}

export function pendingOtpChallenge(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const challengeId = data.challenge_id || data.challengeId;
  const purpose = data.purpose === 'email_verification' || data.purpose === 'login_2fa' ? data.purpose : '';
  const required = data.otp_required === true || data.otpRequired === true || data.status === 'otp_required';
  if (!challengeId || (!required && !purpose)) return null;
  const length = Number(data.code_length ?? data.codeLength);
  return {
    challengeId: String(challengeId),
    purpose: purpose || 'login_2fa',
    maskedEmail: String(data.masked_email || data.maskedEmail || 'your email'),
    resendAfter: Math.max(0, Number(data.resend_after ?? data.resendAfter ?? 60) || 0),
    codeLength: Number.isInteger(length) && length >= 4 && length <= 8 ? length : 6,
    role: String(data.role || ''),
  };
}

export function safeCustomerPath(value) {
  if (typeof value !== 'string') return `${CUSTOMER_BASE}/`;
  if (value === CUSTOMER_BASE || value === `${CUSTOMER_BASE}/`) return `${CUSTOMER_BASE}/`;
  if (!value.startsWith(`${CUSTOMER_BASE}/`)) return `${CUSTOMER_BASE}/`;
  if (value.includes('\\') || value.includes('//') || value.includes('?') || value.includes('#')) {
    return `${CUSTOMER_BASE}/`;
  }
  return value;
}

export function parseCustomerPath(pathname) {
  const path = typeof pathname === 'string' ? pathname.replace(/\/+$/, '') : '';
  if (path === '' || path === CUSTOMER_BASE) return { name: 'home' };
  if (!path.startsWith(`${CUSTOMER_BASE}/`)) return { name: 'outside' };
  const parts = path.slice(CUSTOMER_BASE.length + 1).split('/').filter(Boolean);
  const [head, second] = parts;
  if (head === 'shop' && parts.length === 1) return { name: 'shop' };
  if (head === 'products' && parts.length === 2 && /^[1-9]\d*$/.test(second)) {
    return { name: 'product', id: second };
  }
  if (head === 'cart' && parts.length === 1) return { name: 'cart' };
  if (head === 'checkout' && parts.length === 1) return { name: 'checkout' };
  if (head === 'orders' && parts.length === 1) return { name: 'orders' };
  if (head === 'orders' && parts.length === 2 && /^[1-9]\d*$/.test(second)) {
    return { name: 'order', id: second };
  }
  if (head === 'account' && parts.length === 1) return { name: 'account' };
  if (head === 'wishlist' && parts.length === 1) return { name: 'wishlist' };
  if (head === 'notifications' && parts.length === 1) return { name: 'notifications' };
  if (head === 'reviews' && parts.length === 1) return { name: 'reviews' };
  if (head === 'support' && parts.length === 1) return { name: 'support' };
  if (head === 'team' && parts.length === 1) return { name: 'team' };
  if (head === 'sign-in' && parts.length === 1) return { name: 'sign-in' };
  if (head === 'verify-otp' && parts.length === 1) return { name: 'verify-otp' };
  if (head === 'sign-up' && parts.length === 1) return { name: 'sign-up' };
  if (head === 'forgot-password' && parts.length === 1) return { name: 'forgot-password' };
  if (head === 'reset-password' && parts.length === 1) return { name: 'reset-password' };
  return { name: 'not-found' };
}

export function customerHref(path = '/') {
  if (path === '/' || path === '') return `${CUSTOMER_BASE}/`;
  return `${CUSTOMER_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

export function variantLabel(variant) {
  const attributes = variant && typeof variant.attributes === 'object' && !Array.isArray(variant.attributes)
    ? variant.attributes
    : {};
  const parts = Object.entries(attributes)
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
    .map(([key, value]) => `${key}: ${String(value)}`);
  if (variant?.color_name) parts.unshift(String(variant.color_name));
  if (parts.length === 0) return variant?.sku ? `SKU ${variant.sku}` : `Variant ${variant?.id ?? ''}`.trim();
  return parts.join(' · ');
}

export function buildCheckoutPayload({ lines, address, zoneName, method, idempotencyKey }) {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('Your cart is empty.');
  }
  const items = lines.map((line) => {
    const variantId = Number(line.variant_id);
    const quantity = Number(line.quantity);
    if (!Number.isInteger(variantId) || variantId <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
      throw new Error('Each cart line needs a real variant and quantity.');
    }
    if (quantity > MAX_QUANTITY) throw new Error(`Quantity cannot exceed ${MAX_QUANTITY} per variant.`);
    return { variant_id: variantId, quantity };
  });
  const required = ['name', 'address_line1', 'city', 'state', 'phone'];
  for (const field of required) {
    if (typeof address?.[field] !== 'string' || address[field].trim() === '') {
      throw new Error('Complete the required delivery fields before checkout.');
    }
  }
  if (typeof zoneName !== 'string' || zoneName.trim() === '') {
    throw new Error('Select a delivery zone returned by the server.');
  }
  if (!['cod', 'gcash', 'maya', 'card'].includes(method)) {
    throw new Error('Select an available payment method.');
  }
  if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
    throw new Error('Checkout could not start a safe retry key.');
  }
  return {
    items,
    delivery_zone: zoneName.trim(),
    payment_method: method,
    idempotency_key: idempotencyKey,
    shipping_address: {
      name: address.name.trim(),
      address_line1: address.address_line1.trim(),
      address_line2: (address.address_line2 || '').trim(),
      city: address.city.trim(),
      state: address.state.trim(),
      postal_code: (address.postal_code || '').trim(),
      country: 'PH',
      phone: address.phone.trim(),
    },
  };
}

export function newIdempotencyKey() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `web-${hex}`;
}
