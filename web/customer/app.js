import { api, ApiError, setAuthToken } from './api.js';
import {
  CART_STORAGE_KEY,
  MAX_QUANTITY,
  THEME_STORAGE_KEY,
  buildCheckoutPayload,
  cartRecord,
  customerHref,
  formatCentavos,
  newIdempotencyKey,
  normalizeCapabilities,
  normalizeCart,
  parseCustomerPath,
  safeCustomerPath,
  toCentavos,
  trustedCheckoutUrl,
  usableImageUrl,
  variantLabel,
} from './contracts.js';

const app = document.querySelector('#app');
const statusNode = document.querySelector('#status');
const nav = document.querySelector('#site-nav');
const menuButton = document.querySelector('#menu-button');
const themeButton = document.querySelector('#theme-toggle');
const cartCountNode = document.querySelector('#cart-count');
const accountLink = document.querySelector('#account-link');
const unreadNode = document.querySelector('#unread-count');
const searchForm = document.querySelector('#header-search');

const state = {
  session: null,
  cart: [],
  attempt: null,
};

const pages = {
  home: renderHome,
  shop: renderShop,
  product: renderProduct,
  cart: renderCart,
  checkout: renderCheckout,
  orders: renderOrders,
  order: renderOrder,
  account: renderAccount,
  wishlist: renderWishlist,
  notifications: renderNotifications,
  reviews: renderReviews,
  support: renderSupport,
  team: renderTeam,
  'sign-in': renderSignIn,
  'sign-up': renderSignUp,
  'forgot-password': renderForgot,
  'not-found': async () => page('Page not found', 'That customer page does not exist.', el('a', { class: 'button', href: customerHref('/shop') }, 'Back to shop')),
  outside: async () => page('Wrong route', 'Customer pages stay under /customer so they do not replace the API.'),
};

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key in node && (key === 'checked' || key === 'disabled' || key === 'hidden' || key === 'value' || key === 'selected')) node[key] = value;
    else node.setAttribute(key, String(value));
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function money(value) {
  const cents = toCentavos(value);
  return cents == null ? 'Price unavailable' : formatCentavos(cents);
}

function announce(message) {
  statusNode.textContent = message || '';
}

function errorPanel(error) {
  const status = error instanceof ApiError ? error.status : 0;
  const title = status === 401 || status === 403 ? 'Sign-in required' : status === 0 ? 'Connection problem' : 'Something went wrong';
  return page(title, error?.message || 'The request failed.', status === 401
    ? el('a', { class: 'button primary', href: customerHref('/sign-in') }, 'Sign in')
    : el('button', { type: 'button', onclick: () => render() }, 'Retry'));
}

function page(title, lede, ...nodes) {
  document.title = `${title} · MetroDrip customer`;
  return el('section', { class: 'page' }, [
    el('h1', { tabindex: '-1' }, title),
    lede ? el('p', { class: 'lede' }, lede) : null,
    ...nodes,
  ]);
}

function notice(kind, text) {
  return el('p', { class: `notice ${kind}`, role: kind === 'error' ? 'alert' : 'status' }, text);
}

function productCard(product) {
  const image = usableImageUrl(product.image_url);
  return el('a', { class: 'card', href: customerHref(`/products/${product.id}`) }, [
    image ? el('img', { class: 'card-media', src: image, alt: '' }) : el('div', { class: 'media-fallback' }, 'No image on file'),
    el('div', { class: 'card-body' }, [
      el('h2', {}, product.name || 'Untitled product'),
      el('p', { class: 'price' }, money(product.base_price)),
      el('p', { class: 'muted' }, product.currency === 'PHP' ? 'PHP' : 'Currency needs review'),
    ]),
  ]);
}

function loadCart() {
  try {
    state.cart = normalizeCart(JSON.parse(sessionStorage.getItem(CART_STORAGE_KEY) || 'null'));
  } catch {
    state.cart = [];
  }
}

function saveCart() {
  const record = cartRecord(state.cart);
  state.cart = record.lines;
  try {
    sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify(record));
  } catch {
    announce('This browser did not keep the cart draft.');
  }
  paintChrome();
}

