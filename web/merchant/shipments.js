// Merchant shipments console with fail-closed courier integration behavior.
(() => {
  'use strict';

  const API_BASE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://127.0.0.1:8000/api/merchant'
    : '/api/merchant';
  const SESSION_KEY = 'metrodrip_active_user';
  const LOGIN_URL = '../Registration/screens/MerchantLoginScreen.html';

  let shipments = [];
  let shipmentsLoaded = false;
  let selectedShipmentId = null;

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
    let code = null;
    try {
      const data = await response.json();
      message = data?.error?.message || data?.error || data?.detail || fallback;
      code = data?.code || data?.error?.code || null;
    } catch {
      // Keep the status-specific fallback when the response is not JSON.
    }
    const error = new Error(message);
    error.status = response.status;
    error.code = code;
    return error;
  }

  async function requestJson(path, options = {}) {
    const session = merchantSession();
    if (!session) {
      const error = new Error('Sign in with an authorized merchant account to view shipments.');
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
    if (!response.ok) throw await responseError(response, `Shipment request returned HTTP ${response.status}.`);
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
    let banner = document.getElementById('shipments-page-state');
    if (banner) return banner;
    banner = document.createElement('section');
    banner.id = 'shipments-page-state';
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
    banner.querySelector('[data-state-retry]')?.addEventListener('click', loadShipments);
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
    const tbody = document.getElementById('shipments-tbody');
    if (!tbody) return;
    tbody.setAttribute('aria-busy', kind === 'loading' ? 'true' : 'false');
    tbody.innerHTML = kind === 'loading'
      ? `<tr class="table-state-row"><td colspan="5"><div class="skeleton-stack" aria-hidden="true"><span class="skeleton-line is-wide"></span><span class="skeleton-line"></span><span class="skeleton-line is-wide"></span></div><span class="sr-only">${escapeHtml(message)}</span></td></tr>`
      : `<tr class="table-state-row"><td colspan="5"><div class="table-state"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span></div></td></tr>`;
  }

  function statusKey(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
  }

  function formatDate(value) {
    if (!value) return 'Not reported';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  function normalizeShipment(shipment) {
    const id = Number(shipment?.id);
    const carrierAvailable = Boolean(shipment?.carrier) && shipment?.carrier_source !== 'unavailable';
    return {
      id,
      orderRef: Number(shipment?.order_ref),
      orderNo: shipment?.order_no ? String(shipment.order_no) : null,
      waybill: shipment?.waybill_no ? String(shipment.waybill_no) : null,
      tracking: shipment?.tracking_no ? String(shipment.tracking_no) : null,
      carrier: carrierAvailable ? String(shipment.carrier) : null,
      carrierAvailable,
      status: String(shipment?.status || 'Status unavailable'),
      statusKey: statusKey(shipment?.status),
      bookedAt: shipment?.booked_at ? String(shipment.booked_at) : null,
    };
  }

  function updateStatusOptions() {
    const select = document.getElementById('filter-status-select');
    if (!select) return;
    const previous = select.value;
    const statuses = [...new Map(shipments.map((shipment) => [shipment.statusKey, shipment.status])).entries()]
      .filter(([key]) => key)
      .sort((left, right) => left[1].localeCompare(right[1]));
    select.innerHTML = '<option value="all">Status: All</option>' + statuses
      .map(([key, label]) => `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`)
      .join('');
    select.value = statuses.some(([key]) => key === previous) ? previous : 'all';
  }

  function updateMetrics() {
    const inTransit = shipments.filter((shipment) => ['picked_up', 'in_transit', 'out_for_delivery'].includes(shipment.statusKey)).length;
    const exceptions = shipments.filter((shipment) => shipment.statusKey === 'exception').length;
    const values = {
      'metric-ready-book': shipments.length,
      'metric-in-transit': inTransit,
      'metric-exceptions': exceptions,
    };
    Object.entries(values).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = String(value);
    });
  }

  function filteredShipments() {
    const search = String(document.getElementById('search-shipments-input')?.value || '').trim().toLowerCase();
    const carrierFilter = document.getElementById('filter-carrier-select')?.value || 'all';
    const statusFilter = document.getElementById('filter-status-select')?.value || 'all';
    return shipments.filter((shipment) => {
      const haystack = `${shipment.orderNo || ''} ${shipment.orderRef || ''} ${shipment.tracking || ''} ${shipment.waybill || ''}`.toLowerCase();
      const matchesCarrier = carrierFilter === 'all'
        || (carrierFilter === 'available' && shipment.carrierAvailable)
        || (carrierFilter === 'unavailable' && !shipment.carrierAvailable);
      const matchesStatus = statusFilter === 'all' || shipment.statusKey === statusFilter;
      return (!search || haystack.includes(search)) && matchesCarrier && matchesStatus;
    });
  }

  function renderTable() {
    const tbody = document.getElementById('shipments-tbody');
    if (!tbody || !shipmentsLoaded) return;
    const filtered = filteredShipments();
    tbody.setAttribute('aria-busy', 'false');
    if (!shipments.length) {
      setTableState('empty', 'No shipment records', 'Shipment rows will appear after fulfillment creates them.');
      return;
    }
    if (!filtered.length) {
      setTableState('empty', 'No matching shipments', 'Clear or adjust the current search and filters.');
      return;
    }
    tbody.innerHTML = filtered.map((shipment) => `
      <tr data-shipment-id="${shipment.id}" tabindex="0" class="clickable-row" style="${shipment.id === selectedShipmentId ? 'background-color: var(--color-info-bg);' : ''}">
        <td><span class="td-strong">${escapeHtml(shipment.orderNo || (Number.isFinite(shipment.orderRef) ? `Order #${shipment.orderRef}` : 'Order unavailable'))}</span><br><span class="td-mono td-muted">${escapeHtml(shipment.tracking || 'Tracking unavailable')}</span></td>
        <td>${escapeHtml(shipment.carrier || 'Courier unavailable')}</td>
        <td class="td-mono">${escapeHtml(shipment.waybill || 'Not issued')}</td>
        <td><span class="status-pill ${shipment.statusKey}">${escapeHtml(shipment.status)}</span></td>
        <td class="td-mono td-muted">${escapeHtml(formatDate(shipment.bookedAt))}</td>
      </tr>`).join('');
  }

  function renderDetails() {
    const shipment = shipments.find((item) => item.id === selectedShipmentId);
    const heading = document.getElementById('heading-tracking');
    const subheading = document.getElementById('tracking-source-note');
    const details = document.getElementById('tracking-detail-list');
    const trackingButton = document.getElementById('btn-view-tracking-ext');
    const exceptionBox = document.getElementById('shipment-exception-box');
    const exceptionHeading = document.getElementById('shipment-exception-heading');
    const exceptionAction = document.getElementById('btn-resolve-exception');
    if (!shipment) {
      if (heading) heading.textContent = 'Shipment details';
      if (subheading) subheading.textContent = 'Select a loaded shipment record.';
      if (details) details.innerHTML = '<div class="table-state"><strong>No shipment selected</strong><span>Select a row to inspect its stored fulfillment fields.</span></div>';
      if (trackingButton) trackingButton.disabled = true;
      if (exceptionBox) exceptionBox.hidden = true;
      return;
    }

    if (heading) heading.textContent = shipment.orderNo || `Order #${shipment.orderRef}`;
    if (subheading) subheading.textContent = shipment.carrierAvailable
      ? `Courier: ${shipment.carrier}`
      : 'Courier integration unavailable';
    if (details) details.innerHTML = `
      <div class="tracking-timeline">
        <div class="timeline-step"><span class="timeline-dot" aria-hidden="true"></span><p class="timeline-title">${escapeHtml(shipment.status)}</p><p class="timeline-time">Stored fulfillment status</p></div>
        <div class="timeline-step completed"><span class="timeline-dot" aria-hidden="true"></span><p class="timeline-title">Tracking: ${escapeHtml(shipment.tracking || 'Not reported')}</p><p class="timeline-time">No external tracking URL is configured</p></div>
        <div class="timeline-step completed"><span class="timeline-dot" aria-hidden="true"></span><p class="timeline-title">Waybill: ${escapeHtml(shipment.waybill || 'Not issued')}</p><p class="timeline-time">Booked: ${escapeHtml(formatDate(shipment.bookedAt))}</p></div>
      </div>`;
    if (trackingButton) trackingButton.disabled = true;
    const isException = shipment.statusKey === 'exception';
    if (exceptionBox) exceptionBox.hidden = !isException;
    if (exceptionHeading) exceptionHeading.textContent = `${shipment.orderNo || `Order #${shipment.orderRef}`} · Shipment exception`;
    if (exceptionAction) exceptionAction.disabled = !isException;
  }

  function selectShipment(id) {
    if (!shipments.some((shipment) => shipment.id === id)) return;
    selectedShipmentId = id;
    renderTable();
    renderDetails();
  }

  async function loadShipments() {
    shipmentsLoaded = false;
    setPageState('loading', 'Loading live shipments', 'Stored shipment records are being requested from the server.');
    setTableState('loading', '', 'Loading shipment records');
    ['metric-ready-book', 'metric-in-transit', 'metric-exceptions'].forEach((id) => {
      const element = document.getElementById(id);
      if (element) element.textContent = '—';
    });
    renderDetails();
    try {
      const payload = await requestJson('/shipments/');
      if (!Array.isArray(payload)) throw new Error('The shipment service returned an unsupported payload.');
      shipments = payload.map(normalizeShipment).filter((shipment) => Number.isFinite(shipment.id));
      shipmentsLoaded = true;
      updateStatusOptions();
      updateMetrics();
      if (!shipments.some((shipment) => shipment.id === selectedShipmentId)) {
        selectedShipmentId = shipments[0]?.id ?? null;
      }
      renderTable();
      renderDetails();
      setPageState('ready');
    } catch (error) {
      shipments = [];
      selectedShipmentId = null;
      const permission = error?.status === 401 || error?.status === 403;
      setTableState('error', permission ? 'Merchant access required' : 'Shipments unavailable', error.message);
      renderDetails();
      setPageState(permission ? 'permission' : 'error', permission ? 'Merchant access required' : 'Shipments could not be loaded', error.message, {
        retry: !permission,
        signIn: permission,
      });
    }
  }

  function setBookingResult(kind, title, message) {
    const box = document.getElementById('booking-result');
    if (!box) return;
    box.hidden = false;
    box.className = `eligibility-result-pill ${kind}`;
    document.getElementById('booking-result-title').textContent = title;
    document.getElementById('booking-result-message').textContent = message;
  }

  async function requestBooking(event) {
    event.preventDefault();
    const orderInput = document.getElementById('book-order-ref');
    const orderRef = Number.parseInt(orderInput?.value || '', 10);
    if (!Number.isInteger(orderRef) || orderRef < 1) {
      setBookingResult('ineligible', 'Order ID required', 'Enter the numeric database ID of an existing order.');
      orderInput?.focus();
      return;
    }

    const button = document.getElementById('btn-book-shipment-submit');
    if (button) {
      button.disabled = true;
      button.textContent = 'Requesting…';
    }
    try {
      await requestJson('/shipments/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_ref: orderRef }),
      });
      setBookingResult('eligible', 'Booking accepted', 'The server accepted the courier booking request. Refreshing stored shipment records.');
      showToast('Courier booking accepted by the server.');
      await loadShipments();
    } catch (error) {
      const unavailable = error?.status === 501 || error?.code === 'carrier_integration_unconfigured';
      const permission = error?.status === 401 || error?.status === 403;
      setBookingResult('ineligible', unavailable ? 'Courier booking unavailable' : 'Booking was not created', error.message);
      setPageState(permission ? 'permission' : 'partial', unavailable ? 'Courier integration unavailable' : 'Shipment booking failed', error.message, {
        signIn: permission,
      });
      showToast(`${unavailable ? 'Courier booking is unavailable' : 'Booking was not created'}: ${error.message}`, 'error');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Request carrier booking';
      }
    }
  }

  async function markExceptionInTransit() {
    const shipment = shipments.find((item) => item.id === selectedShipmentId);
    if (!shipment || shipment.statusKey !== 'exception') return;
    const button = document.getElementById('btn-resolve-exception');
    if (button) {
      button.disabled = true;
      button.textContent = 'Saving…';
    }
    try {
      const result = await requestJson(`/shipments/${shipment.id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_transit' }),
      });
      shipment.status = String(result?.status || 'In Transit');
      shipment.statusKey = statusKey(shipment.status);
      updateMetrics();
      updateStatusOptions();
      renderTable();
      renderDetails();
      setPageState('ready');
      showToast('Stored shipment status updated to in transit.');
    } catch (error) {
      const permission = error?.status === 401 || error?.status === 403;
      setPageState(permission ? 'permission' : 'partial', 'Shipment status was not changed', error.message, { signIn: permission });
      showToast(`Shipment status was not changed: ${error.message}`, 'error');
    } finally {
      if (button && shipments.find((item) => item.id === selectedShipmentId)?.statusKey === 'exception') {
        button.disabled = false;
        button.textContent = 'Mark in transit';
      }
    }
  }

  function initHandlers() {
    document.getElementById('search-shipments-input')?.addEventListener('input', renderTable);
    document.getElementById('filter-carrier-select')?.addEventListener('change', renderTable);
    document.getElementById('filter-status-select')?.addEventListener('change', renderTable);
    document.getElementById('btn-open-booking')?.addEventListener('click', () => {
      document.getElementById('card-book-shipment')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      document.getElementById('book-order-ref')?.focus();
    });
    document.getElementById('form-book-shipment')?.addEventListener('submit', requestBooking);
    document.getElementById('btn-resolve-exception')?.addEventListener('click', markExceptionInTransit);
    document.getElementById('shipments-tbody')?.addEventListener('click', (event) => {
      const row = event.target.closest('tr[data-shipment-id]');
      if (row) selectShipment(Number(row.dataset.shipmentId));
    });
    document.getElementById('shipments-tbody')?.addEventListener('keydown', (event) => {
      const row = event.target.closest('tr[data-shipment-id]');
      if (!row || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      selectShipment(Number(row.dataset.shipmentId));
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initHandlers();
    renderDetails();
    loadShipments();
  });
})();
