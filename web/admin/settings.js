// Admin Console: Platform Settings Controller
// Figma: 550:318 (Light) & 554:1236 (Dark)
(() => {
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str || ''));
    return div.innerHTML;
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

  const initialSettings = {
    platformName: 'MetroDrip',
    supportEmail: 'support@metrodrip.ph',
    currency: 'PHP',
    timezone: 'Asia/Manila',
    language: 'en',
    dateFormat: 'DD MMM YYYY',
    tfa: 'required',
    sessionTimeout: '30',
    registration: 'enabled',
    maintenance: 'off',
    orderEmails: 'enabled',
    senderName: 'MetroDrip'
  };

  function restoreSettings() {
    document.getElementById('setting-platform-name').value = initialSettings.platformName;
    document.getElementById('setting-support-email').value = initialSettings.supportEmail;
    document.getElementById('setting-currency').value = initialSettings.currency;
    document.getElementById('setting-timezone').value = initialSettings.timezone;
    document.getElementById('setting-language').value = initialSettings.language;
    document.getElementById('setting-date-format').value = initialSettings.dateFormat;
    document.getElementById('setting-2fa').value = initialSettings.tfa;
    document.getElementById('setting-session-timeout').value = initialSettings.sessionTimeout;
    document.getElementById('setting-registration').value = initialSettings.registration;
    document.getElementById('setting-maintenance').value = initialSettings.maintenance;
    document.getElementById('setting-order-emails').value = initialSettings.orderEmails;
    document.getElementById('setting-sender-name').value = initialSettings.senderName;
  }

  function saveSettings(e) {
    if (e) e.preventDefault();
    const platformName = document.getElementById('setting-platform-name').value.trim();
    const supportEmail = document.getElementById('setting-support-email').value.trim();
    if (!platformName || !supportEmail) return;

    initialSettings.platformName = platformName;
    initialSettings.supportEmail = supportEmail;
    initialSettings.currency = document.getElementById('setting-currency').value;
    initialSettings.timezone = document.getElementById('setting-timezone').value;
    initialSettings.language = document.getElementById('setting-language').value;
    initialSettings.dateFormat = document.getElementById('setting-date-format').value;
    initialSettings.tfa = document.getElementById('setting-2fa').value;
    initialSettings.sessionTimeout = document.getElementById('setting-session-timeout').value;
    initialSettings.registration = document.getElementById('setting-registration').value;
    initialSettings.maintenance = document.getElementById('setting-maintenance').value;
    initialSettings.orderEmails = document.getElementById('setting-order-emails').value;
    initialSettings.senderName = document.getElementById('setting-sender-name').value.trim();

    showToast('Platform preferences and security settings saved successfully.');
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('form-platform-settings')?.addEventListener('submit', saveSettings);
    document.querySelectorAll('.btn-save-settings').forEach(btn => {
      btn.addEventListener('click', saveSettings);
    });
    document.getElementById('btn-discard-settings')?.addEventListener('click', () => {
      restoreSettings();
      showToast('Changes discarded; restored previous settings.');
    });
  });
})();
