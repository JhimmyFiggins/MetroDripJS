// Administrator user directory: API-backed reads/writes with explicit resilient UI states.
(() => {
  const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8000/api/admin'
    : '/api/admin';
  const fixtureMode = new URLSearchParams(window.location.search).get('fixture') === 'users';

  // Fixtures are opt-in, visibly labeled, and read-only so development never looks like a successful write.
  const DEVELOPMENT_USERS = [
    { id: 'fixture-1', name: 'Juan Dela Cruz', email: 'juan@example.invalid', role: 'customer', status: 'Active', tfa: 'Off', lastActive: 'Fixture value', memberSince: 'Fixture value' },
    { id: 'fixture-2', name: 'Store Merchant', email: 'merchant@example.invalid', role: 'merchant', status: 'Active', tfa: 'On', lastActive: 'Fixture value', memberSince: 'Fixture value' },
    { id: 'fixture-3', name: 'Admin User', email: 'admin@example.invalid', role: 'admin', status: 'Active', tfa: 'On', lastActive: 'Fixture value', memberSince: 'Fixture value' },
    { id: 'fixture-4', name: 'Suspended Customer', email: 'suspended@example.invalid', role: 'customer', status: 'Suspended', tfa: 'Off', lastActive: 'Fixture value', memberSince: 'Fixture value' },
  ];

  let users = [];
  let selectedUserId = null;
  let isLoading = true;
  let loadGeneration = 0;
  let writesEnabled = false;

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(value ?? '')));
    return div.innerHTML;
  }

  function activeSession() {
    try {
      return JSON.parse(sessionStorage.getItem('metrodrip_active_user') || 'null');
    } catch {
      return null;
    }
  }

  function requestHeaders(extra = {}) {
    const session = activeSession();
    const token = session?.token || session?.access_token || '';
    return {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    };
  }

  async function httpError(response, fallback) {
    let message = fallback;
    try {
      const data = await response.json();
      message = data?.error?.message || data?.error || data?.detail || fallback;
    } catch {
      // The status-specific fallback remains safe when a response is not JSON.
    }
    const error = new Error(message);
    error.status = response.status;
    return error;
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
    const badge = document.getElementById('users-source-status');
    if (!badge) return;
    badge.textContent = label;
    badge.className = `data-source-badge ${tone}`.trim();
  }

  function setPageState(kind, title = '', message = '', options = {}) {
    const banner = document.getElementById('users-state-banner');
    const eyebrow = document.getElementById('users-state-eyebrow');
    const titleEl = document.getElementById('users-state-title');
    const messageEl = document.getElementById('users-state-message');
    const retry = document.getElementById('btn-retry-users');
    const signIn = document.getElementById('users-state-signin');
    if (!banner || !eyebrow || !titleEl || !messageEl || !retry || !signIn) return;

    if (kind === 'ready') {
      banner.hidden = true;
      retry.hidden = true;
      signIn.hidden = true;
      return;
    }
    banner.hidden = false;
    banner.className = `console-state-banner is-${kind}`;
    banner.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    eyebrow.textContent = options.eyebrow || (kind === 'warning' ? 'PARTIAL DATA' : kind.toUpperCase());
    titleEl.textContent = title;
    messageEl.textContent = message;
    retry.hidden = !options.retry;
    signIn.hidden = !options.signIn;
  }

  function displayRole(role) {
    const normalized = String(role || 'customer').toLowerCase();
    if (normalized === 'admin' || normalized === 'administrator') return 'Administrator';
    if (normalized === 'merchant') return 'Merchant';
    return 'Customer';
  }

  function apiRole(role) {
    return String(role || '').toLowerCase() === 'administrator' ? 'admin' : String(role || '').toLowerCase();
  }

  function formatDate(value, includeTime = false) {
    if (!value) return 'Not reported';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('en-PH', includeTime
      ? { dateStyle: 'medium', timeStyle: 'short' }
      : { dateStyle: 'medium' }).format(date);
  }

  function normalizeUser(raw) {
    const mfa = raw.tfa ?? raw.mfa_enabled ?? raw.two_factor_enabled;
    return {
      id: String(raw.id),
      name: String(raw.name || raw.full_name || 'Unnamed account'),
      email: String(raw.email || 'Email not reported'),
      role: displayRole(raw.role),
      status: String(raw.status || (raw.is_active === false ? 'Suspended' : 'Active')),
      tfa: mfa === true || String(mfa).toLowerCase() === 'on' ? 'On' : mfa === false || String(mfa).toLowerCase() === 'off' ? 'Off' : 'Not reported',
      lastActive: formatDate(raw.last_active || raw.last_login, true),
      memberSince: formatDate(raw.memberSince || raw.date_joined || raw.created_at),
    };
  }

  function setMutationEnabled(enabled) {
    writesEnabled = enabled && !fixtureMode;
    ['btn-open-add-user', 'btn-save-user-role', 'btn-reset-password', 'btn-toggle-suspend', 'btn-send-invite', 'btn-submit-add-user']
      .forEach(id => {
        const element = document.getElementById(id);
        if (element) element.disabled = !writesEnabled || (['btn-save-user-role', 'btn-reset-password', 'btn-toggle-suspend'].includes(id) && !selectedUserId);
      });
    document.querySelectorAll('#form-invite-staff input, #form-invite-staff select').forEach(control => {
      control.disabled = !writesEnabled;
    });
    const roleSelect = document.getElementById('detail-user-role');
    if (roleSelect) roleSelect.disabled = !writesEnabled || !selectedUserId;
  }

  function setTableLoading() {
    const tbody = document.getElementById('users-directory-tbody');
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
          <span class="sr-only">Loading user accounts</span>
        </td>
      </tr>`;
  }

  function renderTableState(title, message, action = '') {
    const tbody = document.getElementById('users-directory-tbody');
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

  function filteredUsers() {
    const search = (document.getElementById('search-users-input')?.value || '').toLowerCase().trim();
    const role = (document.getElementById('filter-role-select')?.value || 'all').toLowerCase();
    const status = (document.getElementById('filter-status-select')?.value || 'all').toLowerCase();
    return users.filter(user => {
      const matchesSearch = !search || `${user.name} ${user.email}`.toLowerCase().includes(search);
      const matchesRole = role === 'all' || apiRole(user.role) === apiRole(role);
      const matchesStatus = status === 'all' || user.status.toLowerCase() === status;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }

  function renderTable() {
    const tbody = document.getElementById('users-directory-tbody');
    if (!tbody) return;
    if (isLoading && users.length === 0) {
      setTableLoading();
      return;
    }
    const filtered = filteredUsers();
    if (!filtered.length) {
      const hasFilters = Boolean((document.getElementById('search-users-input')?.value || '').trim()) ||
        document.getElementById('filter-role-select')?.value !== 'all' ||
        document.getElementById('filter-status-select')?.value !== 'all';
      renderTableState(
        hasFilters ? 'No matching accounts' : 'No accounts found',
        hasFilters ? 'Try a different search or clear the active filters.' : 'Accounts created through the administrator API will appear here.',
        hasFilters ? 'clear' : 'retry',
      );
    } else {
      tbody.setAttribute('aria-busy', isLoading ? 'true' : 'false');
      tbody.innerHTML = filtered.map(user => {
        const selected = user.id === selectedUserId;
        const suspended = user.status.toLowerCase() === 'suspended';
        return `
          <tr data-user-id="${escapeHtml(user.id)}" class="clickable-row ${selected ? 'selected-row' : ''}" tabindex="0" aria-selected="${selected}">
            <td data-label="Name / email"><span class="td-strong">${escapeHtml(user.name)}</span><span class="responsive-secondary td-mono">${escapeHtml(user.email)}</span></td>
            <td data-label="Role" class="td-mono">${escapeHtml(user.role)}</td>
            <td data-label="Status"><span class="status-pill ${suspended ? 'suspended' : 'active'}">${escapeHtml(user.status)}</span></td>
            <td data-label="2FA" class="td-mono td-muted">${escapeHtml(user.tfa)}</td>
            <td data-label="Last active" class="td-mono td-muted">${escapeHtml(user.lastActive)}</td>
          </tr>`;
      }).join('');
    }
    const info = document.getElementById('pagination-info');
    if (info) info.textContent = filtered.length === users.length
      ? `Showing ${filtered.length} account${filtered.length === 1 ? '' : 's'}`
      : `Showing ${filtered.length} of ${users.length} accounts`;
    updateMetrics();
  }

  function setMetricsUnavailable() {
    ['metric-total-customers', 'metric-staff-accounts', 'metric-suspended'].forEach(id => {
      const element = document.getElementById(id);
      if (element) element.textContent = '—';
    });
    const customerDetail = document.getElementById('metric-customer-detail');
    const staffDetail = document.getElementById('metric-staff-detail');
    if (customerDetail) customerDetail.textContent = 'Account data unavailable';
    if (staffDetail) staffDetail.textContent = 'Account data unavailable';
  }

  function updateMetrics() {
    const customers = users.filter(user => user.role === 'Customer').length;
    const merchants = users.filter(user => user.role === 'Merchant').length;
    const admins = users.filter(user => user.role === 'Administrator').length;
    const suspended = users.filter(user => user.status.toLowerCase() === 'suspended').length;
    const total = document.getElementById('metric-total-customers');
    const staff = document.getElementById('metric-staff-accounts');
    const suspendedEl = document.getElementById('metric-suspended');
    const customerDetail = document.getElementById('metric-customer-detail');
    const staffDetail = document.getElementById('metric-staff-detail');
    if (total) total.textContent = customers.toLocaleString();
    if (staff) staff.textContent = String(merchants + admins);
    if (suspendedEl) suspendedEl.textContent = String(suspended);
    if (customerDetail) customerDetail.textContent = `${users.length} loaded accounts`;
    if (staffDetail) staffDetail.textContent = `${merchants} merchant · ${admins} admin`;
  }

  function renderEmptyDetails(message = 'Select an account after the directory loads.') {
    selectedUserId = null;
    const values = {
      'detail-user-name': 'No user selected',
      'detail-user-sub': message,
      'detail-user-2fa': 'Two-factor authentication: Not reported',
      'detail-user-activity': 'Account activity unavailable.',
    };
    Object.entries(values).forEach(([id, text]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = text;
    });
    setMutationEnabled(writesEnabled);
  }

  function selectUser(id) {
    selectedUserId = String(id);
    const user = users.find(item => item.id === selectedUserId);
    if (!user) {
      renderEmptyDetails();
      renderTable();
      return;
    }
    const name = document.getElementById('detail-user-name');
    const sub = document.getElementById('detail-user-sub');
    const role = document.getElementById('detail-user-role');
    const tfa = document.getElementById('detail-user-2fa');
    const activity = document.getElementById('detail-user-activity');
    const suspend = document.getElementById('btn-toggle-suspend');
    if (name) name.textContent = user.name;
    if (sub) sub.textContent = `${user.email} · ${user.status}`;
    if (role) role.value = user.role.toLowerCase();
    if (tfa) tfa.innerHTML = `Two-factor authentication: <strong>${escapeHtml(user.tfa === 'On' ? 'Enabled' : user.tfa === 'Off' ? 'Disabled' : 'Not reported')}</strong>`;
    if (activity) activity.textContent = `Member since ${user.memberSince} · Last active ${user.lastActive}`;
    if (suspend) {
      const suspended = user.status.toLowerCase() === 'suspended';
      suspend.textContent = suspended ? 'Activate account' : 'Suspend account';
      suspend.classList.toggle('btn-danger-outline', !suspended);
      suspend.classList.toggle('btn-success-outline', suspended);
      suspend.removeAttribute('style');
    }
    setMutationEnabled(writesEnabled);
    renderTable();
  }

  function handleLoadError(error, hadData) {
    const denied = error.status === 401 || error.status === 403;
    if (hadData) {
      setSourceStatus('STALE DATA', 'is-warning');
      setPageState('warning', denied ? 'Access changed while viewing accounts' : 'Could not refresh every account', `${error.message} Previously loaded data remains visible and may be stale.`, { retry: !denied, signIn: denied });
      renderTable();
      setMutationEnabled(false);
      return;
    }
    users = [];
    setSourceStatus(denied ? 'ACCESS DENIED' : 'UNAVAILABLE', 'is-error');
    setPageState('error', denied ? 'Administrator access required' : 'User accounts are unavailable', error.message, { retry: !denied, signIn: denied });
    renderTableState(denied ? 'Permission denied' : 'Accounts could not be loaded', denied
      ? 'Sign in with an authorized administrator account.'
      : 'Check the connection, then try again.', denied ? '' : 'retry');
    setMetricsUnavailable();
    renderEmptyDetails('Account data is unavailable.');
    setMutationEnabled(false);
  }

  async function loadUsers() {
    if (fixtureMode) {
      users = DEVELOPMENT_USERS.map(normalizeUser);
      isLoading = false;
      setSourceStatus('DEVELOPMENT FIXTURE', 'is-warning');
      setPageState('warning', 'Read-only development fixture', 'These accounts are synthetic and no write action is available. Remove ?fixture=users to connect to the administrator API.', { eyebrow: 'FIXTURE DATA' });
      renderTable();
      if (users.length) selectUser(users[0].id);
      setMutationEnabled(false);
      return;
    }

    const generation = ++loadGeneration;
    const hadData = users.length > 0;
    isLoading = true;
    setSourceStatus(hadData ? 'REFRESHING' : 'CONNECTING');
    setPageState('info', hadData ? 'Refreshing user accounts' : 'Loading user accounts', hadData
      ? 'Current rows remain visible while the latest directory is requested.'
      : 'Connecting to the administrator API. Account actions stay unavailable until access is verified.');
    setMutationEnabled(false);
    if (!hadData) {
      setTableLoading();
      setMetricsUnavailable();
      renderEmptyDetails('Account actions are unavailable while loading.');
    } else {
      renderTable();
    }

    try {
      const response = await fetch(`${API_BASE}/users/`, { headers: requestHeaders() });
      if (!response.ok) throw await httpError(response, `Administrator API returned HTTP ${response.status}.`);
      const payload = await response.json();
      const records = Array.isArray(payload) ? payload : payload?.results;
      if (!Array.isArray(records)) throw new Error('Administrator API returned an unexpected response.');
      if (generation !== loadGeneration) return;
      users = records.map(normalizeUser);
      isLoading = false;
      setSourceStatus('API CONNECTED', 'is-success');
      setPageState('ready');
      renderTable();
      setMutationEnabled(true);
      if (users.length) {
        const next = users.some(user => user.id === selectedUserId) ? selectedUserId : users[0].id;
        selectUser(next);
      } else {
        renderEmptyDetails('No accounts are available.');
      }
    } catch (error) {
      if (generation !== loadGeneration) return;
      isLoading = false;
      handleLoadError(error, hadData);
    }
  }

  function clearFilters() {
    const search = document.getElementById('search-users-input');
    const role = document.getElementById('filter-role-select');
    const status = document.getElementById('filter-status-select');
    if (search) search.value = '';
    if (role) role.value = 'all';
    if (status) status.value = 'all';
    renderTable();
    search?.focus();
  }

  async function runWrite(button, request, onSuccess, successMessage) {
    if (!writesEnabled || fixtureMode) return;
    const original = button?.textContent;
    if (button) {
      button.disabled = true;
      button.textContent = 'Saving…';
    }
    try {
      const response = await fetch(request.url, request.options);
      if (!response.ok) throw await httpError(response, `Update returned HTTP ${response.status}.`);
      const data = await response.json();
      if (button) button.textContent = original;
      onSuccess(data);
      setPageState('ready');
      setSourceStatus('API CONNECTED', 'is-success');
      showToast(typeof successMessage === 'function' ? successMessage(data) : successMessage);
    } catch (error) {
      if (selectedUserId) selectUser(selectedUserId);
      setPageState('warning', 'Account change was not saved', `${error.message} The displayed account state was not changed.`, { retry: true });
      setSourceStatus('PARTIAL DATA', 'is-warning');
      showToast(`Account change was not saved: ${error.message}`, 'error');
    } finally {
      if (button && button.textContent === 'Saving…') button.textContent = original;
      setMutationEnabled(writesEnabled);
    }
  }

  function createUserFromForm(form, button, afterSuccess) {
    const formData = new FormData(form);
    const name = String(formData.get('name') || '').trim();
    const email = String(formData.get('email') || '').trim();
    const role = apiRole(formData.get('role'));
    const phone = String(formData.get('phone') || '').trim();
    if (!name || !email || !role) return;
    runWrite(button, {
      url: `${API_BASE}/users/`,
      options: {
        method: 'POST',
        headers: requestHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name, email, role, phone }),
      },
    }, data => {
      const user = normalizeUser(data);
      users.unshift(user);
      form.reset();
      renderTable();
      selectUser(user.id);
      afterSuccess?.();
    }, `Created account for ${name}.`);
  }

  function initModal() {
    const modal = document.getElementById('modal-add-user');
    const open = document.getElementById('btn-open-add-user');
    const close = document.getElementById('btn-close-modal');
    const cancel = document.getElementById('btn-cancel-add-user');
    const form = document.getElementById('form-add-user');

    const openModal = () => {
      if (!modal || !writesEnabled) return;
      modal.hidden = false;
      document.getElementById('add-user-name')?.focus();
    };
    const closeModal = () => {
      if (!modal) return;
      modal.hidden = true;
      form?.reset();
      open?.focus();
    };
    open?.addEventListener('click', openModal);
    close?.addEventListener('click', closeModal);
    cancel?.addEventListener('click', closeModal);
    modal?.addEventListener('click', event => {
      if (event.target === modal) closeModal();
    });
    modal?.addEventListener('keydown', event => {
      if (event.key === 'Escape') return closeModal();
      if (event.key !== 'Tab') return;
      const controls = Array.from(modal.querySelectorAll('button, input, select, textarea')).filter(control => !control.disabled);
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    form?.addEventListener('submit', event => {
      event.preventDefault();
      createUserFromForm(form, document.getElementById('btn-submit-add-user'), closeModal);
    });
  }

  function initHandlers() {
    ['search-users-input', 'filter-role-select', 'filter-status-select'].forEach(id => {
      const element = document.getElementById(id);
      element?.addEventListener(id === 'search-users-input' ? 'input' : 'change', renderTable);
    });
    document.getElementById('btn-refresh-users')?.addEventListener('click', loadUsers);
    document.getElementById('btn-retry-users')?.addEventListener('click', loadUsers);

    const tbody = document.getElementById('users-directory-tbody');
    tbody?.addEventListener('click', event => {
      const action = event.target.closest('[data-table-action]')?.dataset.tableAction;
      if (action === 'clear') return clearFilters();
      if (action === 'retry') return loadUsers();
      const row = event.target.closest('tr[data-user-id]');
      if (row) selectUser(row.dataset.userId);
    });
    tbody?.addEventListener('keydown', event => {
      const row = event.target.closest('tr[data-user-id]');
      if (!row || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      selectUser(row.dataset.userId);
    });

    document.getElementById('btn-save-user-role')?.addEventListener('click', event => {
      const user = users.find(item => item.id === selectedUserId);
      const selectedRole = document.getElementById('detail-user-role')?.value;
      if (!user || !selectedRole) return;
      const nextRole = displayRole(selectedRole);
      if (user.role === nextRole) {
        showToast('No role change to save.');
        return;
      }
      runWrite(event.currentTarget, {
        url: `${API_BASE}/users/${encodeURIComponent(user.id)}/`,
        options: { method: 'PATCH', headers: requestHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ role: apiRole(selectedRole) }) },
      }, data => {
        Object.assign(user, normalizeUser({ ...user, ...data }));
        renderTable();
        selectUser(user.id);
      }, `Updated the role for ${user.name}.`);
    });

    document.getElementById('btn-reset-password')?.addEventListener('click', event => {
      const user = users.find(item => item.id === selectedUserId);
      if (!user) return;
      runWrite(event.currentTarget, {
        url: `${API_BASE}/users/${encodeURIComponent(user.id)}/reset-password/`,
        options: { method: 'POST', headers: requestHeaders({ 'Content-Type': 'application/json' }), body: '{}' },
      }, () => {}, `Password reset request accepted for ${user.email}.`);
    });

    document.getElementById('btn-toggle-suspend')?.addEventListener('click', event => {
      const user = users.find(item => item.id === selectedUserId);
      if (!user) return;
      const activate = user.status.toLowerCase() === 'suspended';
      runWrite(event.currentTarget, {
        url: `${API_BASE}/users/${encodeURIComponent(user.id)}/`,
        options: { method: 'PATCH', headers: requestHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ is_active: activate }) },
      }, data => {
        Object.assign(user, normalizeUser({ ...user, ...data }));
        renderTable();
        selectUser(user.id);
      }, `${user.name} is now ${activate ? 'active' : 'suspended'}.`);
    });

    document.getElementById('form-invite-staff')?.addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget;
      // Reuse the API-backed create path while preserving native form validation.
      const values = {
        name: document.getElementById('invite-name')?.value || '',
        email: document.getElementById('invite-email')?.value || '',
        role: document.getElementById('invite-role')?.value || 'merchant',
      };
      const button = document.getElementById('btn-send-invite');
      if (!values.name.trim() || !values.email.trim()) return;
      runWrite(button, {
        url: `${API_BASE}/users/`,
        options: { method: 'POST', headers: requestHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ ...values, role: apiRole(values.role) }) },
      }, data => {
        const user = normalizeUser(data);
        users.unshift(user);
        form.reset();
        renderTable();
        selectUser(user.id);
      }, `Created staff account for ${values.name}.`);
    });

    initModal();
  }

  document.addEventListener('DOMContentLoaded', () => {
    initHandlers();
    setMutationEnabled(false);
    loadUsers();
  });
})();
