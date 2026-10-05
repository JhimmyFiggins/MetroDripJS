// Merchant orders workspace: live API states, keyboard selection, and truthful write feedback.
(() => {
  const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8000/api/merchant'
    : '/api/merchant';

  let orders = [];
  let selectedOrderId = null;
  let isLoading = true;
  let loadGeneration = 0;
  let detailGeneration = 0;
  let modalActiveTrigger = null;
  const detailCache = new Map();

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(value ?? '')));
    return div.innerHTML;
  }

  function sessionToken() {
    try {
      const session = JSON.parse(sessionStorage.getItem('metrodrip_active_user') || 'null');
      return session?.token || session?.access_token || '';
    } catch {
      return '';
    }
  }

  function requestHeaders(extra = {}) {
    const token = sessionToken();
    return {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    };
  }

  async function responseError(response, fallback) {
    try {
      const data = await response.json();
      return new Error(data?.error?.message || data?.error || data?.detail || fallback);
    } catch {
      return new Error(fallback);
    }
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

  function setSourceStatus(label, tone = '') {
    const badge = document.getElementById('orders-source-status');
    if (!badge) return;
    badge.textContent = label;
    badge.className = `data-source-badge ${tone}`.trim();
  }

  function setPageState(kind, title = '', message = '', retry = false) {
    const banner = document.getElementById('orders-state-banner');
    const eyebrow = document.getElementById('orders-state-eyebrow');
    const titleEl = document.getElementById('orders-state-title');
    const messageEl = document.getElementById('orders-state-message');
    const retryBtn = document.getElementById('btn-retry-orders');
    if (!banner || !eyebrow || !titleEl || !messageEl || !retryBtn) return;

    if (kind === 'ready') {
      banner.hidden = true;
      retryBtn.hidden = true;
      return;
    }

    banner.hidden = false;
    banner.className = `console-state-banner is-${kind}`;
    banner.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    eyebrow.textContent = kind === 'warning' ? 'PARTIAL DATA' : kind.toUpperCase();
    titleEl.textContent = title;
    messageEl.textContent = message;
    retryBtn.hidden = !retry;
  }

  function money(value) {
    if (typeof value === 'string' && value.trim().startsWith('₱')) return value.trim();
    const numeric = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(numeric) ? `₱${Math.round(numeric).toLocaleString('en-PH')}` : '—';
  }

  function numericMoney(value) {
    const numeric = Number(String(value ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(numeric) ? numeric : 0;
  }

  function normalizedMethod(value) {
    const method = String(value || '').toLowerCase();
    if (method === 'paymaya') return 'maya';
    if (method.includes('card')) return 'card';
    if (method.includes('gcash')) return 'gcash';
    if (method.includes('maya')) return 'maya';
    if (method.includes('cod') || method.includes('cash')) return 'cod';
    return method || 'unknown';
  }

  function normalizeOrder(raw) {
    const recordId = raw.order_id ?? raw.id;
    const id = String(raw.order_no || raw.order_number || raw.id || 'Unknown order');
    const method = raw.payment_method || raw.pay || raw.payment || 'Not reported';
    const paymentStatus = String(raw.payment_status || '').toLowerCase();
    const fulfillment = String(raw.fulfillment || raw.status || 'Not reported');
    const fulfillmentKey = String(raw.fulfillmentKey || raw.raw_status || raw.status || '').toLowerCase();
    return {
      recordId,
      id,
      customer: String(raw.customer || raw.customer_name || 'Customer not reported'),
      total: money(raw.total ?? raw.total_amount),
      totalNumeric: numericMoney(raw.total ?? raw.total_amount),
      payment: String(method),
      paymentKey: normalizedMethod(method),
      paymentStatus,
      fulfillment,
      fulfillmentKey,
      placed: String(raw.placed || raw.created_at || 'Not reported'),
    };
  }

  function normalizeDetail(raw, summary) {
    const address = raw.shipping_address || {};
    const addressParts = [address.line1 || address.address_line1, address.line2 || address.address_line2, address.city, address.state, address.postal_code]
      .filter(Boolean);
    const lines = Array.isArray(raw.lines) ? raw.lines : (Array.isArray(raw.items) ? raw.items : []);
    return {
      ...summary,
      subtotal: money(raw.subtotal),
      shipping: money(raw.shipping ?? raw.shipping_fee),
      total: money(raw.total ?? raw.total_amount ?? summary.total),
      customer: String(address.name || raw.customer || summary.customer),
      address: addressParts.join(', ') || 'Delivery address not reported.',
      speed: String(raw.delivery_estimate || 'Delivery estimate not reported.'),
      items: lines.map(item => ({
        name: [item.product_name_snapshot || item.product_name || item.name || 'Unnamed item', item.variant_desc_snapshot || item.variant_desc].filter(Boolean).join(' · '),
        sku: item.sku_snapshot || item.sku || '',
        price: `${Number(item.quantity || 1)} × ${money(item.unit_price ?? item.price)}`,
      })),
      activity: Array.isArray(raw.activity) ? raw.activity : [],
      paymentTransitions: Array.isArray(raw.payment_transitions) ? raw.payment_transitions : [],
    };
  }

  function setTableLoading() {
    const tbody = document.getElementById('all-orders-tbody');
    if (!tbody) return;
    tbody.setAttribute('aria-busy', 'true');
    tbody.innerHTML = `
      <tr class="table-state-row table-loading-row">
        <td colspan="5">
          <div class="skeleton-stack" aria-hidden="true">
            <span class="skeleton-line is-wide"></span>
            <span class="skeleton-line"></span>
            <span class="skeleton-line is-wide"></span>
          </div>
          <span class="sr-only">Loading orders</span>
        </td>
      </tr>`;
  }

  function renderTableState(title, message, action = '') {
    const tbody = document.getElementById('all-orders-tbody');
    if (!tbody) return;
    tbody.setAttribute('aria-busy', 'false');
    tbody.innerHTML = `
      <tr class="table-state-row">
        <td colspan="5">
          <div class="table-state">
            <strong>${escapeHtml(title)}</strong>
            <span>${escapeHtml(message)}</span>
            ${action ? `<button type="button" class="btn btn-secondary btn-sm" data-table-action="${escapeHtml(action)}">${action === 'clear' ? 'Clear filters' : 'Try again'}</button>` : ''}
          </div>
        </td>
      </tr>`;
  }

  function filteredOrders() {
    const searchTerm = (document.getElementById('search-orders-input')?.value || '').toLowerCase().trim();
    const payFilter = document.getElementById('filter-payment-select')?.value || 'all';
    const fulfillFilter = document.getElementById('filter-fulfillment-select')?.value || 'all';
    return orders.filter(order => {
      const matchSearch = !searchTerm || `${order.id} ${order.customer}`.toLowerCase().includes(searchTerm);
      const matchPay = payFilter === 'all' || order.paymentKey === payFilter;
      const matchFulfill = fulfillFilter === 'all' || order.fulfillmentKey === fulfillFilter;
      return matchSearch && matchPay && matchFulfill;
    });
  }

  function renderTable() {
    const tbody = document.getElementById('all-orders-tbody');
    if (!tbody) return;
    if (isLoading && orders.length === 0) {
      setTableLoading();
      return;
    }

    const filtered = filteredOrders();
    if (filtered.length === 0) {
      const hasFilters = Boolean((document.getElementById('search-orders-input')?.value || '').trim()) ||
        document.getElementById('filter-payment-select')?.value !== 'all' ||
        document.getElementById('filter-fulfillment-select')?.value !== 'all';
      renderTableState(
        hasFilters ? 'No matching orders' : 'No orders yet',
        hasFilters ? 'Try a different search or clear the active filters.' : 'New orders will appear here after checkout.',
        hasFilters ? 'clear' : 'retry',
      );
    } else {
      tbody.setAttribute('aria-busy', isLoading ? 'true' : 'false');
      tbody.innerHTML = filtered.map(order => {
        const selected = order.id === selectedOrderId;
        const paymentTone = order.paymentStatus === 'paid' ? 'paid' : order.paymentStatus ? 'pending' : 'neutral';
        const paymentLabel = order.paymentStatus ? `${order.payment} · ${order.paymentStatus.replaceAll('_', ' ')}` : order.payment;
        return `
          <tr data-order-id="${escapeHtml(order.id)}" class="clickable-row ${selected ? 'selected-row' : ''}" tabindex="0" aria-selected="${selected}">
            <td data-label="Order / customer"><span class="td-strong">${escapeHtml(order.id)}</span><span class="responsive-secondary">${escapeHtml(order.customer)}</span></td>
            <td data-label="Total" class="td-mono td-strong">${escapeHtml(order.total)}</td>
            <td data-label="Payment"><span class="status-pill ${paymentTone}">${escapeHtml(paymentLabel)}</span></td>
            <td data-label="Fulfillment"><span class="td-mono">${escapeHtml(order.fulfillment)}</span></td>
            <td data-label="Placed" class="td-mono td-muted">${escapeHtml(order.placed)}</td>
          </tr>`;
      }).join('');
    }

    const info = document.getElementById('orders-pagination-info');
    if (info) info.textContent = filtered.length === orders.length
      ? `Showing ${filtered.length} order${filtered.length === 1 ? '' : 's'}`
      : `Showing ${filtered.length} of ${orders.length} orders`;
  }

  function setMetricsUnavailable() {
    ['metric-orders-count', 'metric-to-ship', 'metric-sales'].forEach(id => {
      const element = document.getElementById(id);
      if (element) element.textContent = '—';
    });
    const detail = document.getElementById('metric-orders-detail');
    const shipDetail = document.getElementById('metric-to-ship-detail');
    if (detail) detail.textContent = 'Order data unavailable';
    if (shipDetail) shipDetail.textContent = 'Order data unavailable';
  }

  function updateMetrics() {
    const paid = orders.filter(order => order.paymentStatus === 'paid' || order.fulfillmentKey === 'paid');
    const pending = orders.filter(order => order.paymentStatus && order.paymentStatus !== 'paid').length;
    const toShip = orders.filter(order => ['paid', 'placed', 'confirmed', 'processing', 'unfulfilled'].includes(order.fulfillmentKey)).length;
    const sales = paid.reduce((sum, order) => sum + order.totalNumeric, 0);
    const countEl = document.getElementById('metric-orders-count');
    const detailEl = document.getElementById('metric-orders-detail');
    const shipEl = document.getElementById('metric-to-ship');
    const shipDetailEl = document.getElementById('metric-to-ship-detail');
    const salesEl = document.getElementById('metric-sales');
    if (countEl) countEl.textContent = String(orders.length);
    if (detailEl) detailEl.textContent = `${paid.length} paid · ${pending} awaiting payment`;
    if (shipEl) shipEl.textContent = String(toShip);
    if (shipDetailEl) shipDetailEl.textContent = 'Loaded orders ready for action';
    if (salesEl) salesEl.textContent = money(sales);
    const badge = document.getElementById('badge-orders');
    if (badge) badge.textContent = String(orders.length);
  }

  function renderEmptyDetails(message = 'Select an order after the directory loads.') {
    selectedOrderId = null;
    const values = {
      'detail-order-number': 'No order selected',
      'detail-order-sub': message,
      'detail-total-amount': 'Total —',
      'delivery-customer-name': '—',
      'delivery-address-text': 'Delivery address unavailable.',
      'delivery-speed-text': 'Delivery estimate unavailable.',
    };
    Object.entries(values).forEach(([id, text]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = text;
    });
    const items = document.getElementById('detail-line-items');
    const subtotal = document.getElementById('detail-subtotal-row');
    const activity = document.getElementById('order-activity-list');
    const transitions = document.getElementById('payment-transitions-list');
    const transitionsBadge = document.getElementById('payment-transitions-count');
    if (items) items.innerHTML = '<p class="td-muted">No items to display.</p>';
    if (subtotal) subtotal.innerHTML = '<span>Subtotal —</span><span>Shipping —</span>';
    if (activity) activity.innerHTML = '<p class="td-muted">No activity recorded.</p>';
    if (transitions) transitions.innerHTML = '<p class="td-muted">No transitions recorded.</p>';
    if (transitionsBadge) transitionsBadge.textContent = '0 recorded';
    setDetailActions(false);
  }

  function setDetailActions(enabled, packed = false, cancelled = false) {
    const packButton = document.getElementById('btn-mark-packed');
    const shipmentLink = document.getElementById('btn-create-shipment-link');
    const cancelButton = document.getElementById('btn-cancel-order');
    if (packButton) {
      packButton.disabled = !enabled || packed || cancelled;
      packButton.textContent = packed ? 'Already packed ✓' : 'Mark as packed';
    }
    if (shipmentLink) {
      shipmentLink.classList.toggle('is-disabled', !enabled || cancelled);
      shipmentLink.setAttribute('aria-disabled', (enabled && !cancelled) ? 'false' : 'true');
      shipmentLink.tabIndex = (enabled && !cancelled) ? 0 : -1;
    }
    if (cancelButton) {
      cancelButton.disabled = !enabled || packed || cancelled;
      cancelButton.textContent = cancelled ? 'Cancelled' : 'Cancel order';
    }
  }

  function renderDetailLoading(order) {
    const number = document.getElementById('detail-order-number');
    const sub = document.getElementById('detail-order-sub');
    const items = document.getElementById('detail-line-items');
    const transitions = document.getElementById('payment-transitions-list');
    const transitionsBadge = document.getElementById('payment-transitions-count');
    if (number) number.textContent = `Order ${order.id}`;
    if (sub) sub.textContent = 'Loading order details…';
    if (items) items.innerHTML = '<span class="skeleton-line is-wide" aria-hidden="true"></span><span class="sr-only">Loading order details</span>';
    if (transitions) transitions.innerHTML = '<span class="skeleton-line is-wide" aria-hidden="true"></span><span class="sr-only">Loading transitions</span>';
    if (transitionsBadge) transitionsBadge.textContent = '…';
    setDetailActions(false);
  }

  function renderDetail(order) {
    const values = {
      'detail-order-number': `Order ${order.id}`,
      'detail-order-sub': `${order.customer} · ${order.payment} · ${order.fulfillment}`,
      'detail-total-amount': `Total ${order.total}`,
      'delivery-customer-name': order.customer,
      'delivery-address-text': order.address,
      'delivery-speed-text': order.speed,
    };
    Object.entries(values).forEach(([id, text]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = text;
    });
    const items = document.getElementById('detail-line-items');
    const subtotal = document.getElementById('detail-subtotal-row');
    const activity = document.getElementById('order-activity-list');
    const transitions = document.getElementById('payment-transitions-list');
    const transitionsBadge = document.getElementById('payment-transitions-count');

    if (items) items.innerHTML = order.items.length
      ? order.items.map(item => `
        <div class="detail-line">
          <div>
            <span>${escapeHtml(item.name)}</span>
            ${item.sku ? `<span class="td-mono td-muted" style="font-size: 11px; margin-left: 6px;">[${escapeHtml(item.sku)}]</span>` : ''}
          </div>
          <span class="td-mono">${escapeHtml(item.price)}</span>
        </div>`).join('')
      : '<p class="td-muted">The API did not report line items.</p>';

    if (subtotal) subtotal.innerHTML = `<span>Subtotal ${escapeHtml(order.subtotal)}</span><span>Shipping ${escapeHtml(order.shipping)}</span>`;

    if (activity) activity.innerHTML = order.activity.length
      ? order.activity.map(item => `<p><span class="td-mono td-muted">${escapeHtml(item.time || '')}</span> ${escapeHtml(item.desc || '')}</p>`).join('')
      : '<p class="td-muted">No activity timeline was reported.</p>';

    if (transitionsBadge) {
      transitionsBadge.textContent = `${order.paymentTransitions.length} recorded`;
    }

    if (transitions) {
      if (order.paymentTransitions.length === 0) {
        transitions.innerHTML = '<p class="td-muted">No payment transitions recorded for this order.</p>';
      } else {
        transitions.innerHTML = order.paymentTransitions.map(t => {
          const toKey = String(t.to_status || '').toLowerCase();
          const nodeType = toKey === 'paid' ? 'node--paid' : (['failed', 'expired', 'cancelled'].includes(toKey) ? 'node--failed' : 'node--pending');
          const nodeGlyph = toKey === 'paid' ? '✓' : (['failed', 'expired', 'cancelled'].includes(toKey) ? '✕' : '●');
          const codeText = `${escapeHtml(t.from_status || 'INIT')} → ${escapeHtml(t.to_status || 'UNKNOWN')}`;
          const triggerText = t.trigger_source ? `via ${escapeHtml(t.trigger_source)}` : '';
          const reasonText = t.reason ? `<span class="timeline-reason">${escapeHtml(t.reason)}</span>` : '';
          const timeText = t.created_at ? `<span class="timeline-time">${escapeHtml(t.created_at.replace('T', ' ').slice(0, 19))}</span>` : '';
          return `
            <div class="timeline-item">
              <span class="timeline-node ${nodeType}" aria-hidden="true">${nodeGlyph}</span>
              <div class="timeline-row">
                <span class="timeline-transition-code">${codeText}</span>
                ${timeText}
              </div>
              <div class="timeline-meta">${triggerText} ${reasonText}</div>
            </div>`;
        }).join('');
      }
    }

    const isCancelled = order.fulfillmentKey === 'cancelled';
    const isPacked = ['packed', 'shipped', 'delivered'].includes(order.fulfillmentKey);
    setDetailActions(true, isPacked, isCancelled);
  }

  async function selectOrder(id) {
    selectedOrderId = id;
    renderTable();
    const summary = orders.find(order => order.id === id);
    if (!summary) {
      renderEmptyDetails();
      return;
    }
    const cached = detailCache.get(id);
    if (cached) {
      renderDetail(cached);
      return;
    }

    renderDetailLoading(summary);
    const generation = ++detailGeneration;
    try {
      const response = await fetch(`${API_BASE}/orders/${encodeURIComponent(summary.recordId)}/`, {
        headers: requestHeaders(),
      });
      if (!response.ok) throw await responseError(response, `Order detail returned HTTP ${response.status}.`);
      const detail = normalizeDetail(await response.json(), summary);
      if (generation !== detailGeneration || selectedOrderId !== id) return;
      detailCache.set(id, detail);
      renderDetail(detail);
    } catch (error) {
      if (generation !== detailGeneration || selectedOrderId !== id) return;
      renderDetail({ ...summary, subtotal: '—', shipping: '—', address: 'Delivery address unavailable.', speed: 'Delivery estimate unavailable.', items: [], activity: [], paymentTransitions: [] });
      setPageState('warning', 'Order list loaded with missing details', error.message, true);
      setSourceStatus('PARTIAL DATA', 'is-warning');
    }
  }

  async function loadOrders() {
    const generation = ++loadGeneration;
    const hadData = orders.length > 0;
    isLoading = true;
    setSourceStatus(hadData ? 'REFRESHING' : 'CONNECTING');
    setPageState('info', hadData ? 'Refreshing orders' : 'Loading orders', hadData
      ? 'Current rows remain visible while the latest order data is requested.'
      : 'Connecting to the order service. Existing order actions stay unavailable until the response is verified.');
    if (!hadData) {
      setTableLoading();
      setMetricsUnavailable();
      renderEmptyDetails('Order actions are unavailable while loading.');
    } else {
      renderTable();
    }

    try {
      const response = await fetch(`${API_BASE}/orders/`, { headers: requestHeaders() });
      if (!response.ok) throw await responseError(response, `Order service returned HTTP ${response.status}.`);
      const payload = await response.json();
      if (!Array.isArray(payload)) throw new Error('Order service returned an unexpected response.');
      if (generation !== loadGeneration) return;
      orders = payload.map(normalizeOrder);
      detailCache.clear();
      isLoading = false;
      updateMetrics();
      setSourceStatus('API CONNECTED', 'is-success');
      setPageState('ready');
      if (orders.length) {
        const next = orders.some(order => order.id === selectedOrderId) ? selectedOrderId : orders[0].id;
        await selectOrder(next);
      } else {
        renderEmptyDetails('No orders are available yet.');
        renderTable();
      }
    } catch (error) {
      if (generation !== loadGeneration) return;
      isLoading = false;
      if (hadData) {
        setSourceStatus('STALE DATA', 'is-warning');
        setPageState('warning', 'Could not refresh every order', `${error.message} The previously loaded data remains visible and may be stale.`, true);
        setDetailActions(false);
        renderTable();
      } else {
        orders = [];
        setSourceStatus('UNAVAILABLE', 'is-error');
        setPageState('error', 'Orders are unavailable', error.message, true);
        renderTableState('Orders could not be loaded', 'Check the connection or your merchant access, then try again.', 'retry');
        setMetricsUnavailable();
        renderEmptyDetails('Order data is unavailable.');
      }
    }
  }

  function clearFilters() {
    const search = document.getElementById('search-orders-input');
    const payment = document.getElementById('filter-payment-select');
    const fulfillment = document.getElementById('filter-fulfillment-select');
    if (search) search.value = '';
    if (payment) payment.value = 'all';
    if (fulfillment) fulfillment.value = 'all';
    renderTable();
    search?.focus();
  }

  async function markPacked() {
    const summary = orders.find(order => order.id === selectedOrderId);
    const button = document.getElementById('btn-mark-packed');
    if (!summary || !button) return;
    const priorLabel = button.textContent;
    button.disabled = true;
    button.textContent = 'Saving…';
    try {
      const response = await fetch(`${API_BASE}/orders/${encodeURIComponent(summary.recordId)}/`, {
        method: 'PATCH',
        headers: requestHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status: 'packed' }),
      });
      if (!response.ok) throw await responseError(response, `Status update returned HTTP ${response.status}.`);
      const result = await response.json();
      summary.fulfillment = String(result.status || 'Packed');
      summary.fulfillmentKey = String(result.raw_status || result.status || 'packed').toLowerCase();
      const cached = detailCache.get(summary.id);
      if (cached) {
        cached.fulfillment = summary.fulfillment;
        cached.fulfillmentKey = summary.fulfillmentKey;
      }
      showToast(`Order ${summary.id} is marked as packed.`);
      setPageState('ready');
      setSourceStatus('API CONNECTED', 'is-success');
      renderTable();
      if (cached) renderDetail(cached);
      else await selectOrder(summary.id);
    } catch (error) {
      button.disabled = false;
      button.textContent = priorLabel;
      setPageState('warning', 'Order was not updated', `${error.message} The displayed fulfillment state has not been changed.`, true);
      setSourceStatus('PARTIAL DATA', 'is-warning');
      showToast(`Order was not updated: ${error.message}`, 'error');
    }
  }

  function openStepUpModal() {
    const summary = orders.find(order => order.id === selectedOrderId);
    if (!summary) return;
    const modal = document.getElementById('step-up-modal');
    const body = document.getElementById('step-up-modal-body');
    const cancelBtn = document.getElementById('btn-modal-cancel');
    if (!modal || !body) return;
    modalActiveTrigger = document.activeElement;
    body.innerHTML = `Are you sure you want to cancel Order <strong>${escapeHtml(summary.id)}</strong> (${escapeHtml(summary.customer)}) for <strong>${escapeHtml(summary.total)}</strong>? This action updates the fulfillment state to cancelled.`;
    modal.hidden = false;
    modal.classList.add('is-open');
    cancelBtn?.focus();
  }

  function closeStepUpModal() {
    const modal = document.getElementById('step-up-modal');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.hidden = true;
    if (modalActiveTrigger && typeof modalActiveTrigger.focus === 'function') {
      modalActiveTrigger.focus();
    }
    modalActiveTrigger = null;
  }

  async function confirmCancelOrder() {
    const summary = orders.find(order => order.id === selectedOrderId);
    const confirmBtn = document.getElementById('btn-modal-confirm');
    if (!summary || !confirmBtn) return;
    const priorLabel = confirmBtn.textContent;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Cancelling…';
    try {
      const response = await fetch(`${API_BASE}/orders/${encodeURIComponent(summary.recordId)}/`, {
        method: 'PATCH',
        headers: requestHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status: 'cancelled' }),
      });
      if (!response.ok) throw await responseError(response, `Cancel order returned HTTP ${response.status}.`);
      const result = await response.json();
      summary.fulfillment = String(result.status || 'Cancelled');
      summary.fulfillmentKey = String(result.raw_status || result.status || 'cancelled').toLowerCase();
      const cached = detailCache.get(summary.id);
      if (cached) {
        cached.fulfillment = summary.fulfillment;
        cached.fulfillmentKey = summary.fulfillmentKey;
      }
      closeStepUpModal();
      showToast(`Order ${summary.id} is now cancelled.`);
      setPageState('ready');
      renderTable();
      if (cached) renderDetail(cached);
      else await selectOrder(summary.id);
    } catch (error) {
      showToast(`Order was not cancelled: ${error.message}`, 'error');
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = priorLabel;
    }
  }

  function exportOrders() {
    if (!orders.length) {
      showToast('No loaded orders to export.', 'error');
      return;
    }
    const csv = 'OrderID,Customer,Total,Payment,Fulfillment,Placed\n' + orders
      .map(order => [order.id, order.customer, order.total, order.payment, order.fulfillment, order.placed]
        .map(value => `"${String(value).replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `orders-export-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast('Exported the currently loaded orders.');
  }

  function initHandlers() {
    ['search-orders-input', 'filter-payment-select', 'filter-fulfillment-select'].forEach(id => {
      const element = document.getElementById(id);
      element?.addEventListener(id === 'search-orders-input' ? 'input' : 'change', renderTable);
    });
    document.getElementById('btn-refresh-orders')?.addEventListener('click', loadOrders);
    document.getElementById('btn-retry-orders')?.addEventListener('click', loadOrders);
    document.getElementById('btn-mark-packed')?.addEventListener('click', markPacked);
    document.getElementById('btn-cancel-order')?.addEventListener('click', openStepUpModal);
    document.getElementById('btn-export-orders')?.addEventListener('click', exportOrders);
    document.getElementById('btn-modal-cancel')?.addEventListener('click', closeStepUpModal);
    document.getElementById('step-up-modal-backdrop')?.addEventListener('click', closeStepUpModal);
    document.getElementById('btn-modal-confirm')?.addEventListener('click', confirmCancelOrder);

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && document.getElementById('step-up-modal')?.classList.contains('is-open')) {
        closeStepUpModal();
      }
    });

    const tbody = document.getElementById('all-orders-tbody');
    tbody?.addEventListener('click', event => {
      const action = event.target.closest('[data-table-action]')?.dataset.tableAction;
      if (action === 'clear') return clearFilters();
      if (action === 'retry') return loadOrders();
      const row = event.target.closest('tr[data-order-id]');
      if (row) selectOrder(row.dataset.orderId);
    });
    tbody?.addEventListener('keydown', event => {
      const row = event.target.closest('tr[data-order-id]');
      if (!row || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      selectOrder(row.dataset.orderId);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initHandlers();
    loadOrders();
  });
})();
