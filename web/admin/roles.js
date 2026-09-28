// Administrator role summary and fail-closed custom-role workflow.
(() => {
  const API_BASE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://127.0.0.1:8000/api/admin'
    : '/api/admin';

  let roles = [];
  let rolesLoaded = false;

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(value ?? '')));
    return div.innerHTML;
  }

  function activeSession() {
    const session = window.MetroDripSession?.getActiveUser?.();
    if (session) return session;
    try {
      const parsed = JSON.parse(sessionStorage.getItem('metrodrip_active_user') || 'null');
      return parsed?.access_token && parsed?.is_staff === true && parsed?.role === 'admin' ? parsed : null;
    } catch {
      return null;
    }
  }

  function requestHeaders(extra = {}) {
    const token = activeSession()?.access_token || '';
    return {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    };
  }

  async function responseError(response, fallback) {
    let message = fallback;
    let code = '';
    try {
      const body = await response.json();
      message = body?.error?.message || body?.error || body?.detail || fallback;
      code = body?.code || body?.error?.code || '';
    } catch {
      // Keep the status-specific fallback when the response is not JSON.
    }
    const error = new Error(message);
    error.status = response.status;
    error.code = code;
    return error;
  }

  function showToast(message, type = 'success') {
    if (window.MetroDripSession?.showToast) {
      window.MetroDripSession.showToast(message, type);
      return;
    }
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span aria-hidden="true">${type === 'success' ? '✓' : '✕'}</span> ${escapeHtml(message)}`;
    container.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3500);
  }

  function setSourceStatus(label, tone = '') {
    const badge = document.getElementById('roles-source-status');
    if (!badge) return;
    badge.textContent = label;
    badge.className = `data-source-badge ${tone}`.trim();
  }

  function setPageState(kind, title = '', message = '', options = {}) {
    const banner = document.getElementById('roles-state-banner');
    const eyebrow = document.getElementById('roles-state-eyebrow');
    const titleElement = document.getElementById('roles-state-title');
    const messageElement = document.getElementById('roles-state-message');
    const retry = document.getElementById('btn-retry-roles');
    const signIn = document.getElementById('roles-state-signin');
    if (!banner || !eyebrow || !titleElement || !messageElement || !retry || !signIn) return;
    if (kind === 'ready') {
      banner.hidden = true;
      return;
    }
    banner.hidden = false;
    banner.className = `console-state-banner is-${kind}`;
    banner.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    eyebrow.textContent = options.eyebrow || kind.toUpperCase();
    titleElement.textContent = title;
    messageElement.textContent = message;
    retry.hidden = !options.retry;
    signIn.hidden = !options.signIn;
  }

  function setCreationEnabled(enabled) {
    const form = document.getElementById('form-custom-role');
    form?.querySelectorAll('input, select, button').forEach(control => {
      control.disabled = !enabled;
    });
    const topButton = document.getElementById('btn-create-role-top');
    if (topButton) topButton.disabled = !enabled;
  }

  function updateMetrics() {
    const staffCount = roles
      .filter(role => ['admin', 'merchant'].includes(String(role.role).toLowerCase()))
      .reduce((sum, role) => sum + Number(role.user_count || 0), 0);
    const merchant = roles.find(role => String(role.role).toLowerCase() === 'merchant');
    const values = {
      'metric-system-roles': roles.length,
      'metric-staff-assigned': staffCount,
      'metric-custom-roles': '—',
    };
    Object.entries(values).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = String(value);
    });
    const staffDetail = document.getElementById('metric-staff-detail');
    if (staffDetail) staffDetail.textContent = `${staffCount} staff account${staffCount === 1 ? '' : 's'} across system roles`;
    const merchantAssignment = document.getElementById('merchant-role-assignment');
    if (merchantAssignment) {
      const count = Number(merchant?.user_count || 0);
      merchantAssignment.textContent = `System role · ${count} staff account${count === 1 ? '' : 's'} assigned`;
    }
  }

  function markMetricsUnavailable() {
    ['metric-system-roles', 'metric-staff-assigned', 'metric-custom-roles'].forEach(id => {
      const element = document.getElementById(id);
      if (element) element.textContent = '—';
    });
    const staffDetail = document.getElementById('metric-staff-detail');
    if (staffDetail) staffDetail.textContent = 'Role data unavailable';
    const merchantAssignment = document.getElementById('merchant-role-assignment');
    if (merchantAssignment) merchantAssignment.textContent = 'System role · assignment data unavailable';
  }

  async function loadRoles() {
    if (!activeSession()) {
      rolesLoaded = false;
      setCreationEnabled(false);
      markMetricsUnavailable();
      setSourceStatus('ACCESS DENIED', 'is-error');
      setPageState('error', 'Administrator access required', 'A verified administrator session is required to load role assignments.', { signIn: true });
      return;
    }
    rolesLoaded = false;
    setCreationEnabled(false);
    setSourceStatus('CONNECTING');
    setPageState('info', 'Loading system roles', 'Connecting to the administrator roles API. Custom-role actions stay unavailable until access is verified.');
    try {
      const response = await fetch(`${API_BASE}/roles/`, { headers: requestHeaders() });
      if (!response.ok) throw await responseError(response, `Roles API returned HTTP ${response.status}.`);
      const payload = await response.json();
      const records = Array.isArray(payload) ? payload : payload?.results;
      if (!Array.isArray(records)) throw new Error('Roles API returned an unexpected response.');
      roles = records;
      rolesLoaded = true;
      updateMetrics();
      setCreationEnabled(true);
      setSourceStatus('API CONNECTED', 'is-success');
      setPageState('warning', 'System roles loaded', 'Custom roles are not persisted by this backend yet. An attempted create will remain unchanged unless the server confirms success.', { eyebrow: 'LIMITED CAPABILITY' });
    } catch (error) {
      const denied = error.status === 401 || error.status === 403;
      roles = [];
      rolesLoaded = false;
      markMetricsUnavailable();
      setCreationEnabled(false);
      setSourceStatus(denied ? 'ACCESS DENIED' : 'UNAVAILABLE', 'is-error');
      setPageState('error', denied ? 'Administrator access required' : 'Role assignments are unavailable', error.message, { retry: !denied, signIn: denied });
    }
  }

  function resetRoleForm() {
    const form = document.getElementById('form-custom-role');
    form?.reset();
    document.querySelectorAll('.matrix-toggle-select').forEach(select => {
      const allowedByDefault = ['view_orders', 'manage_shipments', 'view_inventory'].includes(select.dataset.perm);
      select.value = allowedByDefault ? 'allow' : 'deny';
      select.className = `matrix-toggle-select ${allowedByDefault ? 'allow' : 'deny'}`;
    });
  }

  async function createCustomRole(event) {
    event.preventDefault();
    if (!rolesLoaded) return;
    const nameInput = document.getElementById('custom-role-name');
    const baseInput = document.getElementById('custom-role-base');
    const button = document.getElementById('btn-submit-custom-role');
    const roleName = nameInput?.value.trim() || '';
    const baseRole = baseInput?.value || '';
    if (!roleName || !baseRole) return;
    const permissions = [...document.querySelectorAll('.matrix-toggle-select')]
      .filter(select => select.value === 'allow')
      .map(select => select.dataset.perm)
      .filter(Boolean);
    const original = button?.textContent || 'Create role';
    if (button) {
      button.disabled = true;
      button.textContent = 'Creating…';
    }
    try {
      const response = await fetch(`${API_BASE}/roles/`, {
        method: 'POST',
        headers: requestHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ title: roleName, base_role: baseRole, permissions }),
      });
      if (!response.ok) throw await responseError(response, `Role create returned HTTP ${response.status}.`);
      resetRoleForm();
      showToast(`Custom role "${roleName}" was created.`);
      await loadRoles();
    } catch (error) {
      const unavailable = error.status === 501 || error.code === 'role_persistence_unconfigured';
      setSourceStatus(unavailable ? 'WRITE UNAVAILABLE' : 'PARTIAL DATA', 'is-warning');
      setPageState('warning', unavailable ? 'Custom roles are not available' : 'Custom role was not created', `${error.message} No displayed role counts or assignments were changed.`, { retry: false, eyebrow: unavailable ? 'NOT CONFIGURED' : 'WRITE FAILED' });
      showToast(`Custom role was not created: ${error.message}`, 'error');
    } finally {
      if (button) button.textContent = original;
      setCreationEnabled(rolesLoaded);
    }
  }

  function initHandlers() {
    document.querySelectorAll('.matrix-toggle-select').forEach(select => {
      select.addEventListener('change', () => {
        select.className = `matrix-toggle-select ${select.value === 'allow' ? 'allow' : 'deny'}`;
      });
    });
    document.getElementById('btn-create-role-top')?.addEventListener('click', () => {
      const card = document.getElementById('card-create-custom-role');
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      document.getElementById('custom-role-name')?.focus();
    });
    document.getElementById('btn-cancel-custom-role')?.addEventListener('click', () => {
      resetRoleForm();
      showToast('Unsaved role changes were cleared.');
    });
    document.getElementById('form-custom-role')?.addEventListener('submit', createCustomRole);
    document.getElementById('btn-retry-roles')?.addEventListener('click', loadRoles);
    document.getElementById('btn-refresh-roles')?.addEventListener('click', loadRoles);
  }

  document.addEventListener('DOMContentLoaded', () => {
    initHandlers();
    setCreationEnabled(false);
    loadRoles();
  });
})();
