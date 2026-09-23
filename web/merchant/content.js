/**
 * MetroDrip Merchant Console - Content & Banners Management
 * Figma Spec: 550:182 & 554:793
 */

(function () {
  'use strict';

  // Seed Placements State matching Figma 550:182
  let banners = [
    {
      id: 1,
      name: 'Urban Style Redefined',
      placement: 'Homepage hero',
      status: 'Live',
      schedule: 'Always on',
      headline: 'Urban Style Redefined',
      subtext: 'Designed for the City',
      buttonLabel: 'Shop Now',
      destination: '/shop',
      scheduleType: 'always'
    },
    {
      id: 2,
      name: 'Free shipping over ₱2,500',
      placement: 'Announcement bar',
      status: 'Live',
      schedule: 'Always on',
      headline: 'Free shipping over ₱2,500',
      subtext: 'Applies automatically at checkout on orders over ₱2,500.',
      buttonLabel: 'View Details',
      destination: '/shipping',
      scheduleType: 'always'
    },
    {
      id: 3,
      name: 'Weekend drop',
      placement: 'Homepage secondary',
      status: 'Scheduled',
      schedule: '25 Sep · 09:00 PHT',
      headline: 'Weekend drop',
      subtext: 'Exclusive release drops Friday 9:00 AM PHT sharp.',
      buttonLabel: 'Notify Me',
      destination: '/drops/weekend',
      scheduleType: 'scheduled'
    },
    {
      id: 4,
      name: 'New season collection',
      placement: 'Homepage hero',
      status: 'Draft',
      schedule: 'Not scheduled',
      headline: 'New season collection',
      subtext: 'Fall/Winter 2026 streetwear essentials now in stock.',
      buttonLabel: 'Explore Collection',
      destination: '/collections/fw26',
      scheduleType: 'draft'
    },
    {
      id: 5,
      name: 'Member early access',
      placement: 'Homepage secondary',
      status: 'Draft',
      schedule: 'Not scheduled',
      headline: 'Member early access',
      subtext: 'MetroDrip VIPs get 24-hour headstart before public drop.',
      buttonLabel: 'Unlock Access',
      destination: '/vip',
      scheduleType: 'draft'
    }
  ];

  let activeBannerId = 1; // Default to Urban Style Redefined (Homepage hero)

  // DOM Elements
  const placementsTableBody = document.getElementById('placements-table-body');
  const metricLiveBanners = document.getElementById('metric-live-banners');
  const metricScheduledBanners = document.getElementById('metric-scheduled-banners');
  const metricDraftBanners = document.getElementById('metric-draft-banners');

  const headingBannerEditor = document.getElementById('heading-banner-editor');
  const formBannerEditor = document.getElementById('form-banner-editor');
  const inputBannerHeadline = document.getElementById('input-banner-headline');
  const inputBannerSubtext = document.getElementById('input-banner-subtext');
  const inputBannerButtonLabel = document.getElementById('input-banner-button-label');
  const inputBannerDestination = document.getElementById('input-banner-destination');
  const selectBannerSchedule = document.getElementById('select-banner-schedule');
  const btnSaveDraft = document.getElementById('btn-save-draft');
  const btnPublishBanner = document.getElementById('btn-publish-banner');

  // Preview Elements
  const previewHeadline = document.getElementById('preview-headline');
  const previewSubtext = document.getElementById('preview-subtext');
  const previewCtaButton = document.getElementById('preview-cta-button');

  // Modal Elements
  const btnOpenNewBanner = document.getElementById('btn-open-new-banner');
  const modalNewBanner = document.getElementById('modal-new-banner');
  const btnCloseNewBannerModal = document.getElementById('btn-close-new-banner-modal');
  const btnCancelNewBanner = document.getElementById('btn-cancel-new-banner');
  const formNewBanner = document.getElementById('form-new-banner');

  const toastContainer = document.getElementById('toast-container');

  function showToast(message, type = 'success') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function updateMetrics() {
    const liveCount = banners.filter(b => b.status === 'Live').length;
    const scheduledCount = banners.filter(b => b.status === 'Scheduled').length;
    const draftCount = banners.filter(b => b.status === 'Draft').length;

    if (metricLiveBanners) metricLiveBanners.textContent = liveCount;
    if (metricScheduledBanners) metricScheduledBanners.textContent = scheduledCount;
    if (metricDraftBanners) metricDraftBanners.textContent = draftCount;
  }

  function getStatusPill(status) {
    if (status === 'Live') {
      return '<span class="status-pill status-active">Live</span>';
    } else if (status === 'Scheduled') {
      return '<span class="status-pill status-pending">Scheduled</span>';
    }
    return '<span class="status-pill status-alert">Draft</span>';
  }

  function renderTable() {
    if (!placementsTableBody) return;

    placementsTableBody.innerHTML = banners.map(b => {
      const isSelected = b.id === activeBannerId;
      const actionLabel = b.status === 'Live' ? 'Edit banner' : (b.status === 'Scheduled' ? 'Edit schedule' : 'Continue editing');
      return `
        <tr class="${isSelected ? 'is-selected-row' : ''}" style="${isSelected ? 'background-color: rgba(211, 238, 66, 0.08);' : ''}">
          <td style="font-weight: 600;">
            ${b.name}
            ${isSelected ? '<span style="font-size: 10px; margin-left: 6px; color: var(--color-muted);">(Editing)</span>' : ''}
          </td>
          <td>${b.placement}</td>
          <td>${getStatusPill(b.status)}</td>
          <td class="td-mono" style="font-size: 11px;">${b.schedule}</td>
          <td style="text-align: right;">
            <a href="javascript:void(0)" class="action-link btn-edit-banner" data-id="${b.id}" style="font-size: 11px; font-family: var(--font-mono); color: var(--color-ink); text-decoration: underline;">
              ${actionLabel}
            </a>
          </td>
        </tr>
      `;
    }).join('');

    placementsTableBody.querySelectorAll('.btn-edit-banner').forEach(link => {
      link.addEventListener('click', () => {
        const id = parseInt(link.dataset.id, 10);
        loadBannerIntoEditor(id);
      });
    });
  }

  function loadBannerIntoEditor(bannerId) {
    const banner = banners.find(b => b.id === bannerId);
    if (!banner) return;

    activeBannerId = bannerId;

    if (headingBannerEditor) {
      headingBannerEditor.textContent = `Edit ${banner.placement.toLowerCase()}`;
    }

    if (inputBannerHeadline) inputBannerHeadline.value = banner.headline;
    if (inputBannerSubtext) inputBannerSubtext.value = banner.subtext;
    if (inputBannerButtonLabel) inputBannerButtonLabel.value = banner.buttonLabel;
    if (inputBannerDestination) inputBannerDestination.value = banner.destination;
    if (selectBannerSchedule) selectBannerSchedule.value = banner.scheduleType || 'always';

    updateLivePreview();
    renderTable();

    const editorCard = document.getElementById('card-banner-editor');
    if (editorCard) {
      editorCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function updateLivePreview() {
    const headline = inputBannerHeadline ? inputBannerHeadline.value : 'URBAN STYLE REDEFINED';
    const subtext = inputBannerSubtext ? inputBannerSubtext.value : 'Designed for the City';
    const btnLabel = inputBannerButtonLabel ? inputBannerButtonLabel.value : 'Shop Now';

    if (previewHeadline) {
      // Split words gracefully for display headline
      const words = headline.trim().split(' ');
      if (words.length > 2) {
        const mid = Math.ceil(words.length / 2);
        previewHeadline.innerHTML = `${words.slice(0, mid).join(' ').toUpperCase()}<br>${words.slice(mid).join(' ').toUpperCase()}`;
      } else {
        previewHeadline.textContent = headline.toUpperCase();
      }
    }

    if (previewSubtext) {
      previewSubtext.textContent = subtext;
    }

    if (previewCtaButton) {
      previewCtaButton.textContent = btnLabel;
    }
  }

  // Live typing listeners
  if (inputBannerHeadline) inputBannerHeadline.addEventListener('input', updateLivePreview);
  if (inputBannerSubtext) inputBannerSubtext.addEventListener('input', updateLivePreview);
  if (inputBannerButtonLabel) inputBannerButtonLabel.addEventListener('input', updateLivePreview);

  // Save Draft Handler
  if (btnSaveDraft) {
    btnSaveDraft.addEventListener('click', () => {
      const banner = banners.find(b => b.id === activeBannerId);
      if (!banner) return;

      banner.headline = inputBannerHeadline.value;
      banner.subtext = inputBannerSubtext.value;
      banner.buttonLabel = inputBannerButtonLabel.value;
      banner.destination = inputBannerDestination.value;
      banner.status = 'Draft';
      banner.schedule = 'Not scheduled';
      banner.scheduleType = 'draft';

      updateMetrics();
      renderTable();
      showToast(`Saved "${banner.name}" as draft`);
    });
  }

  // Publish Handler
  if (formBannerEditor) {
    formBannerEditor.addEventListener('submit', (e) => {
      e.preventDefault();
      const banner = banners.find(b => b.id === activeBannerId);
      if (!banner) return;

      banner.headline = inputBannerHeadline.value;
      banner.subtext = inputBannerSubtext.value;
      banner.buttonLabel = inputBannerButtonLabel.value;
      banner.destination = inputBannerDestination.value;

      const scheduleVal = selectBannerSchedule ? selectBannerSchedule.value : 'always';
      if (scheduleVal === 'scheduled') {
        banner.status = 'Scheduled';
        banner.schedule = '25 Sep · 09:00 PHT';
        banner.scheduleType = 'scheduled';
        showToast(`Scheduled banner "${banner.name}" for release`);
      } else if (scheduleVal === 'draft') {
        banner.status = 'Draft';
        banner.schedule = 'Not scheduled';
        banner.scheduleType = 'draft';
        showToast(`Saved "${banner.name}" as draft`);
      } else {
        banner.status = 'Live';
        banner.schedule = 'Always on';
        banner.scheduleType = 'always';
        showToast(`Published "${banner.name}" to storefront!`);
      }

      updateMetrics();
      renderTable();
    });
  }

  // Modal Controls for New Banner
  function openNewBannerModal() {
    if (modalNewBanner) modalNewBanner.hidden = false;
  }

  function closeNewBannerModal() {
    if (modalNewBanner) modalNewBanner.hidden = true;
    if (formNewBanner) formNewBanner.reset();
  }

  if (btnOpenNewBanner) btnOpenNewBanner.addEventListener('click', openNewBannerModal);
  if (btnCloseNewBannerModal) btnCloseNewBannerModal.addEventListener('click', closeNewBannerModal);
  if (btnCancelNewBanner) btnCancelNewBanner.addEventListener('click', closeNewBannerModal);

  if (modalNewBanner) {
    modalNewBanner.addEventListener('click', (e) => {
      if (e.target === modalNewBanner) closeNewBannerModal();
    });
  }

  if (formNewBanner) {
    formNewBanner.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('new-banner-name').value;
      const placement = document.getElementById('new-banner-placement').value;
      const headline = document.getElementById('new-banner-headline').value;
      const subtext = document.getElementById('new-banner-subtext').value;
      const buttonLabel = document.getElementById('new-banner-cta').value;
      const destination = document.getElementById('new-banner-link').value;
      const status = document.getElementById('new-banner-status').value;

      const newId = banners.length ? Math.max(...banners.map(b => b.id)) + 1 : 1;
      const schedule = status === 'Live' ? 'Always on' : (status === 'Scheduled' ? 'Next week' : 'Not scheduled');

      const newBanner = {
        id: newId,
        name,
        placement,
        status,
        schedule,
        headline,
        subtext,
        buttonLabel,
        destination,
        scheduleType: status.toLowerCase()
      };

      banners.unshift(newBanner);
      closeNewBannerModal();
      updateMetrics();
      loadBannerIntoEditor(newId);
      showToast(`Created new banner "${name}"`);
    });
  }

  // Initial Run
  updateMetrics();
  renderTable();
  updateLivePreview();

})();