function paintChrome() {
  cartCountNode.textContent = String(state.cart.reduce((sum, line) => sum + line.quantity, 0));
  accountLink.textContent = state.session ? 'Account' : 'Sign in';
  accountLink.href = state.session ? customerHref('/account') : customerHref('/sign-in');
  const current = parseCustomerPath(location.pathname).name;
  for (const link of nav.querySelectorAll('a')) {
    const name = parseCustomerPath(new URL(link.href).pathname).name;
    if (name === current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  const dark = document.documentElement.dataset.theme === 'dark';
  themeButton.textContent = dark ? 'Light theme' : 'Dark theme';
  themeButton.setAttribute('aria-pressed', String(dark));
}

function navigate(path, { replace = false } = {}) {
  const url = new URL(path, location.origin);
  const next = `${safeCustomerPath(url.pathname)}${url.search}`;
  if (replace) history.replaceState({}, '', next);
  else history.pushState({}, '', next);
  nav.classList.remove('is-open');
  menuButton.setAttribute('aria-expanded', 'false');
  render();
}

async function read(path, options) {
  try {
    return await api(path, options);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403) && state.session) {
      setAuthToken(null);
      state.session = null;
      paintChrome();
      announce('Your session expired or this account cannot view that record.');
    }
    throw error;
  }
}

async function refreshUnread() {
  if (!state.session) {
    unreadNode.hidden = true;
    return;
  }
  try {
    const data = await api('/notifications/');
    const count = Number(data?.unread_count || 0);
    unreadNode.hidden = count < 1;
    unreadNode.textContent = String(count);
  } catch {
    unreadNode.hidden = true;
  }
}

function signInPanel(nextPath) {
  return page(
    'Sign in required',
    'The customer token stays in memory for this tab and is not written to browser storage.',
    el('a', {
      class: 'button primary',
      href: `${customerHref('/sign-in')}?next=${encodeURIComponent(nextPath)}`,
    }, 'Sign in'),
  );
}

function requireSession(nextPath) {
  if (state.session) return true;
  navigate(`${customerHref('/sign-in')}?next=${encodeURIComponent(nextPath)}`);
  return false;
}

async function signIn(email, password) {
  const data = await api('/login/', { method: 'POST', auth: false, body: { email, password } });
  const token = data.access_token || data.token;
  if (data.role !== 'customer') {
    if (token) {
      setAuthToken(token);
      try { await api('/logout/', { method: 'POST' }); } catch { /* revoke best effort */ }
      setAuthToken(null);
    }
    throw new Error('This shop accepts customer accounts only. Merchant and admin accounts stay on the staff portal.');
  }
  setAuthToken(token);
  state.session = { id: data.id, name: data.name, email: data.email, role: data.role, phone: data.phone || '', addresses: data.addresses };
  paintChrome();
  refreshUnread();
}

async function renderHome() {
  const [categories, products] = await Promise.all([
    api('/categories/', { auth: false }),
    api('/products/?sort=newest', { auth: false }),
  ]);
  const categoryList = Array.isArray(categories) ? categories : [];
  const productList = Array.isArray(products) ? products : [];
  const featured = productList.filter((product) => product.is_featured).slice(0, 8);
  const arrivals = (featured.length ? featured : productList).slice(0, 8);
  return page(
    'MetroDrip',
    'Streetwear from the live catalog. Cards use server names and prices, not sample drops.',
    el('div', { class: 'cluster' }, categoryList.map((category) => el('a', {
      class: 'button',
      href: customerHref(`/shop?category=${encodeURIComponent(category.slug || category.id)}`),
    }, category.name))),
    el('h2', {}, 'New arrivals'),
    arrivals.length
      ? el('div', { class: 'grid' }, arrivals.map(productCard))
      : el('div', { class: 'empty' }, 'No active products were returned.'),
  );
}

async function renderShop() {
  const params = new URLSearchParams(location.search);
  const query = new URLSearchParams();
  for (const key of ['search', 'category', 'size', 'color', 'fit', 'sort']) {
    const value = params.get(key);
    if (value) query.set(key, value);
  }
  let products = [];
  let categories = [];
  let failed = null;
  try {
    [products, categories] = await Promise.all([
      api(`/products/${query.size ? `?${query}` : ''}`, { auth: false }),
      api('/categories/', { auth: false }),
    ]);
  } catch (error) {
    failed = error;
  }
  const list = Array.isArray(products) ? products : [];
  const form = el('form', { class: 'filters panel', onsubmit: (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const next = new URLSearchParams();
    for (const [key, value] of data.entries()) if (String(value).trim()) next.set(key, String(value).trim());
    navigate(`${customerHref('/shop')}?${next.toString()}`);
  } }, [
    field('Search', 'search', params.get('search') || ''),
    categoryField(Array.isArray(categories) ? categories : [], params.get('category') || ''),
    field('Size attribute', 'size', params.get('size') || '', 'Matches a stored variant size. It does not invent sizes.'),
    field('Color attribute', 'color', params.get('color') || '', 'Matches a stored color name.'),
    field('Fit attribute', 'fit', params.get('fit') || '', 'Matches a stored fit attribute.'),
    selectField('Sort', 'sort', params.get('sort') || '', [
      ['', 'Catalog order'],
      ['newest', 'Newest'],
      ['price_asc', 'Price low to high'],
      ['price_desc', 'Price high to low'],
    ]),
    el('button', { class: 'primary', type: 'submit' }, 'Apply'),
  ]);
  const results = failed
    ? notice('error', failed.message)
    : list.length
      ? el('div', { class: 'grid' }, list.map(productCard))
      : el('div', { class: 'empty panel' }, 'No products match these server filters.');
  return page('Shop', 'Filters use the catalog API. The list is not split into server pages.', el('div', { class: 'layout' }, [form, results]));
}

