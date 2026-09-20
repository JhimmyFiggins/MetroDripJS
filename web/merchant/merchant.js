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

  // --- 3. CUSTOMER REVIEWS: VIEW & REPLY (Figma 58:2 / 58:467) ---
  const modalViewReview = document.getElementById('modal-view-review');
  const btnCloseViewReview = document.getElementById('btn-close-view-review');
  const btnCloseViewReviewFooter = document.getElementById('btn-close-view-review-footer');
  const btnReplyFromView = document.getElementById('btn-reply-from-view');

  const modalReplyReview = document.getElementById('modal-reply-review');
  const btnCloseReplyReview = document.getElementById('btn-close-reply-review');
  const btnCancelReplyReview = document.getElementById('btn-cancel-reply-review');
  const formReplyReview = document.getElementById('form-reply-review');

  let currentViewingReview = null;

  // Local review cache initialized with default seeded reviews
  const reviewCache = {
    '1': {
      id: 1,
      customer_name: 'Bea S.',
      product_name: 'Drip Zip-Up Hoodie',
      rating: 5,
      rating_stars: '★★★★★',
      body: 'Super lapad ng fit, ang angas ng tela! Perfect for streetwear layering.',
      date: 'Verified Customer · Sep 19, 2026',
      merchant_reply: '',
      replied_at: null,
    },
    '2': {
      id: 2,
      customer_name: 'Marco L.',
      product_name: 'Metro Snapback',
      rating: 3,
      rating_stars: '★★★☆☆',
      body: 'Color is slightly off from photo. The cap is good quality though.',
      date: 'Verified Customer · Sep 19, 2026',
      merchant_reply: '',
      replied_at: null,
    },
  };

  async function openViewReviewModal(reviewId) {
    if (!modalViewReview) return;
    let review = reviewCache[reviewId];

    try {
      const res = await fetch(`${API_BASE}/reviews/${reviewId}/`);
      if (res.ok) {
        const data = await res.json();
        review = {
          ...review,
          ...data,
        };
        reviewCache[reviewId] = review;
      }
    } catch {
      // Use cached/seeded review
    }

    if (!review) return;
    currentViewingReview = review;

    const elAvatar = document.getElementById('view-review-avatar');
    const elCustomer = document.getElementById('view-review-customer');
    const elDate = document.getElementById('view-review-date');
    const elStars = document.getElementById('view-review-stars');
    const elProduct = document.getElementById('view-review-product');
    const elBody = document.getElementById('view-review-body');
    const replyContainer = document.getElementById('view-review-reply-container');
    const replyText = document.getElementById('view-review-reply-text');
    const replyDate = document.getElementById('view-review-reply-date');

    const initials = (review.customer_name || 'C')
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    if (elAvatar) elAvatar.textContent = initials;
    if (elCustomer) elCustomer.textContent = review.customer_name || review.customer;
    if (elDate) elDate.textContent = review.created_at ? `Verified Customer · ${review.created_at}` : 'Verified Customer · Sep 19, 2026';
    if (elStars) elStars.textContent = review.rating_stars || '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
    if (elProduct) elProduct.textContent = review.product_name;
    if (elBody) elBody.textContent = `“${review.body}”`;

    if (review.merchant_reply) {
      if (replyContainer) replyContainer.style.display = 'block';
      if (replyText) replyText.textContent = review.merchant_reply;
      if (replyDate) replyDate.textContent = review.replied_at ? `Replied ${review.replied_at}` : 'Replied recently';
      if (btnReplyFromView) btnReplyFromView.textContent = 'Edit reply';
    } else {
      if (replyContainer) replyContainer.style.display = 'none';
      if (btnReplyFromView) btnReplyFromView.textContent = 'Reply to review';
    }

    modalViewReview.hidden = false;
    setActiveModal(modalViewReview);
  }

  function closeViewReviewModal() {
    if (modalViewReview) modalViewReview.hidden = true;
    currentViewingReview = null;
    clearActiveModal();
  }

  function openReplyReviewModal(reviewId) {
    if (!modalReplyReview) return;
    const review = reviewCache[reviewId] || currentViewingReview;
    if (!review) return;

    // Close view modal if open
    if (modalViewReview && !modalViewReview.hidden) {
      modalViewReview.hidden = true;
    }

    document.getElementById('reply-review-id').value = review.id;
    document.getElementById('reply-customer-name').textContent = review.customer_name || review.customer;
    document.getElementById('reply-product-name').textContent = review.product_name;

    const textarea = document.getElementById('reply-textarea');
    if (textarea) {
      textarea.value = review.merchant_reply || '';
      setTimeout(() => textarea.focus(), 50);
    }

    modalReplyReview.hidden = false;
    setActiveModal(modalReplyReview);
  }

  function closeReplyReviewModal() {
    if (modalReplyReview) modalReplyReview.hidden = true;
    formReplyReview?.reset();
    clearActiveModal();
  }

  btnCloseViewReview?.addEventListener('click', closeViewReviewModal);
  btnCloseViewReviewFooter?.addEventListener('click', closeViewReviewModal);
  modalViewReview?.addEventListener('click', (e) => {
    if (e.target === modalViewReview) closeViewReviewModal();
  });

  btnReplyFromView?.addEventListener('click', () => {
    if (currentViewingReview) {
      openReplyReviewModal(currentViewingReview.id);
    }
  });

  btnCloseReplyReview?.addEventListener('click', closeReplyReviewModal);
  btnCancelReplyReview?.addEventListener('click', closeReplyReviewModal);
  modalReplyReview?.addEventListener('click', (e) => {
    if (e.target === modalReplyReview) closeReplyReviewModal();
  });

  // Event delegation for View and Reply buttons on the reviews table
  document.addEventListener('click', (e) => {
    const btnView = e.target.closest('.btn-view-review');
    if (btnView) {
      openViewReviewModal(btnView.dataset.reviewId);
      return;
    }

    const btnReply = e.target.closest('.btn-reply-review');
    if (btnReply) {
      openReplyReviewModal(btnReply.dataset.reviewId);
      return;
    }
  });

  // Handle Reply Form Submission
  formReplyReview?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const reviewId = document.getElementById('reply-review-id').value;
    const textarea = document.getElementById('reply-textarea');
    const reply = textarea.value.trim();

    if (!reply) {
      showToast('Reply text cannot be empty.', 'error');
      return;
    }

    const review = reviewCache[reviewId] || {};
    const customerName = review.customer_name || review.customer || 'Customer';

    try {
      const res = await fetch(`${API_BASE}/reviews/${reviewId}/reply/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply }),
      });
      if (res.ok) {
        const data = await res.json();
        review.merchant_reply = data.merchant_reply || reply;
        review.replied_at = data.replied_at || new Date().toISOString();
      } else {
        review.merchant_reply = reply;
        review.replied_at = new Date().toISOString();
      }
    } catch {
      // Offline fallback
      review.merchant_reply = reply;
      review.replied_at = new Date().toISOString();
    }

    reviewCache[reviewId] = review;

    // Update row button visually to show "Replied" state indicator
    const row = document.querySelector(`tr[data-review-id="${reviewId}"]`);
    if (row) {
      const replyBtn = row.querySelector('.btn-reply-review');
      if (replyBtn) {
        replyBtn.textContent = 'Edit reply';
      }
    }

    closeReplyReviewModal();
    showToast(`Reply sent to ${customerName}.`);
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

  // --- 5. EDIT PRODUCT MODAL & CONTROLLER ---
  const modalEditProd = document.getElementById('modal-edit-product');
  const btnCloseEditProd = document.getElementById('btn-close-edit-product');
  const btnCancelEditProd = document.getElementById('btn-cancel-edit-product');
  const formEditProd = document.getElementById('form-edit-product');
  let currentEditingRow = null;

  async function openEditProductModal(row) {
    if (!modalEditProd) return;
    currentEditingRow = row;
    const productId = row.dataset.productId || row.getAttribute('data-product-id') || '1';
    const cells = row.querySelectorAll('td');

    const name = cells[1]?.textContent.trim() || '';
    const category = cells[2]?.textContent.trim() || 'Tops › Hoodies';
    const stock = cells[4]?.textContent.trim() || '20';
    const priceRaw = cells[5]?.textContent.trim().replace(/[^0-9]/g, '') || '649';
    const statusText = (cells[6]?.textContent.trim() || 'Active').toLowerCase();

    document.getElementById('edit-prod-id').value = productId;
    document.getElementById('edit-prod-name').value = name;
    document.getElementById('edit-prod-category').value = category;
    document.getElementById('edit-prod-price').value = priceRaw;
    document.getElementById('edit-prod-stock').value = stock;
    document.getElementById('edit-prod-sku').value = `MD-PRD-00${productId}`;
    document.getElementById('edit-prod-status').value = statusText.includes('inactive') ? 'inactive' : 'active';

    // Try fetching fresh data from backend if available
    try {
      const res = await fetch(`${API_BASE}/products/${productId}/`);
      if (res.ok) {
        const data = await res.json();
        document.getElementById('edit-prod-name').value = data.name;
        document.getElementById('edit-prod-price').value = data.price;
        document.getElementById('edit-prod-stock').value = data.stock;
        document.getElementById('edit-prod-sku').value = data.sku;
        document.getElementById('edit-prod-status').value = data.is_active ? 'active' : 'inactive';
        if (data.description) {
          const descEl = document.getElementById('edit-prod-desc');
          if (descEl) descEl.value = data.description;
        }
      }
    } catch {
      // Offline fallback: seeded table values used
    }

    modalEditProd.hidden = false;
    setActiveModal(modalEditProd);
    document.getElementById('edit-prod-name')?.focus();
  }

  function closeEditProductModal() {
    if (modalEditProd) modalEditProd.hidden = true;
    formEditProd?.reset();
    currentEditingRow = null;
    clearActiveModal();
  }

  btnCloseEditProd?.addEventListener('click', closeEditProductModal);
  btnCancelEditProd?.addEventListener('click', closeEditProductModal);
  modalEditProd?.addEventListener('click', (e) => {
    if (e.target === modalEditProd) closeEditProductModal();
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-edit-product');
    if (!btn) return;
    const row = btn.closest('tr');
    if (row) openEditProductModal(row);
  });

  formEditProd?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const productId = document.getElementById('edit-prod-id').value;
    const name = document.getElementById('edit-prod-name').value.trim();
    const category = document.getElementById('edit-prod-category').value;
    const price = parseInt(document.getElementById('edit-prod-price').value, 10);
    const stock = parseInt(document.getElementById('edit-prod-stock').value, 10);
    const sku = document.getElementById('edit-prod-sku').value.trim();
    const statusVal = document.getElementById('edit-prod-status').value;
    const desc = document.getElementById('edit-prod-desc')?.value || '';

    if (!name || isNaN(price) || price <= 0 || isNaN(stock) || stock < 0) {
      showToast('Please enter valid product details.', 'error');
      return;
    }

    try {
      await fetch(`${API_BASE}/products/${productId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          category,
          price,
          stock,
          sku,
          is_active: statusVal === 'active',
          description: desc,
        }),
      });
    } catch {
      // Offline fallback
    }

    if (currentEditingRow) {
      const cells = currentEditingRow.querySelectorAll('td');
      if (cells[1]) cells[1].textContent = name;
      if (cells[2]) cells[2].textContent = category;
      if (cells[4]) {
        cells[4].textContent = stock;
        cells[4].style.color = stock <= 5 ? 'var(--color-danger)' : 'var(--color-ink)';
      }
      if (cells[5]) cells[5].textContent = `₱${price.toLocaleString()}`;
      if (cells[6]) {
        const isActive = statusVal === 'active';
        cells[6].innerHTML = `<span class="status-pill ${isActive ? 'active' : 'inactive'}">${isActive ? 'Active' : 'Inactive'}</span>`;
      }
      currentEditingRow.dataset.status = statusVal;
      const catKey = category.toLowerCase().includes('tops') ? 'tops' : category.toLowerCase().includes('bottoms') ? 'bottoms' : 'accessories';
      currentEditingRow.dataset.category = catKey;
    }

    closeEditProductModal();
    showToast(`Saved changes for "${name}".`);
  });

  // --- 6. MANAGE CATEGORIES MODAL & CONTROLLER ---
  const modalManageCats = document.getElementById('modal-manage-categories');
  const btnManageCats = document.getElementById('btn-manage-categories');
  const btnCloseCats = document.getElementById('btn-close-categories');
  const btnCloseCatsFooter = document.getElementById('btn-close-categories-footer');
  const formAddCat = document.getElementById('form-add-category');
  const catListContainer = document.getElementById('categories-list-container');

  async function openManageCategoriesModal() {
    if (!modalManageCats) return;

    try {
      const res = await fetch(`${API_BASE}/categories/`);
      if (res.ok) {
        const categories = await res.json();
        if (catListContainer && categories.length > 0) {
          catListContainer.innerHTML = categories.map((c) => `
            <div class="category-item-row" data-category-id="${c.id}">
              <span class="category-item-name">${escapeHtml(c.name)}</span>
              <span class="category-count-badge">${c.product_count} items</span>
            </div>
          `).join('');
        }
      }
    } catch {
      // Offline fallback: retain pre-rendered categories
    }

    modalManageCats.hidden = false;
    setActiveModal(modalManageCats);
    document.getElementById('new-cat-name')?.focus();
  }

  function closeManageCategoriesModal() {
    if (modalManageCats) modalManageCats.hidden = true;
    formAddCat?.reset();
    clearActiveModal();
  }

  btnManageCats?.addEventListener('click', openManageCategoriesModal);
  btnCloseCats?.addEventListener('click', closeManageCategoriesModal);
  btnCloseCatsFooter?.addEventListener('click', closeManageCategoriesModal);
  modalManageCats?.addEventListener('click', (e) => {
    if (e.target === modalManageCats) closeManageCategoriesModal();
  });

  formAddCat?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.getElementById('new-cat-name');
    const name = input?.value.trim();
    if (!name) return;

    let createdCategory = { id: Date.now(), name, product_count: 0 };
    try {
      const res = await fetch(`${API_BASE}/categories/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        createdCategory = await res.json();
      }
    } catch {
      // Offline fallback
    }

    if (catListContainer) {
      const row = document.createElement('div');
      row.className = 'category-item-row';
      row.dataset.categoryId = createdCategory.id;
      row.innerHTML = `
        <span class="category-item-name">${escapeHtml(createdCategory.name)}</span>
        <span class="category-count-badge">${createdCategory.product_count || 0} items</span>
      `;
      catListContainer.appendChild(row);
      row.scrollIntoView({ behavior: 'smooth' });
    }

    // Add to category select dropdowns
    ['add-prod-category', 'edit-prod-category'].forEach((selId) => {
      const selectEl = document.getElementById(selId);
      if (selectEl) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        selectEl.appendChild(opt);
      }
    });

    input.value = '';
    showToast(`Created category "${name}".`);
  });

  // --- 7. RECENT ORDERS & FULFILLMENT MODAL ---
  const modalOrderDetail = document.getElementById('modal-order-detail');
  const btnCloseOrderDetail = document.getElementById('btn-close-order-detail');
  const btnCloseOrderFooter = document.getElementById('btn-close-order-footer');
  const btnOrderMarkPacked = document.getElementById('btn-order-mark-packed');
  const btnOrderMarkShipped = document.getElementById('btn-order-mark-shipped');
  let currentActiveOrderId = null;

  async function openOrderDetailModal(orderId) {
    if (!modalOrderDetail) return;
    currentActiveOrderId = orderId;

    let orderData = null;
    try {
      const res = await fetch(`${API_BASE}/orders/${orderId}/`);
      if (res.ok) {
        orderData = await res.json();
      }
    } catch {
      // Offline fallback
    }

    if (!orderData) {
      // Default fallback demo data
      const demoOrders = {
        318: { order_no: 'MD-2026-00318', customer: 'Juan Dela Cruz', phone: '+63 917 555 1234', addr: 'Unit 12B Tower 2, One Serendra, Taguig', status: 'Paid', raw_status: 'paid', total: 2632, subtotal: 2547, shipping: 85, pay: 'GCASH' },
        317: { order_no: 'MD-2026-00317', customer: 'Bea Santos', phone: '+63 918 222 3456', addr: '45 Commonwealth Ave, Quezon City', status: 'Packed', raw_status: 'packed', total: 1249, subtotal: 1164, shipping: 85, pay: 'MAYA' },
        316: { order_no: 'MD-2026-00316', customer: 'Miguel Reyes', phone: '+63 920 444 8899', addr: '88 Session Road, Baguio City', status: 'Shipped', raw_status: 'shipped', total: 3447, subtotal: 3327, shipping: 120, pay: 'CARD' },
        315: { order_no: 'MD-2026-00315', customer: 'Aliyah Cruz', phone: '+63 927 888 1122', addr: '24 Real St, Cebu City', status: 'Pending', raw_status: 'pending', total: 849, subtotal: 699, shipping: 150, pay: 'GCASH' },
        314: { order_no: 'MD-2026-00314', customer: 'Marco Lim', phone: '+63 915 777 4433', addr: '77 Abreeza Mall Road, Davao City', status: 'Paid', raw_status: 'paid', total: 1798, subtotal: 1648, shipping: 150, pay: 'GCASH' },
      };
      const demo = demoOrders[orderId] || demoOrders[318];
      orderData = {
        id: orderId,
        order_no: demo.order_no,
        status: demo.status,
        raw_status: demo.raw_status,
        subtotal: demo.subtotal,
        shipping: demo.shipping,
        total: demo.total,
        payment_method: demo.pay,
        created_at: 'Sep 19, 2026 15:42',
        shipping_address: {
          name: demo.customer,
          line1: demo.addr,
          city: 'Metro Manila',
          phone: demo.phone,
        },
        lines: [
          { product_name: 'Drip Zip-Up Hoodie', variant_desc: 'BLK · M · OVS', quantity: 1, unit_price: 1249, total_price: 1249 },
          { product_name: 'Metro Core Boxy Tee', variant_desc: 'WHT · XL · REG', quantity: 2, unit_price: 649, total_price: 1298 },
        ],
      };
    }

    // Populate Modal UI
    document.getElementById('order-detail-no').textContent = orderData.order_no;
    document.getElementById('order-customer-name').textContent = orderData.shipping_address?.name || 'Customer';
    document.getElementById('order-shipping-line1').textContent = orderData.shipping_address?.line1 || 'Delivery address';
    document.getElementById('order-shipping-city').textContent = `${orderData.shipping_address?.city || 'Metro Manila'}, ${orderData.shipping_address?.postal_code || ''}`;
    document.getElementById('order-customer-phone').textContent = orderData.shipping_address?.phone || '';
    document.getElementById('order-payment-method').textContent = orderData.payment_method || 'GCASH';
    document.getElementById('order-created-date').textContent = orderData.created_at || 'Sep 19, 2026';

    const pillEl = document.getElementById('order-detail-status-pill');
    if (pillEl) {
      const statusClass = (orderData.raw_status || orderData.status.toLowerCase());
      pillEl.className = `status-pill ${statusClass}`;
      pillEl.textContent = orderData.status;
    }

    document.getElementById('order-subtotal').textContent = `₱${orderData.subtotal.toLocaleString()}`;
    document.getElementById('order-shipping').textContent = `₱${orderData.shipping.toLocaleString()}`;
    document.getElementById('order-total').textContent = `₱${orderData.total.toLocaleString()}`;

    // Populate line items
    const tbody = document.getElementById('order-items-tbody');
    if (tbody && orderData.lines) {
      tbody.innerHTML = orderData.lines.map((item) => `
        <tr>
          <td class="td-strong">${escapeHtml(item.product_name)}</td>
          <td class="td-mono td-muted">${escapeHtml(item.variant_desc)}</td>
          <td class="td-mono" style="text-align: center;">${item.quantity}</td>
          <td class="td-mono" style="text-align: right;">₱${item.unit_price.toLocaleString()}</td>
          <td class="td-mono td-strong" style="text-align: right;">₱${item.total_price.toLocaleString()}</td>
        </tr>
      `).join('');
    }

    updateFulfillmentButtonStates(orderData.raw_status || orderData.status.toLowerCase());

    modalOrderDetail.hidden = false;
    setActiveModal(modalOrderDetail);
  }

  function updateFulfillmentButtonStates(rawStatus) {
    if (!btnOrderMarkPacked || !btnOrderMarkShipped) return;
    if (rawStatus === 'paid') {
      btnOrderMarkPacked.disabled = false;
      btnOrderMarkPacked.textContent = 'Mark as Packed';
      btnOrderMarkShipped.disabled = false;
      btnOrderMarkShipped.textContent = 'Mark as Shipped';
    } else if (rawStatus === 'packed') {
      btnOrderMarkPacked.disabled = true;
      btnOrderMarkPacked.textContent = '✓ Packed';
      btnOrderMarkShipped.disabled = false;
      btnOrderMarkShipped.textContent = 'Mark as Shipped';
    } else if (rawStatus === 'shipped') {
      btnOrderMarkPacked.disabled = true;
      btnOrderMarkPacked.textContent = '✓ Packed';
      btnOrderMarkShipped.disabled = true;
      btnOrderMarkShipped.textContent = '✓ Shipped';
    } else {
      btnOrderMarkPacked.disabled = false;
      btnOrderMarkShipped.disabled = false;
    }
  }

  async function updateOrderStatus(newStatus) {
    if (!currentActiveOrderId) return;

    try {
      await fetch(`${API_BASE}/orders/${currentActiveOrderId}/status/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch {
      // Offline fallback
    }

    const pillEl = document.getElementById('order-detail-status-pill');
    if (pillEl) {
      pillEl.className = `status-pill ${newStatus}`;
      pillEl.textContent = newStatus.charAt(0).toUpperCase() + newStatus.slice(1);
    }
    updateFulfillmentButtonStates(newStatus);

    // Update table row in Dashboard
    const row = document.querySelector(`tr[data-order-id="${currentActiveOrderId}"]`);
    if (row) {
      const statusCell = row.children[4];
      if (statusCell) {
        statusCell.innerHTML = `<span class="status-pill ${newStatus}">${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}</span>`;
      }
    }

    showToast(`Order #${currentActiveOrderId} status updated to ${newStatus.toUpperCase()}.`);
  }

  btnOrderMarkPacked?.addEventListener('click', () => updateOrderStatus('packed'));
  btnOrderMarkShipped?.addEventListener('click', () => updateOrderStatus('shipped'));

  function closeOrderDetailModal() {
    if (modalOrderDetail) modalOrderDetail.hidden = true;
    currentActiveOrderId = null;
    clearActiveModal();
  }

  btnCloseOrderDetail?.addEventListener('click', closeOrderDetailModal);
  btnCloseOrderFooter?.addEventListener('click', closeOrderDetailModal);
  modalOrderDetail?.addEventListener('click', (e) => {
    if (e.target === modalOrderDetail) closeOrderDetailModal();
  });

  // Event delegation for Dashboard recent orders table
  document.getElementById('orders-tbody')?.addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-order-id]');
    if (!row) return;
    const orderId = parseInt(row.dataset.orderId, 10);
    if (orderId) openOrderDetailModal(orderId);
  });

  // --- 8. EXPORT CSV (Merchant Dashboard & Catalog) ---
  const btnExport = document.getElementById('btn-merchant-export-csv');
  btnExport?.addEventListener('click', async () => {
    // On catalog page, export product table data
    const productsTbody = document.getElementById('products-tbody');
    if (productsTbody) {
      const rows = Array.from(productsTbody.querySelectorAll('tr'))
        .filter((r) => r.style.display !== 'none')
        .map((r) => {
          const cells = r.querySelectorAll('td');
          return [
            `"${cells[1]?.textContent.trim() || ''}"`,
            `"${cells[2]?.textContent.trim() || ''}"`,
            cells[3]?.textContent.trim() || '',
            cells[4]?.textContent.trim() || '',
            `"${cells[5]?.textContent.trim() || ''}"`,
            `"${cells[6]?.textContent.trim() || ''}"`,
          ].join(',');
        });
      const csvContent = ['Product,Category,Variants,Stock,Price,Status', ...rows].join('\n');
      downloadCsv(csvContent, 'metrodrip_products');
      showToast('Exported product catalog to CSV.');
      return;
    }

    // On dashboard page, try backend export first
    try {
      const res = await fetch(`${API_BASE}/orders/export/`);
      if (res.ok) {
        const text = await res.text();
        downloadCsv(text, 'metrodrip_merchant_orders');
        showToast('Exported recent orders to CSV.');
        return;
      }
    } catch {
      // Offline fallback
    }

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

  // --- 9. NAVIGATION ACTIVE STATE ---
  document.querySelectorAll('.nav-item[data-nav]').forEach((item) => {
    item.addEventListener('click', (e) => {
      document.querySelectorAll('.nav-item').forEach((nav) => nav.classList.remove('is-active'));
      item.classList.add('is-active');
    });
  });
})();

