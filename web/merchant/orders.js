// Merchant Console: Orders Controller
// Figma: 550:65 (Light) & 554:431 (Dark)
// Fully wired to Orders Microservice (/api/merchant/orders/) - zero fake fallback orders
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

  // Dynamic real orders from database
  let orders = [];
  let selectedOrderId = null;
  let isLoading = false;

  function renderTable() {
    const tbody = document.getElementById('all-orders-tbody');
    if (!tbody) return;

    if (isLoading) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 24px; color: var(--color-muted);">Loading real-time orders...</td></tr>`;
      return;
    }

    const searchTerm = (document.getElementById('search-orders-input')?.value || '').toLowerCase().trim();
    const payFilter = document.getElementById('filter-payment-select')?.value || 'all';
    const fulfillFilter = document.getElementById('filter-fulfillment-select')?.value || 'all';

    const filtered = orders.filter(o => {
      const matchSearch = !searchTerm ||
        o.id.toLowerCase().includes(searchTerm) ||
        o.customer.toLowerCase().includes(searchTerm);
      const matchPay = payFilter === 'all' || o.paymentKey === payFilter;
      const matchFulfill = fulfillFilter === 'all' || o.fulfillmentKey === fulfillFilter;
      return matchSearch && matchPay && matchFulfill;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 24px; color: var(--color-muted);">No orders matching filter criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(o => {
      const isSelected = o.id === selectedOrderId;
      const isPending = (o.payment || '').toLowerCase().includes('pending');
      return `
        <tr data-order-id="${escapeHtml(o.id)}" style="cursor: pointer; ${isSelected ? 'background-color: var(--color-info-bg);' : ''}">
          <td>
            <div style="display: flex; flex-direction: column;">
              <span class="td-strong">${escapeHtml(o.id)} · ${escapeHtml(o.customer)}</span>
            </div>
          </td>
          <td class="td-mono" style="font-weight: 700;">${escapeHtml(o.total)}</td>
          <td>
            <span class="status-pill ${isPending ? 'pending' : 'paid'}">${escapeHtml(o.payment)}</span>
          </td>
          <td>
            <span class="td-mono" style="font-weight: 500;">${escapeHtml(o.fulfillment)}</span>
          </td>
          <td class="td-mono td-muted">${escapeHtml(o.placed)}</td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('tr[data-order-id]').forEach(row => {
      row.addEventListener('click', () => {
        const id = row.getAttribute('data-order-id');
        selectOrder(id);
      });
    });
  }

  function renderEmptyDetails() {
    const numberEl = document.getElementById('detail-order-number');
    const subEl = document.getElementById('detail-order-sub');
    const lineItemsEl = document.getElementById('detail-line-items');
    const subtotalEl = document.getElementById('detail-subtotal-row');
    const totalEl = document.getElementById('detail-total-amount');
    const packBtn = document.getElementById('btn-mark-packed');

    const custEl = document.getElementById('delivery-customer-name');
    const addrEl = document.getElementById('delivery-address-text');
    const speedEl = document.getElementById('delivery-speed-text');
    const activityEl = document.getElementById('order-activity-list');

    if (numberEl) numberEl.textContent = 'No Order Selected';
    if (subEl) subEl.textContent = 'Awaiting orders';
    if (lineItemsEl) lineItemsEl.innerHTML = '<p style="color: var(--color-muted); font-size: 13px; padding: 12px 0;">No items to display.</p>';
    if (subtotalEl) subtotalEl.innerHTML = '<span>Subtotal ₱0</span><span>-</span>';
    if (totalEl) totalEl.textContent = 'Total ₱0';
    if (packBtn) packBtn.disabled = true;

    if (custEl) custEl.textContent = '-';
    if (addrEl) addrEl.textContent = '-';
    if (speedEl) speedEl.textContent = '-';
    if (activityEl) activityEl.innerHTML = '<p style="color: var(--color-muted); font-size: 13px;">No activity recorded.</p>';
  }

  function selectOrder(id) {
    selectedOrderId = id;
    const order = orders.find(o => o.id === id);
    if (!order) {
      renderEmptyDetails();
      renderTable();
      return;
    }

    const numberEl = document.getElementById('detail-order-number');
    const subEl = document.getElementById('detail-order-sub');
    const lineItemsEl = document.getElementById('detail-line-items');
    const subtotalEl = document.getElementById('detail-subtotal-row');
    const totalEl = document.getElementById('detail-total-amount');
    const packBtn = document.getElementById('btn-mark-packed');

    const custEl = document.getElementById('delivery-customer-name');
    const addrEl = document.getElementById('delivery-address-text');
    const speedEl = document.getElementById('delivery-speed-text');
    const activityEl = document.getElementById('order-activity-list');

    if (numberEl) numberEl.textContent = `Order ${order.id}`;
    if (subEl) subEl.textContent = `${order.customer} · ${order.payment} · ${order.fulfillment}`;

    if (lineItemsEl) {
      lineItemsEl.innerHTML = (order.items || []).map(item => `
        <div style="display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0;">
          <span>${escapeHtml(item.name)}</span>
          <span class="td-mono">${escapeHtml(item.price)}</span>
        </div>
      `).join('');
    }

    if (subtotalEl) {
      subtotalEl.innerHTML = `<span>Subtotal ${order.subtotal}</span><span>${order.shipping}</span>`;
    }
    if (totalEl) totalEl.textContent = `Total ${order.total}`;

    if (packBtn) {
      if (order.fulfillmentKey === 'packed' || order.fulfillmentKey === 'shipped' || order.fulfillmentKey === 'delivered') {
        packBtn.textContent = 'Already packed ✓';
        packBtn.disabled = true;
      } else {
        packBtn.textContent = 'Mark as packed';
        packBtn.disabled = false;
      }
    }

    if (custEl) custEl.textContent = order.customer;
    if (addrEl) addrEl.innerHTML = escapeHtml(order.address).replace(/\n/g, '<br>');
    if (speedEl) speedEl.textContent = order.speed;

    if (activityEl) {
      activityEl.innerHTML = (order.activity || []).map(a => `
        <p><span class="td-mono td-muted">${escapeHtml(a.time)}</span> ${escapeHtml(a.desc)}</p>
      `).join('');
    }

    renderTable();
  }

  async function loadOrders() {
    isLoading = true;
    renderTable();
    try {
      const response = await fetch('/api/merchant/orders/', {
        headers: { 'Accept': 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }
      orders = await response.json();
      isLoading = false;
      if (orders.length > 0) {
        const stillExists = orders.some(o => o.id === selectedOrderId);
        selectOrder(stillExists ? selectedOrderId : orders[0].id);
      } else {
        selectedOrderId = null;
        renderEmptyDetails();
        renderTable();
      }
    } catch (err) {
      isLoading = false;
      orders = [];
      selectedOrderId = null;
      renderEmptyDetails();
      renderTable();
      showToast(`Unable to load orders: ${err.message}`, 'error');
    }
  }

  function initHandlers() {
    document.getElementById('search-orders-input')?.addEventListener('input', renderTable);
    document.getElementById('filter-payment-select')?.addEventListener('change', renderTable);
    document.getElementById('filter-fulfillment-select')?.addEventListener('change', renderTable);

    document.getElementById('btn-mark-packed')?.addEventListener('click', async () => {
      const order = orders.find(o => o.id === selectedOrderId);
      if (!order) return;
      const targetId = order.order_id || order.id;

      try {
        const res = await fetch(`/api/merchant/orders/${targetId}/`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'packed' }),
        });
        if (!res.ok) throw new Error('Status update failed on server');

        order.fulfillment = 'Packed';
        order.fulfillmentKey = 'packed';
        if (!order.activity) order.activity = [];
        order.activity.unshift({
          time: new Date().toTimeString().slice(0, 5),
          desc: 'Marked as packed by Store Merchant'
        });
        showToast(`Order ${order.id} marked as packed and ready for carrier pickup.`);
        selectOrder(order.id);
      } catch (e) {
        showToast(`Failed to update order: ${e.message}`, 'error');
      }
    });

    document.getElementById('btn-export-orders')?.addEventListener('click', () => {
      if (orders.length === 0) {
        showToast('No orders to export.', 'error');
        return;
      }
      const csv = 'OrderID,Customer,Total,Payment,Fulfillment,Placed\n' +
        orders.map(o => `"${o.id}","${o.customer}","${o.total}","${o.payment}","${o.fulfillment}","${o.placed}"`).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `orders-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Exported orders CSV.');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initHandlers();
    loadOrders();
  });
})();