function field(label, name, value, hint) {
  return el('label', { class: 'field' }, [
    el('span', {}, label),
    el('input', { name, value, type: name === 'search' ? 'search' : 'text' }),
    hint ? el('small', { class: 'muted' }, hint) : null,
  ]);
}

function categoryField(categories, selected) {
  return el('label', { class: 'field' }, [
    el('span', {}, 'Category'),
    el('select', { name: 'category' }, [
      el('option', { value: '', selected: selected === '' }, 'All'),
      ...categories.map((category) => el('option', {
        value: category.slug || category.id,
        selected: String(selected) === String(category.slug || category.id),
      }, category.name)),
    ]),
  ]);
}

function selectField(label, name, selected, choices) {
  return el('label', { class: 'field' }, [
    el('span', {}, label),
    el('select', { name }, choices.map(([value, text]) => el('option', { value, selected: value === selected }, text))),
  ]);
}

async function renderProduct(route) {
  const [product, variants, reviews] = await Promise.all([
    api(`/products/${route.id}/`, { auth: false }),
    api(`/products/${route.id}/variants/`, { auth: false }),
    api(`/products/${route.id}/reviews/`, { auth: false }).catch((error) => ({ error })),
  ]);
  const variantList = Array.isArray(variants) ? variants : [];
  let selected = variantList[0] || null;
  const image = usableImageUrl(product.image_url);
  const stockText = el('p', { class: 'mono' }, 'Select a variant to check stock.');
  const priceText = el('p', { class: 'price' }, money(product.base_price));
  const qty = el('input', { class: 'qty', type: 'number', min: '1', max: String(MAX_QUANTITY), value: '1', inputmode: 'numeric' });
  const add = el('button', { class: 'primary', type: 'button', disabled: !selected }, 'Add to cart');
  const wish = el('button', { type: 'button' }, 'Save to wishlist');

  async function refreshVariant(variant) {
    selected = variant;
    for (const button of variantButtons.querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(button.dataset.id === String(variant?.id)));
    }
    if (!variant) {
      stockText.textContent = 'No purchasable variant was returned.';
      add.disabled = true;
      return;
    }
    const cents = toCentavos(product.base_price);
    const adjustment = toCentavos(variant.price_adjustment || '0.00');
    priceText.textContent = cents == null || adjustment == null ? 'Price unavailable' : formatCentavos(cents + adjustment);
    stockText.textContent = 'Checking stock…';
    try {
      const rows = await api(`/variants/${variant.id}/stock/`, { auth: false });
      const available = Array.isArray(rows)
        ? rows.reduce((sum, row) => sum + Number(row.available_stock || 0), 0)
        : 0;
      stockText.textContent = available > 0 ? `${available} available` : 'Out of stock';
      qty.max = String(Math.min(MAX_QUANTITY, Math.max(available, 1)));
      add.disabled = available < 1;
    } catch (error) {
      stockText.textContent = error.message;
      add.disabled = true;
    }
  }

  const variantButtons = el('div', { class: 'variant-list', role: 'group', 'aria-label': 'Variants' }, variantList.map((variant) => el('button', {
    type: 'button',
    dataset: undefined,
    'data-id': variant.id,
    'aria-pressed': 'false',
    onclick: () => refreshVariant(variant),
  }, variantLabel(variant))));
  add.addEventListener('click', async () => {
    const quantity = Number(qty.value);
    if (!selected || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      announce('Enter a quantity from 1 to 5.');
      return;
    }
    const rows = await api(`/variants/${selected.id}/stock/`, { auth: false });
    const available = Array.isArray(rows) ? rows.reduce((sum, row) => sum + Number(row.available_stock || 0), 0) : 0;
    const existing = state.cart.find((line) => line.variant_id === selected.id);
    if (quantity + (existing?.quantity || 0) > Math.min(MAX_QUANTITY, available)) {
      announce('That quantity is above the available stock or the 5-item limit.');
      return;
    }
    const line = {
      variant_id: selected.id,
      product_id: product.id,
      quantity: quantity + (existing?.quantity || 0),
      name: product.name,
      label: variantLabel(selected),
      unit_hint: priceText.textContent,
    };
    state.cart = existing
      ? state.cart.map((item) => item.variant_id === selected.id ? line : item)
      : state.cart.concat(line);
    saveCart();
    announce(`${product.name} added to cart.`);
  });
  wish.addEventListener('click', async () => {
    if (!requireSession(customerHref(`/products/${product.id}`))) return;
    try {
      await api('/wishlist/', { method: 'POST', body: { product_ref: product.id } });
      announce('Saved to your wishlist.');
    } catch (error) {
      announce(error.message);
    }
  });
  if (selected) refreshVariant(selected);

  const reviewBlock = reviews?.error
    ? notice('error', `Reviews could not be loaded. ${reviews.error.message}`)
    : reviewSection(product, reviews);
  return page(product.name || 'Product', product.description || 'No description was returned.', el('div', { class: 'split' }, [
    image ? el('img', { src: image, alt: `${product.name} product image` }) : el('div', { class: 'media-fallback' }, 'No image on file'),
    el('div', {}, [priceText, el('p', { class: 'muted' }, product.sku ? `SKU ${product.sku}` : 'No SKU'), variantButtons, stockText, qty, el('div', { class: 'button-row' }, [add, wish])]),
  ]), reviewBlock);
}

