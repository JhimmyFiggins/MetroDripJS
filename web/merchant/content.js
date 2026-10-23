// Merchant banner management backed by the authoritative Django API.
(() => {
  'use strict';

  const API_BASE = (['localhost', '127.0.0.1'].includes(window.location.hostname) && window.location.port !== '3000') || window.location.protocol === 'file:'
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
  let originalSnapshot = null;
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

  function getFilteredBanners() {
    const search = byId('filter-banner-search')?.value.trim().toLowerCase() || '';
    const status = byId('filter-banner-status')?.value || 'all';
    const placement = byId('filter-banner-placement')?.value || 'all';

    return banners.filter((banner) => {
      if (status !== 'all' && banner.status !== status) return false;
      if (placement !== 'all' && banner.placement !== placement) return false;
      if (search) {
        const titleMatch = (banner.title || '').toLowerCase().includes(search);
        const headlineMatch = (banner.headline || '').toLowerCase().includes(search);
        const placementMatch = (banner.placement_label || placements[banner.placement] || '').toLowerCase().includes(search);
        if (!titleMatch && !headlineMatch && !placementMatch) return false;
      }
      return true;
    });
  }

  function renderTable() {
    if (!tableBody) return;
    const filtered = getFilteredBanners();
    const countLabel = byId('placements-count-label');
    if (countLabel) {
      countLabel.textContent = `Showing ${filtered.length} of ${banners.length} banner${banners.length === 1 ? '' : 's'}`;
    }

    if (!filtered.length) {
      const msg = banners.length === 0
        ? 'No banners have been created yet. Click "+ New banner" to begin.'
        : 'No banners match the selected filters.';
      tableBody.innerHTML = `<tr><td colspan="5" style="padding:28px;text-align:center;color:var(--color-muted);">${escapeHtml(msg)}</td></tr>`;
      return;
    }

    tableBody.innerHTML = filtered.map((banner) => {
      const isSelected = banner.id === activeBannerId;
      const editingTag = isSelected
        ? '<span class="status-pill status-active" style="margin-left:8px;font-size:9px;padding:2px 6px;">Now Editing</span>'
        : '';
      return `
        <tr class="${isSelected ? 'selected-row is-selected-row' : ''}" aria-selected="${isSelected}" data-id="${Number(banner.id)}">
          <td class="td-strong">
            ${escapeHtml(banner.title)}
            ${editingTag}
          </td>
          <td>${escapeHtml(banner.placement_label || placements[banner.placement] || 'Unavailable')}</td>
          <td>${statusPill(banner.status)}</td>
          <td class="td-mono" style="font-size:11px;">${escapeHtml(banner.schedule || 'Not scheduled')}</td>
          <td style="text-align:right;">
            <button type="button" class="action-link btn-edit-banner" data-id="${Number(banner.id)}" aria-label="Edit banner ${escapeHtml(banner.title)}">
              Edit banner
            </button>
          </td>
        </tr>`;
    }).join('');

    tableBody.querySelectorAll('.btn-edit-banner').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        loadBanner(Number(button.dataset.id), true);
      });
    });

    tableBody.querySelectorAll('tr[data-id]').forEach((row) => {
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        loadBanner(Number(row.dataset.id), true);
      });
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

  function isFormDirty() {
    if (!originalSnapshot) return false;
    const current = {
      title: byId('input-banner-title')?.value.trim() || '',
      placement: byId('select-banner-placement')?.value || 'homepage_hero',
      headline: byId('input-banner-headline')?.value.trim() || '',
      subtext: byId('input-banner-subtext')?.value.trim() || '',
      button_label: byId('input-banner-button-label')?.value.trim() || '',
      link_url: byId('input-banner-destination')?.value.trim() || '',
      image_url: byId('input-banner-image-url')?.value.trim() || '',
      order: Number(byId('input-banner-order')?.value) || 1,
      schedule: byId('select-banner-schedule')?.value || 'always',
      starts_at: byId('input-banner-starts-at')?.value || '',
      ends_at: byId('input-banner-ends-at')?.value || '',
    };
    return Object.keys(current).some((k) => current[k] !== originalSnapshot[k]);
  }

  function checkDirtyAndPrompt() {
    if (isFormDirty()) {
      return window.confirm(`You have unsaved changes to "${originalSnapshot.title || 'this banner'}". Discard changes?`);
    }
    return true;
  }

  function updatePreview() {
    const headline = byId('input-banner-headline')?.value.trim() || 'SELECT A BANNER';
    const subtext = byId('input-banner-subtext')?.value.trim() || 'No supporting text';
    const buttonLabel = byId('input-banner-button-label')?.value.trim() || 'Shop Now';
    const imageUrl = byId('input-banner-image-url')?.value.trim() || '';
    const destination = byId('input-banner-destination')?.value.trim() || '/shop';
    const placementVal = byId('select-banner-placement')?.value || 'homepage_hero';

    byId('preview-headline').textContent = headline.toUpperCase();
    byId('preview-subtext').textContent = subtext;
    byId('preview-cta-button').textContent = buttonLabel;

    const previewCard = byId('banner-preview-card');
    if (previewCard) {
      if (imageUrl && (imageUrl.startsWith('http') || imageUrl.startsWith('/'))) {
        previewCard.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.7)), url('${imageUrl}')`;
        previewCard.classList.add('has-image');
      } else {
        previewCard.style.backgroundImage = '';
        previewCard.classList.remove('has-image');
      }
    }

    const destInfo = byId('preview-destination-info');
    if (destInfo) destInfo.textContent = `Destination: ${destination}`;

    const placeInfo = byId('preview-placement-info');
    if (placeInfo) {
      const placeName = placements[placementVal] || 'Storefront placement';
      placeInfo.textContent = `${placeName} · Live sync on Customer Web & Mobile`;
    }

    // Toggle revert button enabled state based on dirty status
    const revertBtn = byId('btn-revert-banner');
    if (revertBtn && originalSnapshot) {
      revertBtn.disabled = !isFormDirty();
    }
  }

  function setEditorEnabled(enabled) {
    editorForm?.querySelectorAll('input, select, button').forEach((control) => {
      control.disabled = !enabled;
    });
    if (byId('btn-revert-banner')) byId('btn-revert-banner').disabled = true;
    if (byId('btn-delete-banner')) byId('btn-delete-banner').disabled = !enabled;
  }

  function loadBanner(id, scroll = false) {
    if (activeBannerId !== null && activeBannerId !== id) {
      if (!checkDirtyAndPrompt()) return;
    }

    const banner = banners.find((item) => item.id === id);
    activeBannerId = banner?.id ?? null;
    setEditorEnabled(Boolean(banner));

    if (!banner) {
      originalSnapshot = null;
      byId('heading-banner-editor').textContent = 'Select a banner';
      byId('banner-editor-editing-notice').textContent = 'Select a banner from the table to edit.';
      byId('banner-editor-status-wrap').hidden = true;
      [
        'input-banner-title',
        'input-banner-headline',
        'input-banner-subtext',
        'input-banner-button-label',
        'input-banner-destination',
        'input-banner-image-url',
        'input-banner-order',
        'input-banner-starts-at',
        'input-banner-ends-at',
      ].forEach((field) => { if (byId(field)) byId(field).value = ''; });
      updatePreview();
      renderTable();
      return;
    }

    byId('heading-banner-editor').textContent = 'Edit banner';
    byId('banner-editor-editing-notice').textContent = `Now editing: "${banner.title}" (ID #${banner.id})`;
    byId('banner-editor-status-wrap').hidden = false;
    byId('banner-editor-badge').className = `status-pill ${banner.status === 'Live' ? 'status-active' : banner.status === 'Scheduled' ? 'status-pending' : 'status-alert'}`;
    byId('banner-editor-badge').textContent = banner.status;

    byId('input-banner-title').value = banner.title || '';
    byId('select-banner-placement').value = banner.placement || 'homepage_hero';
    byId('input-banner-headline').value = banner.headline || banner.title || '';
    byId('input-banner-subtext').value = banner.subtext || '';
    byId('input-banner-button-label').value = banner.button_label || '';
    byId('input-banner-destination').value = banner.link_url || '';
    byId('input-banner-image-url').value = banner.image_url || '';
    byId('input-banner-order').value = banner.order ?? 1;

    const scheduleSelect = byId('select-banner-schedule');
    scheduleSelect.value = banner.status === 'Scheduled' ? 'scheduled' : banner.status === 'Live' ? 'always' : 'draft';

    const startsAtVal = toLocalInput(banner.starts_at);
    const endsAtVal = toLocalInput(banner.ends_at);
    byId('input-banner-starts-at').value = startsAtVal;
    byId('input-banner-ends-at').value = endsAtVal;

    // Snapshot for dirty checking & revert
    originalSnapshot = {
      title: banner.title || '',
      placement: banner.placement || 'homepage_hero',
      headline: banner.headline || banner.title || '',
      subtext: banner.subtext || '',
      button_label: banner.button_label || '',
      link_url: banner.link_url || '',
      image_url: banner.image_url || '',
      order: Number(banner.order) || 1,
      schedule: scheduleSelect.value,
      starts_at: startsAtVal,
      ends_at: endsAtVal,
    };

    updateScheduleVisibility();
    updatePreview();
    renderTable();

    if (scroll) {
      byId('card-banner-editor')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      byId('input-banner-title')?.focus();
    }
  }

  function revertChanges() {
    if (!originalSnapshot || !activeBannerId) return;
    byId('input-banner-title').value = originalSnapshot.title;
    byId('select-banner-placement').value = originalSnapshot.placement;
    byId('input-banner-headline').value = originalSnapshot.headline;
    byId('input-banner-subtext').value = originalSnapshot.subtext;
    byId('input-banner-button-label').value = originalSnapshot.button_label;
    byId('input-banner-destination').value = originalSnapshot.link_url;
    byId('input-banner-image-url').value = originalSnapshot.image_url;
    byId('input-banner-order').value = originalSnapshot.order;
    byId('select-banner-schedule').value = originalSnapshot.schedule;
    byId('input-banner-starts-at').value = originalSnapshot.starts_at;
    byId('input-banner-ends-at').value = originalSnapshot.ends_at;

    updateScheduleVisibility();
    updatePreview();
    showToast('Changes reverted to saved banner state.');
  }

  function editorPayload(status) {
    const payload = {
      title: byId('input-banner-title').value.trim(),
      placement: byId('select-banner-placement').value,
      headline: byId('input-banner-headline').value.trim(),
      subtext: byId('input-banner-subtext').value.trim(),
      button_label: byId('input-banner-button-label').value.trim(),
      link_url: byId('input-banner-destination').value.trim(),
      image_url: byId('input-banner-image-url').value.trim(),
      order: parseInt(byId('input-banner-order').value, 10) || 1,
      status,
    };
    if (status === 'Scheduled') {
      payload.starts_at = toIso(byId('input-banner-starts-at').value);
      payload.ends_at = toIso(byId('input-banner-ends-at').value);
    } else if (status === 'Live') {
      const endsAt = toIso(byId('input-banner-ends-at').value);
      if (endsAt) payload.ends_at = endsAt;
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
      updateMetrics();
      loadBanner(updated.id);
      setPageState('default', '');
      showToast(`Banner "${updated.title}" saved as ${updated.status.toLowerCase()}.`);
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function deleteBanner() {
    if (!activeBannerId) return;
    const banner = banners.find((b) => b.id === activeBannerId);
    const title = banner?.title || 'this banner';
    if (!window.confirm(`Are you sure you want to delete banner "${title}"? This cannot be undone.`)) {
      return;
    }
    const btn = byId('btn-delete-banner');
    if (btn) btn.disabled = true;
    try {
      await api(`/banners/${activeBannerId}/`, { method: 'DELETE' });
      banners = banners.filter((b) => b.id !== activeBannerId);
      updateMetrics();
      showToast(`Banner "${title}" deleted.`);
      const nextId = banners[0]?.id ?? null;
      loadBanner(nextId);
    } catch (error) {
      showToast(error.message, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function openModal() {
    lastFocusedElement = document.activeElement;
    newModal.hidden = false;
    newForm.reset();
    byId('new-banner-cta').value = 'Shop Now';
    byId('new-banner-link').value = '/shop';
    byId('new-banner-order').value = String(banners.length + 1);
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
    // Real-time input updates to preview
    [
      'input-banner-title',
      'select-banner-placement',
      'input-banner-headline',
      'input-banner-subtext',
      'input-banner-button-label',
      'input-banner-destination',
      'input-banner-image-url',
      'input-banner-order',
    ].forEach((id) => {
      byId(id)?.addEventListener('input', updatePreview);
      byId(id)?.addEventListener('change', updatePreview);
    });

    // Schedule visibility toggles
    byId('select-banner-schedule')?.addEventListener('change', () => {
      updateScheduleVisibility();
      updatePreview();
    });
    byId('new-banner-status')?.addEventListener('change', () => updateScheduleVisibility('new'));

    // Revert and Delete buttons
    byId('btn-revert-banner')?.addEventListener('click', revertChanges);
    byId('btn-delete-banner')?.addEventListener('click', deleteBanner);

    // Save Draft button
    byId('btn-save-draft')?.addEventListener('click', (event) => updateBanner('Draft', event.currentTarget));

    // Submit form (Save & Publish)
    editorForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      const selected = byId('select-banner-schedule').value;
      const targetStatus = selected === 'scheduled' ? 'Scheduled' : selected === 'draft' ? 'Draft' : 'Live';
      updateBanner(targetStatus, byId('btn-publish-banner'));
    });

    // Viewport preview toggle (Desktop vs Mobile)
    const previewWrapper = byId('banner-preview-wrapper');
    byId('btn-preview-desktop')?.addEventListener('click', () => {
      byId('btn-preview-desktop')?.classList.add('is-active');
      byId('btn-preview-mobile')?.classList.remove('is-active');
      previewWrapper?.classList.remove('is-mobile-view');
    });
    byId('btn-preview-mobile')?.addEventListener('click', () => {
      byId('btn-preview-mobile')?.classList.add('is-active');
      byId('btn-preview-desktop')?.classList.remove('is-active');
      previewWrapper?.classList.add('is-mobile-view');
    });

    // Table filters and search
    byId('filter-banner-search')?.addEventListener('input', renderTable);
    byId('filter-banner-status')?.addEventListener('change', renderTable);
    byId('filter-banner-placement')?.addEventListener('change', renderTable);

    // Modal events
    byId('btn-open-new-banner')?.addEventListener('click', openModal);
    byId('btn-close-new-banner-modal')?.addEventListener('click', closeModal);
    byId('btn-cancel-new-banner')?.addEventListener('click', closeModal);
    newModal?.addEventListener('click', (event) => { if (event.target === newModal) closeModal(); });
    newModal?.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });

    // Create new banner submit
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
        image_url: byId('new-banner-image-url')?.value.trim() || '',
        status,
        starts_at: status === 'Scheduled' ? toIso(byId('new-banner-starts-at').value) : null,
        ends_at: status === 'Scheduled' ? toIso(byId('new-banner-ends-at').value) : null,
        order: parseInt(byId('new-banner-order')?.value, 10) || (banners.length ? Math.max(...banners.map((b) => Number(b.order) || 0)) + 1 : 1),
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
