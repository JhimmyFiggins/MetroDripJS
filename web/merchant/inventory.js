// Merchant Console: Inventory Controller
// Figma: 550:26 (Light) & 554:303 (Dark)
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

  // Seeded inventory matching Figma 550:26
  let inventory = [
    {
      id: 1,
      name: 'Drip Zip-Up Hoodie',
      variant: 'Black / M',
      sku: 'MD-HD-002-BLK-M-OVS',
      category: 'tops',
      onHand: 5,
      reserved: 2,
      min: 10,
      status: 'Low stock · min 10'
    },
    {
      id: 2,
      name: 'Metro Snapback',
      variant: 'Black',
      sku: 'MD-CP-001-BLK-OS',
      category: 'headwear',
      onHand: 4,
      reserved: 1,
      min: 8,
      status: 'Low stock · min 8'
    },
    {
      id: 3,
      name: 'Skyline Pullover',
      variant: 'Gray / L',
      sku: 'MD-HD-003-GRY-L-OVS',
      category: 'tops',
      onHand: 2,
      reserved: 0,
      min: 10,
      status: 'Low stock · min 10'
    },
    {
      id: 4,
      name: 'Boxy Tee',
      variant: 'White / L',
      sku: 'MD-TS-001-WHT-L-REG',
      category: 'tops',
      onHand: 6,
      reserved: 2,
      min: 12,
      status: 'Low stock · min 12'
    },
    {
      id: 5,
      name: 'Cargo Pants',
      variant: 'Olive / 32',
      sku: 'MD-PT-002-OLV-32',
      category: 'bottoms',
      onHand: 0,
      reserved: 0,
      min: 8,
      status: 'Out of stock'
    }
  ];

  let selectedSkuId = 1;

  function populateSelect() {
    const select = document.getElementById('adjust-product-select');
    if (!select) return;
    select.innerHTML = inventory.map(item => `
      <option value="${item.id}" ${item.id === selectedSkuId ? 'selected' : ''}>
        ${escapeHtml(item.name)} · ${escapeHtml(item.variant)}
      </option>
    `).join('');
  }

  function renderTable() {
    const tbody = document.getElementById('inventory-tbody');
    if (!tbody) return;

    const searchTerm = (document.getElementById('search-inventory-input')?.value || '').toLowerCase().trim();
    const stockFilter = document.getElementById('filter-stock-select')?.value || 'all';
    const catFilter = document.getElementById('filter-category-select')?.value || 'all';

    const filtered = inventory.filter(item => {
      const matchSearch = !searchTerm ||
        item.name.toLowerCase().includes(searchTerm) ||
        item.sku.toLowerCase().includes(searchTerm);
      const matchCat = catFilter === 'all' || item.category === catFilter;
      let matchStock = true;
      if (stockFilter === 'low') matchStock = item.onHand > 0 && item.onHand < item.min;
      if (stockFilter === 'out') matchStock = item.onHand === 0;
      if (stockFilter === 'normal') matchStock = item.onHand >= item.min;
      return matchSearch && matchCat && matchStock;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 24px; color: var(--color-muted);">No inventory matching criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(item => {
      const isSelected = item.id === selectedSkuId;
      const available = Math.max(0, item.onHand - item.reserved);
      const isAlert = item.onHand < item.min;
      return `
        <tr data-sku-id="${item.id}" style="cursor: pointer; ${isSelected ? 'background-color: var(--color-info-bg);' : ''}">
          <td>
            <div style="display: flex; flex-direction: column;">
              <span class="td-strong">${escapeHtml(item.name)} · ${escapeHtml(item.variant)}</span>
              <span class="td-mono td-muted" style="font-size: 11px;">${escapeHtml(item.sku)}</span>
            </div>
          </td>
          <td class="td-mono" style="${isAlert ? 'color: var(--color-danger); font-weight: 700;' : ''}">${item.onHand}</td>
          <td class="td-mono td-muted">${item.reserved}</td>
          <td class="td-mono" style="font-weight: 600;">${available}</td>
          <td>
            <span class="td-mono" style="color: var(--color-danger); font-size: 12px; font-weight: 600;">${escapeHtml(item.status)}</span>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('tr[data-sku-id]').forEach(row => {
      row.addEventListener('click', () => {
        const id = parseInt(row.getAttribute('data-sku-id'), 10);
        selectItem(id);
      });
    });

    updateMetrics();
  }

  function selectItem(id) {
    selectedSkuId = id;
    const item = inventory.find(i => i.id === id);
    if (!item) return;

    const select = document.getElementById('adjust-product-select');
    if (select) select.value = item.id;

    updateCalculationPreview();
    renderTable();
  }

  function updateCalculationPreview() {
    const item = inventory.find(i => i.id === selectedSkuId);
    if (!item) return;

    const adjustInput = document.getElementById('adjust-amount');
    const delta = parseInt(adjustInput?.value || '0', 10);
    const newOnHand = Math.max(0, item.onHand + delta);
    const newAvailable = Math.max(0, newOnHand - item.reserved);

    const previewEl = document.getElementById('adjust-calculation-preview');
    if (previewEl) {
      previewEl.textContent = `On hand: ${item.onHand} → ${newOnHand} · Reserved: ${item.reserved} · Available: ${newAvailable}`;
    }
  }

  function updateMetrics() {
    const lowCount = inventory.filter(i => i.onHand > 0 && i.onHand < i.min).length;
    const outCount = inventory.filter(i => i.onHand === 0).length;

    const lowEl = document.getElementById('metric-low-stock');
    const outEl = document.getElementById('metric-out-stock');
    if (lowEl) lowEl.textContent = lowCount;
    if (outEl) outEl.textContent = outCount;
  }

  function addMovement(delta, reason, productName) {
    const list = document.getElementById('movements-list');
    if (!list) return;

    const isPositive = delta >= 0;
    const sign = isPositive ? `+${delta}` : `${delta}`;
    const color = isPositive ? 'var(--color-ink)' : 'var(--color-danger)';

    const itemHtml = `
      <div class="movement-item" style="border-bottom: 1px solid var(--color-border); padding-bottom: 10px;">
        <p style="font-weight: 700; font-size: 13px; color: ${color};">${sign} · ${escapeHtml(reason)}</p>
        <p class="td-muted" style="font-size: 12px; margin-top: 2px;">${escapeHtml(productName)} · Just now</p>
      </div>
    `;
    list.insertAdjacentHTML('afterbegin', itemHtml);
  }

  function initHandlers() {
    document.getElementById('search-inventory-input')?.addEventListener('input', renderTable);
    document.getElementById('filter-stock-select')?.addEventListener('change', renderTable);
    document.getElementById('filter-category-select')?.addEventListener('change', renderTable);

    document.getElementById('adjust-product-select')?.addEventListener('change', (e) => {
      selectItem(parseInt(e.target.value, 10));
    });

    document.getElementById('adjust-amount')?.addEventListener('input', updateCalculationPreview);

    document.getElementById('btn-open-adjust-stock')?.addEventListener('click', () => {
      const card = document.getElementById('card-adjust-stock');
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        document.getElementById('adjust-amount')?.focus();
      }
    });

    document.getElementById('btn-cancel-adjustment')?.addEventListener('click', () => {
      document.getElementById('adjust-amount').value = '25';
      updateCalculationPreview();
    });

    document.getElementById('form-adjust-stock')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const item = inventory.find(i => i.id === selectedSkuId);
      if (!item) return;

      const delta = parseInt(document.getElementById('adjust-amount')?.value || '0', 10);
      const reasonSelect = document.getElementById('adjust-reason');
      const reasonText = reasonSelect.options[reasonSelect.selectedIndex].text.replace(' ▾', '');

      item.onHand = Math.max(0, item.onHand + delta);
      if (item.onHand === 0) {
        item.status = 'Out of stock';
      } else if (item.onHand < item.min) {
        item.status = `Low stock · min ${item.min}`;
      } else {
        item.status = 'In stock';
      }

      addMovement(delta, reasonText, item.name);
      showToast(`Adjusted ${item.name} (${item.variant}) by ${delta > 0 ? '+' : ''}${delta}. New on-hand: ${item.onHand}`);
      updateCalculationPreview();
      renderTable();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    populateSelect();
    selectItem(selectedSkuId);
    initHandlers();
  });
})();
