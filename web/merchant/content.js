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

  function getSelectedArtworkMode() {
    return document.querySelector('input[name="artwork_mode"]:checked')?.value || 'graphic';
  }

  function setArtworkMode(mode) {
    const radioGraphic = byId('radio-mode-graphic');
    const radioImage = byId('radio-mode-image');
    if (mode === 'image') {
      if (radioImage) radioImage.checked = true;
      byId('label-mode-image')?.classList.add('is-selected');
      byId('label-mode-graphic')?.classList.remove('is-selected');
      byId('panel-artwork-image')?.removeAttribute('hidden');
      byId('panel-artwork-graphic')?.setAttribute('hidden', '');
    } else {
      if (radioGraphic) radioGraphic.checked = true;
      byId('label-mode-graphic')?.classList.add('is-selected');
      byId('label-mode-image')?.classList.remove('is-selected');
      byId('panel-artwork-graphic')?.removeAttribute('hidden');
      byId('panel-artwork-image')?.setAttribute('hidden', '');
    }
  }

  function displayArtworkImageDetails(url, name, sizeBytes) {
    const details = byId('artwork-image-details');
    const thumb = byId('artwork-image-preview-thumb');
    const filename = byId('artwork-image-filename');
    const filesize = byId('artwork-image-filesize');
    if (!url) {
      if (details) details.hidden = true;
      if (thumb) thumb.src = '';
      if (filename) filename.textContent = 'No file uploaded';
      if (filesize) filesize.textContent = '—';
      return;
    }
    if (details) details.hidden = false;
    if (thumb) thumb.src = url;
    if (filename) filename.textContent = name || url.split('/').pop() || 'uploaded-image';
    if (filesize) {
      filesize.textContent = sizeBytes ? `${(sizeBytes / 1024).toFixed(1)} KB` : 'Uploaded image';
    }
  }

  async function uploadArtworkImage(file) {
    if (!file) return;
    const errorEl = byId('artwork-upload-error');
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }

    const validMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validMimes.includes(file.type)) {
      const msg = 'Invalid file format. Please upload a JPG, PNG, or WebP image.';
      if (errorEl) {
        errorEl.hidden = false;
        errorEl.textContent = msg;
      }
      showToast(msg, 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      const msg = 'File exceeds the 5 MiB size limit.';
      if (errorEl) {
        errorEl.hidden = false;
        errorEl.textContent = msg;
      }
      showToast(msg, 'error');
      return;
    }

    const current = session();
    if (!current) {
      showToast('Session expired. Please sign in again.', 'error');
      return;
    }

    const idleBox = byId('artwork-upload-idle');
    const loadingBox = byId('artwork-uploading-indicator');
    const browseBtn = byId('btn-browse-artwork-file');
    if (idleBox) idleBox.hidden = true;
    if (loadingBox) loadingBox.hidden = false;
    if (browseBtn) browseBtn.disabled = true;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE}/banners/upload/`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${current.access_token}`,
        },
        body: formData,
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || `Upload failed (${response.status})`);
      }

      const url = result.url;
      if (byId('input-banner-image-url')) byId('input-banner-image-url').value = url;
      if (byId('input-artwork-direct-url')) byId('input-artwork-direct-url').value = url;
      displayArtworkImageDetails(url, file.name, file.size);
      updatePreview();
      showToast('Hero promotional image uploaded successfully.');
    } catch (err) {
      if (errorEl) {
        errorEl.hidden = false;
        errorEl.textContent = err.message || 'Image upload failed.';
      }
      showToast(err.message || 'Image upload failed.', 'error');
    } finally {
      if (idleBox) idleBox.hidden = false;
      if (loadingBox) loadingBox.hidden = true;
      if (browseBtn) browseBtn.disabled = false;
    }
  }

  function resetGraphicDefaults() {
    if (byId('input-graphic-text-main')) byId('input-graphic-text-main').value = 'MD';
    if (byId('input-graphic-text-tagline')) byId('input-graphic-text-tagline').value = 'BUILT FOR THE STREETS';
    if (byId('input-graphic-text-sub')) byId('input-graphic-text-sub').value = 'METRODRIP / MANILA';
    if (byId('input-graphic-bg-color')) byId('input-graphic-bg-color').value = '#d3ee42';
    if (byId('picker-graphic-bg-color')) byId('picker-graphic-bg-color').value = '#d3ee42';
    if (byId('input-graphic-text-color')) byId('input-graphic-text-color').value = '#141414';
    if (byId('picker-graphic-text-color')) byId('picker-graphic-text-color').value = '#141414';
    if (byId('input-graphic-accent-color')) byId('input-graphic-accent-color').value = '#141414';
    if (byId('picker-graphic-accent-color')) byId('picker-graphic-accent-color').value = '#141414';
    if (byId('select-graphic-alignment')) byId('select-graphic-alignment').value = 'left';
    if (byId('select-graphic-font-size')) byId('select-graphic-font-size').value = 'normal';
    updatePreview();
    showToast('Branded graphic design reset to defaults.');
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
      artwork_mode: getSelectedArtworkMode(),
      graphic_text_main: byId('input-graphic-text-main')?.value.trim() || 'MD',
      graphic_text_tagline: byId('input-graphic-text-tagline')?.value.trim() || 'BUILT FOR THE STREETS',
      graphic_text_sub: byId('input-graphic-text-sub')?.value.trim() || 'METRODRIP / MANILA',
      graphic_bg_color: byId('input-graphic-bg-color')?.value.trim().toLowerCase() || '#d3ee42',
      graphic_text_color: byId('input-graphic-text-color')?.value.trim().toLowerCase() || '#141414',
      graphic_accent_color: byId('input-graphic-accent-color')?.value.trim().toLowerCase() || '#141414',
      graphic_alignment: byId('select-graphic-alignment')?.value || 'left',
      graphic_font_size: byId('select-graphic-font-size')?.value || 'normal',
      image_fit: byId('select-artwork-image-fit')?.value || 'cover',
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
    const isHero = placementVal === 'homepage_hero';

    byId('preview-headline').textContent = headline.toUpperCase();
    byId('preview-subtext').textContent = subtext;
    byId('preview-cta-button').textContent = buttonLabel;

    // Toggle hero artwork section visibility in form
    const heroSection = byId('section-hero-artwork');
    if (heroSection) {
      heroSection.hidden = !isHero;
    }

    const previewCard = byId('banner-preview-card');
    const heroRight = byId('hero-preview-right');
    const artworkCard = byId('preview-artwork-card');

    if (previewCard) {
      if (isHero) {
        previewCard.classList.add('is-hero-layout');
        if (heroRight) heroRight.hidden = false;
        previewCard.style.backgroundImage = '';
      } else {
        previewCard.classList.remove('is-hero-layout');
        if (heroRight) heroRight.hidden = true;
        if (imageUrl && (imageUrl.startsWith('http') || imageUrl.startsWith('/'))) {
          previewCard.style.backgroundImage = `linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.7)), url('${imageUrl}')`;
          previewCard.classList.add('has-image');
        } else {
          previewCard.style.backgroundImage = '';
          previewCard.classList.remove('has-image');
        }
      }
    }

    // Hero right-side artwork preview
    if (isHero && artworkCard) {
      const mode = getSelectedArtworkMode();
      const fit = byId('select-artwork-image-fit')?.value || 'cover';
      const mainText = byId('input-graphic-text-main')?.value.trim() || 'MD';
      const tagline = byId('input-graphic-text-tagline')?.value.trim() || 'BUILT FOR THE STREETS';
      const sub = byId('input-graphic-text-sub')?.value.trim() || 'METRODRIP / MANILA';
      const bgColor = byId('input-graphic-bg-color')?.value.trim() || '#d3ee42';
      const textColor = byId('input-graphic-text-color')?.value.trim() || '#141414';
      const accentColor = byId('input-graphic-accent-color')?.value.trim() || '#141414';
      const alignment = byId('select-graphic-alignment')?.value || 'left';
      const fontSize = byId('select-graphic-font-size')?.value || 'normal';

      artworkCard.className = `preview-artwork-card align-${alignment} font-${fontSize}`;

      if (mode === 'image' && imageUrl) {
        artworkCard.classList.add('is-image-mode');
        artworkCard.style.backgroundImage = `url('${imageUrl}')`;
        artworkCard.style.backgroundSize = fit;
        artworkCard.style.backgroundColor = '#141414';
        if (byId('preview-artwork-main')) byId('preview-artwork-main').style.display = 'none';
        if (byId('preview-artwork-tagline')) byId('preview-artwork-tagline').style.display = 'none';
        if (byId('preview-artwork-sub')) byId('preview-artwork-sub').style.display = 'none';
      } else {
        artworkCard.classList.remove('is-image-mode');
        artworkCard.style.backgroundImage = '';
        artworkCard.style.backgroundColor = bgColor;
        artworkCard.style.color = textColor;

        const mainEl = byId('preview-artwork-main');
        const tagEl = byId('preview-artwork-tagline');
        const subEl = byId('preview-artwork-sub');

        if (mainEl) {
          mainEl.style.display = '';
          mainEl.style.color = textColor;
          mainEl.textContent = mainText;
        }
        if (tagEl) {
          tagEl.style.display = '';
          tagEl.style.color = textColor;
          tagEl.textContent = tagline;
        }
        if (subEl) {
          subEl.style.display = '';
          subEl.style.color = accentColor;
          subEl.textContent = sub;
        }
      }
    }

    const destInfo = byId('preview-destination-info');
    if (destInfo) destInfo.textContent = `Destination: ${destination}`;

    const placeInfo = byId('preview-placement-info');
    if (placeInfo) {
      const placeName = placements[placementVal] || 'Storefront placement';
      placeInfo.textContent = `${placeName} · Live sync on Customer Web & Mobile`;
    }

    // Draft indicator pill
    const draftPill = byId('preview-draft-pill');
    if (draftPill) {
      const scheduleSelect = byId('select-banner-schedule');
      const isDraftStatus = scheduleSelect?.value === 'draft';
      const dirty = isFormDirty();
      if (dirty) {
        draftPill.hidden = false;
        draftPill.textContent = 'UNSAVED CHANGES';
        draftPill.style.color = '#ffaa00';
      } else if (isDraftStatus) {
        draftPill.hidden = false;
        draftPill.textContent = 'DRAFT';
        draftPill.style.color = '#a0a0a0';
      } else {
        draftPill.hidden = true;
      }
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
        'input-artwork-direct-url',
        'input-graphic-text-main',
        'input-graphic-text-tagline',
        'input-graphic-text-sub',
        'input-graphic-bg-color',
        'input-graphic-text-color',
        'input-graphic-accent-color',
      ].forEach((field) => { if (byId(field)) byId(field).value = ''; });
      displayArtworkImageDetails('', '', null);
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

    // Load artwork settings
    const mode = banner.artwork_mode || (banner.image_url ? 'image' : 'graphic');
    setArtworkMode(mode);

    const mainText = banner.graphic_text_main ?? 'MD';
    const tagline = banner.graphic_text_tagline ?? 'BUILT FOR THE STREETS';
    const subText = banner.graphic_text_sub ?? 'METRODRIP / MANILA';
    const bgColor = banner.graphic_bg_color || '#d3ee42';
    const textColor = banner.graphic_text_color || '#141414';
    const accentColor = banner.graphic_accent_color || '#141414';
    const alignment = banner.graphic_alignment || 'left';
    const fontSize = banner.graphic_font_size || 'normal';
    const imageFit = banner.image_fit || 'cover';

    if (byId('input-graphic-text-main')) byId('input-graphic-text-main').value = mainText;
    if (byId('input-graphic-text-tagline')) byId('input-graphic-text-tagline').value = tagline;
    if (byId('input-graphic-text-sub')) byId('input-graphic-text-sub').value = subText;
    if (byId('input-graphic-bg-color')) byId('input-graphic-bg-color').value = bgColor;
    if (byId('picker-graphic-bg-color')) byId('picker-graphic-bg-color').value = bgColor;
    if (byId('input-graphic-text-color')) byId('input-graphic-text-color').value = textColor;
    if (byId('picker-graphic-text-color')) byId('picker-graphic-text-color').value = textColor;
    if (byId('input-graphic-accent-color')) byId('input-graphic-accent-color').value = accentColor;
    if (byId('picker-graphic-accent-color')) byId('picker-graphic-accent-color').value = accentColor;
    if (byId('select-graphic-alignment')) byId('select-graphic-alignment').value = alignment;
    if (byId('select-graphic-font-size')) byId('select-graphic-font-size').value = fontSize;
    if (byId('select-artwork-image-fit')) byId('select-artwork-image-fit').value = imageFit;
    if (byId('input-artwork-direct-url')) byId('input-artwork-direct-url').value = banner.image_url || '';

    if (banner.image_url) {
      displayArtworkImageDetails(banner.image_url, banner.image_url.split('/').pop(), null);
    } else {
      displayArtworkImageDetails('', '', null);
    }

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
      artwork_mode: mode,
      graphic_text_main: mainText,
      graphic_text_tagline: tagline,
      graphic_text_sub: subText,
      graphic_bg_color: bgColor.toLowerCase(),
      graphic_text_color: textColor.toLowerCase(),
      graphic_accent_color: accentColor.toLowerCase(),
      graphic_alignment: alignment,
      graphic_font_size: fontSize,
      image_fit: imageFit,
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

    setArtworkMode(originalSnapshot.artwork_mode);
    if (byId('input-graphic-text-main')) byId('input-graphic-text-main').value = originalSnapshot.graphic_text_main;
    if (byId('input-graphic-text-tagline')) byId('input-graphic-text-tagline').value = originalSnapshot.graphic_text_tagline;
    if (byId('input-graphic-text-sub')) byId('input-graphic-text-sub').value = originalSnapshot.graphic_text_sub;
    if (byId('input-graphic-bg-color')) byId('input-graphic-bg-color').value = originalSnapshot.graphic_bg_color;
    if (byId('picker-graphic-bg-color')) byId('picker-graphic-bg-color').value = originalSnapshot.graphic_bg_color;
    if (byId('input-graphic-text-color')) byId('input-graphic-text-color').value = originalSnapshot.graphic_text_color;
    if (byId('picker-graphic-text-color')) byId('picker-graphic-text-color').value = originalSnapshot.graphic_text_color;
    if (byId('input-graphic-accent-color')) byId('input-graphic-accent-color').value = originalSnapshot.graphic_accent_color;
    if (byId('picker-graphic-accent-color')) byId('picker-graphic-accent-color').value = originalSnapshot.graphic_accent_color;
    if (byId('select-graphic-alignment')) byId('select-graphic-alignment').value = originalSnapshot.graphic_alignment;
    if (byId('select-graphic-font-size')) byId('select-graphic-font-size').value = originalSnapshot.graphic_font_size;
    if (byId('select-artwork-image-fit')) byId('select-artwork-image-fit').value = originalSnapshot.image_fit;
    if (byId('input-artwork-direct-url')) byId('input-artwork-direct-url').value = originalSnapshot.image_url;

    displayArtworkImageDetails(originalSnapshot.image_url, originalSnapshot.image_url.split('/').pop(), null);

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
      artwork_mode: getSelectedArtworkMode(),
      graphic_text_main: byId('input-graphic-text-main')?.value.trim() || 'MD',
      graphic_text_tagline: byId('input-graphic-text-tagline')?.value.trim() || 'BUILT FOR THE STREETS',
      graphic_text_sub: byId('input-graphic-text-sub')?.value.trim() || 'METRODRIP / MANILA',
      graphic_bg_color: byId('input-graphic-bg-color')?.value.trim() || '#d3ee42',
      graphic_text_color: byId('input-graphic-text-color')?.value.trim() || '#141414',
      graphic_accent_color: byId('input-graphic-accent-color')?.value.trim() || '#141414',
      graphic_alignment: byId('select-graphic-alignment')?.value || 'left',
      graphic_font_size: byId('select-graphic-font-size')?.value || 'normal',
      image_fit: byId('select-artwork-image-fit')?.value || 'cover',
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
      'input-graphic-text-main',
      'input-graphic-text-tagline',
      'input-graphic-text-sub',
      'input-graphic-bg-color',
      'input-graphic-text-color',
      'input-graphic-accent-color',
      'select-graphic-alignment',
      'select-graphic-font-size',
      'select-artwork-image-fit',
      'input-artwork-direct-url',
    ].forEach((id) => {
      byId(id)?.addEventListener('input', updatePreview);
      byId(id)?.addEventListener('change', updatePreview);
    });

    // Sync direct URL field with image_url
    byId('input-artwork-direct-url')?.addEventListener('input', () => {
      const val = byId('input-artwork-direct-url').value.trim();
      if (byId('input-banner-image-url')) byId('input-banner-image-url').value = val;
      displayArtworkImageDetails(val, val.split('/').pop(), null);
      updatePreview();
    });

    byId('input-banner-image-url')?.addEventListener('input', () => {
      const val = byId('input-banner-image-url').value.trim();
      if (byId('input-artwork-direct-url')) byId('input-artwork-direct-url').value = val;
      displayArtworkImageDetails(val, val.split('/').pop(), null);
      updatePreview();
    });

    // Artwork mode switcher radio listeners
    document.querySelectorAll('input[name="artwork_mode"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        setArtworkMode(radio.value);
        updatePreview();
      });
    });

    // Color pickers synchronization
    [
      ['picker-graphic-bg-color', 'input-graphic-bg-color'],
      ['picker-graphic-text-color', 'input-graphic-text-color'],
      ['picker-graphic-accent-color', 'input-graphic-accent-color'],
    ].forEach(([pickerId, inputId]) => {
      const picker = byId(pickerId);
      const textInput = byId(inputId);
      if (picker && textInput) {
        picker.addEventListener('input', () => {
          textInput.value = picker.value;
          updatePreview();
        });
        textInput.addEventListener('input', () => {
          if (/^#[0-9a-fA-F]{6}$/.test(textInput.value.trim())) {
            picker.value = textInput.value.trim();
          }
          updatePreview();
        });
      }
    });

    // Image upload trigger and file handling
    const fileInput = byId('input-artwork-file');
    byId('btn-browse-artwork-file')?.addEventListener('click', () => fileInput?.click());
    byId('btn-replace-artwork-image')?.addEventListener('click', () => fileInput?.click());

    fileInput?.addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      if (file) {
        uploadArtworkImage(file);
      }
    });

    // Remove image button
    byId('btn-remove-artwork-image')?.addEventListener('click', () => {
      if (byId('input-banner-image-url')) byId('input-banner-image-url').value = '';
      if (byId('input-artwork-direct-url')) byId('input-artwork-direct-url').value = '';
      if (fileInput) fileInput.value = '';
      displayArtworkImageDetails('', '', null);
      updatePreview();
      showToast('Image removed.');
    });

    // Drag and drop onto upload dropzone
    const dropzone = byId('artwork-dropzone');
    if (dropzone) {
      ['dragenter', 'dragover'].forEach((eventName) => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add('is-dragover');
        });
      });
      ['dragleave', 'drop'].forEach((eventName) => {
        dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.remove('is-dragover');
        });
      });
      dropzone.addEventListener('drop', (e) => {
        const file = e.dataTransfer?.files?.[0];
        if (file) {
          uploadArtworkImage(file);
        }
      });
    }

    // Restore graphic defaults button
    byId('btn-restore-graphic-defaults')?.addEventListener('click', resetGraphicDefaults);

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
