// Merchant Console: Shipments Controller
// Figma: 550:104 (Light) & 554:542 (Dark)
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

  // Seeded shipments matching Figma 550:104
  let shipments = [
    {
      orderId: 'MD-2026-00317',
      tracking: 'Not booked',
      carrier: 'J&T Express',
      carrierKey: 'jt',
      destination: 'Quezon City, NCR',
      status: 'Ready to book',
      statusKey: 'ready',
      lastUpdate: 'Today, 09:20'
    },
    {
      orderId: 'MD-2026-00316',
      tracking: 'DEMO-00316',
      carrier: 'J&T Express',
      carrierKey: 'jt',
      destination: 'Makati, NCR',
      status: 'In transit',
      statusKey: 'transit',
      lastUpdate: 'Today, 09:12'
    },
    {
      orderId: 'MD-2026-00314',
      tracking: 'DEMO-00314',
      carrier: 'J&T Express',
      carrierKey: 'jt',
      destination: 'Pasig, NCR',
      status: 'Out for delivery',
      statusKey: 'delivery',
      lastUpdate: 'Today, 08:44'
    },
    {
      orderId: 'MD-2026-00310',
      tracking: 'DEMO-00310',
      carrier: 'J&T Express',
      carrierKey: 'jt',
      destination: 'Cebu City',
      status: 'Exception',
      statusKey: 'exception',
      lastUpdate: 'Today, 08:15'
    }
  ];

  function renderTable() {
    const tbody = document.getElementById('shipments-tbody');
    if (!tbody) return;

    const searchTerm = (document.getElementById('search-shipments-input')?.value || '').toLowerCase().trim();
    const carrierFilter = document.getElementById('filter-carrier-select')?.value || 'all';
    const statusFilter = document.getElementById('filter-status-select')?.value || 'all';

    const filtered = shipments.filter(s => {
      const matchSearch = !searchTerm ||
        s.orderId.toLowerCase().includes(searchTerm) ||
        s.tracking.toLowerCase().includes(searchTerm) ||
        s.destination.toLowerCase().includes(searchTerm);
      const matchCarrier = carrierFilter === 'all' || s.carrierKey === carrierFilter;
      const matchStatus = statusFilter === 'all' || s.statusKey === statusFilter;
      return matchSearch && matchCarrier && matchStatus;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 24px; color: var(--color-muted);">No shipments matching criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(s => {
      const isException = s.statusKey === 'exception';
      return `
        <tr>
          <td>
            <div style="display: flex; flex-direction: column;">
              <span class="td-strong">${escapeHtml(s.orderId)} · <span class="td-mono td-muted" style="font-size: 12px;">${escapeHtml(s.tracking)}</span></span>
            </div>
          </td>
          <td class="td-mono">${escapeHtml(s.carrier)}</td>
          <td>${escapeHtml(s.destination)}</td>
          <td>
            <span class="td-mono" style="${isException ? 'color: var(--color-danger); font-weight: 700;' : ''}">${escapeHtml(s.status)}</span>
          </td>
          <td class="td-mono td-muted">${escapeHtml(s.lastUpdate)}</td>
        </tr>
      `;
    }).join('');
  }

  function initHandlers() {
    document.getElementById('search-shipments-input')?.addEventListener('input', renderTable);
    document.getElementById('filter-carrier-select')?.addEventListener('change', renderTable);
    document.getElementById('filter-status-select')?.addEventListener('change', renderTable);

    document.getElementById('btn-open-booking')?.addEventListener('click', () => {
      const card = document.getElementById('card-book-shipment');
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });

    document.getElementById('form-book-shipment')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const carrierSelect = document.getElementById('book-carrier');
      const carrierName = carrierSelect.options[carrierSelect.selectedIndex].text.replace(' ▾', '');
      const weight = document.getElementById('book-weight').value;

      const booked = shipments.find(s => s.orderId === 'MD-2026-00317');
      if (booked) {
        booked.tracking = `JT-PH-${Math.floor(100000 + Math.random() * 900000)}`;
        booked.status = 'In transit';
        booked.statusKey = 'transit';
        booked.lastUpdate = 'Just now';
      }

      showToast(`Booked shipment with ${carrierName} (${weight}). Generated waybill #${booked?.tracking}.`);
      renderTable();
    });

    document.getElementById('btn-print-slip')?.addEventListener('click', () => {
      showToast('Generating printable courier packing slip PDF...');
    });

    document.getElementById('btn-view-tracking-ext')?.addEventListener('click', () => {
      showToast('Opening external J&T Express carrier tracking portal...');
    });

    document.getElementById('btn-resolve-exception')?.addEventListener('click', () => {
      const exc = shipments.find(s => s.orderId === 'MD-2026-00310');
      if (exc) {
        exc.status = 'In transit';
        exc.statusKey = 'transit';
        exc.lastUpdate = 'Address updated';
      }
      const badgeExceptions = document.getElementById('metric-exceptions');
      if (badgeExceptions) badgeExceptions.textContent = '0';
      showToast('Delivery address re-verified with customer; carrier re-dispatch requested.');
      renderTable();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    renderTable();
    initHandlers();
  });
})();
