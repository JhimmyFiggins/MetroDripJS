// Administrator user directory: API-backed reads/writes with resilient UI states,
// role-based access control, single/bulk user deletion, and dynamic custom roles.
(() => {
  const API_BASE = (['localhost', '127.0.0.1'].includes(window.location.hostname) && window.location.port !== '3000')
    ? 'http://127.0.0.1:8000/api/admin'
    : '/api/admin';
  const fixtureMode = new URLSearchParams(window.location.search).get('fixture') === 'users';

  const DEVELOPMENT_USERS = [
    { id: 'fixture-1', name: 'Juan Dela Cruz', email: 'juan@example.invalid', role: 'customer', status: 'Active', tfa: 'Off', lastActive: 'Fixture value', memberSince: 'Fixture value' },
    { id: 'fixture-2', name: 'Store Merchant', email: 'merchant@example.invalid', role: 'merchant', status: 'Active', tfa: 'On', lastActive: 'Fixture value', memberSince: 'Fixture value' },
    { id: 'fixture-3', name: 'Admin User', email: 'admin@example.invalid', role: 'admin', status: 'Active', tfa: 'On', lastActive: 'Fixture value', memberSince: 'Fixture value' },
    { id: 'fixture-4', name: 'Suspended Customer', email: 'suspended@example.invalid', role: 'customer', status: 'Suspended', tfa: 'Off', lastActive: 'Fixture value', memberSince: 'Fixture value' },
  ];

  let users = [];
  let availableRoles = [];
  let selectedUserId = null;
  let selectedUserIds = new Set();
  let isLoading = true;
  let loadGeneration = 0;
  let writesEnabled = false;

  const PAGE_SIZE = 15;
  let currentPage = 1;

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
      // Keep status-specific fallback
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
    if (normalized === 'customer') return 'Customer';
    const found = availableRoles.find(r => (r.role && r.role.toLowerCase() === normalized) || (r.name && r.name.toLowerCase() === normalized));
    return found ? found.title : role;
  }

  function apiRole(role) {
    const r = String(role || '').toLowerCase();
    return r === 'administrator' ? 'admin' : r;
  }

  function formatDate(value, includeTime = false, fallback = 'Not recorded') {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('en-PH', includeTime
      ? { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }
      : { dateStyle: 'medium', timeZone: 'Asia/Manila' }).format(date);
  }

  function twoFactorLabel(raw) {
    const status = String(raw.two_factor_status || '').toLowerCase();
    if (status === 'enabled') return 'Enabled';
    if (status === 'pending_setup') return 'Pending Setup';
    if (status === 'disabled') return 'Disabled';
    if (raw.mfa_enabled === true) return 'Enabled';
    if (raw.mfa_enabled === false) return 'Disabled';
    return 'Unavailable';
  }

  function normalizeUser(raw) {
    const recorded = Boolean(raw.last_active_recorded || raw.last_active || raw.last_login);
    return {
      id: String(raw.id),
      name: String(raw.name || raw.full_name || 'Unnamed account'),
      email: String(raw.email || 'Email not reported'),
      rawRole: String(raw.role || 'customer').toLowerCase(),
      role: displayRole(raw.role),
      status: String(raw.status || (raw.is_active === false ? 'Suspended' : 'Active')),
      tfa: twoFactorLabel(raw),
      lastActive: recorded ? formatDate(raw.last_active || raw.last_login, true, 'No activity recorded') : 'No activity recorded',
      lastActiveExact: raw.last_active || raw.last_login || '',
      memberSince: formatDate(raw.memberSince || raw.date_joined || raw.created_at, false, 'Not recorded'),
      passwordChangeRequired: Boolean(raw.password_change_required ?? raw.passwordChangeRequired),
    };
  }

  function isAccountProtected(user) {
    const session = activeSession();
    const currentUserId = String(session?.id || '');
    const currentUserEmail = String(session?.email || '').toLowerCase();
    const userEmail = String(user.email || '').toLowerCase();
    const protectedEmails = [
      'support@metrodrip.ph',
      'admin.security@metrodrip.ph',
      'security@metrodrip.ph',
    ];

    if (currentUserId && String(user.id) === currentUserId) {
      return { protected: true, reason: 'Signed-in administrator account' };
    }
    if (currentUserEmail && userEmail === currentUserEmail) {
      return { protected: true, reason: 'Signed-in administrator account' };
    }
    if (protectedEmails.includes(userEmail)) {
      return { protected: true, reason: 'Protected system identity' };
    }
    if (user.role === 'Administrator' && user.status === 'Active') {
      const activeAdmins = users.filter(u => u.role === 'Administrator' && u.status === 'Active');
      if (activeAdmins.length <= 1) {
        return { protected: true, reason: 'Last active administrator account' };
      }
    }
    return { protected: false, reason: '' };
  }

  function setMutationEnabled(enabled) {
    writesEnabled = enabled && !fixtureMode;
    const isSelected = Boolean(selectedUserId);
    const selectedUser = isSelected ? users.find(u => u.id === selectedUserId) : null;
    const isProtected = selectedUser ? isAccountProtected(selectedUser).protected : false;

    [
      'btn-open-add-user',
      'btn-save-user-role',
      'btn-reset-password',
      'btn-resend-invite',
      'btn-toggle-suspend',
      'btn-delete-user',
      'btn-send-invite',
      'btn-submit-add-user',
    ].forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        let isDisabled = !writesEnabled;
        if (['btn-save-user-role', 'btn-reset-password', 'btn-resend-invite', 'btn-toggle-suspend', 'btn-delete-user'].includes(id)) {
          isDisabled = isDisabled || !isSelected;
        }
        if (id === 'btn-delete-user') {
          isDisabled = isDisabled || isProtected;
          if (isProtected) {
            element.setAttribute('title', selectedUser ? isAccountProtected(selectedUser).reason : 'Protected account');
          } else {
            element.removeAttribute('title');
          }
        }
        element.disabled = isDisabled;
        element.setAttribute('aria-disabled', String(isDisabled));
        if (isDisabled) {
          element.setAttribute('disabled', '');
        } else {
          element.removeAttribute('disabled');
        }
      }
    });

    document.querySelectorAll('#form-invite-staff input, #form-invite-staff select').forEach(control => {
      control.disabled = !writesEnabled;
      control.setAttribute('aria-disabled', String(!writesEnabled));
      if (!writesEnabled) {
        control.setAttribute('disabled', '');
      } else {
        control.removeAttribute('disabled');
      }
    });

    const roleSelect = document.getElementById('detail-user-role');
    if (roleSelect) {
      const isDisabled = !writesEnabled || !isSelected;
      roleSelect.disabled = isDisabled;
      roleSelect.setAttribute('aria-disabled', String(isDisabled));
      if (isDisabled) {
        roleSelect.setAttribute('disabled', '');
      } else {
        roleSelect.removeAttribute('disabled');
      }
    }
  }

  function setTableLoading() {
    const tbody = document.getElementById('users-directory-tbody');
    if (!tbody) return;
    tbody.setAttribute('aria-busy', 'true');
    tbody.innerHTML = `
      <tr class="table-state-row table-loading-row">
        <td colspan="6">
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
        <td colspan="6">
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
      const matchesRole = role === 'all' || apiRole(user.role).toLowerCase() === apiRole(role).toLowerCase() || (user.rawRole && user.rawRole.toLowerCase() === role);
      const matchesStatus = status === 'all' || user.status.toLowerCase() === status;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }

  function getPageUsers(filtered) {
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }

  function updateBulkActionBar() {
    const bar = document.getElementById('bulk-actions-bar');
    const countSpan = document.getElementById('bulk-selected-count');
    const count = selectedUserIds.size;
    if (!bar || !countSpan) return;

    if (count > 0) {
      bar.style.display = 'inline-flex';
      countSpan.textContent = `${count} account${count === 1 ? '' : 's'} selected`;
    } else {
      bar.style.display = 'none';
    }
  }

  function updateMasterCheckboxState(pageUsers) {
    const master = document.getElementById('checkbox-select-all');
    if (!master) return;
    const eligiblePageUsers = pageUsers.filter(u => !isAccountProtected(u).protected);
    if (!eligiblePageUsers.length) {
      master.checked = false;
      master.indeterminate = false;
      master.disabled = true;
      return;
    }
    master.disabled = false;
    const allSelected = eligiblePageUsers.every(u => selectedUserIds.has(u.id));
    const someSelected = eligiblePageUsers.some(u => selectedUserIds.has(u.id));
    master.checked = allSelected;
    master.indeterminate = !allSelected && someSelected;
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
      updateMasterCheckboxState([]);
    } else {
      const pageUsers = getPageUsers(filtered);
      tbody.setAttribute('aria-busy', isLoading ? 'true' : 'false');
      tbody.innerHTML = pageUsers.map(user => {
        const selected = user.id === selectedUserId;
        const suspended = user.status.toLowerCase() === 'suspended';
        const tfaPillClass = user.tfa === 'Enabled' ? 'active' : user.tfa === 'Pending Setup' ? 'pending' : user.tfa === 'Disabled' ? 'inactive' : 'neutral';
        const protection = isAccountProtected(user);
        const isChecked = selectedUserIds.has(user.id);

        const checkboxCell = protection.protected
          ? `<input type="checkbox" class="user-row-checkbox" disabled title="${escapeHtml(protection.reason)}" aria-label="Protected: ${escapeHtml(protection.reason)}">`
          : `<input type="checkbox" class="user-row-checkbox" data-user-id="${escapeHtml(user.id)}" ${isChecked ? 'checked' : ''} aria-label="Select ${escapeHtml(user.name)}">`;

        return `
          <tr data-user-id="${escapeHtml(user.id)}" class="clickable-row ${selected ? 'selected-row' : ''}" tabindex="0" aria-selected="${selected}">
            <td style="width: 44px; text-align: center;" class="row-checkbox-cell">${checkboxCell}</td>
            <td data-label="Name / email"><span class="td-strong">${escapeHtml(user.name)}</span><span class="responsive-secondary td-mono">${escapeHtml(user.email)}</span></td>
            <td data-label="Role" class="td-mono">${escapeHtml(user.role)}</td>
            <td data-label="Status"><span class="status-pill ${suspended ? 'suspended' : 'active'}">${escapeHtml(user.status)}</span></td>
            <td data-label="2FA"><span class="status-pill ${tfaPillClass}">${escapeHtml(user.tfa)}</span></td>
            <td data-label="Last active" class="td-mono td-muted" title="${escapeHtml(user.lastActiveExact ? `${user.lastActiveExact} Asia/Manila` : 'No authenticated activity has been recorded')}">${escapeHtml(user.lastActive)}</td>
          </tr>`;
      }).join('');
      updateMasterCheckboxState(pageUsers);
    }

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const info = document.getElementById('pagination-info');
    if (info) {
      if (filtered.length === 0) {
        info.textContent = '0 accounts';
      } else if (filtered.length <= PAGE_SIZE) {
        info.textContent = `Showing ${filtered.length} account${filtered.length === 1 ? '' : 's'}`;
      } else {
        const start = (currentPage - 1) * PAGE_SIZE + 1;
        const end = Math.min(currentPage * PAGE_SIZE, filtered.length);
        info.textContent = `Showing ${start}–${end} of ${filtered.length} accounts (Page ${currentPage} of ${totalPages})`;
      }
    }

    const prevBtn = document.getElementById('btn-prev-page');
    const nextBtn = document.getElementById('btn-next-page');
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;

    updateBulkActionBar();
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
    const merchants = users.filter(user => user.role === 'Merchant' || (user.rawRole && !['admin', 'administrator', 'customer'].includes(user.rawRole))).length;
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
      'detail-user-password-status': 'Password status: Not reported',
    };
    Object.entries(values).forEach(([id, text]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = text;
    });
    const resendInvite = document.getElementById('btn-resend-invite');
    if (resendInvite) resendInvite.style.display = 'none';
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
    const pwdStatus = document.getElementById('detail-user-password-status');
    const resendInvite = document.getElementById('btn-resend-invite');
    const suspend = document.getElementById('btn-toggle-suspend');
    if (name) name.textContent = user.name;
    if (sub) sub.textContent = `${user.email} · ${user.status}`;
    if (role) {
      role.value = user.rawRole || user.role.toLowerCase();
    }
    if (tfa) tfa.innerHTML = `Two-factor authentication: <strong>${escapeHtml(user.tfa)}</strong>`;
    if (activity) {
      const activeText = user.lastActive === 'No activity recorded' ? 'No activity recorded' : `Last active ${user.lastActive}`;
      activity.textContent = `Member since ${user.memberSince} · ${activeText}`;
    }
    if (pwdStatus) {
      if (user.passwordChangeRequired) {
        pwdStatus.innerHTML = 'Password status: <strong style="color: var(--color-warning, #B45309);">Temporary / Setup Required</strong>';
      } else {
        pwdStatus.innerHTML = 'Password status: <strong style="color: var(--color-success, #116B32);">Active & Established</strong>';
      }
    }
    if (resendInvite) {
      resendInvite.style.display = user.passwordChangeRequired ? 'inline-block' : 'none';
    }
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

  async function loadAvailableRoles() {
    try {
      const response = await fetch(`${API_BASE}/roles/`, { headers: requestHeaders() });
      if (!response.ok) return;
      const records = await response.json();
      if (!Array.isArray(records)) return;
      availableRoles = records;

      // Populate Role Dropdowns
      // 1. Add Staff Account (#invite-role): Admin + Merchant + Custom staff roles based on admin/merchant
      const inviteSelect = document.getElementById('invite-role');
      if (inviteSelect) {
        const staffRoles = [
          { role: 'merchant', title: 'Merchant' },
          { role: 'administrator', title: 'Administrator' },
        ];
        records.filter(r => r.is_custom && ['merchant', 'admin'].includes(String(r.base_role).toLowerCase())).forEach(r => {
          staffRoles.push({ role: r.role, title: `${r.title} (Custom ${r.base_role === 'admin' ? 'Admin' : 'Merchant'})` });
        });
        const currentVal = inviteSelect.value;
        inviteSelect.innerHTML = staffRoles.map(r => `<option value="${escapeHtml(r.role)}">${escapeHtml(r.title)}</option>`).join('');
        if (staffRoles.some(r => r.role === currentVal)) inviteSelect.value = currentVal;
      }

      // 2. Selected User Assigned Role (#detail-user-role): All system + custom roles
      const detailSelect = document.getElementById('detail-user-role');
      if (detailSelect) {
        const allRoles = [
          { role: 'customer', title: 'Customer' },
          { role: 'merchant', title: 'Merchant' },
          { role: 'administrator', title: 'Administrator' },
        ];
        records.filter(r => r.is_custom).forEach(r => {
          allRoles.push({ role: r.role, title: `${r.title} (Custom)` });
        });
        const currentVal = detailSelect.value;
        detailSelect.innerHTML = allRoles.map(r => `<option value="${escapeHtml(r.role)}">${escapeHtml(r.title)}</option>`).join('');
        if (allRoles.some(r => r.role === currentVal)) detailSelect.value = currentVal;
      }

      // 3. Add Platform User Modal (#add-user-role): All system + custom roles
      const addModalSelect = document.getElementById('add-user-role');
      if (addModalSelect) {
        const allRoles = [
          { role: 'customer', title: 'Customer' },
          { role: 'merchant', title: 'Merchant' },
          { role: 'administrator', title: 'Administrator' },
        ];
        records.filter(r => r.is_custom).forEach(r => {
          allRoles.push({ role: r.role, title: `${r.title} (Custom)` });
        });
        const currentVal = addModalSelect.value;
        addModalSelect.innerHTML = allRoles.map(r => `<option value="${escapeHtml(r.role)}">${escapeHtml(r.title)}</option>`).join('');
        if (allRoles.some(r => r.role === currentVal)) addModalSelect.value = currentVal;
      }

      // 4. Role Filter Toolbar (#filter-role-select): All
      const filterSelect = document.getElementById('filter-role-select');
      if (filterSelect) {
        const filterOpts = [
          { role: 'all', title: 'Role: All' },
          { role: 'customer', title: 'Customer' },
          { role: 'merchant', title: 'Merchant' },
          { role: 'administrator', title: 'Administrator' },
        ];
        records.filter(r => r.is_custom).forEach(r => {
          filterOpts.push({ role: r.role, title: r.title });
        });
        const currentVal = filterSelect.value;
        filterSelect.innerHTML = filterOpts.map(r => `<option value="${escapeHtml(r.role)}">${escapeHtml(r.title)}</option>`).join('');
        if (filterOpts.some(r => r.role === currentVal)) filterSelect.value = currentVal;
      }
    } catch {
      // Retain fallback options
    }
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
      await loadAvailableRoles();
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

      // Prune selectedUserIds that no longer exist
      const existingIds = new Set(users.map(u => u.id));
      selectedUserIds = new Set([...selectedUserIds].filter(id => existingIds.has(id)));

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
    currentPage = 1;
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

  function showTempPasswordModal(user, tempPassword, passwordOption) {
    const modal = document.getElementById('modal-temp-password');
    const nameEl = document.getElementById('temp-user-name');
    const emailEl = document.getElementById('temp-user-email');
    const pwdBlock = document.getElementById('temp-password-block');
    const pwdVal = document.getElementById('temp-password-value');
    const noticeEl = document.getElementById('temp-password-notice');
    if (!modal) return;

    if (nameEl) nameEl.textContent = user.name;
    if (emailEl) emailEl.textContent = user.email;

    if (tempPassword) {
      if (pwdBlock) pwdBlock.style.display = 'block';
      if (pwdVal) pwdVal.textContent = tempPassword;
      if (noticeEl) {
        noticeEl.innerHTML = '⚠️ <strong>Mandatory First-Login Change:</strong> The user will be restricted from accessing the store/console until they choose a permanent password.';
      }
    } else if (passwordOption === 'email_invite') {
      if (pwdBlock) pwdBlock.style.display = 'none';
      if (noticeEl) {
        noticeEl.innerHTML = '✉️ <strong>Setup Invitation Dispatched:</strong> An invitation link has been queued via Brevo. The user must establish their password using that link before signing in.';
      }
    } else {
      if (pwdBlock) pwdBlock.style.display = 'none';
      if (noticeEl) {
        noticeEl.innerHTML = '⚠️ <strong>Mandatory First-Login Change:</strong> The user will be required to change their password on first login.';
      }
    }

    modal.hidden = false;
  }

  function initTempPasswordModal() {
    const modal = document.getElementById('modal-temp-password');
    const closeBtn = document.getElementById('btn-close-temp-modal');
    const doneBtn = document.getElementById('btn-done-temp-password');
    const copyBtn = document.getElementById('btn-copy-temp-password');
    const pwdVal = document.getElementById('temp-password-value');

    const closeModal = () => {
      if (modal) modal.hidden = true;
    };

    closeBtn?.addEventListener('click', closeModal);
    doneBtn?.addEventListener('click', closeModal);
    modal?.addEventListener('click', event => {
      if (event.target === modal) closeModal();
    });

    copyBtn?.addEventListener('click', async () => {
      const text = pwdVal?.textContent || '';
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
      } catch {
        showToast('Password copied to clipboard.');
      }
    });
  }

  function createUserFromForm(form, button, afterSuccess) {
    const formData = new FormData(form);
    const name = String(formData.get('name') || '').trim();
    const email = String(formData.get('email') || '').trim();
    const role = apiRole(formData.get('role'));
    const phone = String(formData.get('phone') || '').trim();
    const passwordOption = String(formData.get('password_option') || 'generated').trim();
    const password = String(formData.get('password') || '').trim();
    if (!name || !email || !role) return;

    if (passwordOption === 'custom' && password.length < 8) {
      showToast('Temporary password must be at least 8 characters.', 'error');
      return;
    }

    const payload = {
      name,
      email,
      role,
      phone,
      password_option: passwordOption,
      ...(passwordOption === 'custom' ? { password } : {}),
    };

    runWrite(button, {
      url: `${API_BASE}/users/`,
      options: {
        method: 'POST',
        headers: requestHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      },
    }, data => {
      const user = normalizeUser(data);
      users.unshift(user);
      form.reset();
      const optSelect = document.getElementById('add-user-password-option');
      if (optSelect) optSelect.value = 'generated';
      document.getElementById('group-custom-password')?.setAttribute('style', 'display: none;');
      document.getElementById('group-generated-info')?.removeAttribute('style');
      document.getElementById('group-invite-info')?.setAttribute('style', 'display: none;');

      renderTable();
      selectUser(user.id);
      afterSuccess?.();

      if (data.temporary_password || passwordOption === 'email_invite') {
        showTempPasswordModal(user, data.temporary_password, passwordOption);
      }
    }, `Created account for ${name}.`);
  }

  function initAddUserModal() {
    const modal = document.getElementById('modal-add-user');
    const open = document.getElementById('btn-open-add-user');
    const close = document.getElementById('btn-close-modal');
    const cancel = document.getElementById('btn-cancel-add-user');
    const form = document.getElementById('form-add-user');
    const optionSelect = document.getElementById('add-user-password-option');
    const togglePwd = document.getElementById('btn-toggle-add-password');
    const pwdInput = document.getElementById('add-user-password');

    optionSelect?.addEventListener('change', () => {
      const val = optionSelect.value;
      const customGroup = document.getElementById('group-custom-password');
      const genGroup = document.getElementById('group-generated-info');
      const inviteGroup = document.getElementById('group-invite-info');

      if (customGroup) customGroup.style.display = val === 'custom' ? 'block' : 'none';
      if (genGroup) genGroup.style.display = val === 'generated' ? 'block' : 'none';
      if (inviteGroup) inviteGroup.style.display = val === 'email_invite' ? 'block' : 'none';
      if (val === 'custom') pwdInput?.focus();
    });

    togglePwd?.addEventListener('click', () => {
      if (!pwdInput) return;
      const isPassword = pwdInput.type === 'password';
      pwdInput.type = isPassword ? 'text' : 'password';
      togglePwd.textContent = isPassword ? '🔒' : '👁️';
    });

    const openModal = () => {
      if (!modal || !writesEnabled) return;
      modal.hidden = false;
      document.getElementById('add-user-name')?.focus();
    };
    const closeModal = () => {
      if (!modal) return;
      modal.hidden = true;
      form?.reset();
      if (optionSelect) optionSelect.value = 'generated';
      document.getElementById('group-custom-password')?.setAttribute('style', 'display: none;');
      document.getElementById('group-generated-info')?.removeAttribute('style');
      document.getElementById('group-invite-info')?.setAttribute('style', 'display: none;');
      if (pwdInput) pwdInput.type = 'password';
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

    initTempPasswordModal();
  }

  // Single User Deletion Modal & Handler
  function initSingleDeleteModal() {
    const modal = document.getElementById('modal-delete-user');
    const btnOpen = document.getElementById('btn-delete-user');
    const btnClose = document.getElementById('btn-close-delete-modal');
    const btnCancel = document.getElementById('btn-cancel-delete-user');
    const btnConfirm = document.getElementById('btn-confirm-delete-user');
    const nameEl = document.getElementById('delete-user-name');
    const emailEl = document.getElementById('delete-user-email');

    const openModal = () => {
      const user = users.find(u => u.id === selectedUserId);
      if (!user || !writesEnabled) return;
      const protection = isAccountProtected(user);
      if (protection.protected) {
        showToast(`Cannot delete this account: ${protection.reason}.`, 'error');
        return;
      }
      if (nameEl) nameEl.textContent = user.name;
      if (emailEl) emailEl.textContent = user.email;
      if (modal) modal.hidden = false;
      btnConfirm?.focus();
    };

    const closeModal = () => {
      if (modal) modal.hidden = true;
      btnOpen?.focus();
    };

    btnOpen?.addEventListener('click', openModal);
    btnClose?.addEventListener('click', closeModal);
    btnCancel?.addEventListener('click', closeModal);
    modal?.addEventListener('click', event => {
      if (event.target === modal) closeModal();
    });
    modal?.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeModal();
    });

    btnConfirm?.addEventListener('click', async () => {
      const user = users.find(u => u.id === selectedUserId);
      if (!user) return;
      const originalText = btnConfirm.textContent;
      btnConfirm.disabled = true;
      btnConfirm.textContent = 'Deleting…';

      try {
        const response = await fetch(`${API_BASE}/users/${encodeURIComponent(user.id)}/`, {
          method: 'DELETE',
          headers: requestHeaders(),
        });
        if (!response.ok) throw await httpError(response, `Deletion returned HTTP ${response.status}.`);

        selectedUserIds.delete(user.id);
        closeModal();
        showToast(`Account for ${user.name} (${user.email}) was deleted successfully.`);
        renderEmptyDetails('Selected account was deleted.');
        await loadUsers();
      } catch (error) {
        showToast(`Failed to delete account: ${error.message}`, 'error');
        setPageState('warning', 'User account was not deleted', error.message, { retry: true });
      } finally {
        btnConfirm.disabled = false;
        btnConfirm.textContent = originalText;
      }
    });
  }

  // Bulk Deletion Modal & Handler
  function initBulkDeleteModal() {
    const modal = document.getElementById('modal-bulk-delete');
    const btnOpen = document.getElementById('btn-bulk-delete');
    const btnClose = document.getElementById('btn-close-bulk-delete-modal');
    const btnCancel = document.getElementById('btn-cancel-bulk-delete');
    const btnConfirm = document.getElementById('btn-confirm-bulk-delete');
    const countText = document.getElementById('bulk-delete-count-text');

    const openModal = () => {
      if (!selectedUserIds.size || !writesEnabled) return;
      if (countText) {
        countText.textContent = `${selectedUserIds.size} selected account${selectedUserIds.size === 1 ? '' : 's'}`;
      }
      if (modal) modal.hidden = false;
      btnConfirm?.focus();
    };

    const closeModal = () => {
      if (modal) modal.hidden = true;
      btnOpen?.focus();
    };

    btnOpen?.addEventListener('click', openModal);
    btnClose?.addEventListener('click', closeModal);
    btnCancel?.addEventListener('click', closeModal);
    modal?.addEventListener('click', event => {
      if (event.target === modal) closeModal();
    });
    modal?.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeModal();
    });

    btnConfirm?.addEventListener('click', async () => {
      if (!selectedUserIds.size) return;
      const originalText = btnConfirm.textContent;
      btnConfirm.disabled = true;
      btnConfirm.textContent = 'Deleting…';

      const userIdsList = Array.from(selectedUserIds).map(id => isNaN(Number(id)) ? id : Number(id));

      try {
        const response = await fetch(`${API_BASE}/users/bulk-delete/`, {
          method: 'POST',
          headers: requestHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ user_ids: userIdsList }),
        });
        if (!response.ok) throw await httpError(response, `Bulk delete returned HTTP ${response.status}.`);
        const result = await response.json();

        const count = result.deleted_count ?? selectedUserIds.size;
        selectedUserIds.clear();
        closeModal();
        showToast(`Successfully deleted ${count} account${count === 1 ? '' : 's'}.`);

        if (selectedUserId && !users.some(u => u.id === selectedUserId)) {
          renderEmptyDetails();
        }
        await loadUsers();
      } catch (error) {
        showToast(`Bulk deletion failed: ${error.message}`, 'error');
        setPageState('warning', 'Bulk deletion failed', error.message, { retry: true });
      } finally {
        btnConfirm.disabled = false;
        btnConfirm.textContent = originalText;
      }
    });

    document.getElementById('btn-clear-selection')?.addEventListener('click', () => {
      selectedUserIds.clear();
      renderTable();
      showToast('Selection cleared.');
    });
  }

  function initHandlers() {
    ['search-users-input', 'filter-role-select', 'filter-status-select'].forEach(id => {
      const element = document.getElementById(id);
      element?.addEventListener(id === 'search-users-input' ? 'input' : 'change', () => {
        currentPage = 1;
        renderTable();
      });
    });
    document.getElementById('btn-refresh-users')?.addEventListener('click', loadUsers);
    document.getElementById('btn-retry-users')?.addEventListener('click', loadUsers);

    // Master checkbox handler
    document.getElementById('checkbox-select-all')?.addEventListener('change', event => {
      const checked = event.target.checked;
      const pageUsers = getPageUsers(filteredUsers());
      pageUsers.forEach(u => {
        if (!isAccountProtected(u).protected) {
          if (checked) {
            selectedUserIds.add(u.id);
          } else {
            selectedUserIds.delete(u.id);
          }
        }
      });
      renderTable();
    });

    // Pagination buttons
    document.getElementById('btn-prev-page')?.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        renderTable();
      }
    });
    document.getElementById('btn-next-page')?.addEventListener('click', () => {
      const totalPages = Math.ceil(filteredUsers().length / PAGE_SIZE);
      if (currentPage < totalPages) {
        currentPage++;
        renderTable();
      }
    });

    // Table body click & keyboard delegation
    const tbody = document.getElementById('users-directory-tbody');
    tbody?.addEventListener('click', event => {
      const checkbox = event.target.closest('.user-row-checkbox');
      if (checkbox) {
        const uid = checkbox.dataset.userId;
        if (uid) {
          if (checkbox.checked) {
            selectedUserIds.add(uid);
          } else {
            selectedUserIds.delete(uid);
          }
          updateBulkActionBar();
          updateMasterCheckboxState(getPageUsers(filteredUsers()));
        }
        return;
      }

      const action = event.target.closest('[data-table-action]')?.dataset.tableAction;
      if (action === 'clear') return clearFilters();
      if (action === 'retry') return loadUsers();

      const row = event.target.closest('tr[data-user-id]');
      if (row) selectUser(row.dataset.userId);
    });

    tbody?.addEventListener('keydown', event => {
      if (['Enter', ' '].includes(event.key)) {
        if (event.target.classList.contains('user-row-checkbox')) return;
        const row = event.target.closest('tr[data-user-id]');
        if (!row) return;
        event.preventDefault();
        selectUser(row.dataset.userId);
      }
    });

    // Save user role button
    document.getElementById('btn-save-user-role')?.addEventListener('click', event => {
      const user = users.find(item => item.id === selectedUserId);
      const selectedRole = document.getElementById('detail-user-role')?.value;
      if (!user || !selectedRole) return;
      const nextRoleDisplay = displayRole(selectedRole);
      if (user.role === nextRoleDisplay) {
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

    // Password Reset
    document.getElementById('btn-reset-password')?.addEventListener('click', event => {
      const user = users.find(item => item.id === selectedUserId);
      if (!user) return;
      if (!confirm(`Dispatch a password reset link to ${user.email}?`)) return;
      runWrite(event.currentTarget, {
        url: `${API_BASE}/users/${encodeURIComponent(user.id)}/reset-password/`,
        options: { method: 'POST', headers: requestHeaders({ 'Content-Type': 'application/json' }), body: '{}' },
      }, () => {}, `Password reset email dispatched to ${user.email}.`);
    });

    // Resend Invite
    document.getElementById('btn-resend-invite')?.addEventListener('click', event => {
      const user = users.find(item => item.id === selectedUserId);
      if (!user) return;
      if (!confirm(`Resend account setup invitation email to ${user.email}?`)) return;
      runWrite(event.currentTarget, {
        url: `${API_BASE}/users/${encodeURIComponent(user.id)}/resend-invite/`,
        options: { method: 'POST', headers: requestHeaders({ 'Content-Type': 'application/json' }), body: '{}' },
      }, () => {}, `Setup invitation dispatched to ${user.email}.`);
    });

    // Suspend / Activate Account
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

    // Add Staff Account Form
    document.getElementById('form-invite-staff')?.addEventListener('submit', event => {
      event.preventDefault();
      const values = {
        name: document.getElementById('invite-name')?.value || '',
        email: document.getElementById('invite-email')?.value || '',
        role: document.getElementById('invite-role')?.value || 'merchant',
      };
      const button = document.getElementById('btn-send-invite');
      if (!values.name.trim() || !values.email.trim()) return;
      runWrite(button, {
        url: `${API_BASE}/users/`,
        options: {
          method: 'POST',
          headers: requestHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ ...values, role: apiRole(values.role), password_option: 'email_invite', is_staff_account: true }),
        },
      }, data => {
        const user = normalizeUser(data);
        users.unshift(user);
        event.currentTarget.reset();
        renderTable();
        selectUser(user.id);
        showTempPasswordModal(user, null, 'email_invite');
      }, `Created staff account and queued invite for ${values.name}.`);
    });

    initAddUserModal();
    initSingleDeleteModal();
    initBulkDeleteModal();
  }

  document.addEventListener('DOMContentLoaded', () => {
    initHandlers();
    setMutationEnabled(false);
    loadUsers();
  });
})();
