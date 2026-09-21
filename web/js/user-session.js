// MetroDrip Console User Session Controller
// Manages Sign Out and Switch User functionality across Admin and Merchant Consoles.
(() => {
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const isAdmin = window.location.pathname.includes('/admin/');
  const isMerchant = window.location.pathname.includes('/merchant/');

  const API_ROOT = isLocal ? 'http://127.0.0.1:8000' : '';
  const API_ENDPOINT = isAdmin
    ? `${API_ROOT}/api/admin`
    : `${API_ROOT}/api/merchant`;

  const STORAGE_KEY = 'metrodrip_active_user';

  // Fallback seed accounts when backend is unreachable
  const DEFAULT_ACCOUNTS = [
    { id: 7, name: 'Admin User', email: 'admin@metrodrip.ph', role: 'admin', is_staff: true },
    { id: 5, name: 'Store Merchant', email: 'merch@metrodrip.ph', role: 'merchant', is_staff: true },
    { id: 1, name: 'Mike Eleanor', email: 'test@metrodrip.com', role: 'customer', is_staff: false },
    { id: 3, name: 'Juan Dela Cruz', email: 'juan@email.com', role: 'customer', is_staff: false },
    { id: 4, name: 'Bea Santos', email: 'bea@email.com', role: 'customer', is_staff: false },
  ];

  // Helper: XSS-safe escape
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  // Helper: Extract 2-letter initials
  function getInitials(name) {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  // Get current active user from storage or initialize defaults
  function getActiveUser() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.email) {
          // If we are in Admin console and stored user is not admin, or vice versa, default sensibly
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Could not read user from storage', e);
    }

    // Default based on current workspace
    const defaultUser = isAdmin ? DEFAULT_ACCOUNTS[0] : DEFAULT_ACCOUNTS[1];
    saveActiveUser(defaultUser);
    return defaultUser;
  }

  function saveActiveUser(user) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } catch (e) {
      console.warn('Could not save user to storage', e);
    }
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
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  }

  // Render or decorate the user profile in sidebar footer
  function renderUserProfile() {
    const profileContainer = document.querySelector('.sidebar-footer .user-profile');
    if (!profileContainer) return;

    const user = getActiveUser();
    const initials = getInitials(user.name);
    const roleBadge = (user.role || (isAdmin ? 'admin' : 'merchant')).toUpperCase() + ' · 2FA ON';

    // Preserve expanded state or expand when on Account Settings
    const isSettingsActive = window.location.pathname.includes('account-settings') || window.location.pathname.includes('/account/settings');
    const isExpanded = profileContainer.classList.contains('is-expanded') || isSettingsActive;
    if (isExpanded) {
      profileContainer.classList.add('is-expanded');
    }
    const settingsUrl = isAdmin ? '/admin/account/settings' : '/merchant/account/settings';

    profileContainer.innerHTML = `
      <button type="button" class="user-profile-trigger" id="btn-user-profile-toggle" aria-expanded="${isExpanded ? 'true' : 'false'}" aria-controls="user-account-menu" aria-haspopup="true" title="Account controls for ${escapeHtml(user.name)}">
        <div class="user-avatar" id="current-user-avatar" aria-hidden="true">${escapeHtml(initials)}</div>
        <div class="user-meta">
          <p class="user-name" id="current-user-name" title="${escapeHtml(user.name)} (${escapeHtml(user.email)})">${escapeHtml(user.name)}</p>
          <p class="user-role-badge" id="current-user-role">${escapeHtml(roleBadge)}</p>
        </div>
        <div class="user-collapse-chevron" aria-hidden="true">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </button>
      <div class="user-account-menu" id="user-account-menu" role="menu" aria-label="Account actions">
        <a href="${settingsUrl}" class="user-menu-item btn-settings ${isSettingsActive ? 'is-active' : ''}" id="btn-user-settings" role="menuitem" title="Account Settings & Profile Management">
          <span class="menu-action-icon" aria-hidden="true">⚙</span>
          <span>Account Settings</span>
        </a>
        <button type="button" class="user-menu-item btn-switch" id="btn-user-switch" role="menuitem" title="Switch to another account">
          <span class="menu-action-icon" aria-hidden="true">⇄</span>
          <span>Switch Account</span>
        </button>
        <button type="button" class="user-menu-item btn-signout" id="btn-user-signout" role="menuitem" title="Sign out of console">
          <span class="menu-action-icon" aria-hidden="true">↪</span>
          <span>Sign Out</span>
        </button>
      </div>
    `;

    // Attach listeners
    const toggleBtn = document.getElementById('btn-user-profile-toggle');
    const switchBtn = document.getElementById('btn-user-switch');
    const signoutBtn = document.getElementById('btn-user-signout');

    if (toggleBtn) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const expanded = profileContainer.classList.toggle('is-expanded');
        toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      });
    }

    if (switchBtn) {
      switchBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openSwitchUserModal();
      });
    }

    if (signoutBtn) {
      signoutBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openSignOutModal();
      });
    }
  }

  // Close account menu when clicking outside
  document.addEventListener('click', (e) => {
    const profileContainer = document.querySelector('.sidebar-footer .user-profile');
    if (profileContainer && profileContainer.classList.contains('is-expanded')) {
      if (!profileContainer.contains(e.target)) {
        profileContainer.classList.remove('is-expanded');
        const toggleBtn = document.getElementById('btn-user-profile-toggle');
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
      }
    }
  });

  // Fetch available accounts from API with fallback
  async function fetchSwitchableAccounts() {
    try {
      const resp = await fetch(`${API_ENDPOINT}/switch-user/`);
      if (resp.ok) {
        const data = await resp.json();
        if (data && Array.isArray(data.users) && data.users.length > 0) {
          return data.users;
        }
      }
    } catch (err) {
      console.warn('Failed to fetch switchable users from backend, using seed accounts:', err);
    }
    return DEFAULT_ACCOUNTS;
  }

  // --- Switch User Modal ---
  async function openSwitchUserModal() {
    closeAnyModal();

    const currentUser = getActiveUser();
    const overlay = document.createElement('div');
    overlay.className = 'user-modal-overlay';
    overlay.id = 'switch-user-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'switch-modal-title');

    overlay.innerHTML = `
      <div class="user-modal-card">
        <div class="user-modal-header">
          <h2 class="user-modal-title" id="switch-modal-title">Switch Account</h2>
          <button type="button" class="user-modal-close-btn" id="btn-close-switch-modal" aria-label="Close dialog">✕</button>
        </div>
        <div class="user-modal-body">
          <p style="font-size: 12px; color: var(--color-muted); margin: 0;">
            Select an account to switch session, or login with different credentials.
          </p>
          <div class="switch-account-list" id="switch-account-list-container">
            <div style="padding: 16px; text-align: center; color: var(--color-muted); font-size: 12px;">
              Loading available accounts…
            </div>
          </div>
        </div>
        <div class="user-modal-footer">
          <a class="login-different-link" id="link-login-different" href="#">
            Log in to another account →
          </a>
          <button type="button" class="modal-btn modal-btn-cancel" id="btn-cancel-switch-modal">Cancel</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Close handlers
    const closeBtn = document.getElementById('btn-close-switch-modal');
    const cancelBtn = document.getElementById('btn-cancel-switch-modal');
    const loginDiffLink = document.getElementById('link-login-different');

    closeBtn.addEventListener('click', closeAnyModal);
    cancelBtn.addEventListener('click', closeAnyModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeAnyModal();
    });

    // Set correct login screen destination
    const loginUrl = isAdmin
      ? '../Registration/screens/AdminLoginScreen.html'
      : '../Registration/screens/MerchantLoginScreen.html';
    loginDiffLink.href = loginUrl;

    // Load and render accounts
    const accounts = await fetchSwitchableAccounts();
    const listContainer = document.getElementById('switch-account-list-container');
    if (!listContainer) return;

    listContainer.innerHTML = accounts.map((acc) => {
      const isCurrent = acc.id === currentUser.id || acc.email === currentUser.email;
      const initials = getInitials(acc.name);
      const roleClass = acc.role === 'admin' ? 'role-pill-admin' : (acc.role === 'merchant' ? 'role-pill-merchant' : 'role-pill-customer');
      
      return `
        <div class="switch-account-item ${isCurrent ? 'is-current' : ''}">
          <div class="switch-account-info">
            <div class="switch-account-avatar">${escapeHtml(initials)}</div>
            <div class="switch-account-details">
              <div class="switch-account-header-line">
                <span class="switch-account-name">${escapeHtml(acc.name)}</span>
                <span class="account-role-pill ${roleClass}">${escapeHtml(acc.role)}</span>
              </div>
              <span class="switch-account-email">${escapeHtml(acc.email)}</span>
            </div>
          </div>
          ${isCurrent 
            ? `<span class="current-badge"><span aria-hidden="true">✓</span> Active</span>`
            : `<button type="button" class="switch-account-action-btn" data-account-id="${acc.id}" data-account-email="${escapeHtml(acc.email)}" data-account-name="${escapeHtml(acc.name)}" data-account-role="${escapeHtml(acc.role)}">
                 Switch
               </button>`
          }
        </div>
      `;
    }).join('');

    // Attach switch event listeners
    const switchButtons = listContainer.querySelectorAll('.switch-account-action-btn');
    switchButtons.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const targetId = parseInt(btn.dataset.accountId, 10);
        const targetEmail = btn.dataset.accountEmail;
        const targetName = btn.dataset.accountName;
        const targetRole = btn.dataset.accountRole;

        btn.disabled = true;
        btn.textContent = 'Switching…';

        await performSwitchUser({
          id: targetId,
          email: targetEmail,
          name: targetName,
          role: targetRole,
        }, currentUser);
      });
    });

    trapFocus(overlay);
  }

  // Switch user execution
  async function performSwitchUser(targetUser, currentUser) {
    try {
      // Call backend switch-user API
      await fetch(`${API_ENDPOINT}/switch-user/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: targetUser.id,
          email: targetUser.email,
          current_actor: currentUser.name,
        }),
      });
    } catch (e) {
      console.warn('Backend switch call failed, continuing client-side switch:', e);
    }

    // Update active user in storage
    saveActiveUser(targetUser);
    closeAnyModal();
    showToast(`Switched account to ${targetUser.name} (${targetUser.role.toUpperCase()})`);

    // Redirection or reload based on target role
    setTimeout(() => {
      if (targetUser.role === 'admin' && !isAdmin) {
        window.location.href = '../admin/index.html';
      } else if (targetUser.role === 'merchant' && !isMerchant) {
        window.location.href = '../merchant/index.html';
      } else if (targetUser.role === 'customer') {
        // Customer account switched inside console: refresh current view with customer context
        renderUserProfile();
        window.location.reload();
      } else {
        // Same console role: refresh view with new user
        renderUserProfile();
        window.location.reload();
      }
    }, 700);
  }

  // --- Sign Out Modal ---
  function openSignOutModal() {
    closeAnyModal();

    const user = getActiveUser();
    const consoleName = isAdmin ? 'Admin Console' : 'Merchant Console';

    const overlay = document.createElement('div');
    overlay.className = 'user-modal-overlay';
    overlay.id = 'sign-out-modal-overlay';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'signout-modal-title');

    overlay.innerHTML = `
      <div class="user-modal-card signout-modal-card">
        <div class="user-modal-header">
          <h2 class="user-modal-title" id="signout-modal-title">SIGN OUT</h2>
          <button type="button" class="user-modal-close-btn" id="btn-close-signout-modal" aria-label="Close dialog">✕</button>
        </div>
        <div class="confirm-dialog-body">
          <p class="confirm-dialog-lead">
            Are you sure you want to sign out of <strong>${escapeHtml(user.name)}</strong> on the ${escapeHtml(consoleName)}?
          </p>
          <p class="confirm-dialog-subtext">
            Your active session will be ended and logged in the platform audit trail.
          </p>
        </div>
        <div class="confirm-dialog-footer">
          <button type="button" class="modal-btn modal-btn-cancel" id="btn-cancel-signout">Cancel</button>
          <button type="button" class="modal-btn modal-btn-danger" id="btn-confirm-signout">Confirm Sign Out</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const closeBtn = document.getElementById('btn-close-signout-modal');
    const cancelBtn = document.getElementById('btn-cancel-signout');
    const confirmBtn = document.getElementById('btn-confirm-signout');

    closeBtn.addEventListener('click', closeAnyModal);
    cancelBtn.addEventListener('click', closeAnyModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeAnyModal();
    });

    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Signing out…';
      await performSignOut(user);
    });

    trapFocus(overlay);
  }

  // Sign out execution
  async function performSignOut(user) {
    try {
      await fetch(`${API_ENDPOINT}/logout/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actor: user.name,
          role: user.role,
          user_id: user.id,
        }),
      });
    } catch (e) {
      console.warn('Backend logout call failed, completing client-side sign out:', e);
    }

    // Clear active user session
    localStorage.removeItem(STORAGE_KEY);
    closeAnyModal();
    showToast('Signed out successfully. Redirecting to login…');

    // Compute redirect target based on console
    const redirectUrl = isAdmin
      ? '../Registration/screens/AdminLoginScreen.html'
      : '../Registration/screens/MerchantLoginScreen.html';

    setTimeout(() => {
      window.location.href = redirectUrl;
    }, 800);
  }

  // Close any open modal
  function closeAnyModal() {
    const modals = document.querySelectorAll('.user-modal-overlay');
    modals.forEach((m) => m.remove());
  }

  // Focus trap and Escape key listener
  function trapFocus(modalElement) {
    const focusable = modalElement.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable.length > 0) focusable[0].focus();

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeAnyModal();
        document.removeEventListener('keydown', handleKeyDown);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderUserProfile);
  } else {
    renderUserProfile();
  }

  // Expose API for external scripts if needed
  window.MetroDripSession = {
    getActiveUser,
    saveActiveUser,
    renderUserProfile,
    showToast,
    openSwitchUserModal,
    openSignOutModal,
    performSignOut,
  };
})();
