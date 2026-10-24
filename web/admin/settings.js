// Platform settings controller. The UI remains read-only until the server
// returns persisted settings and never treats an unconfirmed write as saved.
(() => {
  const API_BASE = (['localhost', '127.0.0.1'].includes(window.location.hostname) && window.location.port !== '3000')
    ? 'http://127.0.0.1:8000/api/admin'
    : '/api/admin';

  const FIELD_MAP = {
    'setting-platform-name': 'platform_name',
    'setting-support-email': 'support_email',
    'setting-currency': 'currency',
    'setting-timezone': 'timezone',
    'setting-language': 'language',
    'setting-date-format': 'date_format',
    'setting-2fa': 'staff_mfa_policy',
    'setting-session-timeout': 'session_timeout_minutes',
    'setting-password-min-length': 'password_min_length',
    'setting-max-login-attempts': 'max_login_attempts',
    'setting-lockout-duration': 'lockout_duration_minutes',
    'setting-registration': 'customer_registration',
    'setting-registration-message': 'registration_message',
    'setting-maintenance': 'maintenance_mode',
    'setting-maintenance-message': 'maintenance_message',
    'setting-maintenance-start': 'maintenance_scheduled_start',
    'setting-maintenance-end': 'maintenance_scheduled_end',
    'setting-admin-security-alerts': 'admin_security_alerts',
    'setting-admin-alert-email': 'admin_alert_email',
  };

  const NUMERIC_FIELDS = new Set([
    'password_min_length',
    'max_login_attempts',
    'lockout_duration_minutes',
  ]);

  const DATETIME_FIELDS = new Set([
    'maintenance_scheduled_start',
    'maintenance_scheduled_end',
  ]);

  let savedSettings = null;

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
    const badge = document.getElementById('settings-source-status');
    if (!badge) return;
    badge.textContent = label;
    badge.className = `data-source-badge ${tone}`.trim();
  }

  function setPageState(kind, title = '', message = '', options = {}) {
    const banner = document.getElementById('settings-state-banner');
    const eyebrow = document.getElementById('settings-state-eyebrow');
    const titleElement = document.getElementById('settings-state-title');
    const messageElement = document.getElementById('settings-state-message');
    const retry = document.getElementById('btn-retry-settings');
    const signIn = document.getElementById('settings-state-signin');
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

  function setFormEnabled(enabled) {
    const form = document.getElementById('form-platform-settings');
    form?.querySelectorAll('input:not([readonly]), select, button').forEach(control => {
      control.disabled = !enabled;
    });
    document.querySelectorAll('.btn-save-settings').forEach(button => {
      button.disabled = !enabled;
    });
  }

  function ensureSelectValue(select, value) {
    if (!select) return;
    const normalized = String(value ?? '');
    let option = [...select.options].find(item => item.value === normalized);
    if (!option && normalized) {
      option = new Option(normalized, normalized);
      select.add(option);
    }
    select.value = normalized;
  }

  function formatDatetimeForInput(isoString) {
    if (!isoString) return '';
    try {
      const dt = new Date(isoString);
      if (isNaN(dt.getTime())) return '';
      // Return YYYY-MM-DDTHH:mm format in local time
      const pad = n => String(n).padStart(2, '0');
      const year = dt.getFullYear();
      const month = pad(dt.getMonth() + 1);
      const day = pad(dt.getDate());
      const hours = pad(dt.getHours());
      const minutes = pad(dt.getMinutes());
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch {
      return '';
    }
  }

  function applySettings(settings) {
    Object.entries(FIELD_MAP).forEach(([id, key]) => {
      const control = document.getElementById(id);
      if (!control) return;
      const rawValue = settings[key];
      if (control.tagName === 'SELECT') {
        ensureSelectValue(control, rawValue);
      } else if (DATETIME_FIELDS.has(key)) {
        control.value = formatDatetimeForInput(rawValue);
      } else {
        control.value = rawValue !== null && rawValue !== undefined ? String(rawValue) : '';
      }
    });
    updateUnsavedStatus(false);
  }

  function clearSettings() {
    Object.keys(FIELD_MAP).forEach(id => {
      const control = document.getElementById(id);
      if (!control) return;
      if (control.tagName === 'SELECT') control.value = '';
      else control.value = '';
    });
    updateUnsavedStatus(false);
  }

  function readSettings() {
    const result = {};
    Object.entries(FIELD_MAP).forEach(([id, key]) => {
      const control = document.getElementById(id);
      if (!control) return;
      const raw = control.value;
      if (NUMERIC_FIELDS.has(key)) {
        const parsed = parseInt(raw, 10);
        result[key] = isNaN(parsed) ? 0 : parsed;
      } else if (DATETIME_FIELDS.has(key)) {
        result[key] = raw ? new Date(raw).toISOString() : null;
      } else {
        result[key] = raw !== null && raw !== undefined ? raw.trim() : '';
      }
    });
    return result;
  }

  function hasChanges() {
    if (!savedSettings) return false;
    const current = readSettings();
    for (const [key, currVal] of Object.entries(current)) {
      const savedVal = savedSettings[key];
      if (DATETIME_FIELDS.has(key)) {
        const currNorm = currVal ? new Date(currVal).getTime() : null;
        const savedNorm = savedVal ? new Date(savedVal).getTime() : null;
        if (currNorm !== savedNorm) return true;
      } else if (NUMERIC_FIELDS.has(key)) {
        if (Number(currVal) !== Number(savedVal)) return true;
      } else {
        const s1 = String(currVal ?? '').trim();
        const s2 = String(savedVal ?? '').trim();
        if (s1 !== s2) return true;
      }
    }
    return false;
  }

  function updateUnsavedStatus(isDirty) {
    const indicator = document.getElementById('settings-unsaved-indicator');
    const discardBtn = document.getElementById('btn-discard-settings');
    const saveBtns = document.querySelectorAll('.btn-save-settings');

    if (indicator) {
      if (isDirty) {
        indicator.innerHTML = '<span style="color:var(--color-warning, #e67700); font-weight:600;">● Unsaved changes</span>';
      } else {
        indicator.innerHTML = '<span style="color:var(--color-muted);">All settings saved</span>';
      }
    }
    if (discardBtn) discardBtn.disabled = !isDirty;
    saveBtns.forEach(btn => {
      btn.disabled = !isDirty;
    });
  }

  function handleInputChange() {
    if (!savedSettings) return;
    updateUnsavedStatus(hasChanges());
  }

  async function loadSettings(options = {}) {
    if (!activeSession()) {
      savedSettings = null;
      clearSettings();
      setFormEnabled(false);
      setSourceStatus('ACCESS DENIED', 'is-error');
      setPageState('error', 'Administrator access required', 'A verified administrator session is required to load platform settings.', { signIn: true });
      return;
    }
    setFormEnabled(false);
    setSourceStatus('CONNECTING');
    setPageState('info', 'Loading platform settings', 'Controls remain read-only until persisted settings are returned by the administrator API.');
    try {
      const response = await fetch(`${API_BASE}/settings/`, { headers: requestHeaders() });
      if (!response.ok) throw await responseError(response, `Settings API returned HTTP ${response.status}.`);
      const payload = await response.json();
      const settings = payload?.settings || payload;
      if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Settings API returned an unexpected response.');
      savedSettings = { ...settings };
      applySettings(savedSettings);
      setFormEnabled(true);
      setSourceStatus('API CONNECTED', 'is-success');
      setPageState('ready');
      if (options.successMessage) showToast(options.successMessage);
      loadSystemHealth();
    } catch (error) {
      const denied = error.status === 401 || error.status === 403;
      const unavailable = error.status === 501 || error.code === 'settings_persistence_unconfigured';
      savedSettings = null;
      clearSettings();
      setFormEnabled(false);
      setSourceStatus(denied ? 'ACCESS DENIED' : unavailable ? 'NOT CONFIGURED' : 'UNAVAILABLE', 'is-error');
      setPageState('error', denied
        ? 'Administrator access required'
        : unavailable
          ? 'Platform settings are not configured'
          : 'Platform settings are unavailable', `${error.message} No editable settings have been shown or assumed.`, { retry: !denied, signIn: denied, eyebrow: unavailable ? 'NOT CONFIGURED' : undefined });
    }
  }

  async function loadSystemHealth() {
    const overallBadge = document.getElementById('health-overall-status');
    const dbStatus = document.getElementById('health-db-status');
    const dbLatency = document.getElementById('health-db-latency');
    const dbDetail = document.getElementById('health-db-detail');
    const emailStatus = document.getElementById('health-email-status');
    const emailTitle = document.getElementById('health-email-title');
    const emailDetail = document.getElementById('health-email-detail');
    const paymentStatus = document.getElementById('health-payment-status');
    const paymentMode = document.getElementById('health-payment-mode');
    const paymentDetail = document.getElementById('health-payment-detail');
    const envStatus = document.getElementById('health-env-status');
    const envDetail = document.getElementById('health-env-detail');

    if (overallBadge) {
      overallBadge.textContent = 'CHECKING';
      overallBadge.className = 'data-source-badge';
    }

    try {
      const res = await fetch(`${API_BASE}/health/`, { headers: requestHeaders() });
      if (!res.ok) throw await responseError(res, 'Health API returned HTTP ' + res.status);
      const data = await res.json();
      const health = data.health || {};

      // Overall status
      if (overallBadge) {
        const st = String(health.status || 'unknown').toUpperCase();
        overallBadge.textContent = st;
        overallBadge.className = `data-source-badge ${st === 'HEALTHY' ? 'is-success' : st === 'DEGRADED' ? 'is-warning' : 'is-error'}`;
      }

      // Database
      if (dbStatus && dbLatency && dbDetail) {
        const isDbHealthy = health.database?.status === 'healthy';
        dbStatus.textContent = isDbHealthy ? 'CONNECTED' : 'OFFLINE';
        dbStatus.className = `data-source-badge ${isDbHealthy ? 'is-success' : 'is-error'}`;
        dbLatency.textContent = health.database?.latency_ms !== undefined ? `${health.database.latency_ms} ms` : '—';
        dbDetail.textContent = isDbHealthy ? 'PostgreSQL connectivity verified.' : 'Database connection timed out or unreachable.';
      }

      // Brevo Transactional Email
      if (emailStatus && emailTitle && emailDetail) {
        const emailReady = health.transactional_email?.status === 'ready';
        emailStatus.textContent = emailReady ? 'CONFIGURED' : 'UNCONFIGURED';
        emailStatus.className = `data-source-badge ${emailReady ? 'is-success' : 'is-warning'}`;
        emailTitle.textContent = emailReady ? 'Brevo Free' : 'Not Configured';
        const sender = health.transactional_email?.sender_name || 'MetroDrip Orders';
        emailDetail.textContent = emailReady
          ? `Verified sender: ${sender}. Transactional delivery operational.`
          : 'BREVO_API_KEY environment variable required for email delivery.';
      }

      // PayMongo
      if (paymentStatus && paymentMode && paymentDetail) {
        const pmReady = health.payment_provider?.status === 'ready';
        const mode = (health.payment_provider?.mode || 'test').toUpperCase();
        const rails = health.payment_provider?.enabled_hosted_methods || [];
        paymentStatus.textContent = pmReady ? 'CONFIGURED' : 'UNCONFIGURED';
        paymentStatus.className = `data-source-badge ${pmReady ? 'is-success' : 'is-warning'}`;
        paymentMode.textContent = `PayMongo (${mode})`;
        paymentDetail.textContent = pmReady
          ? `Active rails: ${rails.join(', ').toUpperCase() || 'None'}. Webhooks verified.`
          : 'PayMongo secret keys unconfigured. Hosted payments offline.';
      }

      // Environment
      if (envStatus && envDetail) {
        envStatus.textContent = 'ONLINE';
        envStatus.className = 'data-source-badge is-success';
        const checkedTime = new Date().toLocaleTimeString();
        envDetail.textContent = `Last checked: ${checkedTime}`;
      }

    } catch (err) {
      if (overallBadge) {
        overallBadge.textContent = 'UNAVAILABLE';
        overallBadge.className = 'data-source-badge is-error';
      }
      if (dbStatus) {
        dbStatus.textContent = 'ERROR';
        dbStatus.className = 'data-source-badge is-error';
      }
      if (dbDetail) dbDetail.textContent = `Failed to probe diagnostics: ${err.message}`;
    }
  }

  async function saveSettings(event) {
    event?.preventDefault();
    if (!savedSettings) return;
    const form = document.getElementById('form-platform-settings');
    if (!form?.reportValidity()) return;
    const payload = readSettings();
    setFormEnabled(false);
    setSourceStatus('SAVING');
    setPageState('info', 'Saving platform settings', 'Waiting for the administrator API to confirm the update.');
    try {
      const response = await fetch(`${API_BASE}/settings/`, {
        method: 'PATCH',
        headers: requestHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw await responseError(response, `Settings update returned HTTP ${response.status}.`);
      await loadSettings({ successMessage: 'Platform settings were saved and reloaded from the server.' });
    } catch (error) {
      const unavailable = error.status === 501 || error.code === 'settings_persistence_unconfigured';
      applySettings(savedSettings);
      setFormEnabled(true);
      setSourceStatus(unavailable ? 'WRITE UNAVAILABLE' : 'PARTIAL DATA', 'is-warning');
      setPageState('warning', unavailable ? 'Platform settings cannot be saved' : 'Settings were not saved', `${error.message} The last server-confirmed values have been restored.`, { eyebrow: unavailable ? 'NOT CONFIGURED' : 'WRITE FAILED' });
      showToast(`Settings were not saved: ${error.message}`, 'error');
    }
  }

  function discardSettings() {
    if (!savedSettings) return;
    applySettings(savedSettings);
    showToast('Unsaved changes were discarded.');
  }

  document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('form-platform-settings');
    form?.addEventListener('submit', saveSettings);
    form?.addEventListener('input', handleInputChange);
    form?.addEventListener('change', handleInputChange);

    document.querySelectorAll('.btn-save-settings').forEach(button => {
      if (button.getAttribute('type') !== 'submit') button.addEventListener('click', saveSettings);
    });
    document.getElementById('btn-discard-settings')?.addEventListener('click', discardSettings);
    document.getElementById('btn-retry-settings')?.addEventListener('click', loadSettings);
    document.getElementById('btn-refresh-settings')?.addEventListener('click', () => {
      loadSettings();
      loadSystemHealth();
    });
    document.getElementById('btn-refresh-health')?.addEventListener('click', loadSystemHealth);

    setFormEnabled(false);
    clearSettings();
    loadSettings();
  });
})();
