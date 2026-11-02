import { api, ApiError, getAuthSnapshot, isAuthCurrent, setAuthToken } from './api.js';
import {
  CART_STORAGE_KEY,
  CHECKOUT_ATTEMPT_KEY,
  MAX_QUANTITY,
  THEME_STORAGE_KEY,
  buildCheckoutPayload,
  cartFingerprint,
  cartRecord,
  bannersForPlacement,
  customerHref,
  formatCentavos,
  newIdempotencyKey,
  normalizeBannerList,
  normalizeCapabilities,
  normalizeCart,
  parseCustomerPath,
  purchasableStock,
  pendingOtpChallenge,
  safeCustomerPath,
  toCentavos,
  trustedCheckoutUrl,
  usableImageUrl,
  variantLabel,
} from './contracts.js';
import { TEAM_MEMBERS, TEAM_HEADING, TEAM_SUBTITLE } from './teamData.js';

const app = document.querySelector('#app');
const statusNode = document.querySelector('#status');
const nav = document.querySelector('#site-nav');
const menuButton = document.querySelector('#menu-button');
const themeButton = document.querySelector('#theme-toggle');
const cartCountNode = document.querySelector('#cart-count');
const accountLink = document.querySelector('#account-link');
const unreadNodes = () => document.querySelectorAll('[data-unread-count]');
const searchForm = document.querySelector('#header-search');
const systemThemeQuery = window.matchMedia?.('(prefers-color-scheme: dark)') || null;

const state = {
  session: null,
  cart: [],
  attempt: null,
};
let navigationGeneration = 0;
let loginGeneration = 0;

function viewSnapshot() {
  return { auth: getAuthSnapshot(), navigation: navigationGeneration };
}

function isCurrent(scope) {
  return scope.navigation === navigationGeneration && isAuthCurrent(scope.auth);
}

function clearAttempt() {
  state.attempt = null;
  try {
    sessionStorage.removeItem(CHECKOUT_ATTEMPT_KEY);
  } catch {
    /* storage is optional for recovery */
  }
}

function rememberAttempt(attempt) {
  state.attempt = attempt;
  try {
    sessionStorage.setItem(CHECKOUT_ATTEMPT_KEY, JSON.stringify({
      key: attempt.key,
      fingerprint: attempt.fingerprint,
      ownerId: attempt.ownerId || null,
      orderId: attempt.orderId || null,
    }));
  } catch {
    announce('This browser did not keep the checkout retry key. Do not refresh during submission.');
  }
}

function storedAttempt() {
  try {
    const raw = JSON.parse(sessionStorage.getItem(CHECKOUT_ATTEMPT_KEY) || 'null');
    if (raw && typeof raw.key === 'string' && typeof raw.fingerprint === 'string') {
      return {
        key: raw.key,
        fingerprint: raw.fingerprint,
        ownerId: raw.ownerId || null,
        orderId: raw.orderId || null,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function changeSession(session, token = null) {
  setAuthToken(token, () => {
    changeSession(null);
    render();
    announce('Your session expired. Please sign in again.');
  });
  state.session = session;
  if (state.attempt) state.attempt.payload = null;
  const stored = storedAttempt();
  if (stored?.ownerId && session?.id && String(stored.ownerId) !== String(session.id)) clearAttempt();
  else state.attempt = null;
  app.replaceChildren();
  paintChrome();
}

async function request(path, options, scope) {
  if (!isCurrent(scope)) throw new Error('This view is no longer current.');
  const data = await api(path, { ...options, authSnapshot: scope.auth });
  if (!isCurrent(scope)) throw new Error('This view is no longer current.');
  return data;
}

async function runAction(scope, control, action) {
  if (!isCurrent(scope) || control.disabled) return;
  control.disabled = true;
  control.setAttribute('aria-busy', 'true');
  try {
    await action();
  } catch (error) {
    if (isCurrent(scope)) announce(error.message);
  } finally {
    // Clean up this action's control, never a control from a newer view.
    control.disabled = false;
    control.removeAttribute('aria-busy');
  }
}

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
  'verify-otp': renderVerifyOtp,
  'sign-up': renderSignUp,
  'forgot-password': renderForgot,
  'reset-password': renderResetPassword,
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

function themeLogo(variant, className = '', label = '') {
  const suffix = variant === 'emblem' ? 'emblem' : variant === 'wordmark' ? 'wordmark' : '';
  const basename = suffix ? `logo-${suffix}` : 'logo';
  return el('span', {
    class: `theme-logo ${className}`.trim(),
    role: label ? 'img' : null,
    'aria-label': label || null,
    'aria-hidden': label ? null : 'true',
  }, [
    el('img', { class: 'theme-logo-light', src: `/assets/branding/${basename}.png`, alt: '' }),
    el('img', { class: 'theme-logo-dark', src: `/assets/branding/${basename}-dark.png`, alt: '' }),
  ]);
}

function readThemePreference() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : null;
  } catch {
    return null;
  }
}

function systemTheme() {
  return systemThemeQuery?.matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  paintChrome();
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
  const title = status === 401 ? 'Sign-in required' : status === 403 ? 'Access denied' : status === 0 ? 'Connection problem' : 'Something went wrong';
  return page(title, error?.message || 'The request failed.', status === 401
    ? el('a', { class: 'btn btn-primary', href: customerHref('/sign-in') }, 'Sign in')
    : el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => render() }, 'Retry'));
}

