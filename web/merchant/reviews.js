/**
 * MetroDrip Merchant Console - Customer Reviews Management
 * Figma Spec: 550:143 & 554:664 & 515:27 & 515:212
 */

(function () {
  'use strict';

  // Seed Reviews State
  let reviews = [
    {
      id: 1,
      customer: 'Bea S.',
      initials: 'BS',
      rating: 5,
      product: 'Drip Zip-Up Hoodie',
      productSku: 'MD-HD-001',
      date: '2 days ago',
      text: 'Super lapad ng fit and solid ng tela. Worth it!',
      needsReply: true,
      reply: null,
      replyDate: null
    },
    {
      id: 2,
      customer: 'Marco L.',
      initials: 'ML',
      rating: 4,
      product: 'Oversized Acid Wash Tee',
      productSku: 'MD-TS-042',
      date: '3 days ago',
      text: 'Nice heavy cotton, but the acid wash pattern is slightly lighter in person than in product photos.',
      needsReply: true,
      reply: null,
      replyDate: null
    },
    {
      id: 3,
      customer: 'Sarah T.',
      initials: 'ST',
      rating: 5,
      product: 'Cargo Utility Pant - Black',
      productSku: 'MD-PT-088',
      date: '1 week ago',
      text: 'Pockets are actually functional and the cut is super modern. Love this brand!',
      needsReply: false,
      reply: 'Thank you so much Sarah! Glad the utility pockets are hitting the mark.',
      replyDate: '6 days ago'
    },
    {
      id: 4,
      customer: 'Devon K.',
      initials: 'DK',
      rating: 5,
      product: 'Signature Nylon Bucket Hat',
      productSku: 'MD-HT-012',
      date: '2 weeks ago',
      text: 'Water-resistant material works great during rainy commute.',
      needsReply: false,
      reply: 'Thanks for the feedback Devon! We designed that specifically for unpredictable city weather.',
      replyDate: '13 days ago'
    }
  ];

  let currentFilter = {
    onlyNeedsReply: true,
    rating: 'all',
    search: ''
  };

  let activeReplyReviewId = 2; // Default targeting Marco L. matching Figma 550:143
  let activeModalReview = null;

  // DOM Elements
  const reviewsContainer = document.getElementById('reviews-list-container');
  const metricNeedsReply = document.getElementById('metric-needs-reply');
  const metricRepliedCount = document.getElementById('metric-replied-count');
  const chipReplyCount = document.getElementById('chip-reply-count');
  const sidebarReviewsCount = document.getElementById('sidebar-reviews-count');

  const btnFilterNeedsReply = document.getElementById('btn-filter-needs-reply');
  const btnToggleViewAll = document.getElementById('btn-toggle-view-all');
  const searchInput = document.getElementById('search-reviews-input');
  const filterRatingSelect = document.getElementById('filter-rating-select');

  const replyComposerCard = document.getElementById('card-reply-composer');
  const headingReplyComposer = document.getElementById('heading-reply-composer');
  const formReplyComposer = document.getElementById('form-reply-composer');
  const replyComposerTextarea = document.getElementById('reply-composer-textarea');
  const composerCharCount = document.getElementById('composer-char-count');
  const btnCancelReply = document.getElementById('btn-cancel-reply');

  // Modal Elements
  const modalViewReview = document.getElementById('modal-view-review');
  const btnCloseViewModal = document.getElementById('btn-close-view-modal');
  const btnCloseViewFooter = document.getElementById('btn-close-view-footer');
  const btnModalOpenReply = document.getElementById('btn-modal-open-reply');
  const viewCustomerName = document.getElementById('view-customer-name');
  const viewStarRating = document.getElementById('view-star-rating');
  const viewProductName = document.getElementById('view-product-name');
  const viewReviewBody = document.getElementById('view-review-body');
  const viewReplyStatus = document.getElementById('view-reply-status');

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

  function getStars(count) {
    return '★'.repeat(count) + '☆'.repeat(5 - count);
  }

  function updateMetrics() {
    const needsReplyCount = reviews.filter(r => r.needsReply).length;
    const repliedCount = 84 + reviews.filter(r => !r.needsReply && r.reply).length - 2; // Baseline from 84

    if (metricNeedsReply) metricNeedsReply.textContent = needsReplyCount;
    if (chipReplyCount) chipReplyCount.textContent = needsReplyCount;
    if (sidebarReviewsCount) sidebarReviewsCount.textContent = needsReplyCount;
    if (metricRepliedCount) metricRepliedCount.textContent = repliedCount;
  }

  function renderReviews() {
    if (!reviewsContainer) return;

    let filtered = reviews.filter(r => {
      if (currentFilter.onlyNeedsReply && !r.needsReply) return false;
      if (currentFilter.rating !== 'all' && r.rating !== parseInt(currentFilter.rating, 10)) return false;
      if (currentFilter.search) {
        const q = currentFilter.search.toLowerCase();
        const matchCust = r.customer.toLowerCase().includes(q);
        const matchProd = r.product.toLowerCase().includes(q);
        const matchText = r.text.toLowerCase().includes(q);
        if (!matchCust && !matchProd && !matchText) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      reviewsContainer.innerHTML = `
        <div style="padding: 32px 16px; text-align: center; color: var(--color-muted);">
          <p style="font-size: 14px; font-weight: 600; margin-bottom: 4px;">No reviews match your filter</p>
          <p style="font-size: 12px;">Try clearing your search query or switching to "View all reviews".</p>
        </div>
      `;
      return;
    }

    reviewsContainer.innerHTML = filtered.map(r => `
      <article class="review-item-card" data-review-id="${r.id}" style="border: 1px solid var(--color-border); border-radius: 6px; padding: 16px; margin-bottom: 12px; background: var(--color-paper);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 34px; height: 34px; border-radius: 50%; background: var(--color-surface); border: 1px solid var(--color-border); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px; color: var(--color-ink);">
              ${r.initials}
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <h3 style="font-size: 13px; font-weight: 700; color: var(--color-ink); margin: 0;">${r.customer}</h3>
                <span style="font-size: 11px; color: var(--color-muted);">${r.date}</span>
                ${r.needsReply ? '<span class="status-pill status-alert" style="font-size: 10px; padding: 2px 6px;">Needs reply</span>' : '<span class="status-pill status-active" style="font-size: 10px; padding: 2px 6px;">Replied</span>'}
              </div>
              <div style="display: flex; align-items: center; gap: 8px; margin-top: 2px;">
                <span class="td-mono" style="color: #ffb800; font-size: 12px;">${getStars(r.rating)}</span>
                <span style="font-size: 11px; color: var(--color-muted); font-weight: 500;">Product: <strong>${r.product}</strong></span>
              </div>
            </div>
          </div>
          <div style="display: flex; gap: 8px;">
            <button type="button" class="btn btn-secondary btn-view-review" data-id="${r.id}" style="padding: 4px 10px; font-size: 11px;">
              View review
            </button>
            ${r.needsReply ? `
              <button type="button" class="btn btn-primary btn-trigger-reply" data-id="${r.id}" style="padding: 4px 10px; font-size: 11px;">
                Reply
              </button>
            ` : ''}
          </div>
        </div>

        <div style="font-size: 13px; line-height: 1.5; color: var(--color-ink); margin-bottom: 8px;">
          ${r.text}
        </div>

        ${r.reply ? `
          <div style="margin-top: 12px; padding: 10px 14px; background: var(--color-surface); border-left: 3px solid var(--color-ink); border-radius: 0 4px 4px 0;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
              <span style="font-size: 11px; font-weight: 700; color: var(--color-ink); text-transform: uppercase; letter-spacing: 0.5px;">Merchant Response</span>
              <span style="font-size: 10px; color: var(--color-muted);">${r.replyDate || 'Just now'}</span>
            </div>
            <p style="font-size: 12px; color: var(--color-ink); margin: 0; line-height: 1.4;">${r.reply}</p>
          </div>
        ` : ''}
      </article>
    `).join('');

    // Attach listeners
    reviewsContainer.querySelectorAll('.btn-view-review').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id, 10);
        openViewModal(id);
      });
    });

    reviewsContainer.querySelectorAll('.btn-trigger-reply').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id, 10);
        setReplyTarget(id);
      });
    });
  }

  function setReplyTarget(reviewId) {
    const target = reviews.find(r => r.id === reviewId);
    if (!target) return;

    activeReplyReviewId = reviewId;
    if (headingReplyComposer) {
      headingReplyComposer.textContent = `Reply to ${target.customer}`;
    }

    if (replyComposerTextarea) {
      if (reviewId === 2) {
        replyComposerTextarea.value = 'Thanks for your feedback, Marco. Please contact our support team so we can help with the color difference.';
      } else if (reviewId === 1) {
        replyComposerTextarea.value = 'Salamat sa review, Bea! Enjoy the hoodie and stay dripped.';
      } else {
        replyComposerTextarea.value = `Thank you for your feedback, ${target.customer.split(' ')[0]}!`;
      }
      updateCharCount();
      replyComposerTextarea.focus();
    }

    if (replyComposerCard) {
      replyComposerCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function updateCharCount() {
    if (!replyComposerTextarea || !composerCharCount) return;
    const len = replyComposerTextarea.value.length;
    composerCharCount.textContent = `${len} / 1,000 characters`;
  }

  function openViewModal(reviewId) {
    const target = reviews.find(r => r.id === reviewId);
    if (!target) return;

    activeModalReview = target;
    if (viewCustomerName) viewCustomerName.textContent = target.customer;
    if (viewStarRating) viewStarRating.textContent = `${target.rating} of 5 stars (${getStars(target.rating)})`;
    if (viewProductName) viewProductName.textContent = `${target.product} (${target.productSku})`;
    if (viewReviewBody) viewReviewBody.textContent = `“${target.text}”`;

    if (viewReplyStatus) {
      if (target.reply) {
        viewReplyStatus.innerHTML = `<span style="color: var(--color-ink); font-weight: 600;">Replied:</span> "${target.reply}"`;
      } else {
        viewReplyStatus.textContent = 'No merchant reply yet';
      }
    }

    if (btnModalOpenReply) {
      btnModalOpenReply.style.display = target.needsReply ? 'inline-block' : 'none';
    }

    if (modalViewReview) modalViewReview.hidden = false;
  }

  function closeViewModal() {
    if (modalViewReview) modalViewReview.hidden = true;
    activeModalReview = null;
  }

  // Setup Event Handlers
  if (btnFilterNeedsReply) {
    btnFilterNeedsReply.addEventListener('click', () => {
      currentFilter.onlyNeedsReply = !currentFilter.onlyNeedsReply;
      btnFilterNeedsReply.classList.toggle('is-active', currentFilter.onlyNeedsReply);
      renderReviews();
    });
  }

  if (btnToggleViewAll) {
    btnToggleViewAll.addEventListener('click', () => {
      currentFilter.onlyNeedsReply = false;
      if (btnFilterNeedsReply) btnFilterNeedsReply.classList.remove('is-active');
      renderReviews();
      showToast('Showing all customer reviews');
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentFilter.search = e.target.value.trim();
      renderReviews();
    });
  }

  if (filterRatingSelect) {
    filterRatingSelect.addEventListener('change', (e) => {
      currentFilter.rating = e.target.value;
      renderReviews();
    });
  }

  if (replyComposerTextarea) {
    replyComposerTextarea.addEventListener('input', updateCharCount);
  }

  if (btnCancelReply) {
    btnCancelReply.addEventListener('click', () => {
      if (replyComposerTextarea) {
        replyComposerTextarea.value = '';
        updateCharCount();
      }
      showToast('Reply canceled', 'info');
    });
  }

  if (formReplyComposer) {
    formReplyComposer.addEventListener('submit', (e) => {
      e.preventDefault();
      const replyText = replyComposerTextarea ? replyComposerTextarea.value.trim() : '';
      if (!replyText) {
        showToast('Please enter reply text before posting', 'error');
        return;
      }

      const target = reviews.find(r => r.id === activeReplyReviewId);
      if (!target) {
        showToast('Unable to find review to reply to', 'error');
        return;
      }

      target.needsReply = false;
      target.reply = replyText;
      target.replyDate = 'Just now';

      updateMetrics();
      renderReviews();

      showToast(`Reply posted for ${target.customer}`);

      // Reset composer to next review needing reply if any
      const nextTarget = reviews.find(r => r.needsReply);
      if (nextTarget) {
        setReplyTarget(nextTarget.id);
      } else {
        if (replyComposerTextarea) replyComposerTextarea.value = '';
        updateCharCount();
        if (headingReplyComposer) headingReplyComposer.textContent = 'Reply to review';
      }
    });
  }

  // Modal Handlers
  if (btnCloseViewModal) btnCloseViewModal.addEventListener('click', closeViewModal);
  if (btnCloseViewFooter) btnCloseViewFooter.addEventListener('click', closeViewModal);

  if (btnModalOpenReply) {
    btnModalOpenReply.addEventListener('click', () => {
      if (activeModalReview) {
        const id = activeModalReview.id;
        closeViewModal();
        setReplyTarget(id);
      }
    });
  }

  if (modalViewReview) {
    modalViewReview.addEventListener('click', (e) => {
      if (e.target === modalViewReview) closeViewModal();
    });
  }

  // Initial Boot
  updateMetrics();
  renderReviews();
  updateCharCount();

})();
