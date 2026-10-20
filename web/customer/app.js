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
  'not-found': async () => page('Page not found', 'That customer page does not exist.', el('a', { class: 'btn btn-primary', href: customerHref('/shop') }, 'Back to shop')),
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
    ? el('a', { class: 'btn btn-primary', href: customerHref('/sign-in') }, 'Sign in')
    : el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => render() }, 'Retry'));
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

function breadcrumbs(...items) {
  const children = [];
  items.forEach((item, index) => {
    if (index > 0) children.push(el('span', { class: 'breadcrumb-sep' }, '/'));
    if (item.href) children.push(el('a', { href: item.href }, item.label));
    else children.push(el('span', {}, item.label));
  });
  return el('nav', { class: 'breadcrumb', 'aria-label': 'Breadcrumb' }, children);
}

function getCategoryName(product) {
  if (product?.category_name && typeof product.category_name === 'string') {
    return product.category_name.toUpperCase();
  }
  if (typeof product?.category === 'string' && product.category.trim()) {
    return product.category.toUpperCase();
  }
  const name = product?.name || '';
  if (/tee|t-shirt/i.test(name)) return 'T-SHIRTS';
  if (/hoodie/i.test(name)) return 'HOODIES';
  if (/jean|pant|denim/i.test(name)) return 'DENIM';
  if (/cap|snapback|hat/i.test(name)) return 'CAPS';
  if (/jacket|outerwear|windbreaker/i.test(name)) return 'OUTERWEAR';
  return 'STREETWEAR';
}

