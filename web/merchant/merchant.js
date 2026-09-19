// Merchant Console Controller
// Interacts with /api/merchant/ endpoints with graceful fallback to seeded Figma state.
(() => {
  const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:8000/api/merchant'
    : '/api/merchant';

  // --- Utility: HTML-safe text helper (XSS prevention) ---
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
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

  // --- Track currently open modal for Escape key ---
  let activeModal = null;

  function setActiveModal(modal) {
    activeModal = modal;
  }

  function clearActiveModal() {
    activeModal = null;
  }

  // --- ESCAPE KEY HANDLER (BUG-02 fix) ---
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && activeModal && !activeModal.hidden) {
      activeModal.hidden = true;
      clearActiveModal();
    }
  });

  // --- 1. RESTOCK MODAL (Dashboard & Inventory) ---
  const modalRestock = document.getElementById('modal-restock');
  const btnCloseRestock = document.getElementById('btn-close-restock');
  const btnCancelRestock = document.getElementById('btn-cancel-restock');
  const formRestock = document.getElementById('form-restock');

  function openRestockModal(productName, variantCode, sku) {
    if (!modalRestock) return;
    document.getElementById('restock-product-name').value = productName;
    document.getElementById('restock-variant-code').value = `${variantCode} (${sku})`;
    document.getElementById('restock-sku-hidden').value = sku;
    modalRestock.hidden = false;
    setActiveModal(modalRestock);
    document.getElementById('restock-quantity')?.focus();
  }

  function closeRestockModal() {
    if (modalRestock) modalRestock.hidden = true;
    formRestock?.reset();
    clearActiveModal();
  }

  btnCloseRestock?.addEventListener('click', closeRestockModal);
  btnCancelRestock?.addEventListener('click', closeRestockModal);
  modalRestock?.addEventListener('click', (e) => {
    if (e.target === modalRestock) closeRestockModal();
  });

  // Use event delegation for restock buttons (fixes dynamically added rows)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-open-restock');
    if (!btn) return;
    openRestockModal(btn.dataset.product, btn.dataset.variant, btn.dataset.sku);
  });

  formRestock?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const sku = document.getElementById('restock-sku-hidden').value;
    const qtyInput = document.getElementById('restock-quantity');
    const qty = parseInt(qtyInput.value, 10);
    const reason = document.getElementById('restock-reason').value;

    // Validation: quantity must be a positive integer
    if (!qty || qty < 1) {
      showToast('Quantity must be at least 1.', 'error');
      qtyInput?.focus();
      return;
    }

    if (qty > 1000) {
      showToast('Quantity cannot exceed 1,000 per transaction.', 'error');
      qtyInput?.focus();
      return;
    }

    try {
      await fetch(`${API_BASE}/inventory/restock/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, quantity: qty, reason }),
      });
    } catch {
      // Offline fallback
    }

    // Update UI table row stock if on Dashboard
    const row = document.querySelector(`tr[data-sku="${CSS.escape(sku)}"]`);
    if (row) {
      const onHandCell = row.children[2];
      const currentVal = parseInt(onHandCell.textContent, 10) || 0;
      const newVal = currentVal + qty;
      onHandCell.textContent = newVal;
      if (newVal >= parseInt(row.children[3]?.textContent, 10) || 10) {
        onHandCell.style.color = 'var(--color-success)';
        onHandCell.style.fontWeight = '600';
      }
    }

    closeRestockModal();
    showToast(`Committed +${qty} units for SKU ${sku}.`);
  });

  // --- 2. CATALOG SEARCH & CATEGORY FILTERING ---
  const searchInput = document.getElementById('input-catalog-search');
  const categoryTabs = document.querySelectorAll('.category-tab-btn');

  // BUG-06 fix: use a live function to query product rows instead of a stale NodeList
  function getProductRows() {
    return document.querySelectorAll('#products-tbody tr');
  }

  function applyProductFilters() {
    const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const activeTab = document.querySelector('.category-tab-btn.is-active');
    const category = activeTab ? activeTab.dataset.category : 'all';

    const productRows = getProductRows();
    let matchCount = 0;
    productRows.forEach((row) => {
      const text = row.textContent.toLowerCase();
      const rowCategory = row.dataset.category || '';
      const rowStatus = row.dataset.status || '';

      const matchesSearch = !query || text.includes(query);
      let matchesCategory = true;
      if (category === 'inactive') {
        matchesCategory = rowStatus === 'inactive';
      } else if (category !== 'all') {
        matchesCategory = rowCategory === category;
      }

      if (matchesSearch && matchesCategory) {
        row.style.display = '';
        matchCount++;
      } else {
        row.style.display = 'none';
      }
    });

    // Update summary subhead with filtered count
    const subhead = document.getElementById('catalog-summary-subhead');
    if (subhead && (query || category !== 'all')) {
      subhead.textContent = `${matchCount} PRODUCT${matchCount !== 1 ? 'S' : ''} SHOWN · FILTERED`;
    } else if (subhead && !query && category === 'all') {
      const totalRows = getProductRows().length;
      subhead.textContent = `${totalRows} ACTIVE PRODUCTS · 3 MAIN CATEGORIES · 9 SUBCATEGORIES`;
    }
  }

  searchInput?.addEventListener('input', applyProductFilters);

  categoryTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      categoryTabs.forEach((t) => {
        t.classList.remove('is-active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('is-active');
      tab.setAttribute('aria-selected', 'true');
      applyProductFilters();
    });
  });

  // --- 3. REVIEW MODERATION QUEUE (via event delegation) ---
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-moderate-review');
    if (!btn) return;

    const reviewId = btn.dataset.reviewId;
    const action = btn.dataset.action; // 'approved' or 'rejected'
    const row = btn.closest('tr');

    // Disable both buttons to prevent double-click
    const siblingBtns = row?.querySelectorAll('.btn-moderate-review');
    siblingBtns?.forEach((b) => { b.disabled = true; });

    try {
      await fetch(`${API_BASE}/reviews/${reviewId}/moderate/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action }),
      });
    } catch {
      // Offline fallback
    }

    if (row) {
      const actionCell = row.children[3];
      const isApproved = action === 'approved';
      actionCell.innerHTML = `
        <span class="status-pill ${isApproved ? 'active' : 'suspended'}">
          ${isApproved ? 'Approved' : 'Rejected'}
        </span>
      `;
    }

    // Update badge
    const badge = document.getElementById('badge-reviews');
    if (badge) {
      const currentCount = parseInt(badge.textContent, 10) || 0;
      const newCount = Math.max(0, currentCount - 1);
      badge.textContent = newCount;
      if (newCount === 0) badge.style.display = 'none';
    }

    showToast(`Review #${reviewId} marked as ${action}.`);
  });

  // --- 4. ADD PRODUCT MODAL ---
  const modalAddProd = document.getElementById('modal-add-product');
  const btnOpenAddProd = document.getElementById('btn-open-add-product') || document.getElementById('btn-merchant-add-product');
  const btnCloseAddProd = document.getElementById('btn-close-product-modal');
  const btnCancelAddProd = document.getElementById('btn-cancel-product-modal');
  const formAddProd = document.getElementById('form-add-product');

  // BUG-08 fix: Only one code path per button
  if (btnOpenAddProd && !modalAddProd) {
    // Dashboard page — no modal here, navigate to catalog
    btnOpenAddProd.addEventListener('click', () => {
      window.location.href = 'catalog.html#add-product';
    });
  } else if (btnOpenAddProd && modalAddProd) {
    // Catalog page — open the modal
    btnOpenAddProd.addEventListener('click', openAddProductModal);
  }

  function openAddProductModal() {
    if (modalAddProd) {
      modalAddProd.hidden = false;
      setActiveModal(modalAddProd);
      document.getElementById('add-prod-name')?.focus();
    }
  }

  function closeAddProductModal() {
    if (modalAddProd) modalAddProd.hidden = true;
    formAddProd?.reset();
    clearActiveModal();
    // Return focus to trigger button
    btnOpenAddProd?.focus();
  }

  btnCloseAddProd?.addEventListener('click', closeAddProductModal);
  btnCancelAddProd?.addEventListener('click', closeAddProductModal);
  modalAddProd?.addEventListener('click', (e) => {
    if (e.target === modalAddProd) closeAddProductModal();
  });

  formAddProd?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(formAddProd);
    const name = formData.get('name').trim();
    const category = formData.get('category');
    const price = formData.get('price');
    const stock = formData.get('stock');
    const sku = formData.get('sku').trim();
    const description = formData.get('description');

    // Validation
    if (!name) {
      showToast('Product name is required.', 'error');
      return;
    }
    if (!sku) {
      showToast('SKU is required.', 'error');
      return;
    }
    if (!price || parseInt(price, 10) <= 0) {
      showToast('Price must be greater than zero.', 'error');
      return;
    }

    try {
      await fetch(`${API_BASE}/products/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category, price, stock, sku, description }),
      });
    } catch {
      // Offline fallback
    }

    const tbody = document.getElementById('products-tbody');
    if (tbody) {
      const tr = document.createElement('tr');
      const catLower = category.toLowerCase().includes('tops') ? 'tops' : category.toLowerCase().includes('bottoms') ? 'bottoms' : 'accessories';
      tr.dataset.category = catLower;
      tr.dataset.status = 'active';
      const safeName = escapeHtml(name);
      const safeCat = escapeHtml(category);
      const safeSku = escapeHtml(sku);
      const initial = name.charAt(0).toUpperCase();
      tr.innerHTML = `
        <td><div class="product-thumb-letter" aria-hidden="true">${escapeHtml(initial)}</div></td>
        <td class="td-strong">${safeName}</td>
        <td class="td-mono td-muted">${safeCat}</td>
        <td class="td-mono">1</td>
        <td class="td-mono td-strong">${escapeHtml(stock)}</td>
        <td class="td-mono td-strong">₱${parseInt(price, 10).toLocaleString()}</td>
        <td><span class="status-pill active">Active</span></td>
        <td><button type="button" class="btn btn-secondary btn-sm btn-edit-product" data-product-name="${safeName}">Edit</button></td>
      `;
      tbody.prepend(tr);
    }

    closeAddProductModal();
    showToast(`Published product "${name}" (SKU: ${sku}).`);
  });

  // Check URL hash for direct triggers (e.g. #add-product)
  if (window.location.hash === '#add-product') {
    // Slight delay so DOM is ready
    setTimeout(() => openAddProductModal(), 100);
  }

  // --- 5. EDIT PRODUCT BUTTONS (BUG-03 fix) ---
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-edit-product');
    if (!btn) return;

    const row = btn.closest('tr');
    const productName = row?.querySelector('.td-strong')?.textContent || 'Product';

    showToast(`Editing "${productName}" — this feature will be available in the next release.`, 'error');
  });

  // --- 6. MANAGE CATEGORIES BUTTON (BUG-04 fix) ---
  const btnManageCats = document.getElementById('btn-manage-categories');
  btnManageCats?.addEventListener('click', () => {
    showToast('Category management will be available in the next release.', 'error');
  });

  // --- 7. EXPORT CSV (Merchant Dashboard) ---
  const btnExport = document.getElementById('btn-merchant-export-csv');
  btnExport?.addEventListener('click', () => {
    // On catalog page, export product table data
    const productsTbody = document.getElementById('products-tbody');
    if (productsTbody) {
      const rows = Array.from(productsTbody.querySelectorAll('tr'))
        .filter((r) => r.style.display !== 'none')
        .map((r) => {
          const cells = r.querySelectorAll('td');
          return [
            `"${cells[1]?.textContent.trim() || ''}"`,  // Product
            `"${cells[2]?.textContent.trim() || ''}"`,  // Category
            cells[3]?.textContent.trim() || '',           // Variants
            cells[4]?.textContent.trim() || '',           // Stock
            `"${cells[5]?.textContent.trim() || ''}"`,  // Price
            `"${cells[6]?.textContent.trim() || ''}"`,  // Status
          ].join(',');
        });
      const csvContent = ['Product,Category,Variants,Stock,Price,Status', ...rows].join('\n');
      downloadCsv(csvContent, 'metrodrip_products');
      showToast('Exported product catalog to CSV.');
      return;
    }

    // On dashboard page, export orders table data
    const ordersData = [
      ['Order ID', 'Customer', 'Total', 'Payment', 'Status'],
      ['MD-2026-00318', 'Juan Dela Cruz', '2632', 'GCASH', 'Paid'],
      ['MD-2026-00317', 'Bea Santos', '1249', 'MAYA', 'Packed'],
      ['MD-2026-00316', 'Miguel Reyes', '3447', 'CARD', 'Shipped'],
      ['MD-2026-00315', 'Aliyah Cruz', '849', 'GCASH', 'Pending'],
      ['MD-2026-00314', 'Marco Lim', '1798', 'GCASH', 'Paid'],
    ];
    const csvContent = ordersData.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    downloadCsv(csvContent, 'metrodrip_merchant_orders');
    showToast('Exported recent orders to CSV.');
  });

  function downloadCsv(csvContent, filenamePrefix) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filenamePrefix}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // --- 8. NAVIGATION ACTIVE STATE (for sidebar links) ---
  document.querySelectorAll('.nav-item[data-nav]').forEach((item) => {
    item.addEventListener('click', (e) => {
      document.querySelectorAll('.nav-item').forEach((nav) => nav.classList.remove('is-active'));
      item.classList.add('is-active');
    });
  });
})();
