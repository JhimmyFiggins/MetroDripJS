// Administrator audit trail backed by authenticated server records.
(() => {
  const API_BASE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://127.0.0.1:8000/api/admin'
    : '/api/admin';

  let auditEvents = [];
  let selectedEventId = null;
  let loadGeneration = 0;

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

  function requestHeaders() {
    const token = activeSession()?.access_token || '';
    return {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  async function responseError(response, fallback) {
    let message = fallback;
    try {
      const body = await response.json();
      message = body?.error?.message || body?.error || body?.detail || fallback;
    } catch {
      // Keep the status-specific fallback when the response is not JSON.
    }
    const error = new Error(message);
    error.status = response.status;
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
    const badge = document.getElementById('audit-source-status');
    if (!badge) return;
    badge.textContent = label;
    badge.className = `data-source-badge ${tone}`.trim();
  }

  function setPageState(kind, title = '', message = '', options = {}) {
    const banner = document.getElementById('audit-state-banner');
    const eyebrow = document.getElementById('audit-state-eyebrow');
    const titleElement = document.getElementById('audit-state-title');
    const messageElement = document.getElementById('audit-state-message');
    const retry = document.getElementById('btn-retry-audit');
    const signIn = document.getElementById('audit-state-signin');
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

  function formatDate(value, mode = 'full') {
    if (!value) return 'Not reported';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const options = mode === 'time'
      ? { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }
      : { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'medium' };
    return new Intl.DateTimeFormat('en-PH', options).format(date);
  }

  function dateKey(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  function dayOffsetKey(offset) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + offset);
    return dateKey(date);
  }

  function normalizeEvent(raw) {
    return {
      id: String(raw.id ?? ''),
      actor: String(raw.actor || 'Actor not reported'),
      role: String(raw.role || 'Role not reported'),
      action: String(raw.action || 'Action not reported'),
      targetModel: String(raw.target_model || 'Target not reported'),
      createdAt: raw.created_at || null,
    };
  }

  function matchesSelectedDate(event) {
    const filter = document.getElementById('filter-date-select')?.value || 'today';
    const key = dateKey(event.createdAt);
    if (!key) return false;
    if (filter === 'today') return key === dayOffsetKey(0);
    if (filter === 'yesterday') return key === dayOffsetKey(-1);
    if (filter === '7days') {
      const eventDate = new Date(event.createdAt);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      return !Number.isNaN(eventDate.getTime()) && eventDate >= cutoff;
    }
    return true;
  }

  function filteredEvents() {
    const search = (document.getElementById('search-audit-input')?.value || '').trim().toLowerCase();
    const moduleFilter = (document.getElementById('filter-module-select')?.value || 'all').toLowerCase();
    const roleFilter = (document.getElementById('filter-role-select')?.value || 'all').toLowerCase();
    return auditEvents.filter(event => {
      const haystack = `${event.id} ${event.actor} ${event.action} ${event.targetModel}`.toLowerCase();
      const moduleMatches = moduleFilter === 'all' || event.targetModel.toLowerCase().includes(moduleFilter);
      const roleMatches = roleFilter === 'all' || event.role.toLowerCase() === roleFilter;
      return (!search || haystack.includes(search)) && moduleMatches && roleMatches && matchesSelectedDate(event);
    });
  }

  function renderLoading() {
    const tbody = document.getElementById('audit-activity-tbody');
    if (!tbody) return;
    tbody.setAttribute('aria-busy', 'true');
    tbody.innerHTML = `
      <tr class="table-state-row table-loading-row">
        <td colspan="4">
          <div class="skeleton-stack" aria-hidden="true">
            <span class="skeleton-line is-wide"></span>
            <span class="skeleton-line"></span>
            <span class="skeleton-line is-wide"></span>
          </div>
          <span class="sr-only">Loading audit records</span>
        </td>
      </tr>`;
  }

  function renderEmpty(title, message) {
    const tbody = document.getElementById('audit-activity-tbody');
    if (!tbody) return;
    tbody.setAttribute('aria-busy', 'false');
    tbody.innerHTML = `
      <tr class="table-state-row">
        <td colspan="4">
          <div class="table-state">
            <strong>${escapeHtml(title)}</strong>
            <span>${escapeHtml(message)}</span>
          </div>
        </td>
      </tr>`;
  }

  function renderMetrics() {
    const todayCount = auditEvents.filter(event => dateKey(event.createdAt) === dayOffsetKey(0)).length;
    const accessCount = auditEvents.filter(event => /role|permission|access|suspend|reactivat/i.test(event.action)).length;
    const values = {
      'metric-audit-today': todayCount,
      'metric-access-changes': accessCount,
      'metric-loaded-events': auditEvents.length,
      'sidebar-audit-count': auditEvents.length,
    };
    Object.entries(values).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = String(value);
    });
  }

  function markMetricsUnavailable() {
    ['metric-audit-today', 'metric-access-changes', 'metric-loaded-events', 'sidebar-audit-count'].forEach(id => {
      const element = document.getElementById(id);
      if (element) element.textContent = '—';
    });
  }

  function renderDetail(event) {
    const values = event ? {
      'detail-event-title': event.action,
      'detail-event-sub': `Event ${event.id}`,
      'detail-event-actor': event.actor,
      'detail-event-role': event.role,
      'detail-event-module': event.targetModel,
      'detail-event-time': formatDate(event.createdAt),
      'detail-event-source': 'Administrator audit API',
      'detail-target-model': event.targetModel,
      'detail-record-id': event.id,
    } : {
      'detail-event-title': 'No audit record selected',
      'detail-event-sub': 'Load or select a record to inspect it.',
      'detail-event-actor': '—',
      'detail-event-role': '—',
      'detail-event-module': '—',
      'detail-event-time': '—',
      'detail-event-source': '—',
      'detail-target-model': '—',
      'detail-record-id': '—',
    };
    Object.entries(values).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    });
    const copyButton = document.getElementById('btn-copy-event-id');
    if (copyButton) copyButton.disabled = !event;
  }

  function selectEvent(id) {
    selectedEventId = String(id);
    const event = auditEvents.find(item => item.id === selectedEventId);
    renderDetail(event || null);
    renderTable();
  }

  function renderTable() {
    const tbody = document.getElementById('audit-activity-tbody');
    if (!tbody) return;
    const filtered = filteredEvents();
    tbody.setAttribute('aria-busy', 'false');
    if (!filtered.length) {
      const hasRecords = auditEvents.length > 0;
      renderEmpty(
        hasRecords ? 'No matching audit records' : 'No audit records found',
        hasRecords ? 'Try another date, role, module, or search term.' : 'Server-recorded administrative actions will appear here.',
      );
    } else {
      tbody.innerHTML = filtered.map(event => `
        <tr data-event-id="${escapeHtml(event.id)}" class="clickable-row ${event.id === selectedEventId ? 'selected-row' : ''}" tabindex="0" aria-selected="${event.id === selectedEventId}">
          <td class="td-mono td-muted" data-label="Time (PHT)">${escapeHtml(formatDate(event.createdAt, 'time'))}</td>
          <td class="td-strong" data-label="Actor">${escapeHtml(event.actor)}</td>
          <td data-label="Action / target"><span>${escapeHtml(event.action)}</span><span class="responsive-secondary td-mono">${escapeHtml(event.targetModel)}</span></td>
          <td class="td-mono" data-label="Role">${escapeHtml(event.role)}</td>
        </tr>`).join('');
    }
    const info = document.getElementById('audit-pagination-info');
    if (info) info.textContent = `Showing ${filtered.length} of ${auditEvents.length} loaded records · API returns up to 50 · Read-only`;
  }

  function setControlsEnabled(enabled) {
    ['search-audit-input', 'filter-date-select', 'filter-module-select', 'filter-role-select', 'btn-export-audit-csv']
      .forEach(id => {
        const element = document.getElementById(id);
        if (element) element.disabled = !enabled;
      });
  }

  function handleLoadError(error, hadData) {
    const denied = error.status === 401 || error.status === 403;
    setSourceStatus(denied ? 'ACCESS DENIED' : hadData ? 'STALE DATA' : 'UNAVAILABLE', denied || !hadData ? 'is-error' : 'is-warning');
    setPageState(hadData ? 'warning' : 'error', denied ? 'Administrator access required' : 'Audit trail is unavailable', hadData
      ? `${error.message} Previously loaded records remain visible and may be stale.`
      : error.message, { retry: !denied, signIn: denied });
    if (!hadData) {
      auditEvents = [];
      selectedEventId = null;
      renderEmpty(denied ? 'Permission denied' : 'Audit records could not be loaded', denied
        ? 'Sign in with an authorized administrator account.'
        : 'Check the connection, then try again.');
      renderDetail(null);
      markMetricsUnavailable();
    }
    setControlsEnabled(hadData && !denied);
  }

  async function loadAudit() {
    const generation = ++loadGeneration;
    const hadData = auditEvents.length > 0;
    if (!activeSession()) {
      handleLoadError(Object.assign(new Error('A verified administrator session is required.'), { status: 401 }), hadData);
      return;
    }
    setSourceStatus(hadData ? 'REFRESHING' : 'CONNECTING');
    setPageState('info', hadData ? 'Refreshing audit records' : 'Loading audit records', hadData
      ? 'Current records remain visible while the latest audit trail is requested.'
      : 'Connecting to the administrator audit API.');
    setControlsEnabled(false);
    if (!hadData) renderLoading();

    try {
      const response = await fetch(`${API_BASE}/audit-logs/`, { headers: requestHeaders() });
      if (!response.ok) throw await responseError(response, `Audit API returned HTTP ${response.status}.`);
      const payload = await response.json();
      const records = Array.isArray(payload) ? payload : payload?.results;
      if (!Array.isArray(records)) throw new Error('Audit API returned an unexpected response.');
      if (generation !== loadGeneration) return;
      auditEvents = records.map(normalizeEvent);
      selectedEventId = auditEvents.some(event => event.id === selectedEventId)
        ? selectedEventId
        : auditEvents[0]?.id || null;
      setSourceStatus('API CONNECTED', 'is-success');
      setPageState('ready');
      setControlsEnabled(true);
      renderMetrics();
      renderTable();
      renderDetail(auditEvents.find(event => event.id === selectedEventId) || null);
    } catch (error) {
      if (generation !== loadGeneration) return;
      handleLoadError(error, hadData);
    }
  }

  async function exportAudit(button) {
    if (!activeSession()) {
      showToast('Sign in with an administrator account before exporting.', 'error');
      return;
    }
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'Exporting…';
    try {
      const response = await fetch(`${API_BASE}/audit-logs/export/`, { headers: requestHeaders() });
      if (!response.ok) throw await responseError(response, `Export returned HTTP ${response.status}.`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `metrodrip-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast('Audit CSV downloaded.');
    } catch (error) {
      showToast(`Audit export failed: ${error.message}`, 'error');
    } finally {
      button.textContent = original;
      button.disabled = auditEvents.length === 0;
    }
  }

  function initHandlers() {
    ['search-audit-input', 'filter-date-select', 'filter-module-select', 'filter-role-select'].forEach(id => {
      const element = document.getElementById(id);
      element?.addEventListener(id === 'search-audit-input' ? 'input' : 'change', renderTable);
    });
    document.getElementById('btn-refresh-audit')?.addEventListener('click', loadAudit);
    document.getElementById('btn-retry-audit')?.addEventListener('click', loadAudit);
    document.getElementById('btn-export-audit-csv')?.addEventListener('click', event => exportAudit(event.currentTarget));
    document.getElementById('btn-copy-event-id')?.addEventListener('click', async () => {
      if (!selectedEventId) return;
      try {
        await navigator.clipboard.writeText(selectedEventId);
        showToast(`Copied event ${selectedEventId}.`);
      } catch {
        showToast('The browser could not copy the event ID.', 'error');
      }
    });

    const tbody = document.getElementById('audit-activity-tbody');
    tbody?.addEventListener('click', event => {
      const row = event.target.closest('tr[data-event-id]');
      if (row) selectEvent(row.dataset.eventId);
    });
    tbody?.addEventListener('keydown', event => {
      const row = event.target.closest('tr[data-event-id]');
      if (!row || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      selectEvent(row.dataset.eventId);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initHandlers();
    renderDetail(null);
    loadAudit();
  });
})();
