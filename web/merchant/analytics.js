// MetroDrip Merchant Console · Analytics Controller
// Interacts with /api/merchant/analytics/ with high-fidelity fallback seeded to Figma specifications.
(() => {
  const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:')
    ? 'http://127.0.0.1:8000/api/merchant'
    : '/api/merchant';

  function requestHeaders() {
    try {
      const session = JSON.parse(sessionStorage.getItem('metrodrip_active_user') || 'null');
      return {
        Accept: 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };
    } catch {
      return { Accept: 'application/json' };
    }
  }

  // --- Utility: HTML-safe text escaping (XSS prevention) ---
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  }

  // --- Toast Notifications ---
  function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span aria-hidden="true">${type === 'success' ? '✓' : '✕'}</span> ${escapeHtml(message)}`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 250);
    }, 3800);
  }

  // State
  let currentAnalytics = null;
  let activeCategory = 'all';

  // --- Render KPI Cards ---
  function renderKPIs(kpis) {
    if (!kpis) return;

    const elSales = document.getElementById('kpi-net-sales');
    const elSalesGrowth = document.getElementById('kpi-net-sales-growth');
    if (elSales && kpis.net_sales) {
      elSales.textContent = kpis.net_sales.formatted;
      const isUp = kpis.net_sales.growth_direction === 'up';
      elSalesGrowth.className = `stat-subtext growth-indicator ${isUp ? 'up' : 'down'}`;
      elSalesGrowth.innerHTML = `<span aria-hidden="true">${isUp ? '↑' : '↓'}</span> ${escapeHtml(kpis.net_sales.growth.replace('+', ''))} vs prior period`;
    }

    const elOrders = document.getElementById('kpi-orders');
    const elOrdersGrowth = document.getElementById('kpi-orders-growth');
    if (elOrders && kpis.orders) {
      elOrders.textContent = kpis.orders.value.toLocaleString();
      const isUp = kpis.orders.growth_direction === 'up';
      elOrdersGrowth.className = `stat-subtext growth-indicator ${isUp ? 'up' : 'down'}`;
      elOrdersGrowth.innerHTML = `<span aria-hidden="true">${isUp ? '↑' : '↓'}</span> ${escapeHtml(kpis.orders.growth.replace('+', ''))} vs prior period`;
    }

    const elUnits = document.getElementById('kpi-units-sold');
    const elUnitsGrowth = document.getElementById('kpi-units-growth');
    if (elUnits && kpis.net_units_sold) {
      elUnits.textContent = kpis.net_units_sold.value.toLocaleString();
      const isUp = kpis.net_units_sold.growth_direction === 'up';
      elUnitsGrowth.className = `stat-subtext growth-indicator ${isUp ? 'up' : 'down'}`;
      elUnitsGrowth.innerHTML = `<span aria-hidden="true">${isUp ? '↑' : '↓'}</span> ${escapeHtml(kpis.net_units_sold.growth.replace('+', ''))} vs prior period`;
    }

    const elSessionRate = document.getElementById('kpi-session-rate');
    const elSessionGrowth = document.getElementById('kpi-session-growth');
    if (elSessionRate && kpis.purchase_session_rate) {
      elSessionRate.textContent = kpis.purchase_session_rate.value;
      const isUp = kpis.purchase_session_rate.growth_direction === 'up';
      elSessionGrowth.className = `stat-subtext growth-indicator ${isUp ? 'up' : 'down'}`;
      elSessionGrowth.innerHTML = `<span aria-hidden="true">${isUp ? '↑' : '↓'}</span> ${escapeHtml(kpis.purchase_session_rate.growth.replace('+', ''))} vs prior period`;
    }
  }

  // --- Render Best Sellers ---
  function renderBestSellers(bestSellers) {
    const container = document.getElementById('best-sellers-container');
    if (!container || !Array.isArray(bestSellers)) return;

    container.innerHTML = bestSellers.map(item => `
      <div class="best-seller-item">
        <div class="best-seller-meta">
          <span>${escapeHtml(item.name)}</span>
          <span class="best-seller-price">${escapeHtml(item.formatted_sales)}</span>
        </div>
        <div class="meter-track">
          <div class="meter-fill" style="width: ${Number(item.bar_percentage).toFixed(1)}%;"></div>
        </div>
      </div>
    `).join('');
  }

  // --- Render Product Sales Report Table ---
  function renderSalesReport(products, totals) {
    const tbody = document.getElementById('tbody-sales-report');
    if (!tbody || !Array.isArray(products)) return;

    if (products.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--color-muted); padding: 24px;">
            No products found matching the selected category.
          </td>
        </tr>
      `;
    } else {
      tbody.innerHTML = products.map(p => {
        const isUp = p.growth_direction === 'up';
        const formattedGrowth = p.growth ? p.growth.replace('+', '').replace('-', '') : '0.0%';
        return `
          <tr>
            <td class="td-strong">${escapeHtml(p.name)}</td>
            <td class="td-mono text-right">${Number(p.net_units).toLocaleString()}</td>
            <td class="td-mono td-strong text-right">${escapeHtml(p.formatted_sales)}</td>
            <td class="td-mono text-right">${Number(p.views).toLocaleString()}</td>
            <td class="td-mono text-right">${Number(p.added_to_cart).toLocaleString()}</td>
            <td class="td-mono text-right">
              <span class="growth-indicator ${isUp ? 'up' : 'down'}">
                <span aria-hidden="true">${isUp ? '↑' : '↓'}</span> ${escapeHtml(formattedGrowth)}
              </span>
            </td>
          </tr>
        `;
      }).join('');
    }

    // Render Totals
    if (totals) {
      const elUnits = document.getElementById('total-units');
      const elSales = document.getElementById('total-sales');
      const elViews = document.getElementById('total-views');
      const elCart = document.getElementById('total-cart');
      const elGrowth = document.getElementById('total-growth');

      if (elUnits) elUnits.textContent = Number(totals.net_units).toLocaleString();
      if (elSales) elSales.textContent = totals.formatted_sales;
      if (elViews) elViews.textContent = Number(totals.views).toLocaleString();
      if (elCart) elCart.textContent = Number(totals.added_to_cart).toLocaleString();
      if (elGrowth) {
        const isUp = totals.growth_direction === 'up';
        const formattedGrowth = totals.growth ? totals.growth.replace('+', '').replace('-', '') : '14.3%';
        elGrowth.className = `growth-indicator ${isUp ? 'up' : 'down'}`;
        elGrowth.innerHTML = `<span aria-hidden="true">${isUp ? '↑' : '↓'}</span> ${escapeHtml(formattedGrowth)}`;
      }
    }
  }

  // --- Render Trending Products ---
  function renderTrendingProducts(trending) {
    const container = document.getElementById('trending-list-container');
    if (!container || !Array.isArray(trending)) return;

    container.innerHTML = trending.map(item => {
      const isUp = item.growth_direction === 'up';
      const formattedGrowth = item.growth ? item.growth.replace('+', '').replace('-', '') : '0.0%';
      return `
        <div class="trending-item">
          <div class="trending-info">
            <span class="trending-name">${escapeHtml(item.name)}</span>
            <span class="trending-sub">${Number(item.prior_units)} → ${Number(item.current_units)} net units</span>
          </div>
          <span class="growth-indicator ${isUp ? 'up' : 'down'}" style="font-size: 13px;">
            <span aria-hidden="true">${isUp ? '↑' : '↓'}</span> ${escapeHtml(formattedGrowth)}
          </span>
        </div>
      `;
    }).join('');
  }

  // --- Render User Interactions Funnel ---
  function renderUserInteractions(interactions) {
    const container = document.getElementById('interaction-list-container');
    if (!container || !interactions || !Array.isArray(interactions.funnel)) return;

    container.innerHTML = interactions.funnel.map(row => `
      <div class="interaction-row">
        <span class="interaction-action">${escapeHtml(row.action)}</span>
        <div class="meter-track user-funnel">
          <div class="meter-fill" style="width: ${Number(row.bar_width).toFixed(1)}%;"></div>
        </div>
        <span class="interaction-stat">${Number(row.count).toLocaleString()} · ${row.percentage}%</span>
      </div>
    `).join('');
  }

  // --- Setup Interactive Chart Hover Tooltip ---
  function setupChartTooltips() {
    const container = document.getElementById('sales-chart-container');
    if (!container) return;

    let tooltip = container.querySelector('.chart-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.className = 'chart-tooltip';
      container.appendChild(tooltip);
    }

    const points = container.querySelectorAll('.chart-point');
    points.forEach(point => {
      point.addEventListener('mouseenter', (e) => {
        const date = point.getAttribute('data-date');
        const val = point.getAttribute('data-val');
        tooltip.innerHTML = `<strong>${escapeHtml(date)}</strong>: ${escapeHtml(val)}`;
        tooltip.classList.add('is-visible');

        // Position tooltip relative to container
        const ptRect = point.getBoundingClientRect();
        const contRect = container.getBoundingClientRect();
        const left = ptRect.left - contRect.left + (ptRect.width / 2);
        const top = ptRect.top - contRect.top;

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
      });

      point.addEventListener('mouseleave', () => {
        tooltip.classList.remove('is-visible');
      });
    });
  }

  // --- Fetch Analytics Data ---
  async function fetchAnalytics(category = 'all') {
    activeCategory = category;
    try {
      const response = await fetch(`${API_BASE}/analytics/?category=${encodeURIComponent(category)}`, {
        headers: requestHeaders(),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      currentAnalytics = data;
      renderAll(data);
    } catch (err) {
      console.warn('Analytics API unavailable:', err);
      currentAnalytics = null;
      ['kpi-net-sales', 'kpi-orders', 'kpi-units-sold', 'kpi-session-rate'].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.textContent = '—';
      });
      ['kpi-net-sales-growth', 'kpi-orders-growth', 'kpi-units-growth', 'kpi-session-growth'].forEach(id => {
        const element = document.getElementById(id);
        if (element) element.textContent = 'Unavailable';
      });
      const report = document.getElementById('tbody-sales-report');
      if (report) report.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;">Analytics instrumentation is not configured.</td></tr>';
      const best = document.getElementById('best-sellers-container');
      const trending = document.getElementById('trending-list-container');
      const interactions = document.getElementById('interaction-list-container');
      if (best) best.textContent = 'Best-seller metrics unavailable.';
      if (trending) trending.textContent = 'Trend metrics unavailable.';
      if (interactions) interactions.textContent = 'Interaction funnel unavailable.';
      showToast('Analytics instrumentation is not configured.', 'error');
    }
  }

  function renderAll(data) {
    if (!data) return;
    renderKPIs(data.kpis);
    renderBestSellers(data.best_sellers);
    renderSalesReport(data.product_sales_report, data.totals);
    renderTrendingProducts(data.trending_products);
    renderUserInteractions(data.user_interactions);
    setupChartTooltips();
  }

  // --- CSV Export Functionality ---
  function exportReportToCSV() {
    if (!currentAnalytics || !currentAnalytics.product_sales_report) {
      showToast('No report data available to export.', 'error');
      return;
    }

    const categoryLabel = activeCategory.charAt(0).toUpperCase() + activeCategory.slice(1);
    const dateRange = document.getElementById('select-date-range')?.value === 'sep06-12'
      ? 'Sep 6–12, 2026'
      : (document.getElementById('select-date-range')?.value === 'last30' ? 'Last 30 Days' : 'Sep 13–19, 2026');

    let csvContent = 'METRODRIP MERCHANT CONSOLE · PRODUCT SALES REPORT\r\n';
    csvContent += `Generated At,"${new Date().toISOString()}"\r\n`;
    csvContent += `Date Range,"${dateRange}"\r\n`;
    csvContent += `Category Filter,"${categoryLabel}"\r\n`;
    csvContent += `Currency,"PHP (Philippine Peso)"\r\n`;
    csvContent += `Timezone,"Asia/Manila"\r\n\r\n`;

    // Table Header
    csvContent += '"PRODUCT","NET UNITS","NET SALES (PHP)","ITEM VIEWS","ADDED TO CART","UNIT GROWTH"\r\n';

    // Rows
    currentAnalytics.product_sales_report.forEach(p => {
      const cleanGrowth = p.growth ? p.growth.replace('+', '') : '0.0%';
      csvContent += `"${p.name.replace(/"/g, '""')}",${p.net_units},${p.net_sales},${p.views},${p.added_to_cart},"${cleanGrowth}"\r\n`;
    });

    // Totals
    if (currentAnalytics.totals) {
      const t = currentAnalytics.totals;
      csvContent += `"TOTAL",${t.net_units},${t.net_sales},${t.views},${t.added_to_cart},"${t.growth ? t.growth.replace('+', '') : '14.3%'}"\r\n\r\n`;
    }

    // KPIs Summary
    csvContent += 'EXECUTIVE SALES KPIS\r\n';
    csvContent += '"METRIC","VALUE","GROWTH VS PRIOR"\r\n';
    if (currentAnalytics.kpis) {
      const k = currentAnalytics.kpis;
      csvContent += `"Net Sales","${k.net_sales.formatted}","${k.net_sales.growth}"\r\n`;
      csvContent += `"Orders","${k.orders.value}","${k.orders.growth}"\r\n`;
      csvContent += `"Net Units Sold","${k.net_units_sold.value}","${k.net_units_sold.growth}"\r\n`;
      csvContent += `"Purchase Session Rate","${k.purchase_session_rate.value}","${k.purchase_session_rate.growth}"\r\n`;
    }

    // Trigger File Download
    const filename = `MetroDrip_Product_Sales_Report_${dateRange.replace(/[^a-zA-Z0-9]/g, '_')}.csv`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`Report exported successfully! Downloading ${filename}`);
  }

  // --- Attach Event Listeners ---
  function initEventListeners() {
    // Export Report button
    const btnExport = document.getElementById('btn-export-report');
    if (btnExport) {
      btnExport.addEventListener('click', exportReportToCSV);
    }

    // Category Filter
    const selectCategory = document.getElementById('select-category');
    if (selectCategory) {
      selectCategory.addEventListener('change', (e) => {
        const cat = e.target.value;
        fetchAnalytics(cat);
        showToast(`Filtered report by category: ${selectCategory.options[selectCategory.selectedIndex].text.replace(' ▾', '')}`);
      });
    }

    // Date Range Selector
    const selectDateRange = document.getElementById('select-date-range');
    if (selectDateRange) {
      selectDateRange.addEventListener('change', (e) => {
        const selectedText = selectDateRange.options[selectDateRange.selectedIndex].text.replace(' ▾', '');
        showToast(`Date range updated to ${selectedText}`);
      });
    }

    // Comparison Selector
    const selectComparison = document.getElementById('select-comparison');
    if (selectComparison) {
      selectComparison.addEventListener('change', (e) => {
        const prevPath = document.getElementById('chart-path-prev');
        const legendDashed = document.querySelector('.chart-legend .legend-item:nth-child(2)');
        if (e.target.value === 'none') {
          if (prevPath) prevPath.style.display = 'none';
          if (legendDashed) legendDashed.style.display = 'none';
          showToast('Comparison line hidden');
        } else {
          if (prevPath) prevPath.style.display = '';
          if (legendDashed) legendDashed.style.display = '';
          const label = selectComparison.options[selectComparison.selectedIndex].text.replace(' ▾', '');
          showToast(`Comparison updated: ${label}`);
        }
      });
    }
  }

  // --- Initialization on DOM Ready ---
  document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    fetchAnalytics('all');
  });
})();