function page(title, lede, ...nodes) {
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

  const fallback = el('div', { class: 'artwork-fallback' }, [
    el('span', { class: 'artwork-initial' }, initial),
    el('span', { class: 'artwork-sub' }, categoryName),
  ]);
  const artwork = image
    ? el('img', {
      src: image,
      alt: product.name || '',
      loading: 'lazy',
      onerror: (event) => event.currentTarget.replaceWith(fallback),
    })
    : fallback;

  return el('a', { class: 'product-card', href: customerHref(`/products/${product.id}`) }, [
    el('div', { class: 'product-card-media-wrap' }, artwork),
    el('div', { class: 'product-card-body' }, [
      el('span', { class: 'product-card-cat' }, categoryName),
      el('h3', { class: 'product-card-title' }, product.name || 'Untitled product'),
      el('p', { class: 'product-card-price' }, money(product.base_price)),
      el('div', { class: 'product-card-cta' }, 'View product'),
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
  const nextThemeLabel = dark ? 'Switch to light theme' : 'Switch to dark theme';
  themeButton.setAttribute('aria-label', nextThemeLabel);
  themeButton.setAttribute('title', nextThemeLabel);
}

function navigate(path, { replace = false } = {}) {
  const url = new URL(path, location.origin);
  const next = `${safeCustomerPath(url.pathname)}${url.search}`;
  if (replace) history.replaceState({}, '', next);
  else history.pushState({}, '', next);
  nav.classList.remove('is-open');
  menuButton.setAttribute('aria-expanded', 'false');
  document.querySelectorAll('.nav-group, .mobile-nav-group').forEach((group) => { group.open = false; });
  render();
}

async function loadNavigationCategories() {
  const targets = [document.querySelector('#desktop-categories'), document.querySelector('#mobile-categories')];
  try {
    const categories = await api('/categories/', { auth: false });
    if (!Array.isArray(categories)) throw new Error('Category response is unavailable.');
    for (const target of targets) {
      target.replaceChildren();
      if (target.id === 'desktop-categories') target.append(el('a', { href: customerHref('/shop') }, 'All Products'));
      if (!categories.length) target.append(el('span', {}, 'No categories available.'));
      for (const category of categories) {
        if (!category.is_active && category.is_active !== undefined) continue;
        target.append(el('a', { href: customerHref(`/shop?category=${encodeURIComponent(category.slug || category.id)}`) }, category.name));
      }
    }
  } catch {
    for (const target of targets) {
      target.replaceChildren(
        el('a', { href: customerHref('/shop') }, 'All Products'),
        el('button', { type: 'button', onclick: loadNavigationCategories }, 'Retry categories')
      );
    }
  }
}

async function refreshUnread() {
  const authSnapshot = getAuthSnapshot();
  if (!state.session) {
    for (const node of unreadNodes()) {
      node.hidden = true;
      node.textContent = '';
    }
    return;
  }
  try {
    const data = await api('/notifications/', { authSnapshot });
    if (!isAuthCurrent(authSnapshot)) return;
    const count = Number(data?.unread_count || 0);
    for (const node of unreadNodes()) {
      node.hidden = count < 1;
      node.textContent = String(count);
    }
  } catch {
    if (isAuthCurrent(authSnapshot)) {
      for (const node of unreadNodes()) node.hidden = true;
    }
  }
}

function signInPanel(nextPath) {
  return page(
    'Sign In Required',
    'Sign in to access your orders, saved items, and account information.',
    el('a', {
      class: 'btn btn-primary',
      href: `${customerHref('/sign-in')}?next=${encodeURIComponent(nextPath)}`,
    }, 'Sign In'),
  );
}

function requireSession(nextPath, scope) {
  if (!isCurrent(scope)) return false;
  if (state.session) return true;
  navigate(`${customerHref('/sign-in')}?next=${encodeURIComponent(nextPath)}`);
  return false;
}

async function signIn(email, password, scope, nextPath = customerHref('/')) {
  const generation = ++loginGeneration;
  const data = await api('/login/', { method: 'POST', auth: false, body: { email, password } });
  const pending = pendingOtpChallenge(data);
  if (pending) {
    sessionStorage.setItem('metrodrip_otp_challenge', JSON.stringify({ ...pending, next: nextPath }));
    navigate(customerHref('/verify-otp'));
    return null;
  }
  const token = data.access_token || data.token;
  if (!isCurrent(scope) || generation !== loginGeneration || data.role !== 'customer') {
    if (token) {
      try { await api('/logout/', { method: 'POST', authSnapshot: { token } }); } catch { /* unaccepted token: revoke best effort */ }
    }
    if (!isCurrent(scope) || generation !== loginGeneration) return null;
    throw new Error('This shop accepts customer accounts only. Merchant and admin accounts stay on the staff portal.');
  }
  if (!token) throw new Error('Sign-in did not return a customer token. Please try again.');
  changeSession({ id: data.id, name: data.name, email: data.email, role: data.role, phone: data.phone || '', addresses: data.addresses }, token);
  refreshUnread();
  return viewSnapshot();
}

function bannerHref(banner) {
  const destination = banner?.link_url || '';
  if (!destination) return customerHref('/shop');
  if (destination.startsWith('https://')) return destination;
  return customerHref(destination);
}

function renderPlacementBanner(banner, className) {
  if (!banner) return null;
  const hasImage = Boolean(banner.image_url);
  const containerClasses = [className, hasImage ? 'has-media' : ''].filter(Boolean).join(' ');
  const imageElement = hasImage
    ? el('div', { class: 'published-banner-media' }, [
        el('img', {
          src: banner.image_url,
          alt: banner.headline || banner.title || 'Promotion',
          loading: 'lazy',
        }),
      ])
    : null;

  return el('aside', { class: containerClasses }, [
    imageElement,
    el('div', { class: 'published-banner-content' }, [
      el('h2', {}, banner.headline || banner.title || 'Promotion'),
      banner.subtext ? el('p', {}, banner.subtext) : null,
    ]),
    el('a', { class: 'btn btn-primary', href: bannerHref(banner) }, banner.button_label || 'Shop Now'),
  ]);
}

let globalAnnouncementPromise = null;
function syncAnnouncementBanner() {
  if (!globalAnnouncementPromise) {
    globalAnnouncementPromise = api('/banners/?placement=announcement_bar', { auth: false })
      .then((data) => normalizeBannerList(data))
      .catch(() => null);
  }
  globalAnnouncementPromise.then((list) => {
    if (list) applyAnnouncement(list);
  });
}

function applyAnnouncement(banners) {
  const node = document.querySelector('#announcement-text');
  const banner = bannersForPlacement(banners, 'announcement_bar')[0];
  if (!node) return;
  node.textContent = banner
    ? `${banner.headline || banner.title}${banner.subtext ? ` · ${banner.subtext}` : ''}`
    : 'METRO MANILA STREETWEAR · PAYMENT OPTIONS CONFIRMED AT CHECKOUT';
}

async function renderHome() {
  let bannerError = null;
  let published = [];
  const [categories, products, bannerPayload] = await Promise.all([
    api('/categories/', { auth: false }).catch(() => []),
    api('/products/?sort=newest', { auth: false }).catch(() => []),
    api('/banners/', { auth: false }).then((data) => ({ data })).catch((error) => ({ error })),
  ]);
  if (bannerPayload.error) {
    bannerError = bannerPayload.error;
  } else {
    published = normalizeBannerList(bannerPayload.data);
    if (published === null) {
      bannerError = new Error('Banner response was not a list.');
    } else {
      globalAnnouncementPromise = Promise.resolve(published);
      applyAnnouncement(published);
    }
  }
  const categoryList = Array.isArray(categories) ? categories : [];
  const productList = Array.isArray(products) ? products : [];
  const arrivals = productList.slice(0, 8);

  const heroBanner = bannerError ? null : bannersForPlacement(published, 'homepage_hero')[0] || null;
  const secondaryBanner = bannerError ? null : bannersForPlacement(published, 'homepage_secondary')[0] || null;

  const heroTitleContent = heroBanner?.headline
    ? heroBanner.headline
    : ['Urban Style', el('br'), 'Redefined'];
  const heroSubtitleContent = heroBanner?.subtext || 'Designed for the City';
  const heroCtaLabel = heroBanner?.button_label || 'Shop Now';
  const heroCtaHref = bannerHref(heroBanner);

  const artworkMode = heroBanner?.artwork_mode || (heroBanner?.image_url ? 'image' : 'graphic');

  let artworkCard;
  if (artworkMode === 'image' && heroBanner?.image_url) {
    const fit = heroBanner.image_fit === 'contain' ? 'contain' : 'cover';
    const fallbackGraphic = el('div', { class: 'hero-artwork-fallback', style: 'display: none; width: 100%; padding: 36px 32px;' }, [
      el('div', { class: 'artwork-big-logo' }, heroBanner?.graphic_text_main || 'MD'),
      el('div', { class: 'artwork-tagline' }, heroBanner?.graphic_text_tagline || 'BUILT FOR THE STREETS'),
      el('div', { class: 'artwork-origin' }, heroBanner?.graphic_text_sub || 'METRODRIP / MANILA'),
    ]);
    const imgEl = el('img', {
      src: heroBanner.image_url,
      alt: heroBanner.headline || heroBanner.title || 'MetroDrip Hero Promotional Artwork',
      class: 'hero-artwork-img',
      style: `width: 100%; height: 100%; object-fit: ${fit}; display: block;`,
    });
    imgEl.addEventListener('error', () => {
      imgEl.style.display = 'none';
      fallbackGraphic.style.display = 'flex';
      fallbackGraphic.style.flexDirection = 'column';
      fallbackGraphic.style.justifyContent = 'center';
      if (artworkCard) {
        artworkCard.style.padding = '';
        artworkCard.style.backgroundColor = heroBanner?.graphic_bg_color || 'var(--volt)';
        artworkCard.style.color = heroBanner?.graphic_text_color || '#141414';
      }
    });
    artworkCard = el('div', {
      class: 'hero-artwork-card hero-artwork-image-mode',
      style: 'padding: 0; overflow: hidden; background: #141414; display: flex; align-items: center; justify-content: center;',
    }, [
      imgEl,
      fallbackGraphic,
    ]);
  } else if (artworkMode === 'graphic' || !heroBanner) {
    const mainText = heroBanner?.graphic_text_main ?? 'MD';
    const taglineText = heroBanner?.graphic_text_tagline ?? 'BUILT FOR THE STREETS';
    const subText = heroBanner?.graphic_text_sub ?? 'METRODRIP / MANILA';
    const bgColor = heroBanner?.graphic_bg_color || 'var(--volt)';
    const textColor = heroBanner?.graphic_text_color || '#141414';
    const accentColor = heroBanner?.graphic_accent_color || textColor;
    const alignment = heroBanner?.graphic_alignment || 'left';
    const fontSize = heroBanner?.graphic_font_size || 'normal';

    const cardStyles = [
      `background-color: ${bgColor}`,
      `color: ${textColor}`,
      `text-align: ${alignment}`,
      alignment === 'center' ? 'align-items: center' : alignment === 'right' ? 'align-items: flex-end' : 'align-items: flex-start',
    ].join('; ');

    const logoClass = `artwork-big-logo font-size-${fontSize}`;

    artworkCard = el('div', {
      class: `hero-artwork-card hero-artwork-graphic-mode align-${alignment}`,
      style: cardStyles,
    }, [
      el('div', { class: logoClass, style: `color: ${textColor};` }, mainText),
      el('div', { class: 'artwork-tagline', style: `color: ${textColor};` }, taglineText),
      el('div', { class: 'artwork-origin', style: `color: ${accentColor};` }, subText),
    ]);
  } else {
    artworkCard = el('div', { class: 'hero-artwork-card' }, [
      el('div', { class: 'artwork-big-logo' }, 'MD'),
      el('div', { class: 'artwork-tagline' }, 'BUILT FOR THE STREETS'),
      el('div', { class: 'artwork-origin' }, 'METRODRIP / MANILA'),
    ]);
  }

  const hero = el('div', { class: 'homepage-hero' }, [
    el('div', { class: 'hero-copy' }, [
      el('div', { class: 'hero-eyebrow' }, 'METRO MANILA STREETWEAR'),
      el('h1', { class: heroBanner ? 'hero-title is-published' : 'hero-title' }, heroTitleContent),
      el('p', { class: 'hero-subtitle' }, heroSubtitleContent),
      el('a', { class: 'hero-cta', href: heroCtaHref }, heroCtaLabel),
    ]),
    artworkCard,
  ]);

  const categoryBar = el('div', { class: 'category-bar' }, [
    el('a', { class: 'category-pill', href: customerHref('/shop') }, 'All Products'),
    ...categoryList.map((category) => el('a', {
      class: 'category-pill',
      href: customerHref(`/shop?category=${encodeURIComponent(category.slug || category.id)}`),
    }, category.name)),
  ]);

  const sectionHeader = el('div', { class: 'section-header' }, [
    el('h2', { class: 'section-title' }, 'New Arrivals'),
    el('a', { class: 'section-link', href: customerHref('/shop?sort=newest') }, 'View all'),
  ]);

  const grid = arrivals.length
    ? el('div', { class: 'grid' }, arrivals.map(productCard))
    : el('div', { class: 'empty' }, 'No active products were returned.');

  const brandStory = el('div', { class: 'brand-story-banner' }, [
    el('div', { class: 'brand-story-content' }, [
      el('h2', { class: 'brand-story-title' }, 'Built for the Streets'),
      el('p', { class: 'brand-story-desc' }, 'Every piece is designed in Metro Manila — from concept to cut.'),
    ]),
    el('a', { class: 'btn btn-secondary', href: customerHref('/team') }, 'Meet the team'),
  ]);

  return el('section', { class: 'page home-page' }, [
    bannerError ? notice('error', bannerError.message || 'Published banners could not be loaded. The default hero is a fallback, not a live campaign.') : null,
    hero,
    renderPlacementBanner(secondaryBanner, 'published-banner'),
    categoryBar,
    sectionHeader,
    grid,
    brandStory,
  ]);
}

async function renderShop() {
  const params = new URLSearchParams(location.search);
  const query = new URLSearchParams();
  for (const key of ['search', 'category', 'size', 'color', 'fit', 'sort', 'featured']) {
    const value = params.get(key);
    if (value) query.set(key, value);
  }
  let products = [];
  let categories = [];
  let categoryBanner = null;
  let failed = null;
  try {
    const [productPayload, categoryPayload, bannerPayload] = await Promise.all([
      api(`/products/${query.size ? `?${query}` : ''}`, { auth: false }),
      api('/categories/', { auth: false }),
      api('/banners/?placement=category_banner', { auth: false }).catch(() => null),
    ]);
    products = productPayload;
    categories = categoryPayload;
    categoryBanner = bannersForPlacement(normalizeBannerList(bannerPayload) || [], 'category_banner')[0] || null;
  } catch (error) {
    failed = error;
  }
  const list = Array.isArray(products) ? products : [];
  const categoryList = Array.isArray(categories) ? categories : [];
  const selectedCategory = params.get('category') || '';

  const form = el('form', { class: 'filters-sidebar', onsubmit: (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const next = new URLSearchParams(location.search);
    for (const key of ['search', 'size', 'color', 'fit']) next.delete(key);
    for (const [key, value] of data.entries()) {
      if (['search', 'size', 'color', 'fit'].includes(key) && String(value).trim()) next.set(key, String(value).trim());
    }
    navigate(`${customerHref('/shop')}${next.size ? `?${next}` : ''}`);
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
    field('Size', 'size', params.get('size') || '', 'Filter by size (e.g. S, M, L, XL).'),
    field('Fit attribute', 'fit', params.get('fit') || '', 'Matches a stored fit attribute.'),
    field('Color', 'color', params.get('color') || '', 'Matches a stored color name.'),
    el('button', { class: 'btn btn-primary btn-full', type: 'submit' }, 'Apply Filters'),
    el('button', { class: 'btn btn-secondary btn-full', type: 'button', onclick: () => navigate(customerHref('/shop')) }, 'Clear filters'),
  ]);

  const toolbar = el('div', { class: 'shop-results-toolbar' }, [
    el('div', { class: 'results-count' }, `${list.length} item${list.length === 1 ? '' : 's'}`),
    el('div', { class: 'sort-select-wrap' }, [
      el('select', {
        name: 'sort',
        'aria-label': 'Sort products',
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
    renderPlacementBanner(categoryBanner, 'published-banner'),
    el('div', { class: 'shop-workspace' }, [form, rightCol]),
  ]);
}

function field(label, name, value, hint) {
  const isEmail = name === 'email';
  return el('label', { class: 'field' }, [
    el('span', {}, label),
    el('input', {
      name,
      value,
      type: name === 'search' ? 'search' : isEmail ? 'email' : 'text',
      autocomplete: isEmail ? 'email' : undefined,
    }),
    hint ? el('small', {}, hint) : null,
  ]);
}

function selectField(label, name, selected, choices) {
  return el('label', { class: 'field' }, [
    el('span', {}, label),
    el('select', { name }, choices.map(([value, text]) => el('option', { value, selected: value === selected }, text))),
  ]);
}

async function renderProduct(route, scope) {
  const [product, variants, reviews] = await Promise.all([
    api(`/products/${route.id}/`, { auth: false }),
    api(`/products/${route.id}/variants/`, { auth: false }),
    api(`/products/${route.id}/reviews/`, { auth: false }).catch((error) => ({ error })),
  ]);
  const variantList = Array.isArray(variants) ? variants : [];
  let selected = variantList[0] || null;
  let stockRequest = 0;
  const image = usableImageUrl(product.image_url);
  const initial = (product.name || 'M').charAt(0).toUpperCase();
  const categoryName = getCategoryName(product);

  const stockText = el('p', { class: 'pdp-stock-status' }, 'Select a variant to check stock.');
  const priceText = el('p', { class: 'pdp-price' }, money(product.base_price));
  const qty = el('input', { class: 'pdp-qty-input', type: 'number', min: '1', max: String(MAX_QUANTITY), value: '1', inputmode: 'numeric', 'aria-label': 'Quantity' });
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
    if (!isCurrent(scope)) return;
    const requestId = ++stockRequest;
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
      if (!isCurrent(scope) || requestId !== stockRequest || selected?.id !== variant.id) return;
      const available = Array.isArray(rows)
        ? purchasableStock(rows)
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
      if (!isCurrent(scope)) return;
      stockText.textContent = error.message;
      add.disabled = true;
    }
  }

  add.addEventListener('click', async () => {
    if (!isCurrent(scope)) return;
    const variant = selected;
    const quantity = Number(qty.value);
    if (!variant || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      announce('Enter a quantity from 1 to 5.');
      return;
    }
    const rows = await api(`/variants/${variant.id}/stock/`, { auth: false });
    if (!isCurrent(scope) || selected?.id !== variant.id) {
      announce('The selected variant changed before stock was confirmed. Nothing was added.');
      return;
    }
    const available = purchasableStock(rows);
    const existing = state.cart.find((line) => line.variant_id === variant.id);
    if (quantity + (existing?.quantity || 0) > Math.min(MAX_QUANTITY, available)) {
      announce('That quantity is above the available stock or the 5-item limit.');
      return;
    }
    const line = {
      variant_id: variant.id,
      product_id: product.id,
      quantity: quantity + (existing?.quantity || 0),
      name: product.name,
      label: variantLabel(variant),
      unit_hint: priceText.textContent,
    };
    state.cart = existing
      ? state.cart.map((item) => item.variant_id === variant.id ? line : item)
      : state.cart.concat(line);
    saveCart();
    announce(`${product.name} added to cart.`);
  });

  wish.addEventListener('click', () => {
    if (!requireSession(customerHref(`/products/${product.id}`), scope)) return;
    return runAction(scope, wish, async () => {
      await request('/wishlist/', { method: 'POST', body: { product_ref: product.id } }, scope);
      if (!isCurrent(scope)) return;
      announce('Saved to your wishlist.');
    });
  });

  if (selected) refreshVariant(selected);

  const mediaList = Array.isArray(product.media) ? product.media.filter(m => usableImageUrl(m.url)) : [];
  let currentMainUrl = image || (mediaList[0] ? usableImageUrl(mediaList[0].url) : '');

  const pdpFallback = () => el('div', { class: 'artwork-fallback' }, [
    el('span', { class: 'artwork-initial' }, initial),
    el('span', { class: 'artwork-sub' }, categoryName),
  ]);

  const mainMediaImg = currentMainUrl
    ? el('img', {
        src: currentMainUrl,
        alt: `${product.name} product image`,
        fetchpriority: 'high',
        onerror: (event) => event.currentTarget.replaceWith(pdpFallback()),
      })
    : pdpFallback();

  const mainMedia = el('div', { class: 'pdp-main-media' }, [mainMediaImg]);

  let galleryThumbnails = null;
  if (mediaList.length > 1) {
    galleryThumbnails = el('div', { class: 'pdp-gallery-strip', style: 'display: flex; gap: 8px; margin-top: 10px; overflow-x: auto; padding-bottom: 4px;' }, mediaList.map((m) => {
      const mUrl = usableImageUrl(m.url);
      const isSelected = mUrl === currentMainUrl;
      const thumbBtn = el('button', {
        type: 'button',
        class: `pdp-thumb-btn ${isSelected ? 'is-active' : ''}`,
        style: `width: 60px; height: 60px; border-radius: 6px; border: 2px solid ${isSelected ? 'var(--color-primary, #00E676)' : 'transparent'}; overflow: hidden; padding: 0; background: var(--color-surface, #1e1e1e); cursor: pointer; flex-shrink: 0;`,
        'aria-label': m.alt_text || 'View product image',
        onclick: () => {
          if (mainMediaImg.tagName === 'IMG') {
            mainMediaImg.src = mUrl;
          }
          galleryThumbnails.querySelectorAll('.pdp-thumb-btn').forEach((b) => {
            b.classList.remove('is-active');
            b.style.borderColor = 'transparent';
          });
          thumbBtn.classList.add('is-active');
          thumbBtn.style.borderColor = 'var(--color-primary, #00E676)';
        },
      }, [
        el('img', {
          src: mUrl,
          alt: m.alt_text || '',
          style: 'width: 100%; height: 100%; object-fit: cover;',
          onerror: (event) => {
            event.currentTarget.replaceWith(el('div', { class: 'artwork-fallback', style: 'width: 100%; height: 100%;' }, [
              el('span', { class: 'artwork-initial', style: 'font-size: 16px;' }, initial),
            ]));
          },
        }),
      ]);
      return thumbBtn;
    }));
  }

  const infoPanel = el('div', { class: 'pdp-info-panel' }, [
    el('h3', {}, 'Made for everyday movement'),
    el('p', {}, product.description || 'No description was returned for this product.'),
  ]);

  const leftGalleryCol = el('div', { class: 'pdp-gallery-col' }, [mainMedia, galleryThumbnails, infoPanel].filter(Boolean));

  const detailsCol = el('div', { class: 'pdp-details-col' }, [
    el('div', { class: 'pdp-cat-tag' }, categoryName),
    el('h1', { class: 'pdp-title' }, product.name || 'Product'),
    priceText,
    el('p', { class: 'pdp-rating-summary' }, reviews?.stats?.count
      ? `${reviews.stats.average} average from ${reviews.stats.count} approved review${reviews.stats.count === 1 ? '' : 's'}`
      : 'No approved reviews yet.'),
    el('p', { class: 'pdp-sku' }, product.sku ? `SKU: ${product.sku}` : 'No SKU returned'),
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
    : reviewSection(product, reviews, scope);

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

function reviewSection(product, payload, scope) {
  const reviews = Array.isArray(payload?.reviews) ? payload.reviews : [];
  const average = payload?.stats?.count ? payload.stats.average : null;
  const form = el('form', { class: 'pdp-info-panel', onsubmit: async (event) => {
    event.preventDefault();
    if (!requireSession(customerHref(`/products/${product.id}`), scope)) return;
    return runAction(scope, form.querySelector('button[type="submit"]'), async () => {
      const data = new FormData(form);
      await request(`/products/${product.id}/reviews/`, {
        method: 'POST',
        body: { rating: Number(data.get('rating')), comment: String(data.get('comment') || '') },
      }, scope);
      if (!isCurrent(scope)) return;
      announce('Review submitted. It appears after the server approves it.');
      render();
    });
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

async function renderCart(_route, scope) {
  if (state.cart.length === 0) {
    const node = page('Your bag is empty', 'Add items from our catalog to get started. Your bag draft stays in this browser tab for 12 hours.', el('a', { class: 'btn btn-primary', href: customerHref('/shop') }, 'Browse shop'));
    node.classList.add('cart-page');
    return node;
  }
  const itemsNodes = [];
  let subtotalCents = 0;

  for (const line of state.cart) {
    let stockNote = 'Stock not rechecked';
    try {
      const rows = await api(`/variants/${line.variant_id}/stock/`, { auth: false });
    const available = purchasableStock(rows);
      stockNote = available >= line.quantity ? `${available} available` : `Only ${available} available now`;
    } catch (error) {
      stockNote = error.message;
    }

    const priceCents = toCentavos(line.unit_hint?.replace(/[^\d.]/g, '') || '0') || 0;
    subtotalCents += priceCents * line.quantity;

    const qty = el('input', {
      class: 'pdp-qty-input',
      type: 'number',
      min: '1',
      max: String(MAX_QUANTITY),
      value: String(line.quantity),
      'aria-label': `Quantity for ${line.name || 'saved item'}`,
    });
    const initial = (line.name || 'M').charAt(0).toUpperCase();

    itemsNodes.push(el('div', { class: 'cart-item-row' }, [
      el('div', { class: 'cart-item-thumb' }, [el('span', { class: 'artwork-initial', style: 'font-size:36px;' }, initial)]),
      el('div', { class: 'cart-item-info' }, [
        el('h2', { class: 'cart-item-title' }, line.name),
        el('span', { class: 'cart-item-variant' }, line.label),
        el('small', { class: 'muted' }, stockNote),
      ]),
      el('div', { style: 'display:flex; align-items:center; gap:8px;' }, [
        qty,
        el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => {
          if (!isCurrent(scope)) return;
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
          if (!isCurrent(scope)) return;
          state.cart = state.cart.filter((item) => item.variant_id !== line.variant_id);
          saveCart();
          announce('Item removed from your bag.');
          render();
        } }, 'Remove'),
      ]),
    ]));
  }

  const summary = el('div', { class: 'summary-card' }, [
    el('h3', { class: 'summary-title' }, 'Order summary'),
    el('div', { class: 'summary-row' }, [
      el('span', {}, `Estimated subtotal · ${state.cart.reduce((s, i) => s + i.quantity, 0)} items`),
      el('span', {}, formatCentavos(subtotalCents)),
    ]),
    el('div', { class: 'summary-row' }, [
      el('span', {}, 'Shipping'),
      el('span', {}, 'Calculated at checkout'),
    ]),
    el('a', { class: 'btn btn-primary btn-full', href: customerHref('/checkout') }, 'Check out'),
    el('p', { class: 'summary-note' }, 'Sign in to place your order. Available payment methods appear at checkout.'),
    el('a', { href: customerHref('/shop'), style: 'font-size:14px; text-align:center; color:var(--muted);' }, 'Continue shopping'),
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

async function renderCheckout(_route, scope) {
  if (!state.session) return signInPanel(customerHref('/checkout'));
  let checkoutBanner = null;
  try {
    const payload = await api('/banners/?placement=checkout_footer', { auth: false });
    checkoutBanner = bannersForPlacement(normalizeBannerList(payload) || [], 'checkout_footer')[0] || null;
  } catch {
    checkoutBanner = null;
  }
  const stored = storedAttempt();
  if (stored?.ownerId && String(stored.ownerId) !== String(state.session.id)) {
    clearAttempt();
  } else if (stored) {
    try {
      const recovered = await request(`/api/orders/checkout/?idempotency_key=${encodeURIComponent(stored.key)}`, {}, scope);
      if (String(recovered.id) === String(stored.orderId) && (recovered.payment_status === 'paid' || recovered.payment_method === 'cod') && stored.fingerprint === cartFingerprint(state.cart)) {
        retainConfirmed(recovered);
      }
      clearAttempt();
      navigate(customerHref(`/orders/${recovered.id}`), { replace: true });
      return el('p', {}, 'Opening the recovered order.');
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
      state.attempt = { ...stored, ownerId: state.session.id, payload: null };
      announce('No completed order was found for the saved checkout key. Retry keeps that key. Start a new checkout only after confirming the previous attempt was not placed.');
    }
  }
  const [zonesPayload, capabilitiesPayload, profile] = await Promise.all([
    api('/api/shipping-zones/', { auth: false }),
    api('/api/payments/capabilities/', { auth: false }).catch((error) => ({ error })),
    request('/profile/', {}, scope),
  ]);
  const zones = Array.isArray(zonesPayload?.zones) ? zonesPayload.zones : [];
  const methods = capabilitiesPayload?.error
    ? normalizeCapabilities(null).map((option) => option.id === 'cod' ? option : { ...option, enabled: false, reason: 'Availability could not be confirmed.' })
    : normalizeCapabilities(capabilitiesPayload);
  const saved = profile?.addresses && typeof profile.addresses === 'object' && !Array.isArray(profile.addresses) ? profile.addresses : {};

  const form = el('form', { class: 'checkout-form-card', onsubmit: (event) => submitCheckout(event, form, methods, scope) }, [
    capabilitiesPayload?.error ? notice('error', 'Online payment options could not be loaded. Please select Cash on Delivery or refresh to retry.') : null,
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
    el('button', { class: 'btn btn-primary btn-full', type: 'submit', disabled: zones.length === 0 }, 'Place order or continue to payment'),
    state.attempt ? el('button', { class: 'btn btn-secondary btn-full', type: 'button', onclick: () => { clearAttempt(); announce('Saved checkout key cleared. The next submission starts a new checkout.'); } }, 'Start a new checkout') : null,
  ]);

  const summary = el('div', { class: 'summary-card' }, [
    el('h3', { class: 'summary-title' }, 'Order summary'),
    el('div', { class: 'cart-items-summary' }, state.cart.map((item) => el('div', { style: 'display:flex; justify-content:space-between; font-size:14px; margin-bottom:8px;' }, [
      el('span', {}, `${item.name} × ${item.quantity}`),
      el('span', { class: 'mono' }, item.unit_hint || ''),
    ]))),
    el('p', { class: 'summary-note' }, 'Online payment opens only for a rail the server currently marks available.'),
  ]);

  return el('section', { class: 'page checkout-page' }, [
    breadcrumbs({ label: 'Bag', href: customerHref('/cart') }, { label: 'Checkout' }),
    el('h1', {}, 'Checkout'),
    el('p', { class: 'lede' }, 'Verified customer checkout with server-calculated shipping and live stock checks.'),
    el('div', { class: 'checkout-workspace' }, [form, summary]),
    renderPlacementBanner(checkoutBanner, 'published-banner'),
  ]);
}

async function submitCheckout(event, form, methods, scope) {
  event.preventDefault();
  if (!requireSession(customerHref('/checkout'), scope)) return;
  const button = form.querySelector('button[type="submit"]');
  if (button.disabled) return;
  const data = new FormData(form);
  const method = String(data.get('payment_method') || '');
  const selected = methods.find((item) => item.id === method);
  if (!selected?.enabled) {
    announce('Choose an enabled payment method.');
    return;
  }
  const fingerprint = cartFingerprint(state.cart);
  if (state.attempt?.fingerprint && state.attempt.fingerprint !== fingerprint) {
    announce('The cart changed after the last checkout attempt. Recover that attempt before starting another.');
    return;
  }
  if (!state.attempt?.payload) {
    try {
      const payload = buildCheckoutPayload({
        lines: state.cart,
        address: Object.fromEntries(data.entries()),
        zoneName: String(data.get('delivery_zone') || ''),
        method,
        idempotencyKey: state.attempt?.key || newIdempotencyKey(),
      });
      rememberAttempt({
        key: payload.idempotency_key,
        fingerprint,
        payload,
        ownerId: state.session?.id || null,
        orderId: state.attempt?.orderId || null,
      });
    } catch (error) {
      announce(error.message);
      return;
    }
  }
  const payload = state.attempt.payload;
  button.disabled = true;
  announce('Submitting checkout…');
  try {
    const order = await request('/api/orders/checkout/', { method: 'POST', body: payload }, scope);
    if (!isCurrent(scope)) return;
    if (order.payment_status === 'paid' || order.payment_method === 'cod') {
      retainConfirmed(order);
      clearAttempt();
    } else {
      rememberAttempt({ ...state.attempt, orderId: order.id, ownerId: state.session?.id || state.attempt.ownerId });
    }
    const action = order.payment_action;
    if (action?.type === 'redirect') {
      if (!trustedCheckoutUrl(action.url)) {
        announce('The server returned a payment link that is not on PayMongo hosted checkout. No redirect was followed.');
        navigate(customerHref(`/orders/${order.id}`));
        return;
      }
      announce('Redirecting to secure checkout…');
      location.assign(action.url);
      return;
    }
    announce(order.payment_method === 'cod' ? 'Order placed. Payment is due on delivery.' : 'Checkout response received.');
    navigate(customerHref(`/orders/${order.id}`));
  } catch (error) {
    if (!isCurrent(scope)) return;
    if (error instanceof ApiError && error.status === 0) {
      announce(`${error.message} Retry will reuse the same checkout key.`);
      return;
    }
    if (error instanceof ApiError && error.data?.code === 'idempotency_conflict' && state.attempt?.key) {
      announce('That checkout key already belongs to another attempt. It was not replaced with a new order.');
      return;
    }
    announce(error.message);
  } finally {
    button.disabled = false;
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

async function renderOrders(_route, scope) {
  if (!state.session) return signInPanel(customerHref('/orders'));
  const orders = await request('/orders/', {}, scope);
  const list = Array.isArray(orders) ? orders : [];
  if (!list.length) {
    return el('section', { class: 'page orders-page' }, [
      breadcrumbs({ label: 'Home', href: customerHref('/') }, { label: 'Orders & Tracking' }),
      el('h1', { tabindex: '-1' }, 'Orders & Tracking'),
      el('p', { class: 'lede' }, 'View your orders, check payment progress, and follow available delivery updates.'),
      el('div', { class: 'summary-card', style: 'text-align: center; padding: 48px 24px;' }, [
        el('h2', { style: 'font-size: 24px; margin: 0 0 8px;' }, 'No orders yet'),
        el('p', { class: 'muted', style: 'margin: 0 0 24px;' }, 'Your orders will appear here after checkout. Explore the collection to find your next fit.'),
        el('a', { class: 'btn btn-primary', href: customerHref('/shop') }, 'Shop Now'),
      ]),
    ]);
  }
  return el('section', { class: 'page orders-page' }, [
    breadcrumbs({ label: 'Home', href: customerHref('/') }, { label: 'Orders & Tracking' }),
    el('h1', { tabindex: '-1' }, 'Orders & Tracking'),
    el('p', { class: 'lede' }, 'View your orders, check payment progress, and follow available delivery updates.'),
    el('div', { class: 'summary-card' }, [
      el('table', { style: 'width:100%; border-collapse:collapse; text-align:left;' }, [
        el('thead', {}, el('tr', { style: 'border-bottom:1px solid var(--border); font-family:var(--font-mono); font-size:12px;' }, ['ORDER NUMBER', 'ORDER STATUS', 'PAYMENT STATUS', 'TOTAL'].map((label) => el('th', { style: 'padding:10px 8px;' }, label)))),
        el('tbody', {}, list.map((order) => el('tr', { style: 'border-bottom:1px solid var(--border);' }, [
          el('td', { style: 'padding:14px 8px; font-weight:600;' }, el('a', { href: customerHref(`/orders/${order.id}`) }, order.order_no || `Order #${order.id}`)),
          el('td', { style: 'padding:14px 8px;' }, order.status || 'Unknown'),
          el('td', { style: 'padding:14px 8px;' }, order.payment_status || 'Unknown'),
          el('td', { class: 'mono', style: 'padding:14px 8px;' }, money(order.total)),
        ]))),
      ]),
    ]),
  ]);
}

function formatPaymentMethod(method) {
  const map = {
    gcash: 'GCash',
    maya: 'Maya',
    card: 'Credit / Debit Card',
    qrph: 'QR Ph',
    cod: 'Cash on Delivery',
  };
  return map[(method || '').toLowerCase()] || (method ? method.toUpperCase() : 'Unknown');
}

function paymentStatusConfig(order, queryReturn) {
  const pStatus = (order.payment_status || '').toLowerCase();
  const oStatus = (order.status || '').toLowerCase();
  const method = (order.payment_method || '').toLowerCase();
  const deferred = order.reconciliation_status === 'deferred';

  // State 6: Paid payment requiring manual review
  if (oStatus === 'payment_review' || pStatus === 'under_review') {
    return {
      state: 'review',
      badgeClass: 'badge-review',
      badgeText: 'Payment Under Review',
      title: 'Payment Received — Manual Review in Progress',
      lede: 'Your payment was recorded, but order fulfillment is temporarily on hold pending review.',
      description: 'This occurs if payment was confirmed after the inventory reservation window expired or if transaction details required additional verification. Our fulfillment team is reviewing your order.',
      icon: 'review',
      themeClass: 'order-state-review',
    };
  }

  // State 1: Payment confirmed
  if (pStatus === 'paid' || ['paid', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'completed'].includes(oStatus)) {
    return {
      state: 'confirmed',
      badgeClass: 'badge-confirmed',
      badgeText: 'Payment Confirmed',
      title: 'Payment Verified & Confirmed',
      lede: 'Your payment has been successfully verified directly with PayMongo.',
      description: 'Thank you for your order! Your streetwear pieces are being prepared by our fulfillment team. You can monitor your delivery progress below.',
      icon: 'confirmed',
      themeClass: 'order-state-confirmed',
    };
  }

  // State 5: Provider temporarily unavailable
  if (deferred) {
    return {
      state: 'deferred',
      badgeClass: 'badge-deferred',
      badgeText: 'Provider Delayed',
      title: 'Payment Provider Verification Delayed',
      lede: 'PayMongo is temporarily slow or unreachable. Your checkout session is safe.',
      description: 'Our backend will automatically check and reconcile your payment status as soon as PayMongo recovers. Please do not place a duplicate payment.',
      icon: 'deferred',
      themeClass: 'order-state-deferred',
    };
  }

  // State 3: Payment not completed or cancelled
  if (pStatus === 'cancelled' || oStatus === 'cancelled' || (queryReturn === 'cancelled' && pStatus === 'awaiting_payment')) {
    return {
      state: 'cancelled',
      badgeClass: 'badge-cancelled',
      badgeText: 'Checkout Incomplete',
      title: 'Payment Incomplete or Cancelled',
      lede: 'You returned from PayMongo without completing payment or the checkout was cancelled.',
      description: 'No charge was applied to your account. If you wish to complete your purchase, you can resume checkout below or select another payment method.',
      icon: 'cancelled',
      themeClass: 'order-state-cancelled',
    };
  }

  // State 4: Payment expired or failed
  if (['expired', 'setup_failed'].includes(pStatus) || ['payment_expired', 'payment_setup_failed'].includes(oStatus)) {
    return {
      state: 'expired',
      badgeClass: 'badge-expired',
      badgeText: 'Payment Expired',
      title: 'Payment Window Expired',
      lede: 'The reservation window for this order has expired.',
      description: 'Reserved inventory holds have been safely returned to stock. No funds were collected. If you still wish to purchase these items, please place a new order from your bag.',
      icon: 'expired',
      themeClass: 'order-state-expired',
    };
  }

  // Cash on Delivery
  if (method === 'cod') {
    return {
      state: 'cod',
      badgeClass: 'badge-cod',
      badgeText: 'Cash on Delivery',
      title: 'Order Placed — Pending Cash Collection',
      lede: 'Your order has been recorded and will be prepared for delivery.',
      description: 'Please have the exact amount ready upon courier delivery. Your package will be inspected and collected at your doorstep.',
      icon: 'cod',
      themeClass: 'order-state-cod',
    };
  }

  // State 2: Payment pending verification
  return {
    state: 'pending',
    badgeClass: 'badge-pending',
    badgeText: 'Verification in Progress',
    title: 'Awaiting Payment Confirmation',
    lede: 'We are actively checking your transaction status with PayMongo.',
    description: 'If you have completed your payment on PayMongo, confirmation typically arrives within moments. This page checks automatically in the background.',
    icon: 'pending',
    themeClass: 'order-state-pending',
  };
}

function orderStateIcon(type) {
  if (type === 'confirmed') {
    return el('div', { class: 'order-hero-icon', 'aria-hidden': 'true' }, [
      el('svg', { width: '28', height: '28', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
        el('path', { d: 'M20 6L9 17l-5-5' }),
      ]),
    ]);
  }
  if (type === 'cancelled') {
    return el('div', { class: 'order-hero-icon', 'aria-hidden': 'true' }, [
      el('svg', { width: '28', height: '28', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
        el('circle', { cx: '12', cy: '12', r: '10' }),
        el('line', { x1: '12', y1: '8', x2: '12', y2: '12' }),
        el('line', { x1: '12', y1: '16', x2: '12.01', y2: '16' }),
      ]),
    ]);
  }
  if (type === 'expired') {
    return el('div', { class: 'order-hero-icon', 'aria-hidden': 'true' }, [
      el('svg', { width: '28', height: '28', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
        el('circle', { cx: '12', cy: '12', r: '10' }),
        el('polyline', { points: '12 6 12 12 16 14' }),
      ]),
    ]);
  }
  if (type === 'deferred') {
    return el('div', { class: 'order-hero-icon', 'aria-hidden': 'true' }, [
      el('svg', { width: '28', height: '28', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
        el('path', { d: 'M21.5 2v6h-6' }),
        el('path', { d: 'M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67' }),
      ]),
    ]);
  }
  if (type === 'review') {
    return el('div', { class: 'order-hero-icon', 'aria-hidden': 'true' }, [
      el('svg', { width: '28', height: '28', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
        el('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
        el('polyline', { points: '14 2 14 8 20 8' }),
        el('line', { x1: '16', y1: '13', x2: '8', y2: '13' }),
        el('line', { x1: '16', y1: '17', x2: '8', y2: '17' }),
      ]),
    ]);
  }
  if (type === 'cod') {
    return el('div', { class: 'order-hero-icon', 'aria-hidden': 'true' }, [
      el('svg', { width: '28', height: '28', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
        el('rect', { x: '1', y: '3', width: '15', height: '13' }),
        el('polygon', { points: '16 8 20 8 23 11 23 16 16 16 8' }),
        el('circle', { cx: '5.5', cy: '18.5', r: '2.5' }),
        el('circle', { cx: '18.5', cy: '18.5', r: '2.5' }),
      ]),
    ]);
  }
  return el('div', { class: 'order-hero-icon', 'aria-hidden': 'true' }, [
    el('svg', { class: 'spin-icon', width: '28', height: '28', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
      el('circle', { cx: '12', cy: '12', r: '10', 'stroke-opacity': '0.2' }),
      el('path', { d: 'M12 2a10 10 0 0 1 10 10' }),
    ]),
  ]);
}

async function renderOrder(route, scope) {
  if (!state.session) return signInPanel(customerHref(`/orders/${route.id}`));
  let order;
  let trackingError = null;
  try {
    order = await request(`/orders/${route.id}/`, {}, scope);
  } catch (error) {
    return errorPanel(error);
  }
  let tracking = null;
  try {
    tracking = await request(`/orders/${route.id}/tracking/`, {}, scope);
  } catch (error) {
    trackingError = error;
  }
  const savedAttempt = storedAttempt();
  if (savedAttempt && String(savedAttempt.orderId) === String(order.id) && savedAttempt.fingerprint === cartFingerprint(state.cart) && (order.payment_status === 'paid' || order.payment_method === 'cod')) {
    retainConfirmed(order);
    clearAttempt();
  }
  const action = order.payment_action;
  const canContinue = action?.type === 'redirect' && trustedCheckoutUrl(action.url);
  const canCancel = order.payment_method === 'cod'
    ? ['placed', 'processing'].includes(order.status) && order.payment_status === 'pending_collection'
    : ['pending_payment', 'payment_setup_failed'].includes(order.status) && ['awaiting_payment', 'setup_failed'].includes(order.payment_status);

  const searchParams = new URLSearchParams(location.search);
  const paymentReturn = searchParams.get('payment_return');
  const statusCfg = paymentStatusConfig(order, paymentReturn);

  let pollingBox = null;
  let pollingText = null;

  if (statusCfg.state === 'pending') {
    pollingText = el('span', { class: 'polling-text' }, 'Checking payment status with PayMongo (attempt 1 of 5)…');
    pollingBox = el('div', { class: 'polling-status-box' }, [
      el('span', { class: 'polling-pulse', 'aria-hidden': 'true' }),
      pollingText,
    ]);

    let attempt = 0;
    const intervals = [3000, 5000, 8000, 12000, 15000];
    const maxAttempts = intervals.length;
    let isPolling = true;

    const pollNext = () => {
      if (!isCurrent(scope) || !isPolling) return;
      if (attempt >= maxAttempts) {
        if (pollingBox) {
          pollingBox.replaceChildren(
            el('span', { class: 'muted', style: 'font-size:13px;' }, 'Payment verification is taking longer than usual. You can check again using the button below or check your email for confirmation.')
          );
        }
        return;
      }
      const delay = intervals[attempt];
      attempt += 1;
      if (pollingText) {
        pollingText.textContent = `Checking payment status with PayMongo (attempt ${attempt} of ${maxAttempts})…`;
      }
      setTimeout(async () => {
        if (!isCurrent(scope) || !isPolling) return;
        try {
          const fresh = await request(`/orders/${route.id}/`, {}, scope);
          if (!isCurrent(scope) || !isPolling) return;
          const freshPaymentStatus = (fresh.payment_status || '').toLowerCase();
          if (freshPaymentStatus !== 'awaiting_payment' || fresh.reconciliation_status === 'deferred') {
            isPolling = false;
            render();
            return;
          }
        } catch {
          // Continue gracefully on network glitch
        }
        pollNext();
      }, delay);
    };
    pollNext();
  }

  // Hero action buttons
  const heroActions = [];
  if (canContinue) {
    heroActions.push(el('a', { class: 'btn btn-primary', href: action.url }, 'Continue to PayMongo'));
  }
  if (statusCfg.state === 'pending' || statusCfg.state === 'deferred') {
    heroActions.push(
      el('button', {
        class: 'btn btn-secondary',
        type: 'button',
        onclick: async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          btn.textContent = 'Checking…';
          try {
            await request(`/orders/${route.id}/`, {}, scope);
          } catch {}
          if (isCurrent(scope)) render();
        },
      }, 'Check Status Now')
    );
  }
  if (canCancel) {
    heroActions.push(
      el('button', {
        class: 'btn btn-danger',
        type: 'button',
        onclick: (event) => cancelOrder(route.id, scope, event.currentTarget),
      }, 'Cancel Order')
    );
  }
  if (statusCfg.state === 'confirmed') {
    heroActions.push(el('a', { class: 'btn btn-primary', href: '#delivery-updates' }, 'Track Delivery'));
    heroActions.push(el('a', { class: 'btn btn-secondary', href: customerHref('/shop') }, 'Continue Shopping'));
  } else if (statusCfg.state === 'cancelled' || statusCfg.state === 'expired') {
    heroActions.push(el('a', { class: 'btn btn-primary', href: customerHref('/shop') }, 'Browse Catalog'));
    heroActions.push(el('a', { class: 'btn btn-secondary', href: customerHref('/cart') }, 'View Bag'));
  }

  const addr = order.shipping_address;
  const addressBlock = addr ? el('div', { class: 'summary-card' }, [
    el('h2', { class: 'summary-title', style: 'font-size:20px;' }, 'Delivery Address'),
    el('p', { style: 'font-weight:600; margin:0;' }, addr.name || 'Recipient'),
    addr.phone ? el('p', { class: 'muted', style: 'font-size:14px; margin:0;' }, addr.phone) : null,
    el('p', { style: 'margin:8px 0 0; font-size:14px; line-height:1.5;' }, [
      addr.address_line1,
      addr.address_line2 ? el('br') : null,
      addr.address_line2 || null,
      el('br'),
      `${addr.city || ''}, ${addr.state || ''} ${addr.postal_code || ''}`.trim(),
      el('br'),
      addr.country || 'Philippines',
    ]),
  ]) : null;

  const paymentTotalsBlock = el('div', { class: 'summary-card' }, [
    el('h2', { class: 'summary-title', style: 'font-size:20px;' }, 'Payment & Summary'),
    el('div', { class: 'summary-row' }, [
      el('span', {}, 'Payment Method'),
      el('span', { style: 'font-weight:600;' }, formatPaymentMethod(order.payment_method)),
    ]),
    el('div', { class: 'summary-row' }, [
      el('span', {}, 'Order Status'),
      el('span', { style: 'font-weight:600; text-transform:capitalize;' }, (order.status || 'Unknown').replace(/_/g, ' ')),
    ]),
    el('div', { class: 'summary-row' }, [
      el('span', {}, 'Payment Status'),
      el('span', { style: 'font-weight:600; text-transform:capitalize;' }, (order.payment_status || 'Unknown').replace(/_/g, ' ')),
    ]),
    el('div', { class: 'summary-row' }, [
      el('span', {}, 'Subtotal'),
      el('span', { class: 'mono' }, money(order.subtotal)),
    ]),
    el('div', { class: 'summary-row' }, [
      el('span', {}, 'Shipping Fee'),
      el('span', { class: 'mono' }, money(order.shipping)),
    ]),
    toCentavos(order.discount) > 0 ? el('div', { class: 'summary-row', style: 'color:var(--ok);' }, [
      el('span', {}, 'Discount'),
      el('span', { class: 'mono' }, `-${money(order.discount)}`),
    ]) : null,
    el('div', { class: 'summary-row-total' }, [
      el('span', {}, 'Order Total'),
      el('span', { class: 'summary-total-price mono' }, money(order.total)),
    ]),
  ]);

  return el('section', { class: 'page order-details-page' }, [
    breadcrumbs({ label: 'Orders & Tracking', href: customerHref('/orders') }, { label: order.order_no || `Order #${order.id}` }),
    el('h1', { tabindex: '-1' }, order.order_no || `Order #${order.id}`),
    el('p', { class: 'lede' }, order.created_at ? `Placed on ${new Date(order.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : 'Review your order details, payment progress, and delivery updates.'),

    // Hero Confirmation Card
    el('div', { class: `order-confirmation-hero ${statusCfg.themeClass}` }, [
      el('div', { class: 'order-confirmation-top' }, [
        el('span', { class: 'order-state-badge' }, [
          el('span', { class: 'badge-dot', 'aria-hidden': 'true' }),
          statusCfg.badgeText,
        ]),
        orderStateIcon(statusCfg.icon),
      ]),
      el('h2', { class: 'order-hero-title' }, statusCfg.title),
      el('p', { class: 'order-hero-lede' }, statusCfg.lede),
      el('p', { class: 'order-hero-desc' }, statusCfg.description),
      order.reconciliation_status === 'deferred' ? notice('info', 'Payment confirmation is still being checked with the payment provider. Please do not attempt a duplicate payment while this check is in progress.') : null,
      action?.url && !canContinue ? notice('error', 'A payment link was present but rejected because it is not a trusted PayMongo hosted checkout URL.') : null,
      pollingBox,
      heroActions.length ? el('div', { class: 'order-actions-row' }, heroActions) : null,
    ]),

    // Two-Column Grid: Payment/Totals + Shipping Address
    el('div', { class: 'order-grid-two-col' }, [
      paymentTotalsBlock,
      addressBlock,
    ]),

    // Items Ordered
    el('h2', { class: 'section-title', style: 'font-size:24px; margin-bottom:12px;' }, `Items Ordered (${(order.items || []).reduce((acc, it) => acc + (it.quantity || 1), 0)})`),
    el('div', { class: 'summary-card', style: 'margin-bottom:24px;' }, (order.items || []).map((item) => el('div', { style: 'display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid var(--border); font-size:14px;' }, [
      el('div', {}, [
        el('p', { style: 'font-weight:600; margin:0;' }, item.product_name || 'Item'),
        el('p', { class: 'muted', style: 'font-size:13px; margin:2px 0 0;' }, `${item.variant_desc || item.sku || 'Variant'} (×${item.quantity})`),
      ]),
      el('span', { class: 'mono', style: 'font-weight:600;' }, money(item.total_price)),
    ]))),

    // Delivery Updates
    el('div', { id: 'delivery-updates' }, [
      trackingError ? notice('error', "We couldn't load your latest delivery updates. Please try again.") : trackingBlock(tracking),
    ]),
  ]);
}

function trackingBlock(tracking) {
  if (!tracking) return el('p', { class: 'muted' }, "Shipping updates will appear here when they're available.");
  const events = Array.isArray(tracking.events) ? tracking.events : [];
  return el('section', { class: 'summary-card' }, [
    el('h2', { class: 'summary-title' }, 'Delivery Updates'),
    tracking.shipment ? el('p', {}, `Shipment Status: ${tracking.shipment.status || 'Processing'}`) : el('p', { class: 'muted' }, "Shipping updates will appear here when they're available."),
    events.length ? el('ol', { style: 'padding-left:20px;' }, events.map((event) => el('li', { style: 'margin-bottom:6px;' }, `${event.title || event.key || 'Update'} · ${event.state || 'Confirmed'}`))) : null,
  ]);
}

async function cancelOrder(id, scope, button) {
  return runAction(scope, button, async () => {
    const confirmed = await openDialog('Cancel this order?', 'Are you sure you want to cancel this order? Once cancelled, this action cannot be undone.');
    if (!confirmed || !isCurrent(scope)) return;
    await request(`/orders/${id}/cancel/`, { method: 'POST', body: {} }, scope);
    if (!isCurrent(scope)) return;
    announce('Your order has been cancelled.');
    render();
  });
}

async function renderAccount(_route, scope) {
  if (!state.session) return signInPanel(customerHref('/account'));
  const profile = await request('/profile/', {}, scope);
  const addresses = profile.addresses;
  const form = el('form', { class: 'summary-card', onsubmit: async (event) => {
    event.preventDefault();
    return runAction(scope, form.querySelector('button[type="submit"]'), async () => {
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
        await request('/profile/', { method: 'PUT', body }, scope);
        if (!isCurrent(scope)) return;
        announce('Your account information has been updated.');
        render();
      } catch (err) {
        if (!isCurrent(scope)) return;
        announce(err.message || "We couldn't save your changes. Please try again.");
      }
    });
  } }, [
    el('h2', { class: 'summary-title', style: 'font-size:20px; margin-bottom:4px;' }, 'Personal Information'),
    el('p', { class: 'muted', style: 'font-size:13px; margin:0 0 16px;' }, 'Keep your contact details up to date for a smoother shopping experience.'),
    field('Full Name', 'name', profile.name || ''),
    field('Email Address', 'email', profile.email || ''),
    field('Phone Number', 'phone', profile.phone || ''),
    Array.isArray(addresses) ? null : field('Address', 'address', addresses?.address || ''),
    el('button', { class: 'btn btn-primary', type: 'submit', style: 'margin-top:8px;' }, 'Save Changes'),
  ]);
  for (const name of ['name', 'email']) form.elements[name].required = true;
  form.elements.name.maxLength = 150;
  form.elements.email.maxLength = 254;
  form.elements.phone.maxLength = 32;

  const closeForm = el('form', { class: 'summary-card', onsubmit: async (event) => {
    event.preventDefault();
    const data = new FormData(closeForm);
    if (String(data.get('confirmation') || '') !== 'CLOSE MY ACCOUNT') {
      announce('Type CLOSE MY ACCOUNT to confirm.');
      return;
    }
    return runAction(scope, closeForm.querySelector('button[type="submit"]'), async () => {
      const confirmed = await openDialog('Close your account?', 'Your sign-in will be disabled. Profile, wishlist, reviews and notifications will be removed. Historical orders, payments, shipping and audit records remain pending retention review.');
      if (!confirmed || !isCurrent(scope)) return;
      const result = await request('/account/close/', { method: 'POST', body: {
        confirmation: 'CLOSE MY ACCOUNT',
        password: String(data.get('password') || ''),
      } }, scope);
      if (!isCurrent(scope)) return;
      changeSession(null);
      state.cart = [];
      saveCart();
      clearAttempt();
      navigate(customerHref('/'), { replace: true });
      announce(result.message || 'Account closed.');
    });
  } }, [
    el('h2', { class: 'summary-title' }, 'Close account'),
    el('p', { class: 'muted' }, 'This disables sign-in and removes your profile, saved items, reviews, notifications and device registrations. Historical order, payment, shipping and audit records remain while their retention policy is reviewed. Open orders must be resolved first.'),
    el('label', { class: 'field' }, [el('span', {}, 'Current password'), el('input', { name: 'password', type: 'password', required: true, autocomplete: 'current-password' })]),
    el('label', { class: 'field' }, [el('span', {}, 'Type CLOSE MY ACCOUNT'), el('input', { name: 'confirmation', required: true, autocomplete: 'off' })]),
    el('button', { class: 'btn btn-danger', type: 'submit' }, 'Close my account'),
  ]);

  return el('section', { class: 'page account-page' }, [
    breadcrumbs({ label: 'Home', href: customerHref('/') }, { label: 'My Account' }),
    el('h1', { tabindex: '-1' }, 'My Account'),
    el('p', { class: 'lede' }, 'Manage your profile, review your orders, and access your saved items.'),
    el('div', { class: 'account-layout' }, [
      el('nav', { class: 'account-links', 'aria-label': 'Account sections' }, [
        el('a', { class: 'btn btn-secondary', href: '#personal-information' }, 'Personal Information'),
        el('a', { class: 'btn btn-secondary', href: customerHref('/orders') }, 'My Orders'),
        el('a', { class: 'btn btn-secondary', href: customerHref('/wishlist') }, 'Wishlist'),
        el('a', { class: 'btn btn-secondary', href: customerHref('/reviews') }, 'My Reviews'),
        el('a', { class: 'btn btn-secondary', href: '#account-settings' }, 'Account Settings'),
      ]),
      el('div', {}, [
        el('div', { id: 'personal-information' }, form),
        el('section', { id: 'account-settings' }, [
          el('h2', {}, 'Account Settings'),
          el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => signOut(scope) }, 'Sign out'),
          closeForm,
        ]),
      ]),
    ]),
  ]);
}

async function signOut(scope) {
  if (!isCurrent(scope) || !state.session) return;
  const authSnapshot = scope.auth;
  changeSession(null);
  const signedOut = getAuthSnapshot();
  announce('Signed out of this browser session.');
  navigate(customerHref('/'));
  try {
    await api('/logout/', { method: 'POST', authSnapshot });
  } catch {
    if (isAuthCurrent(signedOut)) {
      announce('Signed out locally, but server revocation could not be confirmed. The previous token may remain valid until it expires.');
    }
  }
}

async function renderWishlist(_route, scope) {
  if (!state.session) return signInPanel(customerHref('/wishlist'));
  const items = await request('/wishlist/', {}, scope);
  const list = Array.isArray(items) ? items : [];
  if (!list.length) {
    return page('Wishlist', 'No saved items yet. Explore our collection to find your next fit.', el('a', { class: 'btn btn-primary', href: customerHref('/shop') }, 'Shop Collection'));
  }
  return page('Wishlist', 'Review your saved products.', el('div', { class: 'grid' }, list.map((item) => el('article', { class: 'product-card' }, [
    el('div', { class: 'product-card-media-wrap' }, [
      usableImageUrl(item.image_url)
        ? el('img', {
            src: usableImageUrl(item.image_url),
            alt: item.name || '',
            onerror: (event) => event.currentTarget.replaceWith(el('div', { class: 'artwork-fallback' }, [el('span', { class: 'artwork-initial' }, (item.name || 'W').charAt(0).toUpperCase())])),
          })
        : el('div', { class: 'artwork-fallback' }, [el('span', { class: 'artwork-initial' }, (item.name || 'W').charAt(0).toUpperCase())]),
    ]),
    el('div', { class: 'product-card-body' }, [
      el('h3', { class: 'product-card-title' }, item.name || 'Saved product'),
      el('p', { class: 'product-card-price' }, money(item.price)),
      el('div', { style: 'display:flex; gap:8px;' }, [
        el('a', { class: 'btn btn-secondary', href: customerHref(`/products/${item.product_ref}`) }, 'View product'),
        el('button', { class: 'btn btn-danger', type: 'button', onclick: (event) => runAction(scope, event.currentTarget, async () => {
          await request(`/wishlist/?product_ref=${encodeURIComponent(item.product_ref)}`, { method: 'DELETE' }, scope);
          if (!isCurrent(scope)) return;
          announce('Removed from wishlist.');
          render();
        }) }, 'Remove'),
      ]),
    ]),
  ]))));
}

async function renderNotifications(_route, scope) {
  if (!state.session) return signInPanel(customerHref('/notifications'));
  let data;
  try {
    data = await request('/notifications/', {}, scope);
  } catch (error) {
    return page('Notifications', 'We could not load your notifications right now. Please try again.', el('button', { class: 'btn btn-secondary', type: 'button', onclick: () => render() }, 'Retry'));
  }
  const results = Array.isArray(data?.results) ? data.results : [];
  if (!results.length) {
    return page('Notifications', 'No notifications yet. Updates about your orders and account will appear here.', el('a', { class: 'btn btn-primary', href: customerHref('/shop') }, 'Shop Collection'));
  }
  return page('Notifications', `${data.unread_count || 0} unread notifications.`, el('button', { class: 'btn btn-secondary', style: 'margin-bottom:16px;', type: 'button', onclick: (event) => runAction(scope, event.currentTarget, async () => {
    await request('/notifications/read-all/', { method: 'POST', body: {} }, scope);
    if (!isCurrent(scope)) return;
    announce('All visible notifications marked read.');
    refreshUnread();
    render();
  }) }, 'Mark all read'), el('div', { style: 'display:flex; flex-direction:column; gap:12px;' }, results.map((item) => el('article', { class: 'summary-card' }, [
    el('h3', { style: 'margin:0; font-size:18px;' }, item.title || 'Notification'),
    el('p', { style: 'margin:6px 0;' }, item.body || ''),
    el('p', { class: 'mono', style: 'font-size:12px; color:var(--muted); margin:0 0 8px;' }, item.is_read ? 'Read' : 'Unread'),
    item.is_read ? null : el('button', { class: 'btn btn-secondary', type: 'button', onclick: (event) => runAction(scope, event.currentTarget, async () => {
      await request(`/notifications/${item.id}/read/`, { method: 'POST', body: {} }, scope);
      if (!isCurrent(scope)) return;
      announce('Notification marked read.');
      refreshUnread();
      render();
    }) }, 'Mark read'),
  ]))));
}

async function renderReviews(_route, scope) {
  if (!state.session) return signInPanel(customerHref('/reviews'));
  const reviews = await request('/reviews/mine/', {}, scope);
  if (!reviews.length) return page('My Reviews', 'You have not submitted a review yet.', el('a', { class: 'btn btn-primary', href: customerHref('/shop') }, 'Browse Products'));
  return page('My Reviews', 'Your submitted product reviews.', el('div', { class: 'grid' }, reviews.map((review) => el('article', { class: 'summary-card' }, [
    el('h2', {}, review.product_name),
    el('p', {}, `${review.rating}/5 · ${review.status}`),
    el('p', {}, review.comment),
    review.product_ref ? el('a', { href: customerHref(`/products/${review.product_ref}`) }, 'View product') : null,
  ]))));
}

const FAQ_ITEMS = [
  {
    q: 'How can I track my order?',
    a: 'Sign in to your account, open Orders & Tracking, and select an order to view its latest available updates.',
  },
  {
    q: 'What payment methods can I use?',
    a: 'Available payment methods are shown at checkout. Options may vary depending on payment service availability.',
  },
  {
    q: 'When will my order arrive?',
    a: 'Delivery times depend on your location and the shipping service. You can check your order page for available shipping updates.',
  },
  {
    q: 'Can I cancel an order?',
    a: 'Some orders can be cancelled before they reach certain fulfillment or payment stages. Open your order details to check whether cancellation is available.',
  },
  {
    q: 'How do I update my account information?',
    a: 'Sign in, go to My Account, update the available profile fields, and select Save Changes.',
  },
  {
    q: 'How do I choose the right size?',
    a: 'Check the sizing and variation details on the product page before completing your order.',
  },
  {
    q: 'What if I need a return or exchange?',
    a: 'Contact MetroDrip through its confirmed support channel before returning an item so the team can review your request and provide instructions.',
  },
];

async function renderSupport() {
  const faqNodes = FAQ_ITEMS.map((item) => el('details', { class: 'faq-item' }, [
    el('summary', { class: 'faq-question' }, [
      el('span', {}, item.q),
      el('span', { class: 'faq-icon', 'aria-hidden': 'true' }, '+'),
    ]),
    el('div', { class: 'faq-answer' }, [
      el('p', {}, item.a),
    ]),
  ]));

  const contactSection = el('section', { class: 'contact-card', 'aria-labelledby': 'support-contacts-title' }, [
    el('h2', { id: 'support-contacts-title', class: 'summary-title', style: 'font-size:20px; margin:0 0 4px;' }, 'Contact Support'),
    el('p', { class: 'muted', style: 'font-size:14px; margin:0 0 16px;' }, 'Have questions about your order or need assistance? Reach out to our team directly.'),
    el('div', { class: 'contact-grid' }, [
      el('div', { class: 'contact-item' }, [
        el('span', { class: 'contact-item-label' }, 'Email'),
        el('span', { class: 'contact-item-value' }, el('a', { href: 'mailto:support@metrodrip.ph' }, 'support@metrodrip.ph')),
      ]),
      el('div', { class: 'contact-item' }, [
        el('span', { class: 'contact-item-label' }, 'Support Hours'),
        el('span', { class: 'contact-item-value' }, 'Monday–Saturday, 9:00 AM–6:00 PM PHT'),
      ]),
      el('div', { class: 'contact-item' }, [
        el('span', { class: 'contact-item-label' }, 'Location'),
        el('span', { class: 'contact-item-value' }, 'Metro Manila, Philippines'),
      ]),
    ]),
  ]);

  const navSection = el('div', { style: 'display:flex; gap:12px; margin-top:24px; flex-wrap:wrap;' }, [
    el('a', { class: 'btn btn-primary', href: customerHref('/shop') }, 'Shop Collection'),
    el('a', { class: 'btn btn-secondary', href: customerHref('/orders') }, 'Orders & Tracking'),
    el('a', { class: 'btn btn-secondary', href: customerHref('/account') }, 'My Account'),
  ]);

  return el('section', { class: 'page support-page' }, [
    breadcrumbs({ label: 'Home', href: customerHref('/') }, { label: 'Help & FAQ' }),
    el('h1', { tabindex: '-1' }, 'Help & FAQ'),
    el('p', { class: 'lede' }, 'Need a hand? Find answers about shopping, payments, deliveries, and your MetroDrip account.'),
    el('div', { class: 'faq-list', role: 'region', 'aria-label': 'Frequently Asked Questions' }, faqNodes),
    contactSection,
    navSection,
  ]);
}

async function renderTeam() {
  const cards = TEAM_MEMBERS.map((member) => {
    const avatarImg = el('img', {
      class: 'team-avatar-img',
      src: member.avatar,
      alt: member.name,
      loading: 'lazy',
      onerror: (event) => {
        event.currentTarget.style.display = 'none';
      },
    });

    const initialsFallback = el('span', {
      class: 'team-avatar-initials',
      'aria-hidden': 'true',
    }, member.initials);

    const contributionBadge = el('span', {
      class: 'team-badge',
    }, member.contribution);

    const avatarBox = el('div', { class: 'team-avatar-box' }, [
      initialsFallback,
      avatarImg,
      contributionBadge,
    ]);

    const infoBox = el('div', { class: 'team-card-info' }, [
      el('h2', { class: 'team-member-name' }, member.name),
      el('span', { class: 'team-member-role' }, member.role),
      el('p', { class: 'team-member-bio' }, member.bio),
    ]);

    return el('article', {
      class: 'team-card',
      'aria-label': `${member.name} - ${member.role}`,
    }, [
      avatarBox,
      infoBox,
    ]);
  });

  const teamGrid = el('div', { class: 'team-grid' }, cards);

  return el('section', { class: 'page team-page' }, [
    breadcrumbs({ label: 'Home', href: customerHref('/') }, { label: 'Our Team' }),
    el('div', { class: 'team-header' }, [
      el('h1', { tabindex: '-1' }, TEAM_HEADING),
      el('p', { class: 'lede team-subtitle' }, TEAM_SUBTITLE),
    ]),
    teamGrid,
  ]);
}

function svgIcon(markup) {
  const span = document.createElement('span');
  span.innerHTML = markup.trim();
  return span.firstElementChild;
}

function createOtpBoxes(length, onChange) {
  const boxes = Array.from({ length }, (_, index) => el('input', {
    class: 'otp-box',
    type: 'text',
    inputmode: 'numeric',
    maxlength: '1',
    autocomplete: index === 0 ? 'one-time-code' : 'off',
    'aria-label': `Digit ${index + 1} of ${length}`,
  }));
  const group = el('div', { class: 'otp-boxes', role: 'group', 'aria-label': 'Email verification code' }, boxes);
  const value = () => boxes.map((box) => box.value).join('');
  const focusAt = (index) => boxes[Math.max(0, Math.min(index, boxes.length - 1))]?.focus();

  const syncState = () => {
    boxes.forEach((box) => {
      box.classList.toggle('is-filled', Boolean(box.value));
    });
    group.classList.remove('has-error');
    boxes.forEach((box) => box.removeAttribute('aria-invalid'));
    if (typeof onChange === 'function') {
      onChange(value(), value().length === length);
    }
  };

  boxes.forEach((box, index) => {
    box.addEventListener('input', () => {
      const digits = box.value.replace(/\D/g, '');
      if (digits.length > 1) {
        digits.slice(0, boxes.length - index).split('').forEach((digit, offset) => {
          if (boxes[index + offset]) boxes[index + offset].value = digit;
        });
        syncState();
        focusAt(Math.min(index + digits.length, boxes.length - 1));
        return;
      }
      box.value = digits;
      syncState();
      if (digits) focusAt(index + 1);
    });

    box.addEventListener('keydown', (event) => {
      if (event.key === 'Backspace') {
        if (!box.value && index > 0) {
          boxes[index - 1].value = '';
          syncState();
          focusAt(index - 1);
        } else if (box.value) {
          box.value = '';
          syncState();
        }
      } else if (event.key === 'ArrowLeft' && index > 0) {
        focusAt(index - 1);
      } else if (event.key === 'ArrowRight' && index < boxes.length - 1) {
        focusAt(index + 1);
      }
    });

    box.addEventListener('paste', (event) => {
      event.preventDefault();
      const rawText = event.clipboardData?.getData('text') || '';
      const digits = rawText.replace(/\D/g, '').slice(0, boxes.length);
      if (!digits) return;
      digits.split('').forEach((digit, offset) => {
        if (boxes[offset]) boxes[offset].value = digit;
      });
      syncState();
      focusAt(Math.min(digits.length, boxes.length - 1));
    });
  });

  return {
    group,
    value,
    focus: (idx = 0) => focusAt(idx),
    setDisabled: (disabled) => boxes.forEach((box) => { box.disabled = disabled; }),
    setError: (hasError) => {
      group.classList.toggle('has-error', Boolean(hasError));
      boxes.forEach((box) => {
        if (hasError) box.setAttribute('aria-invalid', 'true');
        else box.removeAttribute('aria-invalid');
      });
    },
    clear: () => {
      boxes.forEach((box) => {
        box.value = '';
        box.classList.remove('is-filled');
        box.removeAttribute('aria-invalid');
      });
      group.classList.remove('has-error');
      syncState();
      focusAt(0);
    },
  };
}

async function renderVerifyOtp(_route, scope) {
  let pending = null;
  try {
    pending = JSON.parse(sessionStorage.getItem('metrodrip_otp_challenge') || 'null');
  } catch {
    pending = null;
  }
  if (!pending?.challengeId) {
    return page('Verification required', 'Start from sign-in or registration to request a code.', el('a', { class: 'btn btn-primary', href: customerHref('/sign-in') }, 'Sign in'));
  }

  const shieldSvg = () => svgIcon('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>');
  const mailSvg = () => svgIcon('<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>');
  const clockSvg = () => svgIcon('<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>');
  const arrowLeftSvg = () => svgIcon('<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>');

  const isEmailVerification = pending.purpose === 'email_verification';
  const headingText = isEmailVerification ? 'Verify your email' : 'Two-factor authentication';
  const instructionText = isEmailVerification
    ? 'Enter the 6-digit verification code sent to your email to activate your account.'
    : 'Enter the 6-digit security code sent to your email to verify your identity.';

  const status = el('p', { class: 'otp-status', role: 'status', 'aria-live': 'polite' }, '');
  const setStatus = (message, isError = false) => {
    status.textContent = message || '';
    status.className = message ? `otp-status ${isError ? 'is-error' : 'is-success'}` : 'otp-status';
    entry.setError(isError);
  };

  const submitBtn = el('button', { class: 'btn btn-primary btn-full otp-verify-btn', type: 'submit', disabled: true }, 'Verify');

  const entry = createOtpBoxes(pending.codeLength || 6, (_code, isComplete) => {
    submitBtn.disabled = !isComplete;
    if (status.textContent) {
      status.textContent = '';
      status.className = 'otp-status';
      entry.setError(false);
    }
  });

  const resend = el('button', { class: 'otp-resend', type: 'button' }, 'Resend code');
  let cooldown = Number(pending.resendAfter || 60);
  const paintCooldown = () => {
    resend.disabled = cooldown > 0;
    resend.textContent = cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code';
  };
  paintCooldown();
  const timer = setInterval(() => {
    cooldown = Math.max(0, cooldown - 1);
    paintCooldown();
    if (cooldown === 0) clearInterval(timer);
  }, 1000);

  resend.addEventListener('click', async () => {
    if (resend.disabled) return;
    resend.disabled = true;
    resend.textContent = 'Sending…';
    try {
      const resent = pendingOtpChallenge(await api('/auth/otp/resend/', { method: 'POST', auth: false, body: { challenge_id: pending.challengeId } }));
      if (!resent) throw new Error('A new code could not be sent.');
      pending = { ...pending, ...resent };
      sessionStorage.setItem('metrodrip_otp_challenge', JSON.stringify(pending));
      setStatus(`A new code was sent to ${pending.maskedEmail}.`, false);
      cooldown = pending.resendAfter || 60;
      paintCooldown();
      entry.clear();
    } catch (error) {
      setStatus(error.message || 'A new code could not be sent.', true);
      paintCooldown();
    }
  });

  const form = el('form', { class: 'auth-form-card otp-card', onsubmit: async (event) => {
    event.preventDefault();
    const code = entry.value();
    if (code.length !== (pending.codeLength || 6)) {
      setStatus(`Enter the full ${pending.codeLength || 6}-digit code from your email.`, true);
      return;
    }
    return runAction(scope, submitBtn, async () => {
      entry.setDisabled(true);
      try {
        const data = await request('/auth/otp/verify/', {
          method: 'POST',
          auth: false,
          body: { challenge_id: pending.challengeId, code },
        }, scope);
        if (!isCurrent(scope)) return;
        if (data.verified || pending.purpose === 'email_verification') {
          clearInterval(timer);
          sessionStorage.removeItem('metrodrip_otp_challenge');
          announce('Email confirmed. Sign in to continue.');
          navigate(customerHref('/sign-in'));
          return;
        }
        const token = data.access_token || data.token;
        if (!token || data.role !== 'customer') throw new Error('This shop accepts customer accounts only.');
        clearInterval(timer);
        changeSession({ id: data.id, name: data.name, email: data.email, role: data.role, phone: data.phone || '', addresses: data.addresses }, token);
        sessionStorage.removeItem('metrodrip_otp_challenge');
        announce('Signed in.');
        navigate(safeCustomerPath(pending.next || customerHref('/')));
      } catch (error) {
        entry.setDisabled(false);
        setStatus(error.message || 'The code could not be verified. Check your email or request a new code.', true);
        entry.focus();
      }
    });
  } }, [
    el('div', { class: 'otp-header-icon', 'aria-hidden': 'true' }, [
      themeLogo('emblem'),
    ]),
    el('h1', { class: 'otp-title' }, headingText),
    el('p', { class: 'otp-instruction' }, instructionText),
    el('div', { class: 'otp-email-chip' }, [
      mailSvg(),
      el('span', {}, pending.maskedEmail || 'your email'),
    ]),
    entry.group,
    el('div', { class: 'otp-expiry-note' }, [
      clockSvg(),
      el('span', {}, 'Code expires in 5 minutes'),
    ]),
    status,
    submitBtn,
    resend,
    el('a', { class: 'otp-back-link', href: customerHref('/sign-in') }, [
      arrowLeftSvg(),
      el('span', {}, 'Back to sign in'),
    ]),
  ]);

  return el('section', { class: 'page auth-page' }, [
    breadcrumbs({ label: 'Home', href: customerHref('/') }, { label: headingText }),
    el('div', { class: 'otp-workspace' }, [form]),
  ]);
}

async function renderSignIn(_route, scope) {
  const next = safeCustomerPath(new URLSearchParams(location.search).get('next') || customerHref('/'));
  
  const brandPanel = el('div', { class: 'auth-brand-panel' }, [
    el('img', { class: 'auth-brand-badge-img', src: '/assets/branding/logo-dark.png', alt: 'METRODRIP' }),
    el('p', { class: 'auth-brand-tagline' }, ['Your city.', el('br'), 'Your style.']),
    el('p', { class: 'auth-brand-perks' }, 'Order history · Wishlist · Faster checkout'),
  ]);

  const form = el('form', { class: 'auth-form-card', onsubmit: async (event) => {
    event.preventDefault();
    return runAction(scope, form.querySelector('button[type="submit"]'), async () => {
      const data = new FormData(form);
      const signedIn = await signIn(String(data.get('email') || ''), String(data.get('password') || ''), scope, next);
      if (!signedIn || !isCurrent(signedIn)) return;
      announce('Signed in.');
      navigate(next, { replace: true });
    });
  } }, [
    el('h1', { class: 'auth-title' }, 'Welcome back'),
    el('p', { class: 'auth-subtitle' }, 'Sign in to your MetroDrip account.'),
    el('div', { class: 'auth-tabs', role: 'tablist', 'aria-label': 'Authentication tabs' }, [
      el('button', { type: 'button', class: 'auth-tab-btn is-active', role: 'tab', 'aria-selected': 'true' }, 'Sign in'),
      el('button', { type: 'button', class: 'auth-tab-btn', role: 'tab', 'aria-selected': 'false', onclick: () => navigate(customerHref('/sign-up')) }, 'Create account'),
    ]),
    field('Email *', 'email', ''),
    secretField('Password *', 'password'),
    el('div', { class: 'auth-forgot-link-row' }, [
      el('a', { class: 'auth-forgot-link', href: customerHref('/forgot-password') }, 'Forgot password?')
    ]),
    el('button', { class: 'btn btn-primary btn-full', type: 'submit' }, 'Sign in'),
    el('button', { class: 'btn btn-secondary btn-full', type: 'button', onclick: () => navigate(customerHref('/shop')) }, 'Browse without signing in'),
    el('p', { class: 'auth-notice-text' }, 'Checkout requires a customer account. Browsing does not place an order.'),
  ]);

  return el('section', { class: 'page auth-page' }, [
    breadcrumbs({ label: 'Home', href: customerHref('/') }, { label: 'Sign in' }),
    el('div', { class: 'auth-workspace' }, [brandPanel, form]),
  ]);
}

async function renderSignUp(_route, scope) {
  const brandPanel = el('div', { class: 'auth-brand-panel' }, [
    el('img', { class: 'auth-brand-badge-img', src: '/assets/branding/logo-dark.png', alt: 'METRODRIP' }),
    el('p', { class: 'auth-brand-tagline' }, ['Join the', el('br'), 'movement.']),
    el('p', { class: 'auth-brand-perks' }, 'Drops notification · Wishlist · Track orders'),
  ]);

  const form = el('form', { class: 'auth-form-card', onsubmit: async (event) => {
    event.preventDefault();
    return runAction(scope, form.querySelector('button[type="submit"]'), async () => {
      const data = new FormData(form);
      const created = await request('/signup/', { method: 'POST', auth: false, body: {
        name: String(data.get('name') || ''),
        email: String(data.get('email') || ''),
        password: String(data.get('password') || ''),
      } }, scope);
      if (!isCurrent(scope)) return;
      const pending = pendingOtpChallenge(created);
      if (pending) {
        sessionStorage.setItem('metrodrip_otp_challenge', JSON.stringify(pending));
        navigate(customerHref('/verify-otp'));
        return;
      }
      announce('Account created. Sign in to continue.');
      navigate(customerHref('/sign-in'));
    });
  } }, [
    el('h1', { class: 'auth-title' }, 'Create account'),
    el('p', { class: 'auth-subtitle' }, 'Password rules come from the server.'),
    el('div', { class: 'auth-tabs', role: 'tablist', 'aria-label': 'Authentication tabs' }, [
      el('button', { type: 'button', class: 'auth-tab-btn', role: 'tab', 'aria-selected': 'false', onclick: () => navigate(customerHref('/sign-in')) }, 'Sign in'),
      el('button', { type: 'button', class: 'auth-tab-btn is-active', role: 'tab', 'aria-selected': 'true' }, 'Create account'),
    ]),
    field('Full name *', 'name', ''),
    field('Email *', 'email', ''),
    secretField('Password *', 'password'),
    el('button', { class: 'btn btn-primary btn-full', type: 'submit' }, 'Create account'),
    el('button', { class: 'btn btn-secondary btn-full', type: 'button', onclick: () => navigate(customerHref('/shop')) }, 'Browse without signing in'),
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

async function renderForgot(_route, scope) {
  const brandPanel = el('div', { class: 'auth-brand-panel' }, [
    el('img', { class: 'auth-brand-badge-img', src: '/assets/branding/logo-dark.png', alt: 'METRODRIP' }),
    el('p', { class: 'auth-brand-tagline' }, ['Account', el('br'), 'Recovery.']),
    el('p', { class: 'auth-brand-perks' }, 'Secure · One-time reset link · Encrypted'),
  ]);

  const statusContainer = el('div', { id: 'forgot-status-area' });

  const form = el('form', { class: 'auth-form-card', onsubmit: async (event) => {
    event.preventDefault();
    return runAction(scope, form.querySelector('button[type="submit"]'), async () => {
      const data = new FormData(form);
      const email = String(data.get('email') || '').trim();
      if (!email) return;

      try {
        const res = await request('/forgot-password/', {
          method: 'POST',
          auth: false,
          body: { email },
        }, scope);
        if (!isCurrent(scope)) return;
        statusContainer.replaceChildren(
          el('div', { class: 'auth-feedback is-success', style: 'padding: 16px; background: rgba(0,255,102,0.08); border: 1px solid var(--color-primary, #00FF66); border-radius: 6px; margin-bottom: 16px;' }, [
            el('p', { style: 'font-weight: 600; margin: 0 0 6px; color: #FFF;' }, 'Password Reset Link Dispatched'),
            el('p', { class: 'muted', style: 'font-size: 13px; margin: 0;' }, res?.message || 'If an eligible account is associated with this email, password reset instructions have been sent. Please check your inbox and spam folder.'),
          ])
        );
        form.querySelector('button[type="submit"]')?.setAttribute('disabled', 'true');
      } catch (err) {
        if (!isCurrent(scope)) return;
        statusContainer.replaceChildren(
          el('div', { class: 'auth-feedback is-error', style: 'padding: 16px; background: rgba(255,51,102,0.08); border: 1px solid var(--color-danger, #FF3366); border-radius: 6px; margin-bottom: 16px;' }, [
            el('p', { style: 'font-weight: 600; margin: 0 0 6px; color: #FFF;' }, 'Password Recovery Unavailable'),
            el('p', { class: 'muted', style: 'font-size: 13px; margin: 0;' }, 'Password recovery is temporarily unavailable. Please try again later or contact support@metrodrip.ph for assistance.'),
          ])
        );
      }
    });
  } }, [
    el('h1', { class: 'auth-title' }, 'Forgot Password'),
    el('p', { class: 'auth-subtitle' }, 'Enter your account email to receive a secure, time-limited password recovery link.'),
    statusContainer,
    field('Email Address *', 'email', ''),
    el('button', { class: 'btn btn-primary btn-full', type: 'submit' }, 'Send Reset Link'),
    el('a', { class: 'btn btn-secondary btn-full', style: 'text-align:center;', href: customerHref('/sign-in') }, 'Return to Sign In'),
  ]);

  return el('section', { class: 'page auth-page' }, [
    breadcrumbs({ label: 'Home', href: customerHref('/') }, { label: 'Forgot password' }),
    el('div', { class: 'auth-workspace' }, [brandPanel, form]),
  ]);
}

async function renderResetPassword(scope) {
  const brandPanel = el('div', { class: 'auth-brand-panel' }, [
    el('img', { class: 'auth-brand-badge-img', src: '/assets/branding/logo-dark.png', alt: 'METRODRIP' }),
    el('p', { class: 'auth-brand-tagline' }, ['Account', el('br'), 'Recovery.']),
    el('p', { class: 'auth-brand-perks' }, 'Secure · One-time reset link · Encrypted'),
  ]);

  const params = new URLSearchParams(window.location.search);
  const token = (params.get('token') || '').trim();

  const container = el('div', { class: 'auth-form-card' });

  if (!token) {
    container.replaceChildren(
      el('h1', { class: 'auth-title' }, 'Reset Password'),
      el('div', { class: 'auth-feedback is-error', style: 'padding: 16px; background: rgba(255,51,102,0.08); border: 1px solid var(--color-danger, #FF3366); border-radius: 6px; margin: 16px 0;' }, [
        el('p', { style: 'font-weight: 600; margin: 0 0 6px; color: #FFF;' }, 'Missing Security Token'),
        el('p', { class: 'muted', style: 'font-size: 13px; margin: 0;' }, 'The password reset token is missing or incomplete. Please use the complete recovery link from your email or request a new one.'),
      ]),
      el('a', { class: 'btn btn-secondary btn-full', style: 'text-align:center;', href: customerHref('/forgot-password') }, 'Request a New Reset Link')
    );
    return el('section', { class: 'page auth-page' }, [
      breadcrumbs({ label: 'Home', href: customerHref('/') }, { label: 'Reset Password' }),
      el('div', { class: 'auth-workspace' }, [brandPanel, container]),
    ]);
  }

  container.replaceChildren(
    el('h1', { class: 'auth-title' }, 'Reset Password'),
    el('p', { class: 'muted', style: 'margin:16px 0;' }, 'Verifying security link…')
  );

  (async () => {
    try {
      const res = await request(`/password-reset/verify/?token=${encodeURIComponent(token)}`, {
        method: 'GET',
        auth: false,
      }, scope);

      if (!isCurrent(scope)) return;

      if (!res?.valid) {
        let msg = res?.error || 'This password reset link is invalid or has expired.';
        if (res?.code === 'token_already_used') {
          msg = 'This password reset link has already been used. Please request another one.';
        } else if (res?.code === 'token_expired') {
          msg = 'This password reset link has expired. Password reset links are valid for 30 minutes.';
        }
        container.replaceChildren(
          el('h1', { style: 'font-family:var(--font-display); font-size:36px; margin:0;' }, 'Reset Password'),
          el('div', { class: 'auth-feedback is-error', style: 'padding: 16px; background: rgba(255,51,102,0.08); border: 1px solid var(--color-danger, #FF3366); border-radius: 6px; margin: 16px 0;' }, [
            el('p', { style: 'font-weight: 600; margin: 0 0 6px; color: #FFF;' }, 'Link Expired or Invalid'),
            el('p', { class: 'muted', style: 'font-size: 13px; margin: 0;' }, msg),
          ]),
          el('a', { class: 'btn btn-secondary btn-full', style: 'text-align:center;', href: customerHref('/forgot-password') }, 'Request a New Reset Link')
        );
        return;
      }

      if (res.role === 'admin' || res.role === 'merchant') {
        window.location.replace(`/Registration/screens/ResetPasswordScreen.html?token=${encodeURIComponent(token)}&context=${res.role}`);
        return;
      }

      const statusArea = el('div', { id: 'reset-status-area' });
      const accountInput = el('input', {
        type: 'text',
        readonly: true,
        disabled: true,
        value: res.email || 'Verified Account',
        style: 'opacity: 0.75;',
      });
      const accountField = el('label', { class: 'field' }, [
        el('span', { class: 'field-label' }, 'Account'),
        accountInput,
      ]);

      const newPassInput = el('input', {
        type: 'password',
        required: true,
        autocomplete: 'new-password',
      });
      const newPassField = el('label', { class: 'field' }, [
        el('span', { class: 'field-label' }, 'New Password *'),
        newPassInput,
        el('span', { class: 'muted', style: 'font-size:11px; margin-top:4px;' }, 'Minimum 8 characters. Must avoid common dictionary words.'),
      ]);

      const confirmPassInput = el('input', {
        type: 'password',
        required: true,
        autocomplete: 'new-password',
      });
      const confirmPassField = el('label', { class: 'field' }, [
        el('span', { class: 'field-label' }, 'Confirm Password *'),
        confirmPassInput,
      ]);

      const submitBtn = el('button', { class: 'btn btn-primary btn-full', type: 'submit' }, 'Save New Password');

      const form = el('form', {
        class: 'auth-form-card',
        style: 'padding: 0; background: transparent; border: none;',
        onsubmit: async (e) => {
          e.preventDefault();
          return runAction(scope, submitBtn, async () => {
            const newPassword = newPassInput.value.trim();
            const confirmPassword = confirmPassInput.value.trim();

            if (!newPassword) {
              announce('New password is required.');
              return;
            }
            if (newPassword.length < 8) {
              announce('Password must be at least 8 characters long.');
              return;
            }
            if (newPassword !== confirmPassword) {
              announce('Passwords do not match.');
              return;
            }

            try {
              const confirmRes = await request('/password-reset/confirm/', {
                method: 'POST',
                auth: false,
                body: {
                  token,
                  new_password: newPassword,
                  confirm_password: confirmPassword,
                },
              }, scope);

              if (!isCurrent(scope)) return;

              container.replaceChildren(
                el('h1', { style: 'font-family:var(--font-display); font-size:36px; margin:0 0 16px;' }, 'Password Updated'),
                el('div', { class: 'auth-feedback is-success', style: 'padding: 16px; background: rgba(0,255,102,0.08); border: 1px solid var(--color-primary, #00FF66); border-radius: 6px; margin-bottom: 20px;' }, [
                  el('p', { style: 'font-weight: 600; margin: 0 0 6px; color: #FFF;' }, 'Password Reset Complete'),
                  el('p', { class: 'muted', style: 'font-size: 13px; margin: 0;' }, confirmRes?.message || 'Your password has been updated. You can now sign in with your new password.'),
                ]),
                el('a', { class: 'btn btn-primary btn-full', style: 'text-align:center;', href: customerHref('/sign-in') }, 'Sign In')
              );
            } catch (err) {
              if (!isCurrent(scope)) return;
              const msg = err?.message || 'Failed to update password. Please try again.';
              statusArea.replaceChildren(
                el('div', { class: 'auth-feedback is-error', style: 'padding: 12px 16px; background: rgba(255,51,102,0.08); border: 1px solid var(--color-danger, #FF3366); border-radius: 6px; margin-bottom: 16px;' }, [
                  el('p', { style: 'margin: 0; font-size: 13px; color: #FFF;' }, msg),
                ])
              );
            }
          });
        },
      }, [
        statusArea,
        accountField,
        newPassField,
        confirmPassField,
        submitBtn,
      ]);

      container.replaceChildren(
        el('h1', { style: 'font-family:var(--font-display); font-size:36px; margin:0;' }, 'Set New Password'),
        el('p', { class: 'muted', style: 'margin:0 0 16px;' }, 'Enter a new permanent password for your customer account.'),
        form
      );
    } catch (err) {
      if (!isCurrent(scope)) return;
      container.replaceChildren(
        el('h1', { style: 'font-family:var(--font-display); font-size:36px; margin:0;' }, 'Reset password'),
        el('div', { class: 'auth-feedback is-error', style: 'padding: 16px; background: rgba(255,51,102,0.08); border: 1px solid var(--color-danger, #FF3366); border-radius: 6px; margin: 16px 0;' }, [
          el('p', { style: 'font-weight: 600; margin: 0 0 6px; color: #FFF;' }, 'Unable to Verify Link'),
          el('p', { class: 'muted', style: 'font-size: 13px; margin: 0;' }, err?.message || 'Network error verifying reset link. Please check your connection and try again.'),
        ]),
        el('a', { class: 'btn btn-secondary btn-full', style: 'text-align:center;', href: customerHref('/forgot-password') }, 'Return to forgot password')
      );
    }
  })();

  return el('section', { class: 'page auth-page' }, [
    breadcrumbs({ label: 'Home', href: customerHref('/') }, { label: 'Reset password' }),
    el('div', { class: 'auth-workspace' }, [brandPanel, container]),
  ]);
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
    const heading = el('h2', { id: 'customer-dialog-title', style: 'font-family:var(--font-display); font-size:24px; margin:0 0 12px;' }, title);
    dialog.setAttribute('aria-labelledby', 'customer-dialog-title');
    dialog.append(
      heading,
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
  navigationGeneration += 1;
  const scope = viewSnapshot();
  const route = parseCustomerPath(location.pathname);
  paintChrome();
  app.replaceChildren(el('p', { class: 'loading' }, 'Loading…'));
  let node;
  try {
    const view = pages[route.name] || pages['not-found'];
    node = await view(route, scope);
  } catch (error) {
    if (!isCurrent(scope)) return;
    node = errorPanel(error);
  }
  if (!isCurrent(scope)) return;
  document.title = route.name === 'home' ? 'MetroDrip customer' : `${node.querySelector('h1')?.textContent || 'Shop'} · MetroDrip customer`;
  app.replaceChildren(node);
  app.focus({ preventScroll: true });
}

function initializeCustomerNavigation() {
  const desktop = document.querySelector('.desktop-main-links');
  desktop.replaceChildren(
    el('details', { class: 'nav-group', id: 'desktop-shop' }, [
      el('summary', { class: 'desktop-nav-link' }, 'Shop'),
      el('div', { class: 'nav-dropdown', id: 'desktop-categories' }, [
        el('a', { href: customerHref('/shop') }, 'All Products'),
        el('span', {}, 'Loading categories…'),
      ]),
    ]),
    el('details', { class: 'nav-group', id: 'desktop-discover' }, [
      el('summary', { class: 'desktop-nav-link' }, 'Discover'),
      el('div', { class: 'nav-dropdown' }, [
        el('a', { href: customerHref('/shop?sort=newest') }, 'New Arrivals'),
        el('a', { href: customerHref('/shop?featured=1') }, 'Featured Products'),
      ]),
    ])
  );
  document.querySelector('.header-actions').prepend(
    el('a', { class: 'header-btn header-notifications-btn', href: customerHref('/notifications'), 'aria-label': 'Notifications' }, [
      'Notifications ', el('span', { 'data-unread-count': '', hidden: true }, '0'),
    ])
  );
  nav.querySelector('.site-nav-inner').replaceChildren(
    el('a', { href: customerHref('/') }, 'Home'),
    el('a', { href: customerHref('/shop') }, 'Shop All'),
    el('details', { class: 'mobile-nav-group' }, [
      el('summary', {}, 'Shop categories'),
      el('div', { id: 'mobile-categories' }, el('span', {}, 'Loading categories…')),
    ]),
    el('details', { class: 'mobile-nav-group' }, [
      el('summary', {}, 'Discover'),
      el('div', {}, [
        el('a', { href: customerHref('/shop?sort=newest') }, 'New Arrivals'),
        el('a', { href: customerHref('/shop?featured=1') }, 'Featured Products'),
      ]),
    ]),
    el('form', { id: 'mobile-search', role: 'search' }, [
      el('label', { for: 'mobile-catalog-search' }, 'Search products'),
      el('input', { id: 'mobile-catalog-search', name: 'q', type: 'search' }),
      el('button', { type: 'submit' }, 'Search'),
    ]),
    el('a', { href: customerHref('/wishlist') }, 'Wishlist'),
    el('a', { href: customerHref('/orders') }, 'Orders & Tracking'),
    el('a', { href: customerHref('/notifications') }, [
      'Notifications ', el('span', { 'data-unread-count': '', hidden: true }, '0'),
    ]),
    el('a', { href: customerHref('/account') }, 'My Account'),
    el('a', { href: '/' , class: 'staff-link' }, 'Staff Portal')
  );
}

initializeCustomerNavigation();

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[href^="/customer"]');
  if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
  if (link.origin !== location.origin) return;
  event.preventDefault();
  navigate(`${link.pathname}${link.search}`);
});
window.addEventListener('popstate', () => render());
document.querySelectorAll('.nav-group').forEach((group) => group.addEventListener('toggle', () => {
  if (group.open) {
    document.querySelectorAll('.nav-group').forEach((other) => { if (other !== group) other.open = false; });
    if (group.id === 'desktop-shop') loadNavigationCategories();
  }
}));
document.querySelectorAll('.mobile-nav-group').forEach((group) => group.addEventListener('toggle', () => {
  if (group.open && group.querySelector('#mobile-categories')) loadNavigationCategories();
}));
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (nav.classList.contains('is-open')) {
    nav.classList.remove('is-open');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.focus();
  }
  document.querySelectorAll('.nav-group, .mobile-nav-group').forEach((group) => { group.open = false; });
});
menuButton.addEventListener('click', () => {
  const open = !nav.classList.contains('is-open');
  nav.classList.toggle('is-open', open);
  menuButton.setAttribute('aria-expanded', String(open));
  if (open) nav.querySelector('a')?.focus();
});
document.addEventListener('click', (event) => {
  if (nav.classList.contains('is-open') && !nav.contains(event.target) && !menuButton.contains(event.target)) {
    nav.classList.remove('is-open');
    menuButton.setAttribute('aria-expanded', 'false');
  }
  if (!event.target.closest('.nav-group')) {
    document.querySelectorAll('.nav-group').forEach((group) => { group.open = false; });
  }
});
themeButton.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* The selected theme still applies for this page view. */
  }
});
systemThemeQuery?.addEventListener('change', () => {
  if (!readThemePreference()) applyTheme(systemTheme());
});
searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const q = String(new FormData(searchForm).get('q') || '').trim();
  navigate(q ? `${customerHref('/shop')}?search=${encodeURIComponent(q)}` : customerHref('/shop'));
});
document.querySelector('#mobile-search').addEventListener('submit', (event) => {
  event.preventDefault();
  const q = String(new FormData(event.currentTarget).get('q') || '').trim();
  navigate(q ? `${customerHref('/shop')}?search=${encodeURIComponent(q)}` : customerHref('/shop'));
});

loadCart();
loadNavigationCategories();
paintChrome();
syncAnnouncementBanner();
render();
