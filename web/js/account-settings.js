// API-backed account settings for authenticated staff sessions. Failed writes
// never update the local profile or show a success state.
(() => {
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const API_ROOT = isLocal ? 'http://127.0.0.1:8000' : '';
  const preferenceMap = {
    'pref-btn-orders': 'order_alerts',
    'pref-btn-inventory': 'low_stock_alerts',
    'pref-btn-reviews': 'review_alerts',
    'pref-btn-summary': 'weekly_summary',
  };
  let remoteSessions = [];
  let pendingSessionId = null;

  function session() {
    return window.MetroDripSession?.getActiveUser?.() || null;
  }

  function authHeaders(extra = {}) {
    const token = session()?.access_token;
    return {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extra,
    };
  }

  async function api(path, options = {}) {
    const response = await fetch(`${API_ROOT}${path}`, {
      ...options,
      headers: authHeaders(options.headers || {}),
    });
    if (!response.ok) {
      let message = 'The request could not be completed.';
      try {
        const body = await response.json();
        message = body?.error || body?.detail || message;
      } catch {
        // The status fallback remains actionable for non-JSON failures.
      }
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }
    return response.status === 204 ? null : response.json();
  }

  function showToast(message, type = 'success') {
    window.MetroDripSession?.showToast?.(message, type);
  }

  function getInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '??';
    return parts.length === 1
      ? parts[0].slice(0, 2).toUpperCase()
      : `${parts[0][0]}${parts.at(-1)[0]}`.toUpperCase();
  }

  function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    modal.querySelector('input, button')?.focus();
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }

  function closeAllModals() {
    document.querySelectorAll('.figma-modal-overlay').forEach((modal) => {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    });
  }

  function showChangesSavedModal() {
    closeAllModals();
    openModal('modal-changes-saved');
  }

  function setPreferenceButton(button, enabled) {
    button.dataset.state = enabled ? 'on' : 'off';
    button.classList.toggle('is-active', enabled);
    button.textContent = enabled ? '✓  On' : 'Off';
  }

  function populatePreferences(preferences = {}) {
    Object.entries(preferenceMap).forEach(([id, key]) => {
      const button = document.getElementById(id);
      if (button) setPreferenceButton(button, preferences[key] === true);
    });
  }

  function formatTimestamp(value) {
    const date = new Date(value || '');
    return Number.isNaN(date.getTime())
      ? 'Not reported'
      : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }

  function renderSessions(sessions = []) {
    remoteSessions = sessions;
    const body = document.getElementById('sessions-table-body');
    if (!body) return;
    if (!sessions.length) {
      body.innerHTML = '<tr><td colspan="4">No active sessions were reported.</td></tr>';
      return;
    }
    body.innerHTML = sessions.map((item) => `
      <tr>
        <td><strong>${item.is_current ? 'Current authenticated client' : 'Authenticated client'}</strong></td>
        <td>Not collected</td>
        <td>${formatTimestamp(item.last_active)}</td>
        <td style="text-align: right;">
          ${item.is_current
            ? '<span class="current-session-tag">Current session</span>'
            : `<button type="button" class="btn-mgmt-secondary btn-signout-session" data-session-id="${item.id}" style="min-height: 44px;">Sign out</button>`}
        </td>
      </tr>`).join('');
    body.querySelectorAll('.btn-signout-session').forEach((button) => {
      button.addEventListener('click', () => {
        pendingSessionId = button.dataset.sessionId;
        const description = document.getElementById('desc-signout-single');
        if (description) description.textContent = 'End this authenticated session? This browser stays signed in.';
        openModal('modal-signout-single');
      });
    });
  }

  function populateAccount(user) {
    const avatar = document.getElementById('identity-avatar-display');
    const displayName = document.getElementById('identity-display-name');
    const nameInput = document.getElementById('profile-display-name-input');
    const emailInput = document.getElementById('profile-email-input');
    const phoneInput = document.getElementById('profile-phone-input');
    if (avatar) avatar.textContent = getInitials(user.name);
    if (displayName) displayName.textContent = user.name;
    if (nameInput) nameInput.value = user.name || '';
    if (emailInput) emailInput.value = user.email || '';
    if (phoneInput) phoneInput.value = user.phone || '';
    const badge = document.getElementById('security-2fa-status-badge');
    if (badge) badge.textContent = 'Not configured';
    populatePreferences(user.preferences);
    renderSessions(user.sessions);
  }

  async function loadAccount() {
    try {
      const user = await api('/users/me/');
      const current = session();
      window.MetroDripSession?.saveActiveUser?.({ ...current, ...user });
      window.MetroDripSession?.renderUserProfile?.();
      populateAccount(user);
    } catch (error) {
      showToast(error.message, 'error');
      renderSessions([]);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    const button = document.getElementById('btn-save-profile-changes');
    const payload = {
      name: document.getElementById('profile-display-name-input')?.value.trim(),
      email: document.getElementById('profile-email-input')?.value.trim().toLowerCase(),
      phone: document.getElementById('profile-phone-input')?.value.trim(),
    };
    if (!payload.name || !payload.email.includes('@')) {
      showToast('Enter a valid display name and email address.', 'error');
      return;
    }
    button.disabled = true;
    button.textContent = 'Saving…';
    try {
      const updated = await api('/users/me/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const current = session();
      window.MetroDripSession?.saveActiveUser?.({ ...current, ...updated });
      window.MetroDripSession?.renderUserProfile?.();
      populateAccount({ ...current, ...updated, sessions: remoteSessions });
      showChangesSavedModal();
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Save changes';
    }
  }

  async function updatePassword() {
    const currentPassword = document.getElementById('input-current-pwd')?.value || '';
    const newPassword = document.getElementById('input-new-pwd')?.value || '';
    const confirmation = document.getElementById('input-confirm-pwd')?.value || '';
    if (!currentPassword || newPassword.length < 12 || newPassword !== confirmation) {
      showToast('Enter the current password and a matching new passphrase of at least 12 characters.', 'error');
      return;
    }
    const button = document.getElementById('btn-submit-update-password');
    button.disabled = true;
    button.textContent = 'Updating…';
    try {
      await api('/users/me/password/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmation,
        }),
      });
      ['input-current-pwd', 'input-new-pwd', 'input-confirm-pwd'].forEach((id) => {
        const field = document.getElementById(id);
        if (field) field.value = '';
      });
      showChangesSavedModal();
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Update password';
    }
  }

  async function revokeSessions(revokeAll) {
    try {
      const data = await api('/users/me/sessions/revoke/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(revokeAll ? { revoke_all: true } : { session_id: pendingSessionId }),
      });
      renderSessions(data.sessions || []);
      pendingSessionId = null;
      showChangesSavedModal();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  async function savePreferences() {
    const preferences = {};
    Object.entries(preferenceMap).forEach(([id, key]) => {
      preferences[key] = document.getElementById(id)?.dataset.state === 'on';
    });
    try {
      const updated = await api('/users/me/', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferences }),
      });
      const current = session();
      window.MetroDripSession?.saveActiveUser?.({ ...current, ...updated });
      showChangesSavedModal();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  function initializeControls() {
    document.querySelectorAll('.btn-modal-close').forEach((button) => {
      button.addEventListener('click', () => closeModal(button.dataset.modal));
    });
    document.querySelectorAll('.figma-modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeModal(overlay.id);
      });
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeAllModals();
    });
    document.getElementById('btn-open-password-modal')?.addEventListener('click', () => openModal('modal-change-password'));
    document.getElementById('btn-submit-update-password')?.addEventListener('click', updatePassword);
    document.getElementById('form-profile-details')?.addEventListener('submit', saveProfile);
    document.getElementById('btn-cancel-profile-changes')?.addEventListener('click', loadAccount);
    document.getElementById('btn-open-signout-all-modal')?.addEventListener('click', () => openModal('modal-signout-all'));
    document.getElementById('btn-confirm-signout-all')?.addEventListener('click', () => revokeSessions(true));
    document.getElementById('btn-confirm-signout-single')?.addEventListener('click', () => revokeSessions(false));
    document.querySelectorAll('.toggle-pill-btn').forEach((button) => {
      button.addEventListener('click', () => setPreferenceButton(button, button.dataset.state !== 'on'));
    });
    document.getElementById('btn-save-preferences')?.addEventListener('click', savePreferences);
    ['btn-open-2fa-modal', 'btn-open-recovery-modal'].forEach((id) => {
      const button = document.getElementById(id);
      if (!button) return;
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
      button.title = 'This security feature is not configured.';
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initializeControls();
    loadAccount();
  });
})();
