// Merchant dashboard and catalog: authenticated API data with truthful resilient UI states.
(() => {
  const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8000/api/merchant'
    : '/api/merchant';
  const SESSION_KEY = 'metrodrip_active_user';
  const MERCHANT_LOGIN_URL = '../Registration/screens/MerchantLoginScreen.html';

  let activeModal = null;
  let catalogProducts = [];
  let catalogCategories = [];
  const reviewCache = new Map();
  let currentViewingReview = null;
  let currentEditingProductId = null;
  let currentActiveOrderId = null;
  let currentActiveOrderStatus = null;
  let dashboardLoaded = false;
  let catalogProductsLoaded = false;

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(value ?? '')));
    return div.innerHTML;
  }

  function activeMerchantSession() {
    try {
      const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      const role = String(session?.role || '').toLowerCase();
      const token = session?.access_token || session?.token || '';
      return token && session?.is_staff === true && role === 'merchant'
        ? { ...session, token }
        : null;
    } catch {
      return null;
    }
  }

  async function responseError(response, fallback) {
    let message = fallback;
    try {
      const data = await response.json();
      message = data?.error?.message || data?.error || data?.detail || fallback;
    } catch {
      // Use the status-specific fallback when the server did not return JSON.
    }
    const error = new Error(message);
    error.status = response.status;
    return error;
  }

  async function authorizedFetch(path, options = {}) {
    const session = activeMerchantSession();
    if (!session) {
      const error = new Error('Sign in with a merchant account to use this console.');
      error.status = 401;
      throw error;
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${session.token}`,
        ...(options.headers || {}),
      },
    });
    if (!response.ok) {
      throw await responseError(response, `Request failed with status ${response.status}.`);
    }
    return response;
  }

  async function requestJson(path, options = {}) {
    const response = await authorizedFetch(path, options);
    return response.status === 204 ? null : response.json();
  }

  function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span aria-hidden="true">${type === 'success' ? '✓' : '✕'}</span> ${escapeHtml(message)}`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 200);
    }, 3500);
  }

  function ensureStateBanner() {
    let banner = document.getElementById('merchant-console-state');
    if (banner) return banner;

    banner = document.createElement('section');
    banner.id = 'merchant-console-state';
    banner.className = 'console-state-banner is-info';
    banner.hidden = true;
    banner.innerHTML = `
      <div class="console-state-copy">
        <p class="console-state-eyebrow" data-state-eyebrow>STATUS</p>
        <strong class="console-state-title" data-state-title></strong>
        <p class="console-state-message" data-state-message></p>
      </div>
      <div class="console-state-actions">
        <button type="button" class="btn btn-secondary btn-sm" data-state-retry hidden>Try again</button>
        <a class="btn btn-primary btn-sm" data-state-signin href="${MERCHANT_LOGIN_URL}" hidden>Merchant sign in</a>
      </div>`;

    const main = document.querySelector('.console-main');
    const header = main?.querySelector('.console-header');
    if (main && header) header.insertAdjacentElement('afterend', banner);
    banner.querySelector('[data-state-retry]')?.addEventListener('click', initializePage);
    return banner;
  }

  function setPageState(kind, title = '', message = '', options = {}) {
    const banner = ensureStateBanner();
    if (kind === 'ready') {
      banner.hidden = true;
      return;
    }

    const tone = kind === 'permission' || kind === 'partial' ? 'warning' : kind;
    banner.hidden = false;
    banner.className = `console-state-banner is-${tone === 'loading' ? 'info' : tone}`;
    banner.setAttribute('role', ['error', 'permission'].includes(kind) ? 'alert' : 'status');
    banner.querySelector('[data-state-eyebrow]').textContent = options.eyebrow || (
      kind === 'permission' ? 'ACCESS REQUIRED' : kind === 'partial' ? 'PARTIAL DATA' : kind.toUpperCase()
    );
    banner.querySelector('[data-state-title]').textContent = title;
    banner.querySelector('[data-state-message]').textContent = message;
    banner.querySelector('[data-state-retry]').hidden = !options.retry;
    banner.querySelector('[data-state-signin]').hidden = !options.signIn;
  }

  function setTableState(tbodyId, columns, kind, title, message) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.setAttribute('aria-busy', kind === 'loading' ? 'true' : 'false');
    if (kind === 'loading') {
      tbody.innerHTML = `
        <tr class="table-state-row table-loading-row">
          <td colspan="${columns}">
            <div class="skeleton-stack" aria-hidden="true">
              <span class="skeleton-line is-wide"></span>
              <span class="skeleton-line"></span>
              <span class="skeleton-line is-wide"></span>
            </div>
            <span class="sr-only">${escapeHtml(message)}</span>
          </td>
        </tr>`;
      return;
    }
    tbody.innerHTML = `
      <tr class="table-state-row">
        <td colspan="${columns}">
          <div class="table-state">
            <strong>${escapeHtml(title)}</strong>
            <span>${escapeHtml(message)}</span>
          </div>
        </td>
      </tr>`;
  }

  function setConsoleMutationsEnabled(enabled) {
    [
      'btn-merchant-export-csv',
      'btn-merchant-add-product',
      'btn-open-add-product',
      'btn-manage-categories',
      'btn-submit-restock',
      'btn-submit-product',
      'btn-save-edit-product',
      'btn-submit-category',
      'btn-submit-reply-review',
    ].forEach((id) => {
      const control = document.getElementById(id);
      if (control) control.disabled = !enabled;
    });
    document.querySelectorAll('.btn-open-restock, .btn-edit-product, .btn-reply-review').forEach((button) => {
      button.disabled = !enabled;
    });
  }

  function setActiveModal(modal) {
    activeModal = modal;
  }

  function clearActiveModal() {
    activeModal = null;
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && activeModal && !activeModal.hidden) {
      activeModal.hidden = true;
      clearActiveModal();
    }
  });

  function money(value) {
    if (typeof value === 'string' && value.trim().startsWith('₱')) return value.trim();
    const numeric = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(numeric) ? `₱${Math.round(numeric).toLocaleString('en-PH')}` : '—';
  }

  function formatDate(value) {
    if (!value) return 'Not reported';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  function categoryKey(value) {
    const category = String(value || '').toLowerCase();
    if (category.includes('top')) return 'tops';
    if (category.includes('bottom')) return 'bottoms';
    return 'accessories';
  }

  function statusKey(value) {
    return String(value || 'unknown').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  function showActionError(title, error) {
    const permissionFailure = error?.status === 401 || error?.status === 403;
    if (permissionFailure) setConsoleMutationsEnabled(false);
    setPageState(permissionFailure ? 'permission' : 'error', title, error.message, {
      signIn: permissionFailure,
      retry: false,
    });
    showToast(error.message, 'error');
  }

  function setMetric(id, value, detail) {
    const valueEl = document.getElementById(id);
    if (!valueEl) return;
    valueEl.textContent = value;
    const detailEl = valueEl.closest('.stat-card')?.querySelector('.stat-subtext');
    if (detailEl && detail !== undefined) detailEl.textContent = detail;
  }

  function resetDashboardMetrics() {
    setMetric('metric-today-sales', '—', 'Waiting for live data');
    setMetric('metric-orders-today', '—', 'Waiting for live data');
    setMetric('metric-low-stock', '—', 'Waiting for live data');
    setMetric('metric-to-ship', '—', 'Waiting for live data');
    ['badge-inventory', 'badge-orders', 'badge-reviews'].forEach((id) => {
      const badge = document.getElementById(id);
      if (badge) badge.textContent = '—';
    });
    const workspaceValues = {
      'workspace-metric-inventory': 'Live data unavailable',
      'workspace-metric-orders': 'Live data unavailable',
      'workspace-metric-shipments': 'Live data unavailable',
      'workspace-metric-zones': 'Live data unavailable',
      'workspace-metric-reviews': 'Live data unavailable',
      'workspace-metric-content': 'Live data unavailable',
    };
    Object.entries(workspaceValues).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    });
  }

  function renderDashboardMetrics(metrics = {}) {
    const ordersToday = Number(metrics.orders_today ?? 0);
    const lowStock = Number(metrics.low_stock_skus ?? 0);
    const toShip = Number(metrics.to_ship ?? 0);
    setMetric('metric-today-sales', metrics.today_sales || money(0), metrics.today_sales_trend || 'No comparison cohort reported');
    setMetric('metric-orders-today', ordersToday.toLocaleString(), metrics.orders_today_breakdown || 'No payment breakdown reported');
    setMetric('metric-low-stock', lowStock.toLocaleString(), lowStock ? 'At or below the reorder threshold' : 'No low-stock SKUs');
    setMetric('metric-to-ship', toShip.toLocaleString(), toShip ? 'Awaiting fulfillment' : 'No orders awaiting fulfillment');

    const inventoryBadge = document.getElementById('badge-inventory');
    const ordersBadge = document.getElementById('badge-orders');
    const inventoryWorkspace = document.getElementById('workspace-metric-inventory');
    const ordersWorkspace = document.getElementById('workspace-metric-orders');
    const shipmentWorkspace = document.getElementById('workspace-metric-shipments');
    if (inventoryBadge) inventoryBadge.textContent = lowStock.toLocaleString();
    if (ordersBadge) ordersBadge.textContent = toShip.toLocaleString();
    if (inventoryWorkspace) inventoryWorkspace.textContent = `${lowStock} low-stock SKU${lowStock === 1 ? '' : 's'}`;
    if (ordersWorkspace) ordersWorkspace.textContent = `${ordersToday} order${ordersToday === 1 ? '' : 's'} today`;
    if (shipmentWorkspace) shipmentWorkspace.textContent = `${toShip} awaiting fulfillment`;
  }

  function renderLowStock(entries) {
    const tbody = document.getElementById('low-stock-tbody');
    if (!tbody) return;
    tbody.setAttribute('aria-busy', 'false');
    if (!entries.length) {
      setTableState('low-stock-tbody', 5, 'empty', 'No low-stock alerts', 'Inventory is currently above the configured dashboard threshold.');
      return;
    }
    tbody.innerHTML = entries.map((entry) => `
      <tr data-sku="${escapeHtml(entry.sku)}">
        <td class="td-strong">${escapeHtml(entry.product || 'Product not reported')}</td>
        <td class="td-mono td-muted">${escapeHtml(entry.variant || 'Variant not reported')}</td>
        <td class="td-mono" style="color: var(--color-danger); font-weight: 600;">${escapeHtml(entry.on_hand)}</td>
        <td class="td-mono td-muted">${escapeHtml(entry.min)}</td>
        <td>
          <button type="button" class="btn btn-secondary btn-sm btn-open-restock"
            data-product="${escapeHtml(entry.product || '')}"
            data-variant="${escapeHtml(entry.variant || 'Variant not reported')}"
            data-sku="${escapeHtml(entry.sku || '')}">Restock</button>
        </td>
      </tr>`).join('');
  }

  function orderRecordId(order) {
    if (order?.id !== undefined && order?.id !== null) return Number(order.id);
    const match = String(order?.order_no || '').match(/(\d+)$/);
    return match ? Number(match[1]) : null;
  }

  function renderRecentOrders(orders) {
    const tbody = document.getElementById('orders-tbody');
    if (!tbody) return;
    tbody.setAttribute('aria-busy', 'false');
    if (!orders.length) {
      setTableState('orders-tbody', 5, 'empty', 'No recent orders', 'New orders will appear here after checkout creates them.');
      return;
    }
    tbody.innerHTML = orders.map((order) => {
      const recordId = orderRecordId(order);
      const fulfillment = String(order.status || 'Not reported');
      const payment = String(order.payment_method || 'Not reported').toUpperCase();
      return `
        <tr ${recordId ? `class="clickable-row" data-order-id="${recordId}" tabindex="0"` : ''}>
          <td class="td-mono td-strong">${escapeHtml(order.order_no || 'Order number not reported')}</td>
          <td>${escapeHtml(order.customer || 'Customer not reported')}</td>
          <td class="td-mono td-strong">${escapeHtml(money(order.total))}</td>
          <td class="td-mono td-muted">${escapeHtml(payment)}</td>
          <td><span class="status-pill ${statusKey(order.raw_status || fulfillment)}">${escapeHtml(fulfillment)}</span></td>
        </tr>`;
    }).join('');
  }

  function setDashboardSupplementalData(reviews, zones, banners) {
    const replyCount = Array.isArray(reviews) ? reviews.filter((review) => !review.merchant_reply).length : null;
    const activeZones = Array.isArray(zones) ? zones.filter((zone) => zone.is_active !== false).length : null;
    const liveBanners = Array.isArray(banners) ? banners.filter((banner) => banner.is_active === true).length : null;
    const draftBanners = Array.isArray(banners) ? banners.filter((banner) => banner.is_active !== true).length : null;
    const reviewBadge = document.getElementById('badge-reviews');
    const reviewsWorkspace = document.getElementById('workspace-metric-reviews');
    const zonesWorkspace = document.getElementById('workspace-metric-zones');
    const contentWorkspace = document.getElementById('workspace-metric-content');
    if (reviewBadge) reviewBadge.textContent = replyCount === null ? '—' : replyCount.toLocaleString();
    if (reviewsWorkspace) reviewsWorkspace.textContent = replyCount === null ? 'Live data unavailable' : `${replyCount} need${replyCount === 1 ? 's' : ''} a reply`;
    if (zonesWorkspace) zonesWorkspace.textContent = activeZones === null ? 'Live data unavailable' : `${activeZones} active zone${activeZones === 1 ? '' : 's'}`;
    if (contentWorkspace) contentWorkspace.textContent = liveBanners === null ? 'Live data unavailable' : `${liveBanners} live · ${draftBanners} draft`;
  }

  async function loadDashboard() {
    dashboardLoaded = false;
    setConsoleMutationsEnabled(false);
    resetDashboardMetrics();
    setTableState('low-stock-tbody', 5, 'loading', '', 'Loading low-stock alerts');
    setTableState('orders-tbody', 5, 'loading', '', 'Loading recent orders');
    setPageState('loading', 'Loading live merchant data', 'Sales, inventory, orders, and workspace counts are being requested from the server.');

    const results = await Promise.allSettled([
      requestJson('/dashboard/'),
      requestJson('/reviews/'),
      requestJson('/shipping-zones/'),
      requestJson('/banners/'),
    ]);
    const [dashboardResult, reviewsResult, zonesResult, bannersResult] = results;
    if (dashboardResult.status === 'rejected') {
      const error = dashboardResult.reason;
      const permissionFailure = error?.status === 401 || error?.status === 403;
      resetDashboardMetrics();
      setTableState('low-stock-tbody', 5, 'error', permissionFailure ? 'Merchant access required' : 'Inventory unavailable', error.message);
      setTableState('orders-tbody', 5, 'error', permissionFailure ? 'Merchant access required' : 'Orders unavailable', error.message);
      setPageState(permissionFailure ? 'permission' : 'error', permissionFailure ? 'Merchant access required' : 'Dashboard data could not be loaded', error.message, {
        retry: !permissionFailure,
        signIn: permissionFailure,
      });
      return;
    }

    const data = dashboardResult.value || {};
    renderDashboardMetrics(data.metrics || {});
    renderLowStock(Array.isArray(data.low_stock_alerts) ? data.low_stock_alerts : []);
    renderRecentOrders(Array.isArray(data.recent_orders) ? data.recent_orders : []);
    setDashboardSupplementalData(
      reviewsResult.status === 'fulfilled' ? reviewsResult.value : null,
      zonesResult.status === 'fulfilled' ? zonesResult.value : null,
      bannersResult.status === 'fulfilled' ? bannersResult.value : null,
    );
    dashboardLoaded = true;
    setConsoleMutationsEnabled(true);

    const supplementalFailures = results.slice(1).filter((result) => result.status === 'rejected');
    if (supplementalFailures.length) {
      setPageState('partial', 'Some workspace counts are unavailable', 'Core dashboard data is live, but one or more supporting services did not respond.', { retry: true });
    } else {
      setPageState('ready');
    }
  }

  const modalRestock = document.getElementById('modal-restock');
  const btnCloseRestock = document.getElementById('btn-close-restock');
  const btnCancelRestock = document.getElementById('btn-cancel-restock');
  const formRestock = document.getElementById('form-restock');

  function openRestockModal(productName, variantCode, sku) {
    if (!modalRestock || !dashboardLoaded || !sku) return;
    document.getElementById('restock-product-name').value = productName;
    document.getElementById('restock-variant-code').value = `${variantCode} (${sku})`;
    document.getElementById('restock-sku-hidden').value = sku;
    modalRestock.hidden = false;
    setActiveModal(modalRestock);
    document.getElementById('restock-quantity')?.focus();
  }

  function closeRestockModal() {
    if (modalRestock) modalRestock.hidden = true;
    formRestock?.reset();
    clearActiveModal();
  }

  btnCloseRestock?.addEventListener('click', closeRestockModal);
  btnCancelRestock?.addEventListener('click', closeRestockModal);
  modalRestock?.addEventListener('click', (event) => {
    if (event.target === modalRestock) closeRestockModal();
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('.btn-open-restock');
    if (!button) return;
    openRestockModal(button.dataset.product, button.dataset.variant, button.dataset.sku);
  });

  formRestock?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const sku = document.getElementById('restock-sku-hidden').value;
    const quantityInput = document.getElementById('restock-quantity');
    const quantity = Number.parseInt(quantityInput.value, 10);
    const reason = document.getElementById('restock-reason').value;
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
      showToast('Quantity must be a whole number from 1 to 1,000.', 'error');
      quantityInput?.focus();
      return;
    }

    const submit = document.getElementById('btn-submit-restock');
    if (submit) submit.disabled = true;
    try {
      await requestJson('/inventory/restock/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, quantity, reason }),
      });
      closeRestockModal();
      await loadDashboard();
      showToast(`Committed +${quantity} units for SKU ${sku}.`);
    } catch (error) {
      if (submit) submit.disabled = false;
      showActionError('Inventory was not changed', error);
    }
  });

  const searchInput = document.getElementById('input-catalog-search');
  const categoryTabs = document.querySelectorAll('.category-tab-btn');

  function getProductRows() {
    return document.querySelectorAll('#products-tbody tr[data-product-id]');
  }

  function applyProductFilters() {
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const activeTab = document.querySelector('.category-tab-btn.is-active');
    const category = activeTab ? activeTab.dataset.category : 'all';
    let matchCount = 0;
    getProductRows().forEach((row) => {
      const matchesSearch = !query || row.textContent.toLowerCase().includes(query);
      const matchesCategory = category === 'all'
        || (category === 'inactive' ? row.dataset.status === 'inactive' : row.dataset.category === category);
      row.style.display = matchesSearch && matchesCategory ? '' : 'none';
      if (matchesSearch && matchesCategory) matchCount += 1;
    });

    const subhead = document.getElementById('catalog-summary-subhead');
    if (!subhead || !catalogProductsLoaded) return;
    subhead.textContent = query || category !== 'all'
      ? `${matchCount} PRODUCT${matchCount === 1 ? '' : 'S'} SHOWN · FILTERED`
      : `${catalogProducts.length} PRODUCT${catalogProducts.length === 1 ? '' : 'S'} · LIVE CATALOG`;
  }

  searchInput?.addEventListener('input', applyProductFilters);
  categoryTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      categoryTabs.forEach((item) => {
        item.classList.remove('is-active');
        item.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      applyProductFilters();
    });
  });

  function normalizeProduct(raw) {
    return {
      id: Number(raw.id),
      name: String(raw.name || 'Unnamed product'),
      category: String(raw.category || 'Uncategorized'),
      variantsCount: Number(raw.variants_count ?? raw.variant_count ?? 1),
      stock: Number(raw.stock ?? 0),
      price: Number(raw.price ?? String(raw.price_formatted || '').replace(/[^0-9.-]/g, '') ?? 0),
      sku: String(raw.sku || ''),
      isActive: raw.is_active !== undefined ? Boolean(raw.is_active) : String(raw.status || 'Active').toLowerCase() === 'active',
      description: String(raw.description || ''),
    };
  }

  function renderProducts() {
    const tbody = document.getElementById('products-tbody');
    if (!tbody) return;
    tbody.setAttribute('aria-busy', 'false');
    if (!catalogProducts.length) {
      setTableState('products-tbody', 8, 'empty', 'No products found', 'Products created through the merchant API will appear here.');
      const subhead = document.getElementById('catalog-summary-subhead');
      if (subhead) subhead.textContent = '0 PRODUCTS · LIVE CATALOG';
      return;
    }
    tbody.innerHTML = catalogProducts.map((product) => {
      const status = product.isActive ? 'active' : 'inactive';
      return `
        <tr data-product-id="${product.id}" data-category="${categoryKey(product.category)}" data-status="${status}">
          <td><div class="product-thumb-letter" aria-hidden="true">${escapeHtml(product.name.charAt(0).toUpperCase() || 'P')}</div></td>
          <td class="td-strong">${escapeHtml(product.name)}</td>
          <td class="td-mono td-muted">${escapeHtml(product.category)}</td>
          <td class="td-mono">${product.variantsCount.toLocaleString()}</td>
          <td class="td-mono td-strong"${product.stock <= 5 ? ' style="color: var(--color-danger);"' : ''}>${product.stock.toLocaleString()}</td>
          <td class="td-mono td-strong">${escapeHtml(money(product.price))}</td>
          <td><span class="status-pill ${status}">${product.isActive ? 'Active' : 'Inactive'}</span></td>
          <td><button type="button" class="btn btn-secondary btn-sm btn-edit-product" data-product-id="${product.id}">Edit</button></td>
        </tr>`;
    }).join('');
    applyProductFilters();
  }

  function renderReviews(reviews) {
    const tbody = document.getElementById('reviews-tbody');
    if (!tbody) return;
    tbody.setAttribute('aria-busy', 'false');
    reviewCache.clear();
    reviews.forEach((review) => reviewCache.set(String(review.id), review));
    if (!reviews.length) {
      setTableState('reviews-tbody', 4, 'empty', 'No customer reviews', 'Submitted customer reviews will appear here.');
      return;
    }
    tbody.innerHTML = reviews.map((review) => `
      <tr data-review-id="${escapeHtml(review.id)}">
        <td class="td-strong">${escapeHtml(review.customer_name || review.customer || 'Customer not reported')}</td>
        <td class="td-muted">${escapeHtml(review.product_review || `${review.product_name || 'Product not reported'} — ${review.body || ''}`)}</td>
        <td class="review-stars">${escapeHtml(review.rating_stars || 'Rating not reported')}</td>
        <td style="text-align: right;">
          <div style="display: inline-flex; gap: 8px; justify-content: flex-end;">
            <button type="button" class="btn-outline-pill btn-view-review" data-review-id="${escapeHtml(review.id)}">View</button>
            <button type="button" class="btn-volt-pill btn-reply-review" data-review-id="${escapeHtml(review.id)}">${review.merchant_reply ? 'Edit reply' : 'Reply'}</button>
          </div>
        </td>
      </tr>`).join('');
  }

  function renderMovements(movements) {
    const tbody = document.getElementById('movements-tbody');
    if (!tbody) return;
    tbody.setAttribute('aria-busy', 'false');
    if (!movements.length) {
      setTableState('movements-tbody', 4, 'empty', 'No stock movements', 'Server-recorded stock changes will appear here.');
      return;
    }
    tbody.innerHTML = movements.map((movement) => {
      const positive = String(movement.delta || '').startsWith('+');
      return `
        <tr>
          <td class="td-mono td-muted">${escapeHtml(movement.sku || 'SKU not reported')}</td>
          <td class="td-mono td-strong" style="color: var(--color-${positive ? 'success' : 'danger'});">${escapeHtml(movement.delta ?? '—')}</td>
          <td class="td-mono td-muted">${escapeHtml(movement.reason || 'Reason not reported')}</td>
          <td class="td-mono td-muted">${escapeHtml(movement.when || 'Time not reported')}</td>
        </tr>`;
    }).join('');
  }

  function renderCategoryOptions() {
    ['add-prod-category', 'edit-prod-category'].forEach((id) => {
      const select = document.getElementById(id);
      if (!select) return;
      const currentValue = select.value;
      select.innerHTML = catalogCategories.length
        ? catalogCategories.map((category) => `<option value="${escapeHtml(category.name)}">${escapeHtml(category.name)}</option>`).join('')
        : '<option value="" disabled selected>No categories available</option>';
      if (catalogCategories.some((category) => category.name === currentValue)) select.value = currentValue;
    });
  }

  async function loadCatalog() {
    catalogProductsLoaded = false;
    catalogProducts = [];
    catalogCategories = [];
    reviewCache.clear();
    setConsoleMutationsEnabled(false);
    setTableState('products-tbody', 8, 'loading', '', 'Loading products');
    setTableState('reviews-tbody', 4, 'loading', '', 'Loading customer reviews');
    setTableState('movements-tbody', 4, 'loading', '', 'Loading stock movements');
    const subhead = document.getElementById('catalog-summary-subhead');
    if (subhead) subhead.textContent = 'LOADING LIVE CATALOG…';
    setPageState('loading', 'Loading live catalog data', 'Products, categories, reviews, and stock movements are being requested from the server.');

    const results = await Promise.allSettled([
      requestJson('/products/'),
      requestJson('/categories/'),
      requestJson('/reviews/'),
      requestJson('/inventory/movements/'),
    ]);
    const [productsResult, categoriesResult, reviewsResult, movementsResult] = results;
    const permissionFailure = results.find((result) => result.status === 'rejected' && [401, 403].includes(result.reason?.status));
    if (permissionFailure) {
      const error = permissionFailure.reason;
      setTableState('products-tbody', 8, 'error', 'Merchant access required', error.message);
      setTableState('reviews-tbody', 4, 'error', 'Merchant access required', error.message);
      setTableState('movements-tbody', 4, 'error', 'Merchant access required', error.message);
      if (subhead) subhead.textContent = 'LIVE CATALOG UNAVAILABLE';
      setPageState('permission', 'Merchant access required', error.message, { signIn: true });
      return;
    }

    if (productsResult.status === 'fulfilled') {
      catalogProducts = Array.isArray(productsResult.value) ? productsResult.value.map(normalizeProduct) : [];
      catalogProductsLoaded = true;
      renderProducts();
    } else {
      setTableState('products-tbody', 8, 'error', 'Products unavailable', productsResult.reason.message);
      if (subhead) subhead.textContent = 'PRODUCT DATA UNAVAILABLE';
    }

    if (categoriesResult.status === 'fulfilled') {
      catalogCategories = Array.isArray(categoriesResult.value) ? categoriesResult.value : [];
      renderCategoryOptions();
    } else {
      renderCategoryOptions();
    }

    if (reviewsResult.status === 'fulfilled') {
      renderReviews(Array.isArray(reviewsResult.value) ? reviewsResult.value : []);
    } else {
      setTableState('reviews-tbody', 4, 'error', 'Reviews unavailable', reviewsResult.reason.message);
    }

    if (movementsResult.status === 'fulfilled') {
      renderMovements(Array.isArray(movementsResult.value) ? movementsResult.value : []);
    } else {
      setTableState('movements-tbody', 4, 'error', 'Stock movements unavailable', movementsResult.reason.message);
    }

    setConsoleMutationsEnabled(Boolean(activeMerchantSession()));
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length) {
      setPageState('partial', 'Some catalog data is unavailable', 'Available sections show live API data. Failed sections are clearly marked and no sample records were substituted.', { retry: true });
    } else {
      setPageState('ready');
    }
  }

  const modalViewReview = document.getElementById('modal-view-review');
  const btnCloseViewReview = document.getElementById('btn-close-view-review');
  const btnCloseViewReviewFooter = document.getElementById('btn-close-view-review-footer');
  const btnReplyFromView = document.getElementById('btn-reply-from-view');
  const modalReplyReview = document.getElementById('modal-reply-review');
  const btnCloseReplyReview = document.getElementById('btn-close-reply-review');
  const btnCancelReplyReview = document.getElementById('btn-cancel-reply-review');
  const formReplyReview = document.getElementById('form-reply-review');

  function populateReviewModal(review) {
    const initials = String(review.customer_name || review.customer || 'C')
      .split(/\s+/)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    document.getElementById('view-review-avatar').textContent = initials;
    document.getElementById('view-review-customer').textContent = review.customer_name || review.customer || 'Customer not reported';
    document.getElementById('view-review-date').textContent = review.created_at ? `Verified Customer · ${formatDate(review.created_at)}` : 'Verified customer · Date not reported';
    document.getElementById('view-review-stars').textContent = review.rating_stars || 'Rating not reported';
    document.getElementById('view-review-product').textContent = review.product_name || 'Product not reported';
    document.getElementById('view-review-body').textContent = review.body || 'Review text not reported';
    const replyContainer = document.getElementById('view-review-reply-container');
    if (review.merchant_reply) {
      replyContainer.style.display = 'block';
      document.getElementById('view-review-reply-text').textContent = review.merchant_reply;
      document.getElementById('view-review-reply-date').textContent = review.replied_at ? `Replied ${formatDate(review.replied_at)}` : 'Reply date not reported';
      btnReplyFromView.textContent = 'Edit reply';
    } else {
      replyContainer.style.display = 'none';
      btnReplyFromView.textContent = 'Reply to review';
    }
  }

  async function fetchReview(reviewId) {
    const review = await requestJson(`/reviews/${reviewId}/`);
    reviewCache.set(String(reviewId), review);
    return review;
  }

  async function openViewReviewModal(reviewId) {
    if (!modalViewReview) return;
    setPageState('loading', 'Loading review', 'The selected review is being requested from the server.');
    try {
      const review = await fetchReview(reviewId);
      currentViewingReview = review;
      populateReviewModal(review);
      modalViewReview.hidden = false;
      setActiveModal(modalViewReview);
      setPageState('ready');
    } catch (error) {
      showActionError('Review could not be loaded', error);
    }
  }

  function closeViewReviewModal() {
    if (modalViewReview) modalViewReview.hidden = true;
    currentViewingReview = null;
    clearActiveModal();
  }

  async function openReplyReviewModal(reviewId) {
    if (!modalReplyReview) return;
    let review = reviewCache.get(String(reviewId));
    if (!review) {
      setPageState('loading', 'Loading review', 'The review must be loaded before a reply can be written.');
      try {
        review = await fetchReview(reviewId);
      } catch (error) {
        showActionError('Review could not be loaded', error);
        return;
      }
    }
    if (modalViewReview && !modalViewReview.hidden) modalViewReview.hidden = true;
    document.getElementById('reply-review-id').value = review.id;
    document.getElementById('reply-customer-name').textContent = review.customer_name || review.customer || 'Customer not reported';
    document.getElementById('reply-product-name').textContent = review.product_name || 'Product not reported';
    const textarea = document.getElementById('reply-textarea');
    textarea.value = review.merchant_reply || '';
    modalReplyReview.hidden = false;
    setActiveModal(modalReplyReview);
    setPageState('ready');
    setTimeout(() => textarea.focus(), 50);
  }

  function closeReplyReviewModal() {
    if (modalReplyReview) modalReplyReview.hidden = true;
    formReplyReview?.reset();
    clearActiveModal();
  }

  btnCloseViewReview?.addEventListener('click', closeViewReviewModal);
  btnCloseViewReviewFooter?.addEventListener('click', closeViewReviewModal);
  modalViewReview?.addEventListener('click', (event) => {
    if (event.target === modalViewReview) closeViewReviewModal();
  });
  btnReplyFromView?.addEventListener('click', () => {
    if (currentViewingReview) openReplyReviewModal(currentViewingReview.id);
  });
  btnCloseReplyReview?.addEventListener('click', closeReplyReviewModal);
  btnCancelReplyReview?.addEventListener('click', closeReplyReviewModal);
  modalReplyReview?.addEventListener('click', (event) => {
    if (event.target === modalReplyReview) closeReplyReviewModal();
  });

  document.addEventListener('click', (event) => {
    const viewButton = event.target.closest('.btn-view-review');
    if (viewButton) {
      openViewReviewModal(viewButton.dataset.reviewId);
      return;
    }
    const replyButton = event.target.closest('.btn-reply-review');
    if (replyButton) openReplyReviewModal(replyButton.dataset.reviewId);
  });

  formReplyReview?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const reviewId = document.getElementById('reply-review-id').value;
    const textarea = document.getElementById('reply-textarea');
    const reply = textarea.value.trim();
    if (!reply) {
      showToast('Reply text cannot be empty.', 'error');
      return;
    }
    const submit = document.getElementById('btn-submit-reply-review');
    if (submit) submit.disabled = true;
    try {
      const response = await requestJson(`/reviews/${reviewId}/reply/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply }),
      });
      const review = reviewCache.get(String(reviewId));
      if (review) {
        review.merchant_reply = response.merchant_reply;
        review.replied_at = response.replied_at;
        reviewCache.set(String(reviewId), review);
      }
      const rowButton = document.querySelector(`tr[data-review-id="${CSS.escape(String(reviewId))}"] .btn-reply-review`);
      if (rowButton) rowButton.textContent = 'Edit reply';
      closeReplyReviewModal();
      setPageState('ready');
      showToast(response.message || 'Reply sent successfully.');
    } catch (error) {
      if (submit) submit.disabled = false;
      showActionError('Reply was not sent', error);
    }
  });

  const modalAddProduct = document.getElementById('modal-add-product');
  const btnOpenAddProduct = document.getElementById('btn-open-add-product') || document.getElementById('btn-merchant-add-product');
  const btnCloseAddProduct = document.getElementById('btn-close-product-modal');
  const btnCancelAddProduct = document.getElementById('btn-cancel-product-modal');
  const formAddProduct = document.getElementById('form-add-product');

  function openAddProductModal() {
    if (!modalAddProduct) return;
    if (!catalogCategories.length) {
      showToast('Load or create a category before adding a product.', 'error');
      return;
    }
    modalAddProduct.hidden = false;
    setActiveModal(modalAddProduct);
    document.getElementById('add-prod-name')?.focus();
  }

  function closeAddProductModal() {
    if (modalAddProduct) modalAddProduct.hidden = true;
    formAddProduct?.reset();
    clearActiveModal();
    btnOpenAddProduct?.focus();
  }

  if (btnOpenAddProduct && !modalAddProduct) {
    btnOpenAddProduct.addEventListener('click', () => { window.location.href = 'catalog.html#add-product'; });
  } else {
    btnOpenAddProduct?.addEventListener('click', openAddProductModal);
  }
  btnCloseAddProduct?.addEventListener('click', closeAddProductModal);
  btnCancelAddProduct?.addEventListener('click', closeAddProductModal);
  modalAddProduct?.addEventListener('click', (event) => {
    if (event.target === modalAddProduct) closeAddProductModal();
  });

  formAddProduct?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(formAddProduct);
    const name = String(formData.get('name') || '').trim();
    const category = String(formData.get('category') || '').trim();
    const price = Number(formData.get('price'));
    const stock = Number(formData.get('stock'));
    const sku = String(formData.get('sku') || '').trim();
    const description = String(formData.get('description') || '').trim();
    if (!name || !sku || !category || !Number.isFinite(price) || price <= 0 || !Number.isInteger(stock) || stock < 0) {
      showToast('Enter a name, category, SKU, positive price, and valid stock quantity.', 'error');
      return;
    }

    const submit = document.getElementById('btn-submit-product');
    if (submit) submit.disabled = true;
    try {
      const created = await requestJson('/products/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category, price, stock, sku, description }),
      });
      catalogProducts.unshift(normalizeProduct(created));
      catalogProductsLoaded = true;
      renderProducts();
      closeAddProductModal();
      setPageState('ready');
      showToast(`Published product "${created.name}" (SKU: ${created.sku}).`);
    } catch (error) {
      if (submit) submit.disabled = false;
      showActionError('Product was not created', error);
    }
  });

  const modalEditProduct = document.getElementById('modal-edit-product');
  const btnCloseEditProduct = document.getElementById('btn-close-edit-product');
  const btnCancelEditProduct = document.getElementById('btn-cancel-edit-product');
  const formEditProduct = document.getElementById('form-edit-product');

  function setEditFormDisabled(disabled) {
    formEditProduct?.querySelectorAll('input, select, textarea, button[type="submit"]').forEach((control) => {
      control.disabled = disabled;
    });
  }

  async function openEditProductModal(productId) {
    if (!modalEditProduct || !productId) return;
    formEditProduct.reset();
    currentEditingProductId = null;
    setEditFormDisabled(true);
    modalEditProduct.hidden = false;
    setActiveModal(modalEditProduct);
    setPageState('loading', 'Loading product', 'Current product values are being requested from the server.');
    try {
      const product = await requestJson(`/products/${productId}/`);
      currentEditingProductId = Number(product.id);
      if (!catalogCategories.some((category) => category.name === product.category)) {
        catalogCategories.push({ id: product.category_id || `product-${product.id}`, name: product.category });
        renderCategoryOptions();
      }
      document.getElementById('edit-prod-id').value = product.id;
      document.getElementById('edit-prod-name').value = product.name;
      document.getElementById('edit-prod-category').value = product.category;
      document.getElementById('edit-prod-price').value = product.price;
      document.getElementById('edit-prod-stock').value = product.stock;
      document.getElementById('edit-prod-sku').value = product.sku;
      document.getElementById('edit-prod-status').value = product.is_active ? 'active' : 'inactive';
      document.getElementById('edit-prod-desc').value = product.description || '';
      setEditFormDisabled(false);
      setPageState('ready');
      document.getElementById('edit-prod-name')?.focus();
    } catch (error) {
      modalEditProduct.hidden = true;
      clearActiveModal();
      showActionError('Product could not be loaded', error);
    }
  }

  function closeEditProductModal() {
    if (modalEditProduct) modalEditProduct.hidden = true;
    formEditProduct?.reset();
    currentEditingProductId = null;
    clearActiveModal();
  }

  btnCloseEditProduct?.addEventListener('click', closeEditProductModal);
  btnCancelEditProduct?.addEventListener('click', closeEditProductModal);
  modalEditProduct?.addEventListener('click', (event) => {
    if (event.target === modalEditProduct) closeEditProductModal();
  });
  document.addEventListener('click', (event) => {
    const button = event.target.closest('.btn-edit-product');
    if (button) openEditProductModal(Number(button.dataset.productId));
  });

  formEditProduct?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!currentEditingProductId) return;
    const name = document.getElementById('edit-prod-name').value.trim();
    const category = document.getElementById('edit-prod-category').value;
    const price = Number(document.getElementById('edit-prod-price').value);
    const stock = Number(document.getElementById('edit-prod-stock').value);
    const sku = document.getElementById('edit-prod-sku').value.trim();
    const isActive = document.getElementById('edit-prod-status').value === 'active';
    const description = document.getElementById('edit-prod-desc').value.trim();
    if (!name || !sku || !category || !Number.isFinite(price) || price <= 0 || !Number.isInteger(stock) || stock < 0) {
      showToast('Enter valid product details before saving.', 'error');
      return;
    }

    const submit = document.getElementById('btn-save-edit-product');
    if (submit) submit.disabled = true;
    try {
      const updated = await requestJson(`/products/${currentEditingProductId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category, price, stock, sku, is_active: isActive, description }),
      });
      const normalized = normalizeProduct(updated);
      catalogProducts = catalogProducts.map((product) => product.id === normalized.id ? normalized : product);
      renderProducts();
      closeEditProductModal();
      setPageState('ready');
      showToast(`Saved server-confirmed changes for "${normalized.name}".`);
    } catch (error) {
      if (submit) submit.disabled = false;
      showActionError('Product changes were not saved', error);
    }
  });

  const modalManageCategories = document.getElementById('modal-manage-categories');
  const btnManageCategories = document.getElementById('btn-manage-categories');
  const btnCloseCategories = document.getElementById('btn-close-categories');
  const btnCloseCategoriesFooter = document.getElementById('btn-close-categories-footer');
  const formAddCategory = document.getElementById('form-add-category');
  const categoryList = document.getElementById('categories-list-container');

  function renderCategoryList(categories, state = 'ready', message = '') {
    if (!categoryList) return;
    if (state === 'loading') {
      categoryList.innerHTML = '<div class="skeleton-stack" aria-hidden="true"><span class="skeleton-line is-wide"></span><span class="skeleton-line"></span></div><span class="sr-only">Loading categories</span>';
      return;
    }
    if (state === 'error') {
      categoryList.innerHTML = `<div class="table-state"><strong>Categories unavailable</strong><span>${escapeHtml(message)}</span></div>`;
      return;
    }
    if (!categories.length) {
      categoryList.innerHTML = '<div class="table-state"><strong>No categories found</strong><span>Create a category below before adding products.</span></div>';
      return;
    }
    categoryList.innerHTML = categories.map((category) => `
      <div class="category-item-row" data-category-id="${escapeHtml(category.id)}">
        <span class="category-item-name">${escapeHtml(category.name)}</span>
        <span class="category-count-badge">${Number(category.product_count || 0).toLocaleString()} items</span>
      </div>`).join('');
  }

  async function openManageCategoriesModal() {
    if (!modalManageCategories) return;
    renderCategoryList([], 'loading');
    modalManageCategories.hidden = false;
    setActiveModal(modalManageCategories);
    try {
      const categories = await requestJson('/categories/');
      catalogCategories = Array.isArray(categories) ? categories : [];
      renderCategoryList(catalogCategories);
      renderCategoryOptions();
      setPageState('ready');
      document.getElementById('new-cat-name')?.focus();
    } catch (error) {
      renderCategoryList([], 'error', error.message);
      showActionError('Categories could not be loaded', error);
    }
  }

  function closeManageCategoriesModal() {
    if (modalManageCategories) modalManageCategories.hidden = true;
    formAddCategory?.reset();
    clearActiveModal();
  }

  btnManageCategories?.addEventListener('click', openManageCategoriesModal);
  btnCloseCategories?.addEventListener('click', closeManageCategoriesModal);
  btnCloseCategoriesFooter?.addEventListener('click', closeManageCategoriesModal);
  modalManageCategories?.addEventListener('click', (event) => {
    if (event.target === modalManageCategories) closeManageCategoriesModal();
  });

  formAddCategory?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.getElementById('new-cat-name');
    const name = input?.value.trim();
    if (!name) return;
    const submit = document.getElementById('btn-submit-category');
    if (submit) submit.disabled = true;
    try {
      const created = await requestJson('/categories/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const index = catalogCategories.findIndex((category) => Number(category.id) === Number(created.id));
      if (index >= 0) catalogCategories[index] = created;
      else catalogCategories.push(created);
      renderCategoryList(catalogCategories);
      renderCategoryOptions();
      input.value = '';
      if (submit) submit.disabled = false;
      setPageState('ready');
      showToast(`Created category "${created.name}".`);
    } catch (error) {
      if (submit) submit.disabled = false;
      showActionError('Category was not created', error);
    }
  });

  const modalOrderDetail = document.getElementById('modal-order-detail');
  const btnCloseOrderDetail = document.getElementById('btn-close-order-detail');
  const btnCloseOrderFooter = document.getElementById('btn-close-order-footer');
  const btnOrderMarkPacked = document.getElementById('btn-order-mark-packed');
  const btnOrderMarkShipped = document.getElementById('btn-order-mark-shipped');

  function resetOrderDetailForLoading() {
    ['order-detail-no', 'order-customer-name', 'order-shipping-line1', 'order-shipping-city', 'order-customer-phone', 'order-payment-method', 'order-created-date', 'order-subtotal', 'order-shipping', 'order-total']
      .forEach((id) => {
        const element = document.getElementById(id);
        if (element) element.textContent = '—';
      });
    const pill = document.getElementById('order-detail-status-pill');
    if (pill) {
      pill.className = 'status-pill pending';
      pill.textContent = 'Loading';
    }
    setTableState('order-items-tbody', 5, 'loading', '', 'Loading order items');
    if (btnOrderMarkPacked) btnOrderMarkPacked.disabled = true;
    if (btnOrderMarkShipped) btnOrderMarkShipped.disabled = true;
  }

  function updateFulfillmentButtonStates(rawStatus) {
    if (!btnOrderMarkPacked || !btnOrderMarkShipped) return;
    const status = String(rawStatus || '').toLowerCase();
    const canPack = ['placed', 'paid', 'processing'].includes(status);
    const canShip = status === 'packed';
    btnOrderMarkPacked.disabled = !canPack;
    btnOrderMarkShipped.disabled = !canShip;
    btnOrderMarkPacked.textContent = ['packed', 'shipped', 'out_for_delivery', 'delivered'].includes(status) ? '✓ Packed' : 'Mark as Packed';
    btnOrderMarkShipped.textContent = ['shipped', 'out_for_delivery', 'delivered'].includes(status) ? '✓ Shipped' : 'Mark as Shipped';
  }

  function populateOrderDetail(order) {
    const address = order.shipping_address || {};
    const addressLine = [address.address_line1 || address.line1, address.address_line2 || address.line2].filter(Boolean).join(', ') || 'Address not reported';
    const cityLine = [address.city, address.state, address.postal_code].filter(Boolean).join(', ') || 'City not reported';
    document.getElementById('order-detail-no').textContent = order.order_no || 'Order number not reported';
    document.getElementById('order-customer-name').textContent = address.name || order.customer || 'Customer not reported';
    document.getElementById('order-shipping-line1').textContent = addressLine;
    document.getElementById('order-shipping-city').textContent = cityLine;
    document.getElementById('order-customer-phone').textContent = address.phone || 'Phone not reported';
    document.getElementById('order-payment-method').textContent = String(order.payment_method || 'Not reported').toUpperCase();
    document.getElementById('order-created-date').textContent = formatDate(order.created_at);
    const rawStatus = order.raw_status || statusKey(order.status);
    currentActiveOrderStatus = rawStatus;
    const statusPill = document.getElementById('order-detail-status-pill');
    statusPill.className = `status-pill ${statusKey(rawStatus)}`;
    statusPill.textContent = order.status || 'Not reported';
    document.getElementById('order-subtotal').textContent = money(order.subtotal);
    document.getElementById('order-shipping').textContent = money(order.shipping);
    document.getElementById('order-total').textContent = money(order.total);

    const lines = Array.isArray(order.lines) ? order.lines : [];
    const tbody = document.getElementById('order-items-tbody');
    if (!lines.length) {
      setTableState('order-items-tbody', 5, 'empty', 'No order items returned', 'The order exists, but its line items were not included in the response.');
    } else {
      tbody.setAttribute('aria-busy', 'false');
      tbody.innerHTML = lines.map((item) => `
        <tr>
          <td class="td-strong">${escapeHtml(item.product_name || 'Product not reported')}</td>
          <td class="td-mono td-muted">${escapeHtml(item.variant_desc || 'Variant not reported')}</td>
          <td class="td-mono" style="text-align: center;">${escapeHtml(item.quantity)}</td>
          <td class="td-mono" style="text-align: right;">${escapeHtml(money(item.unit_price))}</td>
          <td class="td-mono td-strong" style="text-align: right;">${escapeHtml(money(item.total_price))}</td>
        </tr>`).join('');
    }
    updateFulfillmentButtonStates(rawStatus);
  }

  async function openOrderDetailModal(orderId) {
    if (!modalOrderDetail || !orderId) return;
    currentActiveOrderId = orderId;
    resetOrderDetailForLoading();
    modalOrderDetail.hidden = false;
    setActiveModal(modalOrderDetail);
    setPageState('loading', 'Loading order details', 'The selected order is being requested from the server.');
    try {
      const order = await requestJson(`/orders/${orderId}/`);
      populateOrderDetail(order);
      setPageState('ready');
    } catch (error) {
      setTableState('order-items-tbody', 5, 'error', 'Order details unavailable', error.message);
      showActionError('Order could not be loaded', error);
    }
  }

  async function updateOrderStatus(newStatus) {
    if (!currentActiveOrderId) return;
    if (btnOrderMarkPacked) btnOrderMarkPacked.disabled = true;
    if (btnOrderMarkShipped) btnOrderMarkShipped.disabled = true;
    try {
      const updated = await requestJson(`/orders/${currentActiveOrderId}/status/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const rawStatus = updated.raw_status || newStatus;
      currentActiveOrderStatus = rawStatus;
      const pill = document.getElementById('order-detail-status-pill');
      pill.className = `status-pill ${statusKey(rawStatus)}`;
      pill.textContent = updated.status || rawStatus;
      updateFulfillmentButtonStates(rawStatus);
      const row = document.querySelector(`tr[data-order-id="${CSS.escape(String(currentActiveOrderId))}"]`);
      const statusCell = row?.children[4];
      if (statusCell) statusCell.innerHTML = `<span class="status-pill ${statusKey(rawStatus)}">${escapeHtml(updated.status || rawStatus)}</span>`;
      setPageState('ready');
      showToast(updated.message || `Order status updated to ${rawStatus}.`);
    } catch (error) {
      updateFulfillmentButtonStates(currentActiveOrderStatus);
      showActionError('Order status was not changed', error);
    }
  }

  function closeOrderDetailModal() {
    if (modalOrderDetail) modalOrderDetail.hidden = true;
    currentActiveOrderId = null;
    currentActiveOrderStatus = null;
    clearActiveModal();
  }

  btnOrderMarkPacked?.addEventListener('click', () => updateOrderStatus('packed'));
  btnOrderMarkShipped?.addEventListener('click', () => updateOrderStatus('shipped'));
  btnCloseOrderDetail?.addEventListener('click', closeOrderDetailModal);
  btnCloseOrderFooter?.addEventListener('click', closeOrderDetailModal);
  modalOrderDetail?.addEventListener('click', (event) => {
    if (event.target === modalOrderDetail) closeOrderDetailModal();
  });
  document.getElementById('orders-tbody')?.addEventListener('click', (event) => {
    const row = event.target.closest('tr[data-order-id]');
    if (row) openOrderDetailModal(Number(row.dataset.orderId));
  });
  document.getElementById('orders-tbody')?.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key)) return;
    const row = event.target.closest('tr[data-order-id]');
    if (!row) return;
    event.preventDefault();
    openOrderDetailModal(Number(row.dataset.orderId));
  });

  document.getElementById('btn-merchant-export-csv')?.addEventListener('click', async () => {
    if (!dashboardLoaded) {
      showToast('Load live dashboard data before exporting orders.', 'error');
      return;
    }
    const button = document.getElementById('btn-merchant-export-csv');
    button.disabled = true;
    try {
      const response = await authorizedFetch('/orders/export/', { headers: { Accept: 'text/csv' } });
      const csv = await response.text();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `metrodrip_merchant_orders_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      setPageState('ready');
      showToast('Exported live merchant orders to CSV.');
    } catch (error) {
      showActionError('Orders were not exported', error);
    } finally {
      button.disabled = !dashboardLoaded;
    }
  });

  document.querySelectorAll('.nav-item[data-nav]').forEach((item) => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach((nav) => nav.classList.remove('is-active'));
      item.classList.add('is-active');
    });
  });

  async function initializePage() {
    if (document.getElementById('low-stock-tbody')) await loadDashboard();
    if (document.getElementById('products-tbody')) {
      await loadCatalog();
      if (window.location.hash === '#add-product' && catalogCategories.length) openAddProductModal();
    }
  }

  initializePage();
})();
