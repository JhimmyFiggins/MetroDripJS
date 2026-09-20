// Admin Console: User Accounts Controller
// Figma: 550:260 (Light) & 554:999 (Dark)
(() => {
  const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8000/api/admin'
    : '/api/admin';

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

  // Seeded state matching Figma 550:260
  let users = [
    {
      id: 1,
      name: 'Juan Dela Cruz',
      email: 'juan@example.com',
      role: 'Customer',
      status: 'Active',
      tfa: 'Off',
      lastActive: 'Today, 09:41',
      memberSince: '15 Feb 2026'
    },
    {
      id: 2,
      name: 'Bea Santos',
      email: 'bea@example.com',
      role: 'Customer',
      status: 'Active',
      tfa: 'Off',
      lastActive: 'Today, 09:12',
      memberSince: '04 Mar 2026'
    },
    {
      id: 3,
      name: 'Store Merchant',
      email: 'merch@metrodrip.ph',
      role: 'Merchant',
      status: 'Active',
      tfa: 'On',
      lastActive: 'Today, 08:55',
      memberSince: '12 Jan 2026'
    },
    {
      id: 4,
      name: 'Admin User',
      email: 'admin@metrodrip.ph',
      role: 'Administrator',
      status: 'Active',
      tfa: 'On',
      lastActive: 'Today, 09:42',
      memberSince: '01 Jan 2026'
    },
    {
      id: 5,
      name: 'Flagged User',
      email: 'spam@x.com',
      role: 'Customer',
      status: 'Suspended',
      tfa: 'Off',
      lastActive: '18 Sep, 14:20',
      memberSince: '10 Feb 2026'
    }
  ];

  let selectedUserId = 3; // Default to Store Merchant matching Figma

  function renderTable() {
    const tbody = document.getElementById('users-directory-tbody');
    if (!tbody) return;

    const searchTerm = (document.getElementById('search-users-input')?.value || '').toLowerCase().trim();
    const roleFilter = (document.getElementById('filter-role-select')?.value || 'all').toLowerCase();
    const statusFilter = (document.getElementById('filter-status-select')?.value || 'all').toLowerCase();

    const filtered = users.filter(u => {
      const matchSearch = !searchTerm ||
        u.name.toLowerCase().includes(searchTerm) ||
        u.email.toLowerCase().includes(searchTerm);
      const matchRole = roleFilter === 'all' || u.role.toLowerCase() === roleFilter;
      const matchStatus = statusFilter === 'all' || u.status.toLowerCase() === statusFilter;
      return matchSearch && matchRole && matchStatus;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 24px; color: var(--color-muted);">No accounts found matching filter criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(u => {
      const isSelected = u.id === selectedUserId;
      const isSuspended = u.status === 'Suspended';
      return `
        <tr data-user-id="${u.id}" class="${isSelected ? 'selected-row' : ''}" style="cursor: pointer; ${isSelected ? 'background-color: var(--color-info-bg);' : ''}">
          <td>
            <div style="display: flex; flex-direction: column;">
              <span class="td-strong">${escapeHtml(u.name)} · <span class="td-mono td-muted" style="font-size: 12px;">${escapeHtml(u.email)}</span></span>
            </div>
          </td>
          <td class="td-mono">${escapeHtml(u.role)}</td>
          <td>
            <span class="status-pill ${isSuspended ? 'suspended' : 'active'}" style="${isSuspended ? 'color: var(--color-danger); font-weight: 600;' : ''}">${escapeHtml(u.status)}</span>
          </td>
          <td class="td-mono td-muted">${escapeHtml(u.tfa)}</td>
          <td class="td-mono td-muted">${escapeHtml(u.lastActive)}</td>
        </tr>
      `;
    }).join('');

    const infoEl = document.getElementById('pagination-info');
    if (infoEl) {
      infoEl.textContent = `Showing 1–${filtered.length} of ${users.length.toLocaleString()} accounts`;
    }

    // Attach row click listeners
    tbody.querySelectorAll('tr[data-user-id]').forEach(row => {
      row.addEventListener('click', () => {
        const id = parseInt(row.getAttribute('data-user-id'), 10);
        selectUser(id);
      });
    });

    updateMetrics();
  }

  function selectUser(id) {
    selectedUserId = id;
    const user = users.find(u => u.id === id);
    if (!user) return;

    const nameEl = document.getElementById('detail-user-name');
    const subEl = document.getElementById('detail-user-sub');
    const roleSelect = document.getElementById('detail-user-role');
    const tfaEl = document.getElementById('detail-user-2fa');
    const activityEl = document.getElementById('detail-user-activity');
    const suspendBtn = document.getElementById('btn-toggle-suspend');

    if (nameEl) nameEl.textContent = user.name;
    if (subEl) subEl.textContent = `${user.email} · ${user.status}`;
    if (roleSelect) roleSelect.value = user.role.toLowerCase();
    if (tfaEl) tfaEl.innerHTML = `Two-factor authentication: <strong>${user.tfa === 'On' ? 'Enabled' : 'Disabled'}</strong>`;
    if (activityEl) activityEl.textContent = `Member since ${user.memberSince} · Last active ${user.lastActive}`;
    if (suspendBtn) {
      if (user.status === 'Suspended') {
        suspendBtn.textContent = 'Activate account';
        suspendBtn.style.color = 'var(--color-success)';
        suspendBtn.style.borderColor = 'var(--color-success)';
      } else {
        suspendBtn.textContent = 'Suspend account';
        suspendBtn.style.color = 'var(--color-danger)';
        suspendBtn.style.borderColor = 'var(--color-danger)';
      }
    }

    renderTable();
  }

  function updateMetrics() {
    const totalEl = document.getElementById('metric-total-customers');
    const staffEl = document.getElementById('metric-staff-accounts');
    const suspendedEl = document.getElementById('metric-suspended');

    const suspendedCount = users.filter(u => u.status === 'Suspended').length;
    const staffCount = users.filter(u => u.role === 'Merchant' || u.role === 'Administrator').length;

    if (totalEl) totalEl.textContent = users.length > 5 ? users.length.toLocaleString() : '1,284';
    if (staffEl) staffEl.textContent = staffCount;
    if (suspendedEl) suspendedEl.textContent = suspendedCount;
  }

  // Event handlers
  function initHandlers() {
    // Search and filters
    document.getElementById('search-users-input')?.addEventListener('input', renderTable);
    document.getElementById('filter-role-select')?.addEventListener('change', renderTable);
    document.getElementById('filter-status-select')?.addEventListener('change', renderTable);

    // Save role button
    document.getElementById('btn-save-user-role')?.addEventListener('click', () => {
      const user = users.find(u => u.id === selectedUserId);
      const newRole = document.getElementById('detail-user-role')?.value;
      if (user && newRole) {
        user.role = newRole.charAt(0).toUpperCase() + newRole.slice(1);
        showToast(`Updated role for ${user.name} to ${user.role}.`);
        renderTable();
      }
    });

    // Reset password button
    document.getElementById('btn-reset-password')?.addEventListener('click', () => {
      const user = users.find(u => u.id === selectedUserId);
      if (user) {
        showToast(`Password reset link dispatched to ${user.email}.`);
      }
    });

    // Suspend / Activate toggle
    document.getElementById('btn-toggle-suspend')?.addEventListener('click', () => {
      const user = users.find(u => u.id === selectedUserId);
      if (!user) return;
      if (user.status === 'Active') {
        user.status = 'Suspended';
        showToast(`Account suspended for ${user.name}.`, 'error');
      } else {
        user.status = 'Active';
        showToast(`Account activated for ${user.name}.`);
      }
      selectUser(user.id);
    });

    // Invite staff form
    document.getElementById('form-invite-staff')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('invite-name')?.value.trim();
      const email = document.getElementById('invite-email')?.value.trim();
      const role = document.getElementById('invite-role')?.value;
      if (!name || !email) return;

      const newUser = {
        id: Date.now(),
        name,
        email,
        role: role.charAt(0).toUpperCase() + role.slice(1),
        status: 'Active',
        tfa: 'Off',
        lastActive: 'Invitation sent',
        memberSince: 'Today'
      };
      users.unshift(newUser);
      showToast(`Staff invitation sent to ${email} as ${newUser.role}.`);
      document.getElementById('form-invite-staff').reset();
      selectUser(newUser.id);
    });

    // Modal: Add user
    const modal = document.getElementById('modal-add-user');
    const openBtn = document.getElementById('btn-open-add-user');
    const closeBtn = document.getElementById('btn-close-modal');
    const cancelBtn = document.getElementById('btn-cancel-add-user');
    const form = document.getElementById('form-add-user');

    const openModal = () => {
      if (modal) {
        modal.hidden = false;
        document.getElementById('add-user-name')?.focus();
      }
    };
    const closeModal = () => {
      if (modal) {
        modal.hidden = true;
        form?.reset();
      }
    };

    openBtn?.addEventListener('click', openModal);
    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);

    modal?.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('add-user-name')?.value.trim();
      const email = document.getElementById('add-user-email')?.value.trim();
      const role = document.getElementById('add-user-role')?.value;
      if (!name || !email) return;

      const newUser = {
        id: Date.now(),
        name,
        email,
        role: role.charAt(0).toUpperCase() + role.slice(1),
        status: 'Active',
        tfa: 'Off',
        lastActive: 'Just now',
        memberSince: 'Today'
      };
      users.unshift(newUser);
      closeModal();
      showToast(`Created account for ${name} (${email}).`);
      selectUser(newUser.id);
    });
  }

  // Initialize
  document.addEventListener('DOMContentLoaded', () => {
    selectUser(selectedUserId);
    initHandlers();
  });
})();
