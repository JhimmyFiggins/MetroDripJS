// Merchant Console: Orders Controller
// Figma: 550:65 (Light) & 554:431 (Dark)
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

  // Seeded orders matching Figma 550:65
  let orders = [
    {
      id: 'MD-2026-00318',
      customer: 'Juan Dela Cruz',
      total: '₱2,632',
      payment: 'Paid · GCash',
      paymentKey: 'gcash',
      fulfillment: 'Unfulfilled',
      fulfillmentKey: 'unfulfilled',
      placed: 'Today, 09:42',
      address: 'Sample delivery address\nQuezon City, Metro Manila 1100',
      speed: 'Standard delivery · 2–3 business days',
      items: [
        { name: 'Drip Zip-Up Hoodie · Black / M', price: '1 × ₱1,249' },
        { name: 'Skyline Pullover · Gray / L', price: '1 × ₱1,383' }
      ],
      subtotal: '₱2,632',
      shipping: 'Free shipping',
      activity: [
        { time: '09:42', desc: 'Payment confirmed' },
        { time: '09:40', desc: 'Order placed' },
        { time: '09:40', desc: 'Inventory reserved' }
      ]
    },
    {
      id: 'MD-2026-00317',
      customer: 'Bea Santos',
      total: '₱1,249',
      payment: 'Paid · Maya',
      paymentKey: 'maya',
      fulfillment: 'Packed',
      fulfillmentKey: 'packed',
      placed: 'Today, 09:16',
      address: 'Unit 402 City Tower, Makati Ave\nMakati City, Metro Manila 1200',
      speed: 'Standard delivery · 2–3 business days',
      items: [
        { name: 'Drip Zip-Up Hoodie · Black / M', price: '1 × ₱1,249' }
      ],
      subtotal: '₱1,249',
      shipping: '₱85 shipping',
      activity: [
        { time: '09:20', desc: 'Packed by fulfillment team' },
        { time: '09:16', desc: 'Payment confirmed via Maya' },
        { time: '09:14', desc: 'Order placed' }
      ]
    },
    {
      id: 'MD-2026-00316',
      customer: 'Miguel Reyes',
      total: '₱3,447',
      payment: 'Paid · Card',
      paymentKey: 'card',
      fulfillment: 'Shipped',
      fulfillmentKey: 'shipped',
      placed: 'Today, 08:58',
      address: '15 Jade St, Greenwoods Executive\nPasig City, Metro Manila 1600',
      speed: 'Express courier · 1–2 business days',
      items: [
        { name: 'Metro Core Boxy Tee · White / L', price: '1 × ₱899' },
        { name: 'Drip Zip-Up Hoodie · Black / XL', price: '1 × ₱1,249' },
        { name: 'Cargo Pants · Olive / 32', price: '1 × ₱1,299' }
      ],
      subtotal: '₱3,447',
      shipping: 'Free shipping',
      activity: [
        { time: '09:12', desc: 'Handed to J&T Express (DEMO-00316)' },
        { time: '09:05', desc: 'Packed and labeled' },
        { time: '08:58', desc: 'Payment confirmed via Card' }
      ]
    },
    {
      id: 'MD-2026-00315',
      customer: 'Aliyah Cruz',
      total: '₱849',
      payment: 'Pending · GCash',
      paymentKey: 'gcash',
      fulfillment: 'On hold',
      fulfillmentKey: 'on_hold',
      placed: 'Today, 08:40',
      address: 'Block 2 Lot 8 Sunset Village\nAntipolo City, Rizal 1870',
      speed: 'Standard courier · 3–5 business days',
      items: [
        { name: 'Metro Snapback · Black', price: '1 × ₱849' }
      ],
      subtotal: '₱849',
      shipping: '₱85 shipping',
      activity: [
        { time: '08:40', desc: 'Awaiting GCash payment webhook' },
        { time: '08:40', desc: 'Order placed' }
      ]
    },
    {
      id: 'MD-2026-00314',
      customer: 'Marco Lim',
      total: '₱1,798',
      payment: 'Paid · GCash',
      paymentKey: 'gcash',
      fulfillment: 'Shipped',
      fulfillmentKey: 'shipped',
      placed: 'Today, 08:24',
      address: 'Unit 12B Horizon Heights\nCebu City 6000',
      speed: 'VisMin courier · 4–6 business days',
      items: [
        { name: 'Boxy Tee · White / M', price: '2 × ₱899' }
      ],
      subtotal: '₱1,798',
      shipping: 'Free shipping',
      activity: [
        { time: '08:44', desc: 'Dispatched via J&T Express' },
        { time: '08:30', desc: 'Packed and verified' },
        { time: '08:24', desc: 'Payment confirmed via GCash' }
      ]
    }
  ];

  let selectedOrderId = 'MD-2026-00318';

  function renderTable() {
    const tbody = document.getElementById('all-orders-tbody');
    if (!tbody) return;

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
      const isPending = o.payment.toLowerCase().includes('pending');
      return `
        <tr data-order-id="${o.id}" style="cursor: pointer; ${isSelected ? 'background-color: var(--color-info-bg);' : ''}">
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

  function selectOrder(id) {
    selectedOrderId = id;
    const order = orders.find(o => o.id === id);
    if (!order) return;

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
      lineItemsEl.innerHTML = order.items.map(item => `
        <div style="display: flex; justify-content: space-between; font-size: 13px;">
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
      if (order.fulfillmentKey === 'packed' || order.fulfillmentKey === 'shipped') {
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
      activityEl.innerHTML = order.activity.map(a => `
        <p><span class="td-mono td-muted">${escapeHtml(a.time)}</span> ${escapeHtml(a.desc)}</p>
      `).join('');
    }

    renderTable();
  }

  function initHandlers() {
    document.getElementById('search-orders-input')?.addEventListener('input', renderTable);
    document.getElementById('filter-payment-select')?.addEventListener('change', renderTable);
    document.getElementById('filter-fulfillment-select')?.addEventListener('change', renderTable);

    document.getElementById('btn-mark-packed')?.addEventListener('click', () => {
      const order = orders.find(o => o.id === selectedOrderId);
      if (order) {
        order.fulfillment = 'Packed';
        order.fulfillmentKey = 'packed';
        order.activity.unshift({
          time: new Date().toTimeString().slice(0, 5),
          desc: 'Marked as packed by Store Merchant'
        });
        showToast(`Order ${order.id} marked as packed and ready for carrier pickup.`);
        selectOrder(order.id);
      }
    });

    document.getElementById('btn-export-orders')?.addEventListener('click', () => {
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
    selectOrder(selectedOrderId);
    initHandlers();
  });
})();
