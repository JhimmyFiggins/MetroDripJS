// Admin Console: Roles & Permissions Controller
// Figma: 550:289 (Light) & 554:1111 (Dark)
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

  let customRolesCount = 0;

  function initToggleSelects() {
    document.querySelectorAll('.matrix-toggle-select').forEach(select => {
      select.addEventListener('change', () => {
        if (select.value === 'allow') {
          select.className = 'matrix-toggle-select allow';
        } else {
          select.className = 'matrix-toggle-select deny';
        }
      });
    });
  }

  function initHandlers() {
    // Top create role button scrolls to creation card
    document.getElementById('btn-create-role-top')?.addEventListener('click', () => {
      const card = document.getElementById('card-create-custom-role');
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        document.getElementById('custom-role-name')?.focus();
      }
    });

    // Cancel button resets form
    document.getElementById('btn-cancel-custom-role')?.addEventListener('click', () => {
      document.getElementById('form-custom-role')?.reset();
      document.querySelectorAll('.matrix-toggle-select').forEach(select => {
        if (select.dataset.perm === 'view_orders' || select.dataset.perm === 'manage_shipments' || select.dataset.perm === 'view_inventory') {
          select.value = 'allow';
          select.className = 'matrix-toggle-select allow';
        } else {
          select.value = 'deny';
          select.className = 'matrix-toggle-select deny';
        }
      });
      showToast('Form cleared.');
    });

    // Create role form submit
    document.getElementById('form-custom-role')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const roleName = document.getElementById('custom-role-name')?.value.trim();
      const baseRole = document.getElementById('custom-role-base')?.value;
      if (!roleName) return;

      customRolesCount++;
      const metricEl = document.getElementById('metric-custom-roles');
      if (metricEl) metricEl.textContent = customRolesCount;

      showToast(`Custom role "${roleName}" created based on ${baseRole}.`);
      document.getElementById('form-custom-role').reset();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initToggleSelects();
    initHandlers();
  });
})();
