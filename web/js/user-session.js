// Console session controller. The browser stores only the currently
// authenticated staff session; account impersonation and seed identities are
// intentionally unsupported.
(() => {
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const isAdmin = window.location.pathname.includes('/admin/');
  const expectedRoles = isAdmin ? ['admin'] : ['merchant', 'admin'];
  const API_ROOT = isLocal ? 'http://127.0.0.1:8000' : '';
  const API_ENDPOINT = isAdmin ? `${API_ROOT}/api/admin` : `${API_ROOT}/api/merchant`;
  const STORAGE_KEY = 'metrodrip_active_user';
  const LOGIN_URL = isAdmin
    ? '../Registration/screens/AdminLoginScreen.html'
    : '../Registration/screens/MerchantLoginScreen.html';

  function escapeHtml(value) {
    const element = document.createElement('div');
    element.appendChild(document.createTextNode(String(value ?? '')));
    return element.innerHTML;
  }

  function getInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '??';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts.at(-1)[0]}`.toUpperCase();
  }

  function getActiveUser() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
      if (
        parsed?.access_token &&
        parsed?.is_staff === true &&
        expectedRoles.includes(parsed?.role)
      ) {
        return parsed;
      }
    } catch {
      // A malformed session is handled as signed out.
    }
    return null;
  }

  function saveActiveUser(user) {
    if (!user?.access_token || !user?.is_staff || !expectedRoles.includes(user.role)) return false;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    return true;
  }

  function clearSession() {
    sessionStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
  }

  function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      container.setAttribute('aria-live', 'polite');
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span aria-hidden="true">${type === 'success' ? '✓' : '✕'}</span> ${escapeHtml(message)}`;
    container.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3500);
  }

  function closeAnyModal() {
    document.querySelectorAll('.user-modal-overlay').forEach((modal) => modal.remove());
  }

  function trapFocus(modal) {
    const focusable = [...modal.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])')];
    focusable[0]?.focus();
    modal.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeAnyModal();
      if (event.key !== 'Tab' || focusable.length < 2) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  async function performSignOut(user = getActiveUser()) {
    const token = user?.access_token;
    let serverConfirmed = false;
    if (token) {
      try {
        const response = await fetch(`${API_ENDPOINT}/logout/`, {
          method: 'POST',
          headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        });
        serverConfirmed = response.ok;
      } catch {
        serverConfirmed = false;
      }
    }
    clearSession();
    closeAnyModal();
    if (!serverConfirmed && token) {
      showToast('Signed out locally. Server revocation could not be confirmed.', 'error');
    }
    window.setTimeout(() => window.location.assign(LOGIN_URL), 250);
  }

  function openSignOutModal() {
    const user = getActiveUser();
    if (!user) {
      clearSession();
      window.location.assign(LOGIN_URL);
      return;
    }
    closeAnyModal();
    const overlay = document.createElement('div');
    overlay.className = 'user-modal-overlay';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'signout-modal-title');
    overlay.innerHTML = `
      <div class="user-modal-card signout-modal-card">
        <div class="user-modal-header">
          <h2 class="user-modal-title" id="signout-modal-title">SIGN OUT</h2>
          <button type="button" class="user-modal-close-btn" data-close-session-modal aria-label="Close dialog">✕</button>
        </div>
        <div class="confirm-dialog-body">
          <p class="confirm-dialog-lead">Sign out <strong>${escapeHtml(user.name)}</strong> from this console?</p>
          <p class="confirm-dialog-subtext">The current bearer token will be revoked.</p>
        </div>
        <div class="confirm-dialog-footer">
          <button type="button" class="modal-btn modal-btn-cancel" data-close-session-modal>Cancel</button>
          <button type="button" class="modal-btn modal-btn-danger" id="btn-confirm-signout">Confirm Sign Out</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelectorAll('[data-close-session-modal]').forEach((button) => button.addEventListener('click', closeAnyModal));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeAnyModal();
    });
    overlay.querySelector('#btn-confirm-signout')?.addEventListener('click', (event) => {
      event.currentTarget.disabled = true;
      event.currentTarget.textContent = 'Signing out…';
      performSignOut(user);
    });
    trapFocus(overlay);
  }

  function renderUserProfile() {
    const user = getActiveUser();
    if (!user) {
      clearSession();
      window.location.assign(LOGIN_URL);
      return;
    }
    const profile = document.querySelector('.sidebar-footer .user-profile');
    if (!profile) return;
    const isSettingsActive = window.location.pathname.includes('account-settings') || window.location.pathname.includes('/account/settings');
    const settingsUrl = isAdmin ? '/admin/account/settings' : '/merchant/account/settings';
    profile.innerHTML = `
      <button type="button" class="user-profile-trigger" id="btn-user-profile-toggle" aria-expanded="false" aria-controls="user-account-menu" aria-haspopup="true">
        <div class="user-avatar" aria-hidden="true">${escapeHtml(getInitials(user.name))}</div>
        <div class="user-meta">
          <p class="user-name" title="${escapeHtml(user.email)}">${escapeHtml(user.name)}</p>
          <p class="user-role-badge">${escapeHtml(user.role.toUpperCase())} · VERIFIED SESSION</p>
        </div>
        <div class="user-collapse-chevron" aria-hidden="true">⌄</div>
      </button>
      <div class="user-account-menu" id="user-account-menu" role="menu" aria-label="Account actions">
        <a href="${settingsUrl}" class="user-menu-item btn-settings ${isSettingsActive ? 'is-active' : ''}" role="menuitem">Account Settings</a>
        <button type="button" class="user-menu-item btn-signout" id="btn-user-signout" role="menuitem">Sign Out</button>
      </div>`;
    const toggle = profile.querySelector('#btn-user-profile-toggle');
    toggle?.addEventListener('click', () => {
      const expanded = profile.classList.toggle('is-expanded');
      toggle.setAttribute('aria-expanded', String(expanded));
    });
    profile.querySelector('#btn-user-signout')?.addEventListener('click', openSignOutModal);
  }

  window.MetroDripSession = {
    getActiveUser,
    saveActiveUser,
    renderUserProfile,
    showToast,
    openSignOutModal,
    performSignOut,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderUserProfile);
  } else {
    renderUserProfile();
  }
})();
