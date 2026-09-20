// Merchant Console: Shipping Zones Controller
// Figma: 550:221 (Light) & 554:869 (Dark)
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

  // Seeded zones matching Figma 550:221
  let zones = [
    {
      id: 'ncr',
      name: 'Metro Manila · NCR',
      fee: 85,
      freeAbove: 2500,
      estimate: '2–3 business days',
      status: 'Active',
      details: 'All NCR cities included'
    },
    {
      id: 'luzon',
      name: 'Luzon · Outside NCR',
      fee: 120,
      freeAbove: 3000,
      estimate: '3–5 business days',
      status: 'Active',
      details: 'North & South Luzon provinces'
    },
    {
      id: 'visayas',
      name: 'Visayas',
      fee: 150,
      freeAbove: 3500,
      estimate: '5–7 business days',
      status: 'Active',
      details: 'Central, Western & Eastern Visayas'
    },
    {
      id: 'mindanao',
      name: 'Mindanao',
      fee: 180,
      freeAbove: 4000,
      estimate: '7–10 business days',
      status: 'Active',
      details: 'Davao, Zamboanga, CDO & all Mindanao regions'
    }
  ];

  let selectedZoneId = 'ncr';

  function renderTable() {
    const tbody = document.getElementById('zones-tbody');
    if (!tbody) return;

    const searchTerm = (document.getElementById('search-zones-input')?.value || '').toLowerCase().trim();
    const statusFilter = document.getElementById('filter-zone-status')?.value || 'all';

    const filtered = zones.filter(z => {
      const matchSearch = !searchTerm ||
        z.name.toLowerCase().includes(searchTerm) ||
        z.id.toLowerCase().includes(searchTerm);
      const matchStatus = statusFilter === 'all' || z.status.toLowerCase() === statusFilter;
      return matchSearch && matchStatus;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 24px; color: var(--color-muted);">No shipping zones matching criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(z => {
      const isSelected = z.id === selectedZoneId;
      return `
        <tr data-zone-id="${z.id}" style="cursor: pointer; ${isSelected ? 'background-color: var(--color-info-bg);' : ''}">
          <td class="td-strong">${escapeHtml(z.name)}</td>
          <td class="td-mono" style="font-weight: 600;">&#8369;${z.fee}</td>
          <td class="td-mono">&#8369;${z.freeAbove.toLocaleString()}</td>
          <td class="td-muted">${escapeHtml(z.estimate)}</td>
          <td>
            <span class="status-pill active">${escapeHtml(z.status)}</span>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('tr[data-zone-id]').forEach(row => {
      row.addEventListener('click', () => {
        const id = row.getAttribute('data-zone-id');
        selectZone(id);
      });
    });
  }

  function selectZone(id) {
    selectedZoneId = id;
    const z = zones.find(item => item.id === id);
    if (!z) return;

    const headerEl = document.querySelector('#card-edit-zone .panel-title');
    const selectEl = document.getElementById('edit-zone-coverage');
    const feeInput = document.getElementById('edit-zone-fee');
    const freeInput = document.getElementById('edit-zone-free');
    const estInput = document.getElementById('edit-zone-estimate');
    const statusEl = document.getElementById('edit-zone-status-text');

    if (headerEl) headerEl.textContent = `Edit ${z.name}`;
    if (selectEl) selectEl.value = z.id;
    if (feeInput) feeInput.value = z.fee;
    if (freeInput) freeInput.value = z.freeAbove;
    if (estInput) estInput.value = z.estimate;
    if (statusEl) statusEl.textContent = `Status: ${z.status} · ${z.details}`;

    renderTable();
  }

  function initHandlers() {
    document.getElementById('search-zones-input')?.addEventListener('input', renderTable);
    document.getElementById('filter-zone-status')?.addEventListener('change', renderTable);

    document.getElementById('edit-zone-coverage')?.addEventListener('change', (e) => {
      selectZone(e.target.value);
    });

    document.getElementById('btn-add-zone-top')?.addEventListener('click', () => {
      const card = document.getElementById('card-edit-zone');
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        document.getElementById('edit-zone-fee')?.focus();
      }
    });

    document.getElementById('btn-cancel-zone')?.addEventListener('click', () => {
      selectZone(selectedZoneId);
      showToast('Restored zone rates.');
    });

    document.getElementById('form-edit-zone')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const z = zones.find(item => item.id === selectedZoneId);
      if (!z) return;

      const fee = parseInt(document.getElementById('edit-zone-fee')?.value || '0', 10);
      const freeAbove = parseInt(document.getElementById('edit-zone-free')?.value || '0', 10);
      const estimate = document.getElementById('edit-zone-estimate')?.value.trim();

      z.fee = fee;
      z.freeAbove = freeAbove;
      z.estimate = estimate;

      if (z.id === 'ncr') {
        const ncrEl = document.getElementById('metric-ncr-rate');
        if (ncrEl) ncrEl.textContent = `₱${fee}`;
      }

      showToast(`Saved shipping settings for ${z.name}. Standard fee updated to ₱${fee}.`);
      renderTable();
    });

    // Check an address form
    document.getElementById('form-check-address')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const city = (document.getElementById('calc-city')?.value || '').toLowerCase();
      const postal = parseInt(document.getElementById('calc-postal')?.value || '0', 10);
      const subtotal = parseInt(document.getElementById('calc-subtotal')?.value || '0', 10);

      const resultBox = document.getElementById('calc-result-box');
      const titleEl = document.getElementById('calc-result-title');
      const subEl = document.getElementById('calc-result-sub');

      let matchedZone = null;
      if (city.includes('manila') || city.includes('quezon') || city.includes('makati') || city.includes('pasig') || city.includes('taguig') || (postal >= 1000 && postal <= 1499)) {
        matchedZone = zones.find(z => z.id === 'ncr');
      } else if (postal >= 1500 && postal <= 4999) {
        matchedZone = zones.find(z => z.id === 'luzon');
      } else if (postal >= 5000 && postal <= 6999) {
        matchedZone = zones.find(z => z.id === 'visayas');
      } else if (postal >= 7000 && postal <= 9999) {
        matchedZone = zones.find(z => z.id === 'mindanao');
      }

      if (matchedZone) {
        resultBox.className = 'eligibility-result-pill eligible';
        const isFree = subtotal >= matchedZone.freeAbove;
        const feeText = isFree ? 'Free shipping (Threshold reached)' : `Shipping fee: ₱${matchedZone.fee}`;
        titleEl.textContent = `Eligible · ${matchedZone.name}`;
        subEl.textContent = `${feeText} · Estimated delivery: ${matchedZone.estimate}`;
        showToast(`Address is eligible under ${matchedZone.name}.`);
      } else {
        resultBox.className = 'eligibility-result-pill ineligible';
        titleEl.textContent = 'Uncovered area · Blocked';
        subEl.textContent = 'Courier delivery is currently not configured for this postal code.';
        showToast('Area is currently blocked.', 'error');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    selectZone(selectedZoneId);
    initHandlers();
  });
})();