function reviewSection(product, payload) {
  const reviews = Array.isArray(payload?.reviews) ? payload.reviews : [];
  const average = payload?.stats?.count ? payload.stats.average : null;
  const form = el('form', { class: 'panel', onsubmit: async (event) => {
    event.preventDefault();
    if (!requireSession(customerHref(`/products/${product.id}`))) return;
    const data = new FormData(form);
    try {
      await api(`/products/${product.id}/reviews/`, {
        method: 'POST',
        body: { rating: Number(data.get('rating')), comment: String(data.get('comment') || '') },
      });
      announce('Review submitted. It appears after the server approves it.');
      render();
    } catch (error) {
      announce(error.message);
    }
  } }, [
    el('h3', {}, 'Write a review'),
    el('p', { class: 'muted' }, 'A delivered purchase is required. The server decides eligibility.'),
    selectField('Rating', 'rating', '5', [['5', '5'], ['4', '4'], ['3', '3'], ['2', '2'], ['1', '1']]),
    el('label', { class: 'field' }, [el('span', {}, 'Comment'), el('textarea', { name: 'comment', required: 'true', maxlength: '2000' })]),
    el('button', { class: 'primary', type: 'submit' }, 'Submit review'),
  ]);
  return el('section', {}, [
    el('h2', {}, 'Reviews'),
    el('p', { class: 'mono' }, average == null ? 'No approved reviews yet.' : `${average} average from ${payload.stats.count} approved review${payload.stats.count === 1 ? '' : 's'}`),
    reviews.length ? el('div', { class: 'grid' }, reviews.map((review) => el('article', { class: 'panel' }, [
      el('h3', {}, review.author || 'Customer'),
      el('p', { class: 'mono' }, `${review.rating}/5${review.verified ? ' · verified purchase' : ''}`),
      el('p', {}, review.comment || ''),
      review.merchant_reply ? el('p', { class: 'muted' }, `Merchant reply: ${review.merchant_reply}`) : null,
    ]))) : el('p', { class: 'muted' }, 'Approved reviews will show here. Ratings are not filled in.'),
    form,
  ]);
}

async function renderCart() {
  if (state.cart.length === 0) {
    return page('Your cart is empty', 'Add a variant from a product page. This draft stays in this browser tab for 12 hours and is not an order.', el('a', { class: 'button primary', href: customerHref('/shop') }, 'Browse shop'));
  }
  const lines = [];
  for (const line of state.cart) {
    let stockNote = 'Stock not rechecked';
    try {
      const rows = await api(`/variants/${line.variant_id}/stock/`, { auth: false });
      const available = Array.isArray(rows) ? rows.reduce((sum, row) => sum + Number(row.available_stock || 0), 0) : 0;
      stockNote = available >= line.quantity ? `${available} available` : `Only ${available} available now`;
    } catch (error) {
      stockNote = error.message;
    }
    const qty = el('input', { class: 'qty', type: 'number', min: '1', max: String(MAX_QUANTITY), value: String(line.quantity) });
    lines.push(el('div', { class: 'line' }, [
      el('div', {}, [el('strong', {}, line.name), el('p', { class: 'muted' }, line.label), el('p', { class: 'mono' }, stockNote)]),
      qty,
      el('div', { class: 'button-row' }, [
        el('button', { type: 'button', onclick: () => {
          const quantity = Number(qty.value);
          if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
            announce('Quantity must be a whole number from 1 to 5.');
            return;
          }
          state.cart = state.cart.map((item) => item.variant_id === line.variant_id ? { ...item, quantity } : item);
          saveCart();
          render();
        } }, 'Update'),
        el('button', { type: 'button', onclick: () => {
          state.cart = state.cart.filter((item) => item.variant_id !== line.variant_id);
          saveCart();
          announce('Item removed from this browser cart.');
          render();
        } }, 'Remove'),
      ]),
    ]));
  }
  return page('Cart', 'Displayed hints can go stale. Checkout recalculates price, shipping, and stock on the server.', ...lines, el('a', { class: 'button primary', href: customerHref('/checkout') }, 'Checkout'));
}

