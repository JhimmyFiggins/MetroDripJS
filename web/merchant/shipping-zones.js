// Merchant shipping-zone console backed only by authenticated zone APIs.
(() => {
  'use strict';

  const API_BASE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://127.0.0.1:8000/api/merchant'
    : '/api/merchant';
  const SESSION_KEY = 'metrodrip_active_user';
  const LOGIN_URL = '../Registration/screens/MerchantLoginScreen.html';

  let zones = [];
  let zonesLoaded = false;
  let selectedZoneId = null;

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
      const error = new Error('Sign in with an authorized merchant account to manage shipping zones.');
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
    if (!response.ok) throw await responseError(response, `Shipping-zone request returned HTTP ${response.status}.`);
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
    let banner = document.getElementById('zones-page-state');
    if (banner) return banner;
    banner = document.createElement('section');
    banner.id = 'zones-page-state';
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
    banner.querySelector('[data-state-retry]')?.addEventListener('click', loadZones);
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
    const tbody = document.getElementById('zones-tbody');
    if (!tbody) return;
    tbody.setAttribute('aria-busy', kind === 'loading' ? 'true' : 'false');
    tbody.innerHTML = kind === 'loading'
      ? `<tr class="table-state-row"><td colspan="4"><div class="skeleton-stack" aria-hidden="true"><span class="skeleton-line is-wide"></span><span class="skeleton-line"></span><span class="skeleton-line is-wide"></span></div><span class="sr-only">${escapeHtml(message)}</span></td></tr>`
      : `<tr class="table-state-row"><td colspan="4"><div class="table-state"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span></div></td></tr>`;
  }

  function normalizeZone(zone) {
    const fee = Number(zone?.fee);
    return {
      id: Number(zone?.id),
      name: String(zone?.name || 'Unnamed zone'),
      fee: Number.isInteger(fee) && fee >= 0 ? fee : 0,
      formattedFee: zone?.formatted_fee ? String(zone.formatted_fee) : `₱${Number.isFinite(fee) ? fee.toLocaleString('en-PH') : '0'}`,
      isActive: zone?.is_active === true,
    };
  }

  function setFormEnabled(enabled) {
    ['edit-zone-coverage', 'edit-zone-fee', 'edit-zone-active', 'btn-save-zone', 'btn-cancel-zone']
      .forEach((id) => {
        const control = document.getElementById(id);
        if (control) control.disabled = !enabled;
      });
  }

  function updateMetrics() {
    const active = zones.filter((zone) => zone.isActive).length;
    const selected = zones.find((zone) => zone.id === selectedZoneId);
    const activeElement = document.getElementById('metric-active-zones');
    const feeElement = document.getElementById('metric-ncr-rate');
    const feeDetail = document.getElementById('metric-selected-zone-name');
    if (activeElement) activeElement.textContent = String(active);
    if (feeElement) feeElement.textContent = selected ? selected.formattedFee : '—';
    if (feeDetail) feeDetail.textContent = selected ? selected.name : 'No zone selected';
  }

  function populateZoneSelect() {
    const select = document.getElementById('edit-zone-coverage');
    if (!select) return;
    if (!zones.length) {
      select.innerHTML = '<option value="">No shipping zones</option>';
      selectedZoneId = null;
      setFormEnabled(false);
      populateEditor();
      return;
    }
    if (!zones.some((zone) => zone.id === selectedZoneId)) selectedZoneId = zones[0].id;
    select.innerHTML = zones.map((zone) => `<option value="${zone.id}" ${zone.id === selectedZoneId ? 'selected' : ''}>${escapeHtml(zone.name)}</option>`).join('');
    setFormEnabled(zonesLoaded);
    populateEditor();
  }

  function populateEditor() {
    const zone = zones.find((item) => item.id === selectedZoneId);
    const heading = document.getElementById('heading-edit-zone');
    const fee = document.getElementById('edit-zone-fee');
    const active = document.getElementById('edit-zone-active');
    const status = document.getElementById('edit-zone-status-text');
    if (!zone) {
      if (heading) heading.textContent = 'Edit shipping zone';
      if (fee) fee.value = '';
      if (active) active.checked = false;
      if (status) status.textContent = 'Select a loaded zone before editing.';
      updateMetrics();
      return;
    }
    if (heading) heading.textContent = `Edit ${zone.name}`;
    if (fee) fee.value = String(zone.fee);
    if (active) active.checked = zone.isActive;
    if (status) status.textContent = `Stored status: ${zone.isActive ? 'Active' : 'Inactive'}`;
    updateMetrics();
  }

  function filteredZones() {
    const search = String(document.getElementById('search-zones-input')?.value || '').trim().toLowerCase();
    const status = document.getElementById('filter-zone-status')?.value || 'all';
    return zones.filter((zone) => {
      const matchesSearch = !search || zone.name.toLowerCase().includes(search) || String(zone.id).includes(search);
      const matchesStatus = status === 'all' || (status === 'active' ? zone.isActive : !zone.isActive);
      return matchesSearch && matchesStatus;
    });
  }

  function renderTable() {
    const tbody = document.getElementById('zones-tbody');
    if (!tbody || !zonesLoaded) return;
    const filtered = filteredZones();
    tbody.setAttribute('aria-busy', 'false');
    if (!zones.length) {
      setTableState('empty', 'No shipping zones', 'No shipping-zone records were returned by the API.');
      return;
    }
    if (!filtered.length) {
      setTableState('empty', 'No matching zones', 'Clear or adjust the current search and status filter.');
      return;
    }
    tbody.innerHTML = filtered.map((zone) => `
      <tr data-zone-id="${zone.id}" tabindex="0" class="clickable-row" style="${zone.id === selectedZoneId ? 'background-color: var(--color-info-bg);' : ''}">
        <td class="td-strong">${escapeHtml(zone.name)}</td>
        <td class="td-mono td-muted">#${zone.id}</td>
        <td class="td-mono" style="font-weight: 700;">${escapeHtml(zone.formattedFee)}</td>
        <td><span class="status-pill ${zone.isActive ? 'active' : ''}">${zone.isActive ? 'Active' : 'Inactive'}</span></td>
      </tr>`).join('');
  }

  function selectZone(id) {
    if (!zones.some((zone) => zone.id === id)) return;
    selectedZoneId = id;
    const select = document.getElementById('edit-zone-coverage');
    if (select) select.value = String(id);
    populateEditor();
    renderTable();
  }

  async function loadZones() {
    zonesLoaded = false;
    setFormEnabled(false);
    setPageState('loading', 'Loading live shipping zones', 'Stored zone fees and activation states are being requested from the server.');
    setTableState('loading', '', 'Loading shipping zones');
    document.getElementById('metric-active-zones').textContent = '—';
    document.getElementById('metric-ncr-rate').textContent = '—';
    const detail = document.getElementById('metric-selected-zone-name');
    if (detail) detail.textContent = 'Waiting for live data';
    try {
      const payload = await requestJson('/shipping-zones/');
      if (!Array.isArray(payload)) throw new Error('The shipping-zone service returned an unsupported payload.');
      zones = payload.map(normalizeZone).filter((zone) => Number.isFinite(zone.id));
      zonesLoaded = true;
      populateZoneSelect();
      renderTable();
      updateMetrics();
      setPageState('ready');
    } catch (error) {
      zones = [];
      selectedZoneId = null;
      populateZoneSelect();
      const permission = error?.status === 401 || error?.status === 403;
      setTableState('error', permission ? 'Merchant access required' : 'Shipping zones unavailable', error.message);
      setPageState(permission ? 'permission' : 'error', permission ? 'Merchant access required' : 'Shipping zones could not be loaded', error.message, {
        retry: !permission,
        signIn: permission,
      });
    }
  }

  async function saveZone(event) {
    event.preventDefault();
    const zone = zones.find((item) => item.id === selectedZoneId);
    const feeInput = document.getElementById('edit-zone-fee');
    const fee = Number(feeInput?.value);
    const isActive = document.getElementById('edit-zone-active')?.checked === true;
    if (!zone) {
      showToast('Select a shipping zone before saving.', 'error');
      return;
    }
    if (!Number.isInteger(fee) || fee < 0) {
      showToast('Standard fee must be a non-negative whole number.', 'error');
      feeInput?.focus();
      return;
    }

    const button = document.getElementById('btn-save-zone');
    if (button) {
      button.disabled = true;
      button.textContent = 'Saving…';
    }
    try {
      const result = await requestJson(`/shipping-zones/${zone.id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fee, is_active: isActive }),
      });
      zone.fee = Number(result?.fee);
      zone.formattedFee = String(result?.formatted_fee || `₱${zone.fee.toLocaleString('en-PH')}`);
      zone.isActive = result?.is_active === true;
      populateEditor();
      updateMetrics();
      renderTable();
      setPageState('ready');
      showToast(`Saved shipping settings for ${zone.name}.`);
    } catch (error) {
      const permission = error?.status === 401 || error?.status === 403;
      populateEditor();
      setPageState(permission ? 'permission' : 'partial', 'Shipping zone was not changed', error.message, { signIn: permission });
      showToast(`Shipping zone was not changed: ${error.message}`, 'error');
    } finally {
      if (button) {
        button.disabled = !zonesLoaded;
        button.textContent = 'Save zone';
      }
    }
  }

  function setEligibilityResult(kind, title, message) {
    const box = document.getElementById('calc-result-box');
    if (!box) return;
    box.className = `eligibility-result-pill ${kind}`;
    document.getElementById('calc-result-title').textContent = title;
    document.getElementById('calc-result-sub').textContent = message;
  }

  async function checkEligibility(event) {
    event.preventDefault();
    const addressInput = document.getElementById('calc-address');
    const address = String(addressInput?.value || '').trim();
    if (!address) {
      setEligibilityResult('ineligible', 'Address required', 'Enter a complete delivery address before checking.');
      addressInput?.focus();
      return;
    }
    const button = document.getElementById('btn-check-shipping');
    if (button) {
      button.disabled = true;
      button.textContent = 'Checking…';
    }
    try {
      const result = await requestJson('/shipping-zones/eligibility/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      });
      const eligible = result?.eligible === true;
      const title = eligible ? 'Address eligible' : 'Address not eligible';
      const message = result?.message || (eligible ? 'The server confirmed this address is eligible.' : 'The server did not match this address to an active zone.');
      setEligibilityResult(eligible ? 'eligible' : 'ineligible', title, message);
      setPageState('ready');
    } catch (error) {
      const unavailable = error?.status === 501 || error?.code === 'shipping_eligibility_unconfigured';
      const permission = error?.status === 401 || error?.status === 403;
      setEligibilityResult('ineligible', unavailable ? 'Eligibility check unavailable' : 'Address was not checked', error.message);
      setPageState(permission ? 'permission' : 'partial', unavailable ? 'Address eligibility is not configured' : 'Address check failed', error.message, {
        signIn: permission,
      });
      showToast(`${unavailable ? 'Eligibility checking is unavailable' : 'Address was not checked'}: ${error.message}`, 'error');
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = 'Check shipping';
      }
    }
  }

  function initHandlers() {
    document.getElementById('search-zones-input')?.addEventListener('input', renderTable);
    document.getElementById('filter-zone-status')?.addEventListener('change', renderTable);
    document.getElementById('btn-refresh-zones')?.addEventListener('click', loadZones);
    document.getElementById('edit-zone-coverage')?.addEventListener('change', (event) => selectZone(Number(event.target.value)));
    document.getElementById('btn-cancel-zone')?.addEventListener('click', populateEditor);
    document.getElementById('form-edit-zone')?.addEventListener('submit', saveZone);
    document.getElementById('form-check-address')?.addEventListener('submit', checkEligibility);
    document.getElementById('zones-tbody')?.addEventListener('click', (event) => {
      const row = event.target.closest('tr[data-zone-id]');
      if (row) selectZone(Number(row.dataset.zoneId));
    });
    document.getElementById('zones-tbody')?.addEventListener('keydown', (event) => {
      const row = event.target.closest('tr[data-zone-id]');
      if (!row || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      selectZone(Number(row.dataset.zoneId));
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initHandlers();
    populateEditor();
    loadZones();
  });
})();
