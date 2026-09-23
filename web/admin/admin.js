// Administrator Console Controller
// Interacts with /api/admin/ endpoints with graceful fallback to seeded Figma state.
(() => {
  const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8000/api/admin'
    : '/api/admin';

  // --- Utility: HTML-safe text helper (XSS prevention) ---
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // State
  let users = [
    { id: 1, email: 'juan@email.com', name: 'Juan Dela Cruz', role: 'customer', status: 'Active' },
    { id: 2, email: 'bea@email.com', name: 'Bea Santos', role: 'customer', status: 'Active' },
    { id: 3, email: 'merch@metrodrip.ph', name: 'Store Merchant', role: 'merchant', status: 'Active' },
    { id: 4, email: 'spam@x.com', name: 'Flagged User', role: 'customer', status: 'Suspended' },
  ];

  let auditEvents = [
    { id: 1, when: '09:41', actor: 'Admin User', action: 'Suspended customer #1042' },
    { id: 2, when: '09:12', actor: 'Admin User', action: 'Updated NCR shipping fee → ₱85' },
    { id: 3, when: '08:55', actor: 'Store Merchant', action: 'Approved review #318' },
    { id: 4, when: '08:30', actor: 'Admin User', action: 'Granted merchant role → R. Carlos' },
    { id: 5, when: '08:02', actor: 'System', action: 'Nightly backup verified' },
  ];

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

  function renderUsers() {
    const tbody = document.getElementById('users-tbody');
    if (!tbody) return;
    tbody.innerHTML = users.map((u) => `
      <tr data-user-id="${u.id}">
        <td class="td-mono">${escapeHtml(u.email)}</td>
        <td class="td-strong">${escapeHtml(u.name)}</td>
        <td class="td-mono td-muted">${escapeHtml(u.role)}</td>
        <td>
          <span class="status-pill ${u.status.toLowerCase()}">${u.status}</span>
        </td>
        <td>
          <button type="button" class="btn btn-secondary btn-sm btn-toggle-status" data-user-id="${u.id}" data-action="${u.status === 'Active' ? 'suspend' : 'activate'}">
            ${u.status === 'Active' ? 'Suspend' : 'Activate'}
          </button>
        </td>
      </tr>
    `).join('');

    // Rebind toggle events via delegation is handled below
    updateMetrics();
  }

  function updateMetrics() {
    const suspendedCount = users.filter((u) => u.status === 'Suspended').length;
    const activeCount = users.filter((u) => u.status === 'Active').length;
    const suspendedEl = document.getElementById('metric-suspended-count');
    const totalEl = document.getElementById('metric-total-customers');
    const staffEl = document.getElementById('metric-staff-accounts');
    if (suspendedEl) suspendedEl.textContent = suspendedCount;
    // Update total count if new users added
    if (totalEl && totalEl.dataset.baseSet !== 'api') {
      totalEl.textContent = users.length.toLocaleString();
    }
  }

  function renderAuditTrail() {
    const tbody = document.getElementById('audit-tbody');
    if (!tbody) return;
    tbody.innerHTML = auditEvents.map((ev) => `
      <tr>
        <td class="td-mono td-muted">${escapeHtml(ev.when)}</td>
        <td class="td-strong">${escapeHtml(ev.actor)}</td>
        <td>${escapeHtml(ev.action)}</td>
      </tr>
    `).join('');

    const auditBadge = document.getElementById('sidebar-audit-count');
    const auditMetric = document.getElementById('metric-audit-events');
    if (auditBadge) auditBadge.textContent = auditEvents.length;
    if (auditMetric) auditMetric.textContent = auditEvents.length;
  }

  function logAuditEvent(action, actor = 'Admin User') {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    auditEvents.unshift({
      id: Date.now(),
      when: timeStr,
      actor,
      action,
    });
    renderAuditTrail();
  }

  async function toggleUserStatus(userId) {
    const user = users.find((u) => u.id === userId);
    if (!user) return;

    const newStatus = user.status === 'Active' ? 'Suspended' : 'Active';
    user.status = newStatus;

    // Try backend PATCH if available
    try {
      await fetch(`${API_BASE}/users/${userId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newStatus === 'Active' }),
      });
    } catch {
      // Offline fallback
    }

    logAuditEvent(`${newStatus === 'Suspended' ? 'Suspended' : 'Reactivated'} account ${user.email}`);
    renderUsers();
    showToast(`Account ${user.name} is now ${newStatus.toLowerCase()}.`);
  }

  // --- Event Delegation for User Table (avoids re-binding on render) ---
  const usersTable = document.getElementById('users-tbody');
  usersTable?.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-toggle-status');
    if (!btn) return;
    const id = parseInt(btn.dataset.userId, 10);
    toggleUserStatus(id);
  });

  // --- Modal setup ---
  const modal = document.getElementById('modal-add-user');
  const btnOpenModal = document.getElementById('btn-open-add-user');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCancelModal = document.getElementById('btn-cancel-add-user');
  const formAddUser = document.getElementById('form-add-user');

  function openModal() {
    if (modal) {
      modal.hidden = false;
      document.getElementById('add-user-name')?.focus();
    }
  }

  function closeModal() {
    if (modal) {
      modal.hidden = true;
      formAddUser?.reset();
      // Return focus to the trigger button
      btnOpenModal?.focus();
    }
  }

  btnOpenModal?.addEventListener('click', openModal);
  btnCloseModal?.addEventListener('click', closeModal);
  btnCancelModal?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });

  formAddUser?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(formAddUser);
    const newUser = {
      id: Date.now(),
      name: formData.get('name').trim(),
      email: formData.get('email').trim(),
      role: formData.get('role'),
      status: 'Active',
    };

    if (!newUser.name || !newUser.email) {
      showToast('Name and email are required.', 'error');
      return;
    }

    // Basic email format validation
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(newUser.email)) {
      showToast('Please enter a valid email address.', 'error');
      return;
    }

    // Duplicate email check
    if (users.some((u) => u.email.toLowerCase() === newUser.email.toLowerCase())) {
      showToast('An account with this email already exists.', 'error');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/users/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          phone: formData.get('phone') || '',
        }),
      });
      if (res.ok) {
        const created = await res.json();
        newUser.id = created.id;
      }
    } catch {
      // Offline fallback
    }

    users.unshift(newUser);
    logAuditEvent(`Created ${newUser.role} account → ${newUser.name}`);
    renderUsers();
    closeModal();
    showToast(`Successfully created ${newUser.role} account for ${newUser.name}.`);
  });

  // --- Export CSV ---
  const btnExport = document.getElementById('btn-export-csv');
  btnExport?.addEventListener('click', () => {
    const headers = ['ID', 'Email', 'Name', 'Role', 'Status'];
    const rows = users.map((u) => [u.id, `"${u.email}"`, `"${u.name}"`, u.role, u.status]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `metrodrip_users_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Exported users to CSV.');
    logAuditEvent('Exported customer & staff directory to CSV');
  });

  // --- Shipping Zones Manager Modal ---
  const modalShipping = document.getElementById('modal-shipping-zones');
  const btnCloseShipping = document.getElementById('btn-close-shipping-zones');
  const btnCancelShipping = document.getElementById('btn-cancel-shipping-zones');
  const formShipping = document.getElementById('form-shipping-zones');

  async function openShippingZonesModal() {
    if (!modalShipping) return;

    try {
      const res = await fetch(`${API_BASE}/shipping-zones/`);
      if (res.ok) {
        const zones = await res.json();
        zones.forEach((z) => {
          const input = document.getElementById(`fee-zone-${z.id}`) || document.querySelector(`input[name="zone_${z.id}"]`);
          if (input) input.value = z.fee;
        });
      }
    } catch {
      // Offline fallback
    }

    modalShipping.hidden = false;
    document.getElementById('fee-zone-1')?.focus();
  }

  function closeShippingZonesModal() {
    if (modalShipping) modalShipping.hidden = true;
  }

  btnCloseShipping?.addEventListener('click', closeShippingZonesModal);
  btnCancelShipping?.addEventListener('click', closeShippingZonesModal);
  modalShipping?.addEventListener('click', (e) => {
    if (e.target === modalShipping) closeShippingZonesModal();
  });

  formShipping?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fee1 = parseInt(document.getElementById('fee-zone-1')?.value || '85', 10);
    const fee2 = parseInt(document.getElementById('fee-zone-2')?.value || '120', 10);
    const fee3 = parseInt(document.getElementById('fee-zone-3')?.value || '150', 10);

    const updates = [
      { id: 1, name: 'NCR', fee: fee1 },
      { id: 2, name: 'Luzon', fee: fee2 },
      { id: 3, name: 'VisMin', fee: fee3 },
    ];

    for (const u of updates) {
      try {
        await fetch(`${API_BASE}/shipping-zones/${u.id}/`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fee: u.fee }),
        });
      } catch {
        // Offline fallback
      }
    }

    logAuditEvent(`Updated shipping fees → NCR: ₱${fee1}, Luzon: ₱${fee2}, VisMin: ₱${fee3}`);
    closeShippingZonesModal();
    showToast('Regional shipping rates successfully updated.');
  });

  // --- Escape key handler ---
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (modal && !modal.hidden) closeModal();
      if (modalShipping && !modalShipping.hidden) closeShippingZonesModal();
    }
  });

  // --- Navigation Links ---
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      document.querySelectorAll('.nav-item').forEach((nav) => nav.classList.remove('is-active'));
      item.classList.add('is-active');

      const tab = item.dataset.tab || item.getAttribute('href')?.replace('#', '');
      if (tab === 'shipping') {
        openShippingZonesModal();
      }
    });
  });

  // --- Initial fetch from backend if running ---
  async function loadInitialData() {
    try {
      const res = await fetch(`${API_BASE}/dashboard/`);
      if (res.ok) {
        const data = await res.json();
        if (data.metrics) {
          const totalEl = document.getElementById('metric-total-customers');
          if (totalEl) {
            totalEl.textContent = data.metrics.total_customers.toLocaleString();
            totalEl.dataset.baseSet = 'api';
          }
          document.getElementById('metric-staff-accounts').textContent = data.metrics.staff_accounts;
          document.getElementById('metric-suspended-count').textContent = data.metrics.suspended_count;
          document.getElementById('metric-audit-events').textContent = data.metrics.audit_events_24h;
        }
        if (data.users && data.users.length) {
          users = data.users;
          renderUsers();
        }
        if (data.audit_trail && data.audit_trail.length) {
          auditEvents = data.audit_trail;
          renderAuditTrail();
        }
      }
    } catch {
      // Backend not running yet or offline; fallback to pre-seeded Figma data
      renderUsers();
      renderAuditTrail();
    }
  }

  loadInitialData();
})();