async function renderCheckout() {
  if (!state.session) return signInPanel(customerHref('/checkout'));
  const [zonesPayload, capabilitiesPayload, profile] = await Promise.all([
    api('/api/shipping-zones/', { auth: false }),
    api('/api/payments/capabilities/', { auth: false }).catch((error) => ({ error })),
    read('/profile/').catch(() => state.session),
  ]);
  const zones = Array.isArray(zonesPayload?.zones) ? zonesPayload.zones : [];
  const methods = capabilitiesPayload?.error
    ? normalizeCapabilities(null).map((option) => option.id === 'cod' ? option : { ...option, enabled: false, reason: 'Availability could not be confirmed.' })
    : normalizeCapabilities(capabilitiesPayload);
  const saved = profile?.addresses && typeof profile.addresses === 'object' && !Array.isArray(profile.addresses) ? profile.addresses : {};
  const form = el('form', { class: 'panel', onsubmit: (event) => submitCheckout(event, form, methods) }, [
    capabilitiesPayload?.error ? notice('error', 'Payment options could not be loaded. Online methods stay off.') : null,
    zones.length ? null : notice('error', 'No active delivery zone was returned, so checkout cannot quote shipping.'),
    field('Recipient', 'name', saved.name || profile?.name || ''),
    field('Mobile', 'phone', saved.phone || profile?.phone || ''),
    field('Address', 'address_line1', saved.address_line1 || saved.address || ''),
    field('Address line 2', 'address_line2', saved.address_line2 || ''),
    field('City', 'city', saved.city || ''),
    field('State', 'state', saved.state || ''),
    field('Postal code', 'postal_code', saved.postal_code || ''),
    el('label', { class: 'field' }, [
      el('span', {}, 'Delivery zone'),
      el('select', { name: 'delivery_zone', required: 'true' }, [
        el('option', { value: '' }, 'Select a server zone'),
        ...zones.map((zone) => el('option', { value: zone.name }, `${zone.name} · ${money(zone.fee)}`)),
      ]),
    ]),
    el('fieldset', { class: 'choice-list' }, [
      el('legend', {}, 'Payment'),
      ...methods.map((method) => el('label', {}, [
        el('input', { type: 'radio', name: 'payment_method', value: method.id, disabled: !method.enabled, required: method.id === 'cod' }),
        `${method.name}${method.enabled ? '' : ` — ${method.reason}`}`,
        el('small', { class: 'muted' }, method.detail),
      ])),
    ]),
    el('p', { class: 'muted' }, 'The server calculates the PHP total. This form does not send a price.'),
    el('button', { class: 'primary', type: 'submit', disabled: zones.length === 0 }, 'Place order'),
  ]);
  return page('Checkout', 'Sign-in is required. A hosted payment redirect is not proof of payment.', form);
}

async function submitCheckout(event, form, methods) {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  const data = new FormData(form);
  const method = String(data.get('payment_method') || '');
  const selected = methods.find((item) => item.id === method);
  if (!selected?.enabled) {
    announce('Choose an enabled payment method.');
    return;
  }
  if (!state.attempt) state.attempt = { key: newIdempotencyKey() };
  let payload;
  try {
    payload = buildCheckoutPayload({
      lines: state.cart,
      address: Object.fromEntries(data.entries()),
      zoneName: String(data.get('delivery_zone') || ''),
      method,
      idempotencyKey: state.attempt.key,
    });
  } catch (error) {
    announce(error.message);
    return;
  }
  button.disabled = true;
  announce('Submitting checkout…');
  try {
    const order = await api('/api/orders/checkout/', { method: 'POST', body: payload });
    state.attempt = null;
    if (order.payment_status === 'paid' || order.payment_method === 'cod') retainConfirmed(order);
    const action = order.payment_action;
    if (action?.type === 'redirect') {
      if (!trustedCheckoutUrl(action.url)) {
        announce('The server returned a payment link that is not on PayMongo hosted checkout. No redirect was followed.');
        navigate(customerHref(`/orders/${order.id}`));
        return;
      }
      announce('Opening hosted checkout. Your cart stays until the server confirms payment.');
      location.assign(action.url);
      return;
    }
    announce(order.payment_method === 'cod' ? 'Order placed. Payment is due on delivery.' : 'Checkout response received.');
    navigate(customerHref(`/orders/${order.id}`));
  } catch (error) {
    button.disabled = false;
    if (error instanceof ApiError && error.status === 0) {
      announce(`${error.message} Retry will reuse the same checkout key.`);
      return;
    }
    if (error instanceof ApiError && error.data?.code === 'idempotency_conflict') state.attempt = null;
    announce(error.message);
  }
}

