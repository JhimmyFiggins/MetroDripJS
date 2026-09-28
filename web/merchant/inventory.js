// Merchant inventory console backed only by authenticated merchant APIs.
(() => {
  'use strict';

  const API_BASE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://127.0.0.1:8000/api/merchant'
    : '/api/merchant';
  const SESSION_KEY = 'metrodrip_active_user';
  const LOGIN_URL = '../Registration/screens/MerchantLoginScreen.html';
  const LOW_STOCK_THRESHOLD = 5;

  let inventory = [];
  let selectedProductId = null;
  let inventoryLoaded = false;

  function escapeHtml(value) {
    const element = document.createElement('div');
    element.appendChild(document.createTextNode(String(value ?? '')));
    return element.innerHTML;
  }

  function merchantSession() {
    try {
      const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      const role = String(session?.role || '').toLowerCase();
      const token = session?.access_token || session?.token || '';
      return token && session?.is_staff === true && ['merchant', 'admin'].includes(role)
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
      // Keep the status-specific fallback when the server does not return JSON.
    }
    const error = new Error(message);
    error.status = response.status;
    return error;
  }

  async function requestJson(path, options = {}) {
    const session = merchantSession();
    if (!session) {
      const error = new Error('Sign in with an authorized merchant account to view inventory.');
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
    if (!response.ok) throw await responseError(response, `Inventory request returned HTTP ${response.status}.`);
    return response.status === 204 ? null : response.json();
  }

  function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span aria-hidden="true">${type === 'success' ? '✓' : '✕'}</span> ${escapeHtml(message)}`;
    container.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3500);
  }

  function ensureStateBanner() {
    let banner = document.getElementById('inventory-page-state');
    if (banner) return banner;
    banner = document.createElement('section');
    banner.id = 'inventory-page-state';
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
        <a class="btn btn-primary btn-sm" data-state-signin href="${LOGIN_URL}" hidden>Merchant sign in</a>
      </div>`;
    document.querySelector('.console-header')?.insertAdjacentElement('afterend', banner);
    banner.querySelector('[data-state-retry]')?.addEventListener('click', loadInventory);
    return banner;
  }

  function setPageState(kind, title = '', message = '', { retry = false, signIn = false } = {}) {
    const banner = ensureStateBanner();
    if (kind === 'ready') {
      banner.hidden = true;
      return;
    }
    const tone = kind === 'partial' || kind === 'permission' ? 'warning' : kind;
    banner.hidden = false;
    banner.className = `console-state-banner is-${tone === 'loading' ? 'info' : tone}`;
    banner.setAttribute('role', ['error', 'permission'].includes(kind) ? 'alert' : 'status');
    banner.querySelector('[data-state-eyebrow]').textContent = kind === 'permission' ? 'ACCESS REQUIRED' : kind.toUpperCase();
    banner.querySelector('[data-state-title]').textContent = title;
    banner.querySelector('[data-state-message]').textContent = message;
    banner.querySelector('[data-state-retry]').hidden = !retry;
    banner.querySelector('[data-state-signin]').hidden = !signIn;
  }

  function setTableState(kind, title, message) {
    const tbody = document.getElementById('inventory-tbody');
    if (!tbody) return;
    tbody.setAttribute('aria-busy', kind === 'loading' ? 'true' : 'false');
    tbody.innerHTML = kind === 'loading'
      ? `<tr class="table-state-row"><td colspan="5"><div class="skeleton-stack" aria-hidden="true"><span class="skeleton-line is-wide"></span><span class="skeleton-line"></span><span class="skeleton-line is-wide"></span></div><span class="sr-only">${escapeHtml(message)}</span></td></tr>`
      : `<tr class="table-state-row"><td colspan="5"><div class="table-state"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span></div></td></tr>`;
  }

  function setMovementState(kind, title, message) {
    const list = document.getElementById('movements-list');
    if (!list) return;
    list.setAttribute('aria-busy', kind === 'loading' ? 'true' : 'false');
    list.innerHTML = kind === 'loading'
      ? '<div class="skeleton-stack" aria-hidden="true"><span class="skeleton-line is-wide"></span><span class="skeleton-line"></span><span class="skeleton-line is-wide"></span></div><span class="sr-only">Loading stock movements</span>'
      : `<div class="table-state"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span></div>`;
  }

  function setFormEnabled(enabled) {
    ['adjust-product-select', 'adjust-amount', 'adjust-reason', 'btn-apply-adjustment', 'btn-cancel-adjustment', 'btn-open-adjust-stock']
      .forEach((id) => {
        const control = document.getElementById(id);
        if (control) control.disabled = !enabled;
      });
  }

  function normalizeProduct(product) {
    const stock = Number(product?.stock);
    return {
      id: Number(product?.id),
      name: String(product?.name || 'Unnamed product'),
      sku: String(product?.sku || ''),
      category: product?.category ? String(product.category) : null,
      stock: Number.isFinite(stock) && stock >= 0 ? stock : 0,
      isActive: product?.is_active === true,
    };
  }

  function stockStatus(product) {
    if (product.stock === 0) return { key: 'out', label: 'Out of stock' };
    if (product.stock <= LOW_STOCK_THRESHOLD) return { key: 'low', label: `Low stock · ${LOW_STOCK_THRESHOLD} or fewer` };
    return { key: 'normal', label: 'In stock' };
  }

  function updateCategoryOptions() {
    const select = document.getElementById('filter-category-select');
    if (!select) return;
    const previous = select.value;
    const categories = [...new Set(inventory.map((item) => item.category).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right));
    select.innerHTML = '<option value="all">Category: All</option>' + categories
      .map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
      .join('');
    select.value = categories.includes(previous) ? previous : 'all';
  }

  function populateProductSelect() {
    const select = document.getElementById('adjust-product-select');
    if (!select) return;
    const eligible = inventory.filter((item) => item.sku);
    if (!eligible.length) {
      select.innerHTML = '<option value="">No restockable product SKU</option>';
      selectedProductId = null;
      setFormEnabled(false);
      updateCalculationPreview();
      return;
    }
    if (!eligible.some((item) => item.id === selectedProductId)) selectedProductId = eligible[0].id;
    select.innerHTML = eligible.map((item) => `
      <option value="${item.id}" ${item.id === selectedProductId ? 'selected' : ''}>
        ${escapeHtml(item.name)} · ${escapeHtml(item.sku)}
      </option>`).join('');
    setFormEnabled(inventoryLoaded);
    updateCalculationPreview();
  }

  function updateMetrics() {
    const activeCount = inventory.filter((item) => item.isActive).length;
    const lowCount = inventory.filter((item) => item.stock > 0 && item.stock <= LOW_STOCK_THRESHOLD).length;
    const outCount = inventory.filter((item) => item.stock === 0).length;
    const values = {
      'metric-active-skus': activeCount,
      'metric-low-stock': lowCount,
      'metric-out-stock': outCount,
      'badge-inventory': lowCount,
    };
    Object.entries(values).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = String(value);
    });
  }

  function renderTable() {
    const tbody = document.getElementById('inventory-tbody');
    if (!tbody || !inventoryLoaded) return;
    const search = String(document.getElementById('search-inventory-input')?.value || '').trim().toLowerCase();
    const stockFilter = document.getElementById('filter-stock-select')?.value || 'all';
    const categoryFilter = document.getElementById('filter-category-select')?.value || 'all';
    const filtered = inventory.filter((item) => {
      const matchesSearch = !search || item.name.toLowerCase().includes(search) || item.sku.toLowerCase().includes(search);
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
      const matchesStock = stockFilter === 'all' || stockStatus(item).key === stockFilter;
      return matchesSearch && matchesCategory && matchesStock;
    });

    tbody.setAttribute('aria-busy', 'false');
    if (!inventory.length) {
      setTableState('empty', 'No inventory records', 'Products will appear here after they are created in the catalog.');
    } else if (!filtered.length) {
      setTableState('empty', 'No matching inventory', 'Clear or adjust the current filters to see other products.');
    } else {
      tbody.innerHTML = filtered.map((item) => {
        const status = stockStatus(item);
        const selected = item.id === selectedProductId;
        return `
          <tr data-product-id="${item.id}" tabindex="0" class="clickable-row" style="${selected ? 'background-color: var(--color-info-bg);' : ''}">
            <td><span class="td-strong">${escapeHtml(item.name)}</span><br><span class="td-mono td-muted">${escapeHtml(item.sku || 'SKU unavailable')}</span></td>
            <td class="td-mono" style="font-weight: 700;">${item.stock.toLocaleString()}</td>
            <td>${escapeHtml(item.category || 'Uncategorized')}</td>
            <td><span class="status-pill ${item.isActive ? 'active' : ''}">${item.isActive ? 'Active' : 'Inactive'}</span></td>
            <td class="td-mono" style="${status.key !== 'normal' ? 'color: var(--color-danger); font-weight: 700;' : ''}">${escapeHtml(status.label)}</td>
          </tr>`;
      }).join('');
    }
    const pagination = document.getElementById('inventory-pagination-info');
    if (pagination) pagination.textContent = `${filtered.length} of ${inventory.length} loaded product record${inventory.length === 1 ? '' : 's'}`;
  }

  function selectProduct(id) {
    if (!inventory.some((item) => item.id === id)) return;
    selectedProductId = id;
    const select = document.getElementById('adjust-product-select');
    if (select) select.value = String(id);
    updateCalculationPreview();
    renderTable();
  }

  function updateCalculationPreview() {
    const preview = document.getElementById('adjust-calculation-preview');
    if (!preview) return;
    const product = inventory.find((item) => item.id === selectedProductId);
    const quantity = Number.parseInt(document.getElementById('adjust-amount')?.value || '', 10);
    if (!product) {
      preview.textContent = 'Select a product after inventory finishes loading.';
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      preview.textContent = `Current stock: ${product.stock}. Enter a positive whole-number quantity.`;
      return;
    }
    preview.textContent = `Current stock: ${product.stock} → ${product.stock + quantity}`;
  }

  function renderMovements(movements) {
    const list = document.getElementById('movements-list');
    if (!list) return;
    list.setAttribute('aria-busy', 'false');
    if (!movements.length) {
      setMovementState('empty', 'No stock movements', 'Successful restocks and adjustments will appear here.');
      return;
    }
    list.innerHTML = movements.map((movement) => {
      const delta = String(movement?.delta ?? '—');
      const isNegative = delta.startsWith('-');
      return `
        <div class="movement-item" style="border-bottom: 1px solid var(--color-border); padding-bottom: 10px;">
          <p style="font-weight: 700; font-size: 13px; color: ${isNegative ? 'var(--color-danger)' : 'var(--color-ink)'};">${escapeHtml(delta)} · ${escapeHtml(movement?.reason || 'Reason unavailable')}</p>
          <p class="td-muted" style="font-size: 12px; margin-top: 2px;">${escapeHtml(movement?.sku || 'SKU unavailable')} · ${escapeHtml(movement?.when ? `Recorded at ${movement.when}` : 'Time unavailable')}</p>
        </div>`;
    }).join('');
  }

  async function loadInventory() {
    inventoryLoaded = false;
    setFormEnabled(false);
    setPageState('loading', 'Loading live inventory', 'Product stock and movement records are being requested from the server.');
    setTableState('loading', '', 'Loading inventory records');
    setMovementState('loading', '', 'Loading stock movements');
    ['metric-active-skus', 'metric-low-stock', 'metric-out-stock', 'badge-inventory'].forEach((id) => {
      const element = document.getElementById(id);
      if (element) element.textContent = '—';
    });

    const [productsResult, movementsResult] = await Promise.allSettled([
      requestJson('/products/'),
      requestJson('/inventory/movements/'),
    ]);
    if (productsResult.status === 'rejected') {
      const error = productsResult.reason;
      const permission = error?.status === 401 || error?.status === 403;
      inventory = [];
      populateProductSelect();
      setTableState('error', permission ? 'Merchant access required' : 'Inventory unavailable', error.message);
      if (movementsResult.status === 'fulfilled') renderMovements(Array.isArray(movementsResult.value) ? movementsResult.value : []);
      else setMovementState('error', 'Movements unavailable', movementsResult.reason.message);
      setPageState(permission ? 'permission' : 'error', permission ? 'Merchant access required' : 'Inventory could not be loaded', error.message, {
        retry: !permission,
        signIn: permission,
      });
      return;
    }

    const payload = productsResult.value;
    if (!Array.isArray(payload)) {
      setTableState('error', 'Unexpected inventory response', 'The inventory service returned an unsupported payload.');
      setMovementState('error', 'Movements unavailable', 'Inventory loading stopped because the product response was invalid.');
      setPageState('error', 'Inventory could not be loaded', 'The server response format was not recognized.', { retry: true });
      return;
    }

    inventory = payload.map(normalizeProduct).filter((item) => Number.isFinite(item.id));
    inventoryLoaded = true;
    updateCategoryOptions();
    populateProductSelect();
    updateMetrics();
    renderTable();

    if (movementsResult.status === 'fulfilled' && Array.isArray(movementsResult.value)) {
      renderMovements(movementsResult.value);
      setPageState('ready');
    } else {
      const message = movementsResult.status === 'rejected'
        ? movementsResult.reason.message
        : 'The stock movement response format was not recognized.';
      setMovementState('error', 'Movement history unavailable', message);
      setPageState('partial', 'Inventory loaded with missing history', message, { retry: true });
    }
  }

  async function submitRestock(event) {
    event.preventDefault();
    const product = inventory.find((item) => item.id === selectedProductId);
    const quantityInput = document.getElementById('adjust-amount');
    const quantity = Number.parseInt(quantityInput?.value || '', 10);
    const reason = document.getElementById('adjust-reason')?.value || 'restock';
    if (!product?.sku) {
      showToast('Select a product with a valid SKU.', 'error');
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000) {
      showToast('Quantity must be a whole number from 1 to 100,000.', 'error');
      quantityInput?.focus();
      return;
    }

    const submit = document.getElementById('btn-apply-adjustment');
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Saving…';
    }
    try {
      await requestJson('/inventory/restock/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku: product.sku, quantity, reason }),
      });
      if (quantityInput) quantityInput.value = '';
      showToast(`Stock saved for ${product.name}.`);
      await loadInventory();
    } catch (error) {
      const permission = error?.status === 401 || error?.status === 403;
      setPageState(permission ? 'permission' : 'partial', 'Stock was not changed', error.message, {
        signIn: permission,
        retry: false,
      });
      showToast(`Stock was not changed: ${error.message}`, 'error');
    } finally {
      if (submit) {
        submit.disabled = !inventoryLoaded;
        submit.textContent = 'Apply adjustment';
      }
      updateCalculationPreview();
    }
  }

  function initHandlers() {
    document.getElementById('search-inventory-input')?.addEventListener('input', renderTable);
    document.getElementById('filter-stock-select')?.addEventListener('change', renderTable);
    document.getElementById('filter-category-select')?.addEventListener('change', renderTable);
    document.getElementById('adjust-product-select')?.addEventListener('change', (event) => selectProduct(Number(event.target.value)));
    document.getElementById('adjust-amount')?.addEventListener('input', updateCalculationPreview);
    document.getElementById('btn-open-adjust-stock')?.addEventListener('click', () => {
      document.getElementById('card-adjust-stock')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      document.getElementById('adjust-amount')?.focus();
    });
    document.getElementById('btn-cancel-adjustment')?.addEventListener('click', () => {
      const input = document.getElementById('adjust-amount');
      if (input) input.value = '';
      document.getElementById('adjust-reason').value = 'restock';
      updateCalculationPreview();
    });
    document.getElementById('form-adjust-stock')?.addEventListener('submit', submitRestock);
    document.getElementById('inventory-tbody')?.addEventListener('click', (event) => {
      const row = event.target.closest('tr[data-product-id]');
      if (row) selectProduct(Number(row.dataset.productId));
    });
    document.getElementById('inventory-tbody')?.addEventListener('keydown', (event) => {
      const row = event.target.closest('tr[data-product-id]');
      if (!row || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      selectProduct(Number(row.dataset.productId));
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initHandlers();
    loadInventory();
  });
})();
