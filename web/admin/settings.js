// Platform settings controller. The UI remains read-only until the server
// returns persisted settings and never treats an unconfirmed write as saved.
(() => {
  const API_BASE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
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
    'setting-registration': 'customer_registration',
    'setting-maintenance': 'maintenance_mode',
    'setting-order-emails': 'order_confirmation_emails',
    'setting-sender-name': 'sender_name',
  };

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

  function applySettings(settings) {
    Object.entries(FIELD_MAP).forEach(([id, key]) => {
      const control = document.getElementById(id);
      if (!control) return;
      const value = settings[key] ?? '';
      if (control.tagName === 'SELECT') ensureSelectValue(control, value);
      else control.value = String(value);
    });
    const payments = document.getElementById('setting-payments');
    const paymentStatus = document.getElementById('setting-payment-status');
    const methods = settings.payment_methods;
    if (payments) payments.value = Array.isArray(methods) ? methods.join(' · ') : String(methods || '');
    if (paymentStatus) paymentStatus.textContent = settings.payment_provider_mode
      ? `Payment provider mode: ${settings.payment_provider_mode}`
      : 'Payment provider mode was not reported.';
  }

  function clearSettings() {
    Object.keys(FIELD_MAP).forEach(id => {
      const control = document.getElementById(id);
      if (!control) return;
      if (control.tagName === 'SELECT') control.value = '';
      else control.value = '';
    });
    const payments = document.getElementById('setting-payments');
    if (payments) payments.value = '';
    const paymentStatus = document.getElementById('setting-payment-status');
    if (paymentStatus) paymentStatus.textContent = 'Payment configuration is unavailable.';
  }

  function readSettings() {
    return Object.fromEntries(Object.entries(FIELD_MAP).map(([id, key]) => {
      const control = document.getElementById(id);
      return [key, control?.value ?? ''];
    }));
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
    document.getElementById('form-platform-settings')?.addEventListener('submit', saveSettings);
    document.querySelectorAll('.btn-save-settings').forEach(button => {
      if (button.getAttribute('type') !== 'submit') button.addEventListener('click', saveSettings);
    });
    document.getElementById('btn-discard-settings')?.addEventListener('click', discardSettings);
    document.getElementById('btn-retry-settings')?.addEventListener('click', loadSettings);
    document.getElementById('btn-refresh-settings')?.addEventListener('click', loadSettings);
    setFormEnabled(false);
    clearSettings();
    loadSettings();
  });
})();