function retainConfirmed(order) {
  const bought = new Map((order.items || []).map((item) => [Number(item.variant_ref), Number(item.quantity)]));
  state.cart = state.cart.flatMap((line) => {
    const remaining = line.quantity - (bought.get(line.variant_id) || 0);
    return remaining > 0 ? [{ ...line, quantity: remaining }] : [];
  });
  saveCart();
}

async function renderOrders() {
  if (!state.session) return signInPanel(customerHref('/orders'));
  const orders = await read('/orders/');
  const list = Array.isArray(orders) ? orders : [];
  if (!list.length) return page('Orders', 'No owned orders were returned. This list shows the latest 50 records that have a payment.', el('a', { class: 'button', href: customerHref('/shop') }, 'Shop'));
  return page('Orders', 'Only your orders are returned. A missing order and someone else’s order look the same.', el('table', { class: 'table' }, [
    el('thead', {}, el('tr', {}, ['Order', 'Status', 'Payment', 'Total'].map((label) => el('th', {}, label)))),
    el('tbody', {}, list.map((order) => el('tr', {}, [
      el('td', {}, el('a', { href: customerHref(`/orders/${order.id}`) }, order.order_no || `Order ${order.id}`)),
      el('td', {}, order.status || 'Unknown'),
      el('td', {}, order.payment_status || 'Unknown'),
      el('td', { class: 'mono' }, money(order.total)),
    ]))),
  ]));
}

async function renderOrder(route) {
  if (!state.session) return signInPanel(customerHref(`/orders/${route.id}`));
  let order;
  let trackingError = null;
  try {
    order = await read(`/orders/${route.id}/`);
  } catch (error) {
    return errorPanel(error);
  }
  let tracking = null;
  try {
    tracking = await read(`/orders/${route.id}/tracking/`);
  } catch (error) {
    trackingError = error;
  }
  const action = order.payment_action;
  const canContinue = action?.type === 'redirect' && trustedCheckoutUrl(action.url);
  const canCancel = order.payment_method !== 'cod' && ['awaiting_payment', 'setup_failed'].includes(order.payment_status);
  return page(order.order_no || `Order ${order.id}`, 'Payment state is read from your order. This page does not treat a browser return as paid.', el('div', { class: 'panel' }, [
    el('p', {}, `Order status: ${order.status || 'Unknown'}`),
    el('p', {}, `Payment: ${order.payment_status || 'Unknown'} · ${order.payment_method || 'Unknown method'}`),
    el('p', { class: 'price' }, `Server total ${money(order.total)} including shipping ${money(order.shipping)}`),
    order.reconciliation_status === 'deferred' ? notice('error', 'Payment provider lookup is delayed. The status above is the last confirmed server state.') : null,
    canContinue ? el('a', { class: 'button primary', href: action.url }, 'Continue hosted checkout') : null,
    action?.url && !canContinue ? notice('error', 'A payment link was present but rejected because it is not PayMongo hosted checkout.') : null,
    el('div', { class: 'button-row' }, [
      el('button', { type: 'button', onclick: () => render() }, 'Refresh status'),
      canCancel ? el('button', { class: 'danger', type: 'button', onclick: () => cancelOrder(route.id) }, 'Cancel unpaid checkout') : null,
    ]),
  ]), el('h2', {}, 'Items'), el('ul', {}, (order.items || []).map((item) => el('li', {}, `${item.product_name || 'Item'} · ${item.variant_desc || item.sku || 'Variant'} · ${item.quantity} · ${money(item.total_price)}`))), trackingError ? notice('error', `Tracking could not be loaded. ${trackingError.message}`) : trackingBlock(tracking));
}

function trackingBlock(tracking) {
  if (!tracking) return el('p', { class: 'muted' }, 'No tracking payload was returned.');
  const events = Array.isArray(tracking.events) ? tracking.events : [];
  return el('section', {}, [
    el('h2', {}, 'Tracking'),
    tracking.shipment ? el('p', {}, `Shipment status: ${tracking.shipment.status || 'Unknown'}`) : el('p', { class: 'muted' }, 'No courier shipment is attached. No delivery date is estimated.'),
    el('ol', {}, events.map((event) => el('li', {}, `${event.title || event.key || 'Update'} · ${event.state || 'unknown'}`))),
  ]);
}

