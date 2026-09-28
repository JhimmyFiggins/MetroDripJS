// Administrator dashboard: authenticated API data with explicit loading, empty, and failure states.
(() => {
  const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8000/api/admin'
    : '/api/admin';
  const SESSION_KEY = 'metrodrip_active_user';
  const ADMIN_LOGIN_URL = '../Registration/screens/AdminLoginScreen.html';

  let users = [];
  let auditEvents = [];
  let dashboardLoaded = false;
  let loadGeneration = 0;

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(value ?? '')));
    return div.innerHTML;
  }

  function activeAdminSession() {
    try {
      const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      const role = String(session?.role || '').toLowerCase();
      const token = session?.access_token || session?.token || '';
      return token && session?.is_staff === true && ['admin', 'administrator'].includes(role)
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
    const session = activeAdminSession();
    if (!session) {
      const error = new Error('Sign in with an administrator account to use this console.');
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
    let banner = document.getElementById('admin-dashboard-state');
    if (banner) return banner;

    banner = document.createElement('section');
    banner.id = 'admin-dashboard-state';
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
        <a class="btn btn-primary btn-sm" data-state-signin href="${ADMIN_LOGIN_URL}" hidden>Administrator sign in</a>
      </div>`;

    const main = document.querySelector('.console-main');
    const header = main?.querySelector('.console-header');
    if (main && header) header.insertAdjacentElement('afterend', banner);
    banner.querySelector('[data-state-retry]')?.addEventListener('click', loadInitialData);
    return banner;
  }

  function setPageState(kind, title = '', message = '', options = {}) {
    const banner = ensureStateBanner();
    if (kind === 'ready') {
      banner.hidden = true;
      return;
    }

    const tone = kind === 'permission' ? 'warning' : kind;
    banner.hidden = false;
    banner.className = `console-state-banner is-${tone === 'loading' ? 'info' : tone}`;
    banner.setAttribute('role', kind === 'error' || kind === 'permission' ? 'alert' : 'status');
    banner.querySelector('[data-state-eyebrow]').textContent = options.eyebrow || (kind === 'permission' ? 'ACCESS REQUIRED' : kind.toUpperCase());
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

  function setMutationEnabled(enabled) {
    ['btn-open-add-user', 'btn-submit-add-user', 'btn-export-csv', 'btn-save-shipping-zones']
      .forEach((id) => {
        const control = document.getElementById(id);
        if (control) control.disabled = !enabled;
      });
    document.querySelectorAll('.btn-toggle-status').forEach((button) => {
      button.disabled = !enabled;
    });
  }

  function setMetric(id, value, detail) {
    const valueEl = document.getElementById(id);
    if (!valueEl) return;
    valueEl.textContent = value;
    const detailEl = valueEl.closest('.stat-card')?.querySelector('.stat-subtext');
    if (detailEl && detail !== undefined) detailEl.textContent = detail;
  }

  function resetMetrics() {
    setMetric('metric-total-customers', '—', 'Waiting for live data');
    setMetric('metric-staff-accounts', '—', 'Waiting for live data');
    setMetric('metric-suspended-count', '—', 'Waiting for live data');
    setMetric('metric-audit-events', '—', 'Waiting for live data');
    const usersWorkspace = document.getElementById('workspace-metric-users');
    const auditWorkspace = document.getElementById('workspace-metric-audit');
    if (usersWorkspace) usersWorkspace.textContent = 'Live data unavailable';
    if (auditWorkspace) auditWorkspace.textContent = 'Live data unavailable';
    const auditBadge = document.getElementById('sidebar-audit-count');
    if (auditBadge) auditBadge.textContent = '—';
  }

  function renderMetrics(metrics = {}) {
    const total = Number(metrics.total_customers ?? 0);
    const staff = Number(metrics.staff_accounts ?? 0);
    const suspended = Number(metrics.suspended_count ?? 0);
    const audit = Number(metrics.audit_events_24h ?? 0);
    setMetric('metric-total-customers', total.toLocaleString(), metrics.weekly_delta || 'No weekly change reported');
    setMetric('metric-staff-accounts', staff.toLocaleString(), metrics.staff_breakdown || 'Staff breakdown unavailable');
    setMetric('metric-suspended-count', suspended.toLocaleString(), suspended ? 'Requires review' : 'No suspended accounts');
    setMetric('metric-audit-events', audit.toLocaleString(), 'Recorded in the last 24 hours');
    const usersWorkspace = document.getElementById('workspace-metric-users');
    const auditWorkspace = document.getElementById('workspace-metric-audit');
    const auditBadge = document.getElementById('sidebar-audit-count');
    if (usersWorkspace) usersWorkspace.textContent = `${total.toLocaleString()} customer${total === 1 ? '' : 's'}`;
    if (auditWorkspace) auditWorkspace.textContent = `${audit.toLocaleString()} event${audit === 1 ? '' : 's'} today`;
    if (auditBadge) auditBadge.textContent = audit.toLocaleString();
  }

  function normalizeUser(raw) {
    return {
      id: Number(raw.id),
      email: String(raw.email || 'Email not reported'),
      name: String(raw.name || 'Unnamed account'),
      role: String(raw.role || 'customer'),
      status: String(raw.status || (raw.is_active === false ? 'Suspended' : 'Active')),
    };
  }

  function renderUsers() {
    const tbody = document.getElementById('users-tbody');
    if (!tbody) return;
    tbody.setAttribute('aria-busy', 'false');
    if (!users.length) {
      setTableState('users-tbody', 5, 'empty', 'No accounts found', 'Accounts created through the administrator API will appear here.');
      return;
    }
    tbody.innerHTML = users.map((user) => {
      const active = user.status.toLowerCase() === 'active';
      return `
        <tr data-user-id="${user.id}">
          <td class="td-mono">${escapeHtml(user.email)}</td>
          <td class="td-strong">${escapeHtml(user.name)}</td>
          <td class="td-mono td-muted">${escapeHtml(user.role)}</td>
          <td><span class="status-pill ${active ? 'active' : 'suspended'}">${escapeHtml(user.status)}</span></td>
          <td>
            <button type="button" class="btn btn-secondary btn-sm btn-toggle-status" data-user-id="${user.id}">
              ${active ? 'Suspend' : 'Activate'}
            </button>
          </td>
        </tr>`;
    }).join('');
  }

  function renderAuditTrail() {
    const tbody = document.getElementById('audit-tbody');
    if (!tbody) return;
    tbody.setAttribute('aria-busy', 'false');
    if (!auditEvents.length) {
      setTableState('audit-tbody', 3, 'empty', 'No audit events', 'Server-recorded administrative actions will appear here.');
      return;
    }
    tbody.innerHTML = auditEvents.map((event) => `
      <tr>
        <td class="td-mono td-muted">${escapeHtml(event.when || 'Time not reported')}</td>
        <td class="td-strong">${escapeHtml(event.actor || 'Actor not reported')}</td>
        <td>${escapeHtml(event.action || 'Action not reported')}</td>
      </tr>`).join('');
  }

  function showDashboardFailure(error) {
    dashboardLoaded = false;
    users = [];
    auditEvents = [];
    resetMetrics();
    setMutationEnabled(false);
    const permissionFailure = error?.status === 401 || error?.status === 403;
    setTableState('users-tbody', 5, 'error', permissionFailure ? 'Administrator access required' : 'Accounts unavailable', error.message);
    setTableState('audit-tbody', 3, 'error', permissionFailure ? 'Administrator access required' : 'Audit trail unavailable', error.message);
    setPageState(
      permissionFailure ? 'permission' : 'error',
      permissionFailure ? 'Administrator access required' : 'Live administration data could not be loaded',
      error.message,
      { retry: !permissionFailure, signIn: permissionFailure },
    );
  }

  async function loadInitialData() {
    const generation = ++loadGeneration;
    dashboardLoaded = false;
    users = [];
    auditEvents = [];
    resetMetrics();
    setMutationEnabled(false);
    setTableState('users-tbody', 5, 'loading', '', 'Loading user accounts');
    setTableState('audit-tbody', 3, 'loading', '', 'Loading audit trail');
    setPageState('loading', 'Loading live administration data', 'Metrics, accounts, and audit events are being requested from the server.');

    try {
      const data = await requestJson('/dashboard/');
      if (generation !== loadGeneration) return;
      users = Array.isArray(data?.users) ? data.users.map(normalizeUser) : [];
      auditEvents = Array.isArray(data?.audit_trail) ? data.audit_trail : [];
      renderMetrics(data?.metrics || {});
      renderUsers();
      renderAuditTrail();
      dashboardLoaded = true;
      setMutationEnabled(true);
      setPageState('ready');
    } catch (error) {
      if (generation !== loadGeneration) return;
      showDashboardFailure(error);
    }
  }

  async function toggleUserStatus(userId, button) {
    const user = users.find((item) => item.id === userId);
    if (!user || !dashboardLoaded) return;
    const isActive = user.status.toLowerCase() === 'active';
    button.disabled = true;
    try {
      await requestJson(`/users/${userId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive }),
      });
      await loadInitialData();
      showToast(`Account ${user.name} is now ${isActive ? 'suspended' : 'active'}.`);
    } catch (error) {
      button.disabled = false;
      setPageState(error.status === 401 || error.status === 403 ? 'permission' : 'error', 'Account status was not changed', error.message, {
        signIn: error.status === 401 || error.status === 403,
      });
      showToast(error.message, 'error');
    }
  }

  const usersTable = document.getElementById('users-tbody');
  usersTable?.addEventListener('click', (event) => {
    const button = event.target.closest('.btn-toggle-status');
    if (!button) return;
    toggleUserStatus(Number(button.dataset.userId), button);
  });

  const modal = document.getElementById('modal-add-user');
  const btnOpenModal = document.getElementById('btn-open-add-user');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCancelModal = document.getElementById('btn-cancel-add-user');
  const formAddUser = document.getElementById('form-add-user');

  function openModal() {
    if (!modal || !dashboardLoaded) return;
    modal.hidden = false;
    document.getElementById('add-user-name')?.focus();
  }

  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    formAddUser?.reset();
    btnOpenModal?.focus();
  }

  btnOpenModal?.addEventListener('click', openModal);
  btnCloseModal?.addEventListener('click', closeModal);
  btnCancelModal?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  formAddUser?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!dashboardLoaded) return;
    const formData = new FormData(formAddUser);
    const name = String(formData.get('name') || '').trim();
    const email = String(formData.get('email') || '').trim();
    const role = String(formData.get('role') || 'customer');
    const phone = String(formData.get('phone') || '').trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!name || !email) {
      showToast('Name and email are required.', 'error');
      return;
    }
    if (!emailPattern.test(email)) {
      showToast('Please enter a valid email address.', 'error');
      return;
    }
    if (users.some((user) => user.email.toLowerCase() === email.toLowerCase())) {
      showToast('An account with this email already exists.', 'error');
      return;
    }

    const submit = document.getElementById('btn-submit-add-user');
    if (submit) submit.disabled = true;
    try {
      await requestJson('/users/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role, phone }),
      });
      closeModal();
      await loadInitialData();
      showToast(`Successfully created the ${role} account for ${name}.`);
    } catch (error) {
      if (submit) submit.disabled = false;
      setPageState(error.status === 401 || error.status === 403 ? 'permission' : 'error', 'Account was not created', error.message, {
        signIn: error.status === 401 || error.status === 403,
      });
      showToast(error.message, 'error');
    }
  });

  document.getElementById('btn-export-csv')?.addEventListener('click', async () => {
    if (!dashboardLoaded) {
      showToast('Load live administration data before exporting users.', 'error');
      return;
    }
    const button = document.getElementById('btn-export-csv');
    button.disabled = true;
    try {
      const response = await authorizedFetch('/export-users/', { headers: { Accept: 'text/csv' } });
      const csvContent = await response.text();
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `metrodrip_users_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      await loadInitialData();
      showToast('Exported the live user directory to CSV.');
    } catch (error) {
      button.disabled = false;
      setPageState(error.status === 401 || error.status === 403 ? 'permission' : 'error', 'Users were not exported', error.message, {
        signIn: error.status === 401 || error.status === 403,
      });
      showToast(error.message, 'error');
    }
  });

  const modalShipping = document.getElementById('modal-shipping-zones');
  const btnCloseShipping = document.getElementById('btn-close-shipping-zones');
  const btnCancelShipping = document.getElementById('btn-cancel-shipping-zones');
  const formShipping = document.getElementById('form-shipping-zones');

  function closeShippingZonesModal() {
    if (modalShipping) modalShipping.hidden = true;
  }

  async function openShippingZonesModal() {
    if (!modalShipping) return;
    const inputs = Array.from(formShipping?.querySelectorAll('input[type="number"]') || []);
    inputs.forEach((input) => {
      input.value = '';
      input.disabled = true;
    });
    const saveButton = document.getElementById('btn-save-shipping-zones');
    if (saveButton) saveButton.disabled = true;
    modalShipping.hidden = false;
    setPageState('loading', 'Loading shipping rates', 'Current rates are being requested from the server.');

    try {
      const zones = await requestJson('/shipping-zones/');
      if (!Array.isArray(zones) || !zones.length) {
        throw new Error('No shipping zones were returned by the server.');
      }
      zones.forEach((zone) => {
        const input = document.getElementById(`fee-zone-${zone.id}`) || document.querySelector(`input[name="zone_${zone.id}"]`);
        if (input) input.value = zone.fee;
      });
      inputs.forEach((input) => { input.disabled = false; });
      if (saveButton) saveButton.disabled = false;
      setPageState('ready');
      inputs[0]?.focus();
    } catch (error) {
      closeShippingZonesModal();
      setPageState(error.status === 401 || error.status === 403 ? 'permission' : 'error', 'Shipping rates could not be loaded', error.message, {
        signIn: error.status === 401 || error.status === 403,
      });
      showToast(error.message, 'error');
    }
  }

  btnCloseShipping?.addEventListener('click', closeShippingZonesModal);
  btnCancelShipping?.addEventListener('click', closeShippingZonesModal);
  modalShipping?.addEventListener('click', (event) => {
    if (event.target === modalShipping) closeShippingZonesModal();
  });

  formShipping?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const updates = [1, 2, 3].map((id) => ({
      id,
      fee: Number(document.getElementById(`fee-zone-${id}`)?.value),
    }));
    if (updates.some((update) => !Number.isFinite(update.fee) || update.fee < 0)) {
      showToast('Enter a valid non-negative fee for every shipping zone.', 'error');
      return;
    }

    const saveButton = document.getElementById('btn-save-shipping-zones');
    if (saveButton) saveButton.disabled = true;
    try {
      await Promise.all(updates.map((update) => requestJson(`/shipping-zones/${update.id}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fee: update.fee }),
      })));
      closeShippingZonesModal();
      await loadInitialData();
      showToast('Regional shipping rates were updated by the server.');
    } catch (error) {
      if (saveButton) saveButton.disabled = false;
      setPageState(error.status === 401 || error.status === 403 ? 'permission' : 'error', 'Shipping rates were not fully updated', error.message, {
        signIn: error.status === 401 || error.status === 403,
      });
      showToast(error.message, 'error');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (modal && !modal.hidden) closeModal();
    if (modalShipping && !modalShipping.hidden) closeShippingZonesModal();
  });

  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach((nav) => nav.classList.remove('is-active'));
      item.classList.add('is-active');
      const tab = item.dataset.tab || item.getAttribute('href')?.replace('#', '');
      if (tab === 'shipping') openShippingZonesModal();
    });
  });

  loadInitialData();
})();