function productCard(product) {
  const image = usableImageUrl(product.image_url);
  const categoryName = getCategoryName(product);
  const initial = categoryName.charAt(0);

  const artwork = image
    ? el('img', { src: image, alt: product.name || '', loading: 'lazy' })
    : el('div', { class: 'artwork-fallback' }, [
        el('span', { class: 'artwork-initial' }, initial),
        el('span', { class: 'artwork-sub' }, categoryName),
      ]);

  return el('a', { class: 'product-card', href: customerHref(`/products/${product.id}`) }, [
    el('div', { class: 'product-card-media-wrap' }, artwork),
    el('div', { class: 'product-card-body' }, [
      el('span', { class: 'product-card-cat' }, categoryName),
      el('h3', { class: 'product-card-title' }, product.name || 'Untitled product'),
      el('p', { class: 'product-card-price' }, money(product.base_price)),
      el('div', { class: 'product-card-cta' }, 'View product →'),
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
  const count = state.cart.reduce((sum, line) => sum + line.quantity, 0);
  cartCountNode.textContent = String(count);
  accountLink.textContent = state.session ? 'Account' : 'Sign in';
  accountLink.href = state.session ? customerHref('/account') : customerHref('/sign-in');
  
  const current = parseCustomerPath(location.pathname).name;
  for (const link of nav.querySelectorAll('a')) {
    const name = parseCustomerPath(new URL(link.href).pathname).name;
    if (name === current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }

  const dark = document.documentElement.dataset.theme === 'dark';
  const themeText = themeButton.querySelector('.theme-text');
  const themeIcon = themeButton.querySelector('.theme-icon');
  if (themeText) themeText.textContent = dark ? 'Dark' : 'Light';
  if (themeIcon) themeIcon.textContent = dark ? '☾' : '☼';
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
      class: 'btn btn-primary',
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
  document.title = 'MetroDrip customer';
  const [categories, products] = await Promise.all([
    api('/categories/', { auth: false }),
    api('/products/?sort=newest', { auth: false }),
  ]);
  const categoryList = Array.isArray(categories) ? categories : [];
  const productList = Array.isArray(products) ? products : [];
  const featured = productList.filter((product) => product.is_featured).slice(0, 8);
  const arrivals = (featured.length ? featured : productList).slice(0, 8);

  const hero = el('div', { class: 'homepage-hero' }, [
    el('div', { class: 'hero-copy' }, [
      el('div', { class: 'hero-eyebrow' }, 'METRO MANILA STREETWEAR'),
      el('h1', { class: 'hero-title' }, ['Urban Style', el('br'), 'Redefined']),
      el('p', { class: 'hero-subtitle' }, 'Designed for the City'),
      el('a', { class: 'hero-cta', href: customerHref('/shop') }, 'Shop Now →'),
    ]),
    el('div', { class: 'hero-artwork-card' }, [
      el('div', { class: 'artwork-big-logo' }, 'MD'),
      el('div', { class: 'artwork-tagline' }, 'BUILT FOR THE STREETS'),
      el('div', { class: 'artwork-origin' }, 'METRODRIP / MANILA'),
    ]),
  ]);

  const categoryBar = el('div', { class: 'category-bar' }, [
    el('a', { class: 'category-pill', href: customerHref('/shop') }, 'All Products →'),
    ...categoryList.map((category) => el('a', {
      class: 'category-pill',
      href: customerHref(`/shop?category=${encodeURIComponent(category.slug || category.id)}`),
    }, `${category.name} →`)),
  ]);

  const sectionHeader = el('div', { class: 'section-header' }, [
    el('h2', { class: 'section-title' }, 'New Arrivals'),
    el('a', { class: 'section-link', href: customerHref('/shop?sort=newest') }, 'View all →'),
  ]);

  const grid = arrivals.length
    ? el('div', { class: 'grid' }, arrivals.map(productCard))
    : el('div', { class: 'empty' }, 'No active products were returned.');

  const brandStory = el('div', { class: 'brand-story-banner' }, [
    el('div', { class: 'brand-story-content' }, [
      el('h2', { class: 'brand-story-title' }, 'Built for the Streets'),
      el('p', { class: 'brand-story-desc' }, 'Every piece is designed in Metro Manila — from concept to cut.'),
    ]),
    el('a', { class: 'btn btn-secondary', href: customerHref('/team') }, 'Meet the team →'),
  ]);

  return el('section', { class: 'page home-page' }, [
    hero,
    categoryBar,
    sectionHeader,
    grid,
    brandStory,
  ]);
}

async function renderShop() {
  document.title = 'Shop · MetroDrip customer';
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
  const categoryList = Array.isArray(categories) ? categories : [];
  const selectedCategory = params.get('category') || '';

  const form = el('form', { class: 'filters-sidebar', onsubmit: (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const next = new URLSearchParams();
    for (const [key, value] of data.entries()) if (String(value).trim()) next.set(key, String(value).trim());
    navigate(`${customerHref('/shop')}?${next.toString()}`);
  } }, [
    el('h2', { class: 'filters-title' }, 'Filters'),
    el('div', { class: 'filter-group' }, [
      el('div', { class: 'filter-group-label' }, 'Category'),
      el('div', { class: 'category-filter-list' }, [
        el('button', {
          type: 'button',
          class: `filter-pill-btn ${selectedCategory === '' ? 'is-active' : ''}`,
          onclick: () => {
            const next = new URLSearchParams(location.search);
            next.delete('category');
            navigate(`${customerHref('/shop')}${next.size ? `?${next}` : ''}`);
          },
        }, 'All products'),
        ...categoryList.map((cat) => el('button', {
          type: 'button',
          class: `filter-pill-btn ${String(selectedCategory) === String(cat.slug || cat.id) ? 'is-active' : ''}`,
          onclick: () => {
            const next = new URLSearchParams(location.search);
            next.set('category', cat.slug || cat.id);
            navigate(`${customerHref('/shop')}?${next.toString()}`);
          },
        }, cat.name)),
      ]),
    ]),
    field('Search keyword', 'search', params.get('search') || ''),
    selectField('Size', 'size', params.get('size') || '', [
      ['', 'All sizes'],
      ['XS', 'XS'],
      ['S', 'S'],
      ['M', 'M'],
      ['L', 'L'],
      ['XL', 'XL'],
      ['XXL', 'XXL'],
    ]),
    selectField('Fit', 'fit', params.get('fit') || '', [
      ['', 'All fits'],
      ['Slim', 'Slim'],
      ['Regular', 'Regular'],
      ['Oversized', 'Oversized'],
      ['Boxy', 'Boxy'],
    ]),
    field('Color', 'color', params.get('color') || ''),
    el('button', { class: 'btn btn-primary btn-full', type: 'submit' }, 'Apply Filters'),
    el('button', { class: 'btn btn-secondary btn-full', type: 'button', onclick: () => navigate(customerHref('/shop')) }, 'Clear filters'),
  ]);

  const toolbar = el('div', { class: 'shop-results-toolbar' }, [
    el('div', { class: 'results-count' }, `${list.length} item${list.length === 1 ? '' : 's'}`),
    el('div', { class: 'sort-select-wrap' }, [
      el('select', {
        name: 'sort',
        onchange: (event) => {
          const next = new URLSearchParams(location.search);
          const val = event.target.value;
          if (val) next.set('sort', val);
          else next.delete('sort');
          navigate(`${customerHref('/shop')}${next.size ? `?${next}` : ''}`);
        },
      }, [
        el('option', { value: '', selected: !params.get('sort') }, 'Sort: Catalog order ▾'),
        el('option', { value: 'newest', selected: params.get('sort') === 'newest' }, 'Sort: Newest ▾'),
        el('option', { value: 'price_asc', selected: params.get('sort') === 'price_asc' }, 'Price: Low to high ▾'),
        el('option', { value: 'price_desc', selected: params.get('sort') === 'price_desc' }, 'Price: High to low ▾'),
      ]),
    ]),
  ]);

  const results = failed
    ? notice('error', failed.message)
    : list.length
      ? el('div', { class: 'grid' }, list.map(productCard))
      : el('div', { class: 'empty' }, 'No products match these filters.');

  const rightCol = el('div', { class: 'catalog-results' }, [toolbar, results]);

  return el('section', { class: 'page shop-page' }, [
    breadcrumbs({ label: 'Home', href: customerHref('/') }, { label: 'Shop' }),
    el('h1', {}, 'Shop the collection'),
    el('p', { class: 'lede' }, 'Streetwear designed in Metro Manila.'),
    el('div', { class: 'shop-workspace' }, [form, rightCol]),
  ]);
}

function field(label, name, value, hint) {
  return el('label', { class: 'field' }, [
    el('span', {}, label),
    el('input', { name, value, type: name === 'search' ? 'search' : 'text' }),
    hint ? el('small', {}, hint) : null,
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
  const initial = (product.name || 'M').charAt(0).toUpperCase();
  const categoryName = getCategoryName(product);

  document.title = `${product.name || 'Product'} · MetroDrip customer`;

  const stockText = el('p', { class: 'pdp-stock-status' }, 'Select a variant to check stock.');
  const priceText = el('p', { class: 'pdp-price' }, money(product.base_price));
  const qty = el('input', { class: 'pdp-qty-input', type: 'number', min: '1', max: String(MAX_QUANTITY), value: '1', inputmode: 'numeric' });
  const add = el('button', { class: 'btn btn-primary pdp-add-btn', type: 'button', disabled: !selected }, `Add to Bag · ${priceText.textContent}`);
  const wish = el('button', { class: 'btn btn-secondary', type: 'button' }, 'Save to wishlist');

  const variantButtons = el('div', { class: 'pdp-pills-row', role: 'group', 'aria-label': 'Variants' }, variantList.map((variant) => el('button', {
    type: 'button',
    class: 'pdp-pill-btn',
    'data-id': variant.id,
    'aria-pressed': 'false',
    onclick: () => refreshVariant(variant),
  }, variantLabel(variant))));

  async function refreshVariant(variant) {
    selected = variant;
    for (const button of variantButtons.querySelectorAll('button')) {
      const active = button.dataset.id === String(variant?.id);
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('is-active', active);
    }
    if (!variant) {
      stockText.textContent = 'No purchasable variant was returned.';
      stockText.classList.remove('is-low');
      add.disabled = true;
      return;
    }
    const cents = toCentavos(product.base_price);
    const adjustment = toCentavos(variant.price_adjustment || '0.00');
    const displayPrice = cents == null || adjustment == null ? 'Price unavailable' : formatCentavos(cents + adjustment);
    priceText.textContent = displayPrice;
    add.textContent = `Add to Bag · ${displayPrice}`;
    stockText.textContent = 'Checking stock…';
    stockText.classList.remove('is-low');
    try {
      const rows = await api(`/variants/${variant.id}/stock/`, { auth: false });
      const available = Array.isArray(rows)
        ? rows.reduce((sum, row) => sum + Number(row.available_stock || 0), 0)
        : 0;
      if (available > 0) {
        if (available <= 5) {
          stockText.textContent = `Only ${available} left in this variant`;
          stockText.classList.add('is-low');
        } else {
          stockText.textContent = `${available} in stock`;
          stockText.classList.remove('is-low');
        }
      } else {
        stockText.textContent = 'Out of stock';
        stockText.classList.add('is-low');
      }
      qty.max = String(Math.min(MAX_QUANTITY, Math.max(available, 1)));
      add.disabled = available < 1;
    } catch (error) {
      stockText.textContent = error.message;
      add.disabled = true;
    }
  }

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

  const mainMedia = el('div', { class: 'pdp-main-media' }, [
    image
      ? el('img', { src: image, alt: `${product.name} product image` })
      : el('div', { class: 'artwork-fallback' }, [
          el('span', { class: 'artwork-initial' }, initial),
          el('span', { class: 'artwork-sub' }, categoryName),
        ]),
  ]);

  const infoPanel = el('div', { class: 'pdp-info-panel' }, [
    el('h3', {}, 'Made for everyday movement'),
    el('p', {}, product.description || 'Heavyweight fleece, garment-dyed streetwear essentials designed in Metro Manila.'),
  ]);

  const leftGalleryCol = el('div', { class: 'pdp-gallery-col' }, [mainMedia, infoPanel]);

  const detailsCol = el('div', { class: 'pdp-details-col' }, [
    el('div', { class: 'pdp-cat-tag' }, categoryName),
    el('h1', { class: 'pdp-title' }, product.name || 'Product'),
    priceText,
    el('div', { class: 'pdp-rating-summary' }, '★★★★★ 4.6 · 23 reviews'),
    el('p', { class: 'pdp-sku' }, product.sku ? `SKU: ${product.sku}` : 'SKU: MD-001'),
    el('div', { class: 'pdp-option-group' }, [
      el('span', { class: 'pdp-option-header' }, 'Available Variants'),
      variantButtons,
    ]),
    stockText,
    el('div', { class: 'pdp-actions-row' }, [qty, add]),
    el('div', {}, [wish]),
  ]);

  const reviewBlock = reviews?.error
    ? notice('error', `Reviews could not be loaded. ${reviews.error.message}`)
    : reviewSection(product, reviews);

  return el('section', { class: 'page pdp-page' }, [
    breadcrumbs(
      { label: 'Home', href: customerHref('/') },
      { label: 'Shop', href: customerHref('/shop') },
      { label: categoryName, href: customerHref(`/shop?category=${encodeURIComponent(categoryName.toLowerCase())}`) },
      { label: product.name }
    ),
    el('div', { class: 'pdp-grid' }, [leftGalleryCol, detailsCol]),
    reviewBlock,
  ]);
}

function reviewSection(product, payload) {
  const reviews = Array.isArray(payload?.reviews) ? payload.reviews : [];
  const average = payload?.stats?.count ? payload.stats.average : null;
  const form = el('form', { class: 'pdp-info-panel', onsubmit: async (event) => {
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
    selectField('Rating', 'rating', '5', [['5', '5 Stars - Excellent'], ['4', '4 Stars - Very Good'], ['3', '3 Stars - Average'], ['2', '2 Stars - Poor'], ['1', '1 Star - Terrible']]),
    el('label', { class: 'field' }, [el('span', {}, 'Comment'), el('textarea', { name: 'comment', required: 'true', maxlength: '2000', rows: '3' })]),
    el('button', { class: 'btn btn-primary', type: 'submit' }, 'Submit review'),
  ]);

  return el('section', { class: 'pdp-reviews-section' }, [
    el('div', { class: 'reviews-header' }, [
      el('h2', { class: 'section-title' }, 'Customer reviews'),
      el('p', { class: 'pdp-rating-summary' }, average == null ? 'No approved reviews yet.' : `${average} average from ${payload.stats.count} approved review${payload.stats.count === 1 ? '' : 's'}`),
    ]),
    reviews.length ? el('div', { class: 'grid' }, reviews.map((review) => el('article', { class: 'review-card' }, [
      el('h3', { style: 'margin:0; font-size:16px;' }, review.author || 'Customer'),
      el('p', { class: 'pdp-rating-summary', style: 'margin:0;' }, `${review.rating}/5${review.verified ? ' · verified purchase' : ''}`),
      el('p', { style: 'margin:4px 0;' }, review.comment || ''),
      review.merchant_reply ? el('p', { class: 'muted' }, `Merchant reply: ${review.merchant_reply}`) : null,
    ]))) : el('p', { class: 'muted' }, 'Approved reviews will show here. Ratings are not filled in.'),
    form,
  ]);
}

async function renderCart() {
  document.title = 'Your Bag · MetroDrip customer';
  if (state.cart.length === 0) {
    return page('Your bag is empty', 'Add items from our catalog to get started. Your bag draft stays in this browser tab for 12 hours.', el('a', { class: 'btn btn-primary', href: customerHref('/shop') }, 'Browse shop'));
  }
  const itemsNodes = [];
  let subtotalCents = 0;

  for (const line of state.cart) {
    let stockNote = 'Stock not rechecked';
    try {
      const rows = await api(`/variants/${line.variant_id}/stock/`, { auth: false });
      const available = Array.isArray(rows) ? rows.reduce((sum, row) => sum + Number(row.available_stock || 0), 0) : 0;
      stockNote = available >= line.quantity ? `${available} available` : `Only ${available} available now`;
    } catch (error) {
      stockNote = error.message;
    }

    const priceCents = toCentavos(line.unit_hint?.replace(/[^\d.]/g, '') || '0') || 0;
    subtotalCents += priceCents * line.quantity;

    const qty = el('input', { class: 'pdp-qty-input', type: 'number', min: '1', max: String(MAX_QUANTITY), value: String(line.quantity) });
    const initial = (line.name || 'M').charAt(0).toUpperCase();

    itemsNodes.push(el('div', { class: 'cart-item-row' }, [
      el('div', { class: 'cart-item-thumb' }, [el('span', { class: 'artwork-initial', style: 'font-size:36px;' }, initial)]),
      el('div', { class: 'cart-item-info' }, [
        el('h4', { class: 'cart-item-title' }, line.name),
        el('span', { class: 'cart-item-variant' }, line.label),
        el('small', { class: 'muted' }, stockNote),
      ]),
      el('div', { style: 'display:flex; align-items:center; gap:8px;' }, [
        qty,
        el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => {
          const quantity = Number(qty.value);
          if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
            announce('Quantity must be a whole number from 1 to 5.');
            return;
          }
          state.cart = state.cart.map((item) => item.variant_id === line.variant_id ? { ...item, quantity } : item);
          saveCart();
          render();
        } }, 'Update'),
      ]),
      el('div', { style: 'display:flex; flex-direction:column; align-items:flex-end; gap:6px;' }, [
        el('div', { class: 'cart-item-price' }, line.unit_hint || '₱0'),
        el('button', { style: 'background:none; border:none; color:var(--danger); cursor:pointer; font-size:13px; text-decoration:underline;', type: 'button', onclick: () => {
          state.cart = state.cart.filter((item) => item.variant_id !== line.variant_id);
          saveCart();
          announce('Item removed from your bag.');
          render();
        } }, 'Remove'),
      ]),
    ]));
  }

  const shippingCents = 8500; // NCR baseline estimate ₱85
  const totalCents = subtotalCents + shippingCents;

  const summary = el('div', { class: 'summary-card' }, [
    el('h3', { class: 'summary-title' }, 'Order summary'),
    el('div', { class: 'summary-row' }, [
      el('span', {}, `Subtotal · ${state.cart.reduce((s, i) => s + i.quantity, 0)} items`),
      el('span', {}, formatCentavos(subtotalCents)),
    ]),
    el('div', { class: 'summary-row' }, [
      el('span', {}, 'Shipping · NCR estimate'),
      el('span', {}, formatCentavos(shippingCents)),
    ]),
    el('div', { class: 'summary-row summary-row-total' }, [
      el('span', {}, 'Estimated Total'),
      el('span', { class: 'summary-total-price' }, formatCentavos(totalCents)),
    ]),
    el('a', { class: 'btn btn-primary btn-full', href: customerHref('/checkout') }, 'Check out →'),
    el('p', { class: 'summary-note' }, 'Guest checkout available. Pay with GCash, Maya, or card.'),
    el('a', { href: customerHref('/shop'), style: 'font-size:14px; text-align:center; color:var(--muted);' }, '← Continue shopping'),
  ]);

  return el('section', { class: 'page cart-page' }, [
    breadcrumbs({ label: 'Home', href: customerHref('/') }, { label: 'Bag' }),
    el('h1', {}, 'Your Bag'),
    el('p', { class: 'lede' }, `${state.cart.reduce((s, i) => s + i.quantity, 0)} items · Review your order before checkout.`),
    el('div', { class: 'cart-workspace' }, [
      el('div', { class: 'cart-items-list' }, itemsNodes),
      summary,
    ]),
  ]);
}

async function renderCheckout() {
  document.title = 'Checkout · MetroDrip customer';
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

  const form = el('form', { class: 'checkout-form-card', onsubmit: (event) => submitCheckout(event, form, methods) }, [
    capabilitiesPayload?.error ? notice('error', 'Payment options could not be loaded. Online methods stay off.') : null,
    zones.length ? null : notice('error', 'No active delivery zone was returned, so checkout cannot quote shipping.'),
    el('h2', { class: 'checkout-section-title' }, '1. Shipping details'),
    field('Full name *', 'name', saved.name || profile?.name || ''),
    el('div', { style: 'display:grid; grid-template-columns:1fr 1fr; gap:16px;' }, [
      field('Email *', 'email', profile?.email || ''),
      field('Phone *', 'phone', saved.phone || profile?.phone || ''),
    ]),
    field('Address *', 'address_line1', saved.address_line1 || saved.address || ''),
    field('Address line 2', 'address_line2', saved.address_line2 || ''),
    el('div', { style: 'display:grid; grid-template-columns:1fr 1fr; gap:16px;' }, [
      field('City *', 'city', saved.city || ''),
      field('State / Region *', 'state', saved.state || ''),
    ]),
    el('div', { style: 'display:grid; grid-template-columns:1fr 1fr; gap:16px;' }, [
      field('Postal code *', 'postal_code', saved.postal_code || ''),
      el('label', { class: 'field' }, [
        el('span', {}, 'Delivery zone *'),
        el('select', { name: 'delivery_zone', required: 'true' }, [
          el('option', { value: '' }, 'Select a server zone'),
          ...zones.map((zone) => el('option', { value: zone.name }, `${zone.name} · ${money(zone.fee)}`)),
        ]),
      ]),
    ]),
    el('h2', { class: 'checkout-section-title' }, '2. Payment method'),
    el('fieldset', { style: 'border:none; padding:0; margin:0; display:flex; flex-direction:column; gap:10px;' }, [
      el('legend', { class: 'visually-hidden' }, 'Payment methods'),
      ...methods.map((method) => el('label', { style: 'display:flex; align-items:flex-start; gap:10px; padding:12px; border:1px solid var(--border); border-radius:8px; cursor:pointer;' }, [
        el('input', { type: 'radio', name: 'payment_method', value: method.id, disabled: !method.enabled, required: method.id === 'cod', style: 'margin-top:3px;' }),
        el('div', {}, [
          el('strong', {}, `${method.name}${method.enabled ? '' : ` — ${method.reason}`}`),
          el('p', { class: 'muted', style: 'margin:2px 0 0; font-size:13px;' }, method.detail),
        ]),
      ])),
    ]),
    el('p', { class: 'muted', style: 'font-size:13px;' }, 'The server calculates the PHP total and delivery fee. Card details never touch MetroDrip servers.'),
    el('button', { class: 'btn btn-primary btn-full', type: 'submit', disabled: zones.length === 0 }, 'Proceed to Payment →'),
  ]);

  const summary = el('div', { class: 'summary-card' }, [
    el('h3', { class: 'summary-title' }, 'Order summary'),
    el('div', { class: 'cart-items-summary' }, state.cart.map((item) => el('div', { style: 'display:flex; justify-content:space-between; font-size:14px; margin-bottom:8px;' }, [
      el('span', {}, `${item.name} × ${item.quantity}`),
      el('span', { class: 'mono' }, item.unit_hint || ''),
    ]))),
    el('p', { class: 'summary-note' }, 'Payment handled securely by PayMongo. GCash, Maya, and cards supported on verified rails.'),
  ]);

  return el('section', { class: 'page checkout-page' }, [
    breadcrumbs({ label: 'Bag', href: customerHref('/cart') }, { label: 'Checkout' }),
    el('h1', {}, 'Checkout'),
    el('p', { class: 'lede' }, 'Verified customer checkout with server-calculated shipping and live stock checks.'),
    el('div', { class: 'checkout-workspace' }, [form, summary]),
  ]);
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
  document.title = 'Orders · MetroDrip customer';
  if (!state.session) return signInPanel(customerHref('/orders'));
  const orders = await read('/orders/');
  const list = Array.isArray(orders) ? orders : [];
  if (!list.length) return page('Orders', 'No owned orders were returned. This list shows the latest records that have a payment.', el('a', { class: 'btn btn-primary', href: customerHref('/shop') }, 'Shop collection'));
  return page('Orders', 'Only your orders are returned. Complete payment status and tracking come from the server.', el('div', { class: 'summary-card' }, [
    el('table', { style: 'width:100%; border-collapse:collapse; text-align:left;' }, [
      el('thead', {}, el('tr', { style: 'border-bottom:1px solid var(--border); font-family:var(--font-mono); font-size:12px;' }, ['ORDER', 'STATUS', 'PAYMENT', 'TOTAL'].map((label) => el('th', { style: 'padding:10px 8px;' }, label)))),
      el('tbody', {}, list.map((order) => el('tr', { style: 'border-bottom:1px solid var(--border);' }, [
        el('td', { style: 'padding:14px 8px; font-weight:600;' }, el('a', { href: customerHref(`/orders/${order.id}`) }, order.order_no || `Order #${order.id}`)),
        el('td', { style: 'padding:14px 8px;' }, order.status || 'Unknown'),
        el('td', { style: 'padding:14px 8px;' }, order.payment_status || 'Unknown'),
        el('td', { class: 'mono', style: 'padding:14px 8px;' }, money(order.total)),
      ]))),
    ]),
  ]));
}

async function renderOrder(route) {
  document.title = `Order #${route.id} · MetroDrip customer`;
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

  return el('section', { class: 'page order-details-page' }, [
    breadcrumbs({ label: 'Orders', href: customerHref('/orders') }, { label: order.order_no || `Order #${order.id}` }),
    el('h1', {}, order.order_no || `Order #${order.id}`),
    el('p', { class: 'lede' }, 'Payment state is read directly from the server. This page does not treat a browser redirect as paid proof.'),
    el('div', { class: 'summary-card', style: 'margin-bottom:24px;' }, [
      el('p', {}, `Order status: ${order.status || 'Unknown'}`),
      el('p', {}, `Payment: ${order.payment_status || 'Unknown'} · ${order.payment_method || 'Unknown method'}`),
      el('p', { class: 'pdp-price', style: 'font-size:24px;' }, `Server total ${money(order.total)} including shipping ${money(order.shipping)}`),
      order.reconciliation_status === 'deferred' ? notice('error', 'Payment provider lookup is delayed. The status above is the last confirmed server state.') : null,
      canContinue ? el('a', { class: 'btn btn-primary', href: action.url }, 'Continue hosted checkout') : null,
      action?.url && !canContinue ? notice('error', 'A payment link was present but rejected because it is not PayMongo hosted checkout.') : null,
      el('div', { style: 'display:flex; gap:10px; margin-top:12px;' }, [
        el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => render() }, 'Refresh status'),
        canCancel ? el('button', { class: 'btn btn-danger', type: 'button', onclick: () => cancelOrder(route.id) }, 'Cancel unpaid checkout') : null,
      ]),
    ]),
    el('h2', { class: 'section-title', style: 'font-size:24px; margin-bottom:12px;' }, 'Items in order'),
    el('div', { class: 'summary-card', style: 'margin-bottom:24px;' }, (order.items || []).map((item) => el('div', { style: 'display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid var(--border); font-size:14px;' }, [
      el('span', {}, `${item.product_name || 'Item'} · ${item.variant_desc || item.sku || 'Variant'} (×${item.quantity})`),
      el('span', { class: 'mono' }, money(item.total_price)),
    ]))),
    trackingError ? notice('error', `Tracking could not be loaded. ${trackingError.message}`) : trackingBlock(tracking),
  ]);
}

function trackingBlock(tracking) {
  if (!tracking) return el('p', { class: 'muted' }, 'No tracking payload was returned.');
  const events = Array.isArray(tracking.events) ? tracking.events : [];
  return el('section', { class: 'summary-card' }, [
    el('h2', { class: 'summary-title' }, 'Shipment tracking'),
    tracking.shipment ? el('p', {}, `Shipment status: ${tracking.shipment.status || 'Unknown'}`) : el('p', { class: 'muted' }, 'No courier shipment is attached yet.'),
    el('ol', { style: 'padding-left:20px;' }, events.map((event) => el('li', { style: 'margin-bottom:6px;' }, `${event.title || event.key || 'Update'} · ${event.state || 'unknown'}`))),
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
  document.title = 'Account · MetroDrip customer';
  if (!state.session) return signInPanel(customerHref('/account'));
  const profile = await read('/profile/');
  const addresses = profile.addresses;
  const addressNote = Array.isArray(addresses)
    ? 'Saved addresses are a list. This page will not rewrite that shape.'
    : 'Profile address text uses the same addresses.address field as the mobile app.';
  const form = el('form', { class: 'summary-card', onsubmit: async (event) => {
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
    el('h3', { class: 'summary-title' }, 'Customer Profile'),
    field('Name', 'name', profile.name || ''),
    field('Email', 'email', profile.email || ''),
    field('Phone', 'phone', profile.phone || ''),
    Array.isArray(addresses) ? null : field('Address note', 'address', addresses?.address || ''),
    el('p', { class: 'muted', style: 'font-size:13px;' }, addressNote),
    el('button', { class: 'btn btn-primary', type: 'submit' }, 'Save profile'),
  ]);

  return el('section', { class: 'page account-page' }, [
    breadcrumbs({ label: 'Home', href: customerHref('/') }, { label: 'Account' }),
    el('h1', {}, 'My Account'),
    el('p', { class: 'lede' }, profile.email || ''),
    form,
    el('div', { style: 'display:flex; gap:12px; margin-top:20px; flex-wrap:wrap;' }, [
      el('a', { class: 'btn btn-secondary', href: customerHref('/orders') }, 'My Orders'),
      el('a', { class: 'btn btn-secondary', href: customerHref('/wishlist') }, 'Wishlist'),
      el('a', { class: 'btn btn-secondary', href: customerHref('/reviews') }, 'Reviews'),
      el('button', { class: 'btn btn-danger', type: 'button', onclick: signOut }, 'Sign out'),
    ]),
  ]);
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
  document.title = 'Wishlist · MetroDrip customer';
  if (!state.session) return signInPanel(customerHref('/wishlist'));
  const items = await read('/wishlist/');
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return page('Wishlist is empty', 'Saved products appear after you add one from a product page.', el('a', { class: 'btn btn-primary', href: customerHref('/shop') }, 'Explore streetwear'));
  return page('Wishlist', 'This list is your account’s saved products.', el('div', { class: 'grid' }, list.map((item) => el('article', { class: 'product-card' }, [
    el('div', { class: 'product-card-media-wrap' }, [
      usableImageUrl(item.image_url) ? el('img', { src: usableImageUrl(item.image_url), alt: '' }) : el('div', { class: 'artwork-fallback' }, [el('span', { class: 'artwork-initial' }, 'W')]),
    ]),
    el('div', { class: 'product-card-body' }, [
      el('h3', { class: 'product-card-title' }, item.name || 'Saved product'),
      el('p', { class: 'product-card-price' }, money(item.price)),
      el('div', { style: 'display:flex; gap:8px;' }, [
        el('a', { class: 'btn btn-secondary', href: customerHref(`/products/${item.product_ref}`) }, 'View product'),
        el('button', { class: 'btn btn-danger', type: 'button', onclick: async () => {
          await api(`/wishlist/?product_ref=${encodeURIComponent(item.product_ref)}`, { method: 'DELETE' });
          announce('Removed from wishlist.');
          render();
        } }, 'Remove'),
      ]),
    ]),
  ]))));
}

async function renderNotifications() {
  document.title = 'Notifications · MetroDrip customer';
  if (!state.session) return signInPanel(customerHref('/notifications'));
  let data;
  try {
    data = await read('/notifications/');
  } catch (error) {
    return page('Notifications unavailable', error.message, el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => render() }, 'Retry'));
  }
  const results = Array.isArray(data?.results) ? data.results : [];
  if (!results.length) return page('No notifications', 'The server returned an empty owned list, not a hidden error.');
  return page('Notifications', `${data.unread_count || 0} unread.`, el('button', { class: 'btn btn-secondary', style: 'margin-bottom:16px;', type: 'button', onclick: async () => {
    await api('/notifications/read-all/', { method: 'POST', body: {} });
    announce('All visible notifications marked read.');
    refreshUnread();
    render();
  } }, 'Mark all read'), el('div', { style: 'display:flex; flex-direction:column; gap:12px;' }, results.map((item) => el('article', { class: 'summary-card' }, [
    el('h3', { style: 'margin:0; font-size:18px;' }, item.title || 'Notification'),
    el('p', { style: 'margin:6px 0;' }, item.body || ''),
    el('p', { class: 'mono', style: 'font-size:12px; color:var(--muted); margin:0 0 8px;' }, item.is_read ? 'Read' : 'Unread'),
    item.is_read ? null : el('button', { class: 'btn btn-secondary', type: 'button', onclick: async () => {
      await api(`/notifications/${item.id}/read/`, { method: 'POST', body: {} });
      refreshUnread();
      render();
    } }, 'Mark read'),
  ]))));
}

async function renderReviews() {
  return page('My reviews', 'The current API can show and accept reviews on a product page. It does not provide an account-wide review list, so this page does not invent one.', el('a', { class: 'btn btn-primary', href: customerHref('/shop') }, 'Browse products'));
}

async function renderSupport() {
  return page('Support', 'Browser support requests are not connected to a working delivery endpoint. Sending this page does not create a ticket or send an email.', el('p', {}, 'Use a channel your store has actually published outside this form. Password reset delivery is also not configured.'), el('a', { class: 'btn btn-secondary', href: customerHref('/forgot-password') }, 'Password reset status'));
}

async function renderTeam() {
  return page('Our Team', 'Every piece is designed in Metro Manila — from concept to cut. MetroDrip brings high-concept streetwear crafted for everyday urban mobility.');
}

async function renderSignIn() {
  document.title = 'Sign In · MetroDrip customer';
  const next = safeCustomerPath(new URLSearchParams(location.search).get('next') || customerHref('/'));
  
  const brandPanel = el('div', { class: 'auth-brand-panel' }, [
    el('h2', { class: 'auth-brand-name' }, 'METRODRIP'),
    el('p', { class: 'auth-brand-tagline' }, ['Your city.', el('br'), 'Your style.']),
    el('p', { class: 'auth-brand-perks' }, 'Order history · Wishlist · Faster checkout'),
  ]);

  const form = el('form', { class: 'auth-form-card', onsubmit: async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await signIn(String(data.get('email') || ''), String(data.get('password') || ''));
      announce('Signed in.');
      navigate(next, { replace: true });
    } catch (error) {
      announce(error.message);
    }
  } }, [
    el('h1', { style: 'font-family:var(--font-display); font-size:36px; margin:0;' }, 'Welcome back'),
    el('p', { class: 'muted', style: 'margin:0 0 12px;' }, 'Sign in to your MetroDrip account.'),
    el('div', { class: 'auth-tabs' }, [
      el('button', { type: 'button', class: 'auth-tab-btn is-active' }, 'Sign in'),
      el('button', { type: 'button', class: 'auth-tab-btn', onclick: () => navigate(customerHref('/sign-up')) }, 'Create account'),
    ]),
    field('Email *', 'email', ''),
    secretField('Password *', 'password'),
    el('button', { class: 'btn btn-primary btn-full', type: 'submit' }, 'Sign in →'),
    el('button', { class: 'btn btn-secondary btn-full', type: 'button', onclick: () => navigate(customerHref('/shop')) }, 'Continue as guest'),
    el('p', { class: 'muted', style: 'font-size:13px; text-align:center; margin:8px 0 0;' }, [
      'Bought as a guest before? ',
      el('a', { href: customerHref('/sign-up'), style: 'color:var(--ink); text-decoration:underline;' }, 'Create an account'),
      ' to keep past orders.',
    ]),
  ]);

  return el('section', { class: 'page auth-page' }, [
    breadcrumbs({ label: 'Home', href: customerHref('/') }, { label: 'Sign in' }),
    el('div', { class: 'auth-workspace' }, [brandPanel, form]),
  ]);
}

async function renderSignUp() {
  document.title = 'Create Account · MetroDrip customer';
  const brandPanel = el('div', { class: 'auth-brand-panel' }, [
    el('h2', { class: 'auth-brand-name' }, 'METRODRIP'),
    el('p', { class: 'auth-brand-tagline' }, ['Join the', el('br'), 'movement.']),
    el('p', { class: 'auth-brand-perks' }, 'Drops notification · Wishlist · Track orders'),
  ]);

  const form = el('form', { class: 'auth-form-card', onsubmit: async (event) => {
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
  } }, [
    el('h1', { style: 'font-family:var(--font-display); font-size:36px; margin:0;' }, 'Create account'),
    el('p', { class: 'muted', style: 'margin:0 0 12px;' }, 'Password rules come from the server.'),
    el('div', { class: 'auth-tabs' }, [
      el('button', { type: 'button', class: 'auth-tab-btn', onclick: () => navigate(customerHref('/sign-in')) }, 'Sign in'),
      el('button', { type: 'button', class: 'auth-tab-btn is-active' }, 'Create account'),
    ]),
    field('Full name *', 'name', ''),
    field('Email *', 'email', ''),
    secretField('Password *', 'password'),
    el('button', { class: 'btn btn-primary btn-full', type: 'submit' }, 'Create account →'),
    el('button', { class: 'btn btn-secondary btn-full', type: 'button', onclick: () => navigate(customerHref('/shop')) }, 'Continue as guest'),
  ]);

  return el('section', { class: 'page auth-page' }, [
    breadcrumbs({ label: 'Home', href: customerHref('/') }, { label: 'Create account' }),
    el('div', { class: 'auth-workspace' }, [brandPanel, form]),
  ]);
}

function secretField(label, name) {
  return el('label', { class: 'field' }, [
    el('span', {}, label),
    el('input', { name, type: 'password', autocomplete: name === 'password' ? 'current-password' : 'off', required: 'true' }),
  ]);
}

async function renderForgot() {
  return page('Password reset unavailable', 'Reset delivery is not configured. No email is sent from this page, and no reset token is created.', el('a', { class: 'btn btn-secondary', href: customerHref('/sign-in') }, 'Back to sign in'));
}

function openDialog(title, body) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    const previously = document.activeElement;
    const confirm = el('button', { class: 'btn btn-danger', type: 'button' }, 'Confirm');
    const cancel = el('button', { class: 'btn btn-secondary', type: 'button' }, 'Cancel');
    const finish = (value) => {
      dialog.close();
      dialog.remove();
      previously?.focus?.();
      resolve(value);
    };
    confirm.addEventListener('click', () => finish(true));
    cancel.addEventListener('click', () => finish(false));
    dialog.append(
      el('h2', { style: 'font-family:var(--font-display); font-size:24px; margin:0 0 12px;' }, title),
      el('p', { class: 'muted', style: 'margin:0 0 20px;' }, body),
      el('div', { style: 'display:flex; justify-content:flex-end; gap:10px;' }, [cancel, confirm])
    );
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
  app.replaceChildren(el('p', { class: 'loading' }, 'Loading…'));
  try {
    const view = pages[route.name] || pages['not-found'];
    const node = await view(route);
    app.replaceChildren(node);
    app.focus({ preventScroll: true });
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