async function cancelOrder(id) {
  const confirmed = await openDialog('Cancel this unpaid checkout?', 'Stock stays reserved until the server confirms cancellation.');
  if (!confirmed) return;
  try {
    await api(`/orders/${id}/cancel/`, { method: 'POST', body: {} });
    announce('Cancellation request confirmed by the server.');
    render();
  } catch (error) {
    announce(error.message);
  }
}

async function renderAccount() {
  if (!state.session) return signInPanel(customerHref('/account'));
  const profile = await read('/profile/');
  const addresses = profile.addresses;
  const addressNote = Array.isArray(addresses)
    ? 'Saved addresses are a list. This page will not rewrite that shape.'
    : 'Profile address text uses the same addresses.address field as the mobile app.';
  const form = el('form', { class: 'panel', onsubmit: async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const body = {
      name: String(data.get('name') || ''),
      email: String(data.get('email') || ''),
      phone: String(data.get('phone') || ''),
    };
    if (!Array.isArray(addresses)) {
      const current = addresses && typeof addresses === 'object' ? addresses : {};
      body.addresses = { ...current, address: String(data.get('address') || '') };
    }
    try {
      await api('/profile/', { method: 'PUT', body });
      announce('Profile saved.');
      render();
    } catch (error) {
      announce(error.message);
    }
  } }, [
    field('Name', 'name', profile.name || ''),
    field('Email', 'email', profile.email || ''),
    field('Phone', 'phone', profile.phone || ''),
    Array.isArray(addresses) ? null : field('Address note', 'address', addresses?.address || ''),
    el('p', { class: 'muted' }, addressNote),
    el('button', { class: 'primary', type: 'submit' }, 'Save profile'),
  ]);
  return page('Account', profile.email || '', form, el('div', { class: 'button-row' }, [
    el('a', { class: 'button', href: customerHref('/orders') }, 'Orders'),
    el('a', { class: 'button', href: customerHref('/wishlist') }, 'Wishlist'),
    el('a', { class: 'button', href: customerHref('/reviews') }, 'Reviews'),
    el('button', { type: 'button', onclick: signOut }, 'Sign out'),
  ]));
}

async function signOut() {
  try { await api('/logout/', { method: 'POST' }); } catch { /* local session still ends */ }
  setAuthToken(null);
  state.session = null;
  announce('Signed out of this browser session.');
  paintChrome();
  navigate(customerHref('/'));
}

async function renderWishlist() {
  if (!state.session) return signInPanel(customerHref('/wishlist'));
  const items = await read('/wishlist/');
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return page('Wishlist is empty', 'Saved products appear after you add one from a product page.');
  return page('Wishlist', 'This list is your account’s saved products.', el('div', { class: 'grid' }, list.map((item) => el('article', { class: 'card' }, [
    usableImageUrl(item.image_url) ? el('img', { class: 'card-media', src: usableImageUrl(item.image_url), alt: '' }) : el('div', { class: 'media-fallback' }, 'No image on file'),
    el('div', { class: 'card-body' }, [
      el('h2', {}, item.name || 'Saved product'),
      el('p', { class: 'price' }, money(item.price)),
      el('a', { href: customerHref(`/products/${item.product_ref}`) }, 'View'),
      el('button', { type: 'button', onclick: async () => {
        await api(`/wishlist/?product_ref=${encodeURIComponent(item.product_ref)}`, { method: 'DELETE' });
        announce('Removed from wishlist.');
        render();
      } }, 'Remove'),
    ]),
  ]))));
}

async function renderNotifications() {
  if (!state.session) return signInPanel(customerHref('/notifications'));
  let data;
  try {
    data = await read('/notifications/');
  } catch (error) {
    return page('Notifications unavailable', error.message, el('button', { type: 'button', onclick: () => render() }, 'Retry'));
  }
  const results = Array.isArray(data?.results) ? data.results : [];
  if (!results.length) return page('No notifications', 'The server returned an empty owned list, not a hidden error.');
  return page('Notifications', `${data.unread_count || 0} unread.`, el('button', { type: 'button', onclick: async () => {
    await api('/notifications/read-all/', { method: 'POST', body: {} });
    announce('All visible notifications marked read.');
    refreshUnread();
    render();
  } }, 'Mark all read'), el('div', { class: 'grid' }, results.map((item) => el('article', { class: 'panel' }, [
    el('h2', {}, item.title || 'Notification'),
    el('p', {}, item.body || ''),
    el('p', { class: 'mono' }, item.is_read ? 'Read' : 'Unread'),
    item.is_read ? null : el('button', { type: 'button', onclick: async () => {
      await api(`/notifications/${item.id}/read/`, { method: 'POST', body: {} });
      refreshUnread();
      render();
    } }, 'Mark read'),
  ]))));
}

