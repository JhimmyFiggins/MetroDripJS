// Admin Console: Audit Trail Controller
// Figma: 550:347 (Light) & 554:1337 (Dark)
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

  // Seeded events matching Figma 550:347
  const auditEvents = [
    {
      id: 'EVT-2026-0920-012',
      time: '09:41:22',
      fullTime: '20 Sep 2026, 09:41:22 PHT',
      actor: 'Admin User',
      event: 'Suspended customer #1042',
      title: 'Customer account suspended',
      module: 'users',
      moduleName: 'Identity / Customer Accounts',
      entity: 'Customer #1042 · spam@x.com',
      result: 'Success',
      source: 'Admin Console · Authenticated session',
      diffOld: 'Active',
      diffNew: 'Suspended',
      diffLabel: 'ACCOUNT STATUS',
      diffNote: 'Access token revoked and login restricted.'
    },
    {
      id: 'EVT-2026-0920-009',
      time: '09:12:09',
      fullTime: '20 Sep 2026, 09:12:09 PHT',
      actor: 'Store Merchant',
      event: 'Updated NCR shipping fee to ₱85',
      title: 'Shipping zone updated',
      module: 'shipping',
      moduleName: 'Merchant / Shipping Zones',
      entity: 'Metro Manila · NCR',
      result: 'Success',
      source: 'Merchant Console · Authenticated staff session',
      diffOld: '₱90',
      diffNew: '₱85',
      diffLabel: 'STANDARD SHIPPING FEE',
      diffNote: 'All other zone settings unchanged.'
    },
    {
      id: 'EVT-2026-0920-008',
      time: '08:55:47',
      fullTime: '20 Sep 2026, 08:55:47 PHT',
      actor: 'Store Merchant',
      event: 'Replied to review #318',
      title: 'Merchant review reply published',
      module: 'reviews',
      moduleName: 'Catalog / Customer Reviews',
      entity: 'Review #318 (Marco L.)',
      result: 'Success',
      source: 'Merchant Console · Authenticated staff session',
      diffOld: 'Unanswered',
      diffNew: 'Replied',
      diffLabel: 'REVIEW REPLY STATUS',
      diffNote: 'Public reply published on storefront.'
    },
    {
      id: 'EVT-2026-0920-005',
      time: '08:30:16',
      fullTime: '20 Sep 2026, 08:30:16 PHT',
      actor: 'Admin User',
      event: 'Granted Merchant role to R. Carlos',
      title: 'User role escalated',
      module: 'users',
      moduleName: 'Identity / Roles & Permissions',
      entity: 'Rafael Carlos · rcarlos@metrodrip.ph',
      result: 'Success',
      source: 'Admin Console · 2FA verified',
      diffOld: 'Customer',
      diffNew: 'Merchant',
      diffLabel: 'ASSIGNED ROLE',
      diffNote: 'Merchant console permissions granted.'
    },
    {
      id: 'EVT-2026-0920-003',
      time: '08:14:33',
      fullTime: '20 Sep 2026, 08:14:33 PHT',
      actor: 'Store Merchant',
      event: 'Attempted access to platform settings',
      title: 'Unauthorized route access blocked',
      module: 'settings',
      moduleName: 'Identity / Security Guard',
      entity: 'Platform Settings / Secret Config',
      result: 'Denied',
      source: 'Web Gateway · IP 120.29.74.11',
      diffOld: 'Merchant',
      diffNew: 'Blocked (403)',
      diffLabel: 'ACCESS ATTEMPT',
      diffNote: 'Role lacks platform configuration authority.'
    },
    {
      id: 'EVT-2026-0920-001',
      time: '08:02:10',
      fullTime: '20 Sep 2026, 08:02:10 PHT',
      actor: 'System',
      event: 'Nightly backup verified',
      title: 'Database snapshot integrity check',
      module: 'system',
      moduleName: 'System / Infrastructure',
      entity: 'Automated Snapshot snapshot-20260920',
      result: 'Success',
      source: 'System Cron Worker',
      diffOld: 'Checksum Pending',
      diffNew: 'Verified',
      diffLabel: 'BACKUP STATUS',
      diffNote: 'Sha256 hash matched storage replica.'
    }
  ];

  let selectedEventId = 'EVT-2026-0920-009'; // Default to Shipping zone updated matching Figma

  function renderTable() {
    const tbody = document.getElementById('audit-activity-tbody');
    if (!tbody) return;

    const searchTerm = (document.getElementById('search-audit-input')?.value || '').toLowerCase().trim();
    const moduleFilter = document.getElementById('filter-module-select')?.value || 'all';
    const resultFilter = (document.getElementById('filter-result-select')?.value || 'all').toLowerCase();

    const filtered = auditEvents.filter(ev => {
      const matchSearch = !searchTerm ||
        ev.actor.toLowerCase().includes(searchTerm) ||
        ev.event.toLowerCase().includes(searchTerm) ||
        ev.id.toLowerCase().includes(searchTerm);
      const matchModule = moduleFilter === 'all' || ev.module === moduleFilter;
      const matchResult = resultFilter === 'all' || ev.result.toLowerCase() === resultFilter;
      return matchSearch && matchModule && matchResult;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 24px; color: var(--color-muted);">No audit events matching criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(ev => {
      const isSelected = ev.id === selectedEventId;
      const isDenied = ev.result === 'Denied';
      const isSuspendedAction = ev.event.toLowerCase().includes('suspended');
      return `
        <tr data-event-id="${ev.id}" style="cursor: pointer; ${isSelected ? 'background-color: var(--color-info-bg);' : ''}">
          <td class="td-mono td-muted">${escapeHtml(ev.time)}</td>
          <td class="td-strong">${escapeHtml(ev.actor)}</td>
          <td style="${isSuspendedAction ? 'color: var(--color-danger); font-weight: 500;' : ''}">${escapeHtml(ev.event)}</td>
          <td>
            <span class="status-pill ${isDenied ? 'suspended' : 'active'}" style="${isDenied ? 'color: var(--color-danger); font-weight: 600;' : ''}">${escapeHtml(ev.result)}</span>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('tr[data-event-id]').forEach(row => {
      row.addEventListener('click', () => {
        const id = row.getAttribute('data-event-id');
        selectEvent(id);
      });
    });
  }

  function selectEvent(id) {
    selectedEventId = id;
    const ev = auditEvents.find(e => e.id === id);
    if (!ev) return;

    const titleEl = document.getElementById('detail-event-title');
    const subEl = document.getElementById('detail-event-sub');
    const actorEl = document.getElementById('detail-event-actor');
    const moduleEl = document.getElementById('detail-event-module');
    const entityEl = document.getElementById('detail-event-entity');
    const timeEl = document.getElementById('detail-event-time');
    const sourceEl = document.getElementById('detail-event-source');
    const diffBox = document.getElementById('detail-diff-box');
    const diffSub = document.getElementById('detail-diff-sub');

    if (titleEl) titleEl.textContent = ev.title;
    if (subEl) subEl.textContent = `Event ${ev.id} · ${ev.result}`;
    if (actorEl) actorEl.textContent = ev.actor;
    if (moduleEl) moduleEl.textContent = ev.moduleName;
    if (entityEl) entityEl.textContent = ev.entity;
    if (timeEl) timeEl.textContent = ev.fullTime;
    if (sourceEl) sourceEl.textContent = ev.source;

    if (diffBox) {
      diffBox.innerHTML = `
        <span>${escapeHtml(ev.diffOld)}</span>
        <span style="color: var(--color-volt);">&rarr;</span>
        <span>${escapeHtml(ev.diffNew)}</span>
      `;
    }
    if (diffSub) diffSub.textContent = ev.diffNote;

    renderTable();
  }

  function initHandlers() {
    document.getElementById('search-audit-input')?.addEventListener('input', renderTable);
    document.getElementById('filter-module-select')?.addEventListener('change', renderTable);
    document.getElementById('filter-result-select')?.addEventListener('change', renderTable);
    document.getElementById('filter-date-select')?.addEventListener('change', () => {
      showToast('Loaded audit log records for selected date.');
    });

    document.getElementById('btn-copy-event-id')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(selectedEventId);
      showToast(`Copied ${selectedEventId} to clipboard.`);
    });

    document.getElementById('btn-export-audit-csv')?.addEventListener('click', () => {
      const csv = 'Timestamp,Actor,Event,Module,Result\n' +
        auditEvents.map(e => `"${e.fullTime}","${e.actor}","${e.event}","${e.moduleName}","${e.result}"`).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Exported audit log CSV.');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    selectEvent(selectedEventId);
    initHandlers();
  });
})();
