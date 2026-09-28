// Merchant banner management backed by the authenticated Django API.
(() => {
  'use strict';

  const API_BASE = ['localhost', '127.0.0.1'].includes(window.location.hostname) || window.location.protocol === 'file:'
    ? 'http://127.0.0.1:8000/api/merchant'
    : '/api/merchant';
  const SESSION_KEY = 'metrodrip_active_user';
  const placements = {
    homepage_hero: 'Homepage hero',
    homepage_secondary: 'Homepage secondary',
    announcement_bar: 'Announcement bar',
    category_banner: 'Category banner',
    checkout_footer: 'Checkout footer',
  };

  let banners = [];
  let activeBannerId = null;
  let lastFocusedElement = null;

  const byId = (id) => document.getElementById(id);
  const tableBody = byId('placements-table-body');
  const editorForm = byId('form-banner-editor');
  const newForm = byId('form-new-banner');
  const newModal = byId('modal-new-banner');

  function session() {
    try {
      const value = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      if (value?.access_token && value?.is_staff === true && ['merchant', 'admin'].includes(value.role)) return value;
    } catch {
      // Invalid session JSON is treated as signed out.
    }
    return null;
  }

  function escapeHtml(value) {
    const node = document.createElement('div');
    node.appendChild(document.createTextNode(String(value ?? '')));
    return node.innerHTML;
  }

  function showToast(message, type = 'success') {
    const container = byId('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3500);
  }

  function setPageState(kind, message) {
    const region = byId('content-page-state');
    if (!region) return;
    region.dataset.state = kind;
    region.textContent = message;
    region.hidden = kind === 'default';
  }

  async function api(path, options = {}) {
    const current = session();
    if (!current) throw new Error('A verified merchant session is required. Sign in again.');
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${current.access_token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      throw new Error(payload?.error || payload?.detail || `Request failed (${response.status}).`);
    }
    return payload;
  }

  function statusPill(value) {
    const className = value === 'Live' ? 'status-active' : value === 'Scheduled' ? 'status-pending' : 'status-alert';
    return `<span class="status-pill ${className}">${escapeHtml(value)}</span>`;
  }

  function updateMetrics() {
    const counts = banners.reduce((result, banner) => {
      result[banner.status] = (result[banner.status] || 0) + 1;
      return result;
    }, {});
    byId('metric-live-banners').textContent = String(counts.Live || 0);
    byId('metric-scheduled-banners').textContent = String(counts.Scheduled || 0);
    byId('metric-draft-banners').textContent = String(counts.Draft || 0);
  }

  function renderTable() {
    if (!tableBody) return;
    if (!banners.length) {
      tableBody.innerHTML = '<tr><td colspan="5" style="padding:24px;text-align:center;">No banners have been created.</td></tr>';
      return;
    }
    tableBody.innerHTML = banners.map((banner) => `
      <tr class="${banner.id === activeBannerId ? 'is-selected-row' : ''}">
        <td class="td-strong">${escapeHtml(banner.title)}</td>
        <td>${escapeHtml(banner.placement_label || placements[banner.placement] || 'Unavailable')}</td>
        <td>${statusPill(banner.status)}</td>
        <td class="td-mono" style="font-size:11px;">${escapeHtml(banner.schedule || 'Not scheduled')}</td>
        <td style="text-align:right;">
          <button type="button" class="action-link btn-edit-banner" data-id="${Number(banner.id)}">Edit banner</button>
        </td>
      </tr>`).join('');
    tableBody.querySelectorAll('.btn-edit-banner').forEach((button) => {
      button.addEventListener('click', () => loadBanner(Number(button.dataset.id), true));
    });
  }

  function toLocalInput(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function toIso(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  function updateScheduleVisibility(prefix = '') {
    const statusInput = byId(prefix ? 'new-banner-status' : 'select-banner-schedule');
    const fields = byId(prefix ? 'new-banner-schedule-fields' : 'banner-schedule-fields');
    if (!statusInput || !fields) return;
    const scheduled = statusInput.value === 'Scheduled' || statusInput.value === 'scheduled';
    fields.hidden = !scheduled;
    fields.querySelector('[data-schedule-start]')?.toggleAttribute('required', scheduled);
  }

  function updatePreview() {
    const headline = byId('input-banner-headline')?.value.trim() || 'SELECT A BANNER';
    byId('preview-headline').textContent = headline.toUpperCase();
    byId('preview-subtext').textContent = byId('input-banner-subtext')?.value.trim() || 'No supporting text';
    byId('preview-cta-button').textContent = byId('input-banner-button-label')?.value.trim() || 'No CTA';
  }

  function setEditorEnabled(enabled) {
    editorForm?.querySelectorAll('input, select, button').forEach((control) => {
      control.disabled = !enabled;
    });
  }

  function loadBanner(id, scroll = false) {
    const banner = banners.find((item) => item.id === id);
    activeBannerId = banner?.id ?? null;
    setEditorEnabled(Boolean(banner));
    if (!banner) {
      byId('heading-banner-editor').textContent = 'Select a banner';
      ['input-banner-headline', 'input-banner-subtext', 'input-banner-button-label', 'input-banner-destination', 'input-banner-starts-at', 'input-banner-ends-at']
        .forEach((field) => { if (byId(field)) byId(field).value = ''; });
      updatePreview();
      renderTable();
      return;
    }
    byId('heading-banner-editor').textContent = `Edit ${banner.placement_label || placements[banner.placement] || 'banner'}`;
    byId('input-banner-headline').value = banner.headline || banner.title;
    byId('input-banner-subtext').value = banner.subtext || '';
    byId('input-banner-button-label').value = banner.button_label || '';
    byId('input-banner-destination').value = banner.link_url || '';
    byId('select-banner-schedule').value = banner.status === 'Scheduled' ? 'scheduled' : banner.status === 'Live' ? 'always' : 'draft';
    byId('input-banner-starts-at').value = toLocalInput(banner.starts_at);
    byId('input-banner-ends-at').value = toLocalInput(banner.ends_at);
    updateScheduleVisibility();
    updatePreview();
    renderTable();
    if (scroll) byId('card-banner-editor')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function editorPayload(status) {
    const payload = {
      headline: byId('input-banner-headline').value.trim(),
      subtext: byId('input-banner-subtext').value.trim(),
      button_label: byId('input-banner-button-label').value.trim(),
      link_url: byId('input-banner-destination').value.trim(),
      status,
    };
    if (status === 'Scheduled') {
      payload.starts_at = toIso(byId('input-banner-starts-at').value);
      payload.ends_at = toIso(byId('input-banner-ends-at').value);
    }
    return payload;
  }

  async function updateBanner(status, button) {
    if (!activeBannerId) return;
    button.disabled = true;
    try {
      const updated = await api(`/banners/${activeBannerId}/`, {
        method: 'PATCH',
        body: JSON.stringify(editorPayload(status)),
      });
      banners = banners.map((banner) => banner.id === updated.id ? updated : banner);
      loadBanner(updated.id);
      setPageState('default', '');
      showToast(`Banner saved as ${updated.status.toLowerCase()}.`);
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  }

  function openModal() {
    lastFocusedElement = document.activeElement;
    newModal.hidden = false;
    newForm.reset();
    byId('new-banner-cta').value = 'Shop Now';
    byId('new-banner-link').value = '/shop';
    updateScheduleVisibility('new');
    byId('new-banner-name')?.focus();
  }

  function closeModal() {
    newModal.hidden = true;
    lastFocusedElement?.focus();
  }

  async function loadBanners() {
    setPageState('loading', 'Loading banner placements…');
    setEditorEnabled(false);
    try {
      const data = await api('/banners/');
      banners = Array.isArray(data) ? data : [];
      activeBannerId = banners[0]?.id ?? null;
      updateMetrics();
      renderTable();
      loadBanner(activeBannerId);
      setPageState(banners.length ? 'default' : 'empty', banners.length ? '' : 'No banners yet. Create one to begin.');
    } catch (error) {
      banners = [];
      activeBannerId = null;
      updateMetrics();
      renderTable();
      loadBanner(null);
      setPageState('error', error.message);
      showToast(error.message, 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    ['input-banner-headline', 'input-banner-subtext', 'input-banner-button-label'].forEach((id) => {
      byId(id)?.addEventListener('input', updatePreview);
    });
    byId('select-banner-schedule')?.addEventListener('change', updateScheduleVisibility);
    byId('new-banner-status')?.addEventListener('change', () => updateScheduleVisibility('new'));
    byId('btn-save-draft')?.addEventListener('click', (event) => updateBanner('Draft', event.currentTarget));
    editorForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      const selected = byId('select-banner-schedule').value;
      updateBanner(selected === 'scheduled' ? 'Scheduled' : selected === 'draft' ? 'Draft' : 'Live', byId('btn-publish-banner'));
    });

    byId('btn-open-new-banner')?.addEventListener('click', openModal);
    byId('btn-close-new-banner-modal')?.addEventListener('click', closeModal);
    byId('btn-cancel-new-banner')?.addEventListener('click', closeModal);
    newModal?.addEventListener('click', (event) => { if (event.target === newModal) closeModal(); });
    newModal?.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });
    newForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = newForm.querySelector('[type="submit"]');
      submit.disabled = true;
      const status = byId('new-banner-status').value;
      const payload = {
        title: byId('new-banner-name').value.trim(),
        placement: byId('new-banner-placement').value,
        headline: byId('new-banner-headline').value.trim(),
        subtext: byId('new-banner-subtext').value.trim(),
        button_label: byId('new-banner-cta').value.trim(),
        link_url: byId('new-banner-link').value.trim(),
        status,
        starts_at: status === 'Scheduled' ? toIso(byId('new-banner-starts-at').value) : null,
        ends_at: status === 'Scheduled' ? toIso(byId('new-banner-ends-at').value) : null,
        order: banners.length ? Math.max(...banners.map((banner) => Number(banner.order) || 0)) + 1 : 1,
      };
      try {
        const created = await api('/banners/', { method: 'POST', body: JSON.stringify(payload) });
        banners = [created, ...banners];
        updateMetrics();
        closeModal();
        loadBanner(created.id, true);
        setPageState('default', '');
        showToast(`Banner “${created.title}” created.`);
      } catch (error) {
        showToast(error.message, 'error');
      } finally {
        submit.disabled = false;
      }
    });

    loadBanners();
  });
})();