async function renderReviews() {
  return page('My reviews', 'The current API can show and accept reviews on a product page. It does not provide an account-wide review list, so this page does not invent one.', el('a', { class: 'button', href: customerHref('/shop') }, 'Browse products'));
}

async function renderSupport() {
  return page('Support', 'Browser support requests are not connected to a working delivery endpoint. Sending this page does not create a ticket or send an email.', el('p', {}, 'Use a channel your store has actually published outside this form. Password reset delivery is also not configured.'), el('a', { class: 'button', href: customerHref('/forgot-password') }, 'Password reset status'));
}

async function renderTeam() {
  return page('MetroDrip', 'This is the customer shop for the MetroDrip catalog. Staff names and portraits are not published by the current content API, so none are shown here.');
}

function authForm(title, lede, fields, onSubmit, extra) {
  const form = el('form', { class: 'panel', onsubmit: onSubmit }, [...fields, el('button', { class: 'primary', type: 'submit' }, title), extra]);
  return page(title, lede, form);
}

async function renderSignIn() {
  const next = safeCustomerPath(new URLSearchParams(location.search).get('next') || customerHref('/'));
  return authForm('Sign in', 'The token stays in memory for this tab and is dropped on reload.', [
    field('Email', 'email', ''),
    secretField('Password', 'password'),
  ], async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await signIn(String(data.get('email') || ''), String(data.get('password') || ''));
      announce('Signed in.');
      navigate(next, { replace: true });
    } catch (error) {
      announce(error.message);
    }
  }, el('p', {}, [el('a', { href: customerHref('/sign-up') }, 'Create account'), ' · ', el('a', { href: customerHref('/forgot-password') }, 'Forgot password')]));
}

async function renderSignUp() {
  return authForm('Create account', 'Creating an account does not sign you in. Password rules come from the server.', [
    field('Name', 'name', ''),
    field('Email', 'email', ''),
    secretField('Password', 'password'),
  ], async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await api('/signup/', { method: 'POST', auth: false, body: {
        name: String(data.get('name') || ''),
        email: String(data.get('email') || ''),
        password: String(data.get('password') || ''),
      } });
      announce('Account created. Sign in to continue.');
      navigate(customerHref('/sign-in'));
    } catch (error) {
      announce(error.message);
    }
  });
}

function secretField(label, name) {
  return el('label', { class: 'field' }, [el('span', {}, label), el('input', { name, type: 'password', autocomplete: name === 'password' ? 'current-password' : 'off', required: 'true' })]);
}

async function renderForgot() {
  return page('Password reset unavailable', 'Reset delivery is not configured. No email is sent from this page, and no reset token is created.');
}

function openDialog(title, body) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    const previously = document.activeElement;
    const confirm = el('button', { class: 'danger', type: 'button' }, 'Confirm');
    const cancel = el('button', { type: 'button' }, 'Cancel');
    const finish = (value) => {
      dialog.close();
      dialog.remove();
      previously?.focus?.();
      resolve(value);
    };
    confirm.addEventListener('click', () => finish(true));
    cancel.addEventListener('click', () => finish(false));
    dialog.append(el('h2', {}, title), el('p', {}, body), el('div', { class: 'button-row' }, [cancel, confirm]));
    document.body.append(dialog);
    dialog.showModal();
    cancel.focus();
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      finish(false);
    });
  });
}

async function render() {
  const route = parseCustomerPath(location.pathname);
  paintChrome();
  app.replaceChildren(el('p', { class: 'loading' }, 'Loading'));
  try {
    const view = pages[route.name] || pages['not-found'];
    const node = await view(route);
    app.replaceChildren(node);
    app.focus();
  } catch (error) {
    app.replaceChildren(errorPanel(error));
  }
}

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="/customer"]');
  if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  if (link.origin !== location.origin) return;
  event.preventDefault();
  navigate(`${link.pathname}${link.search}`);
});
window.addEventListener('popstate', () => render());
menuButton.addEventListener('click', () => {
  const open = !nav.classList.contains('is-open');
  nav.classList.toggle('is-open', open);
  menuButton.setAttribute('aria-expanded', String(open));
});
themeButton.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem(THEME_STORAGE_KEY, next);
  paintChrome();
});
searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const q = String(new FormData(searchForm).get('q') || '').trim();
  navigate(q ? `${customerHref('/shop')}?search=${encodeURIComponent(q)}` : customerHref('/shop'));
});

loadCart();
paintChrome();
render();
