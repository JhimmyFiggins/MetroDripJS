// Merchant reviews console backed only by authenticated review records.
(() => {
  'use strict';

  const API_BASE = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://127.0.0.1:8000/api/merchant'
    : '/api/merchant';
  const SESSION_KEY = 'metrodrip_active_user';
  const LOGIN_URL = '../Registration/screens/MerchantLoginScreen.html';

  let reviews = [];
  let reviewsLoaded = false;
  let activeReplyReviewId = null;
  let activeModalReviewId = null;
  let lastFocusedElement = null;
  const filters = { onlyNeedsReply: true, rating: 'all', search: '' };

  const reviewsContainer = document.getElementById('reviews-list-container');
  const modal = document.getElementById('modal-view-review');
  const replyTextarea = document.getElementById('reply-composer-textarea');

  function escapeHtml(value) {
    const element = document.createElement('div');
    element.appendChild(document.createTextNode(String(value ?? '')));
    return element.innerHTML;
  }

  function merchantSession() {
    try {
      const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      const role = String(session?.role || '').toLowerCase();
      const token = session?.access_token || session?.token || '';
      return token && session?.is_staff === true && ['merchant', 'admin'].includes(role)
        ? { ...session, token }
        : null;
    } catch {
      return null;
    }
  }

  async function responseError(response, fallback) {
    let message = fallback;
    try {
      const data = await response.json();
      message = data?.error?.message || data?.error || data?.detail || fallback;
    } catch {
      // Keep the status-specific fallback when the response is not JSON.
    }
    const error = new Error(message);
    error.status = response.status;
    return error;
  }

  async function requestJson(path, options = {}) {
    const session = merchantSession();
    if (!session) {
      const error = new Error('Sign in with an authorized merchant account to manage reviews.');
      error.status = 401;
      throw error;
    }
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${session.token}`,
        ...(options.headers || {}),
      },
    });
    if (!response.ok) throw await responseError(response, `Review request returned HTTP ${response.status}.`);
    return response.status === 204 ? null : response.json();
  }

  function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3500);
  }

  function ensureStateBanner() {
    let banner = document.getElementById('reviews-page-state');
    if (banner) return banner;
    banner = document.createElement('section');
    banner.id = 'reviews-page-state';
    banner.className = 'console-state-banner is-info';
    banner.hidden = true;
    banner.innerHTML = `
      <div class="console-state-copy">
        <p class="console-state-eyebrow" data-state-eyebrow>STATUS</p>
        <strong class="console-state-title" data-state-title></strong>
        <p class="console-state-message" data-state-message></p>
      </div>
      <div class="console-state-actions">
        <button type="button" class="btn btn-secondary btn-sm" data-state-retry hidden>Try again</button>
        <a class="btn btn-primary btn-sm" data-state-signin href="${LOGIN_URL}" hidden>Merchant sign in</a>
      </div>`;
    document.querySelector('.console-header')?.insertAdjacentElement('afterend', banner);
    banner.querySelector('[data-state-retry]')?.addEventListener('click', loadReviews);
    return banner;
  }

  function setPageState(kind, title = '', message = '', { retry = false, signIn = false } = {}) {
    const banner = ensureStateBanner();
    if (kind === 'ready') {
      banner.hidden = true;
      return;
    }
    const tone = kind === 'partial' || kind === 'permission' ? 'warning' : kind;
    banner.hidden = false;
    banner.className = `console-state-banner is-${tone === 'loading' ? 'info' : tone}`;
    banner.setAttribute('role', ['error', 'permission'].includes(kind) ? 'alert' : 'status');
    banner.querySelector('[data-state-eyebrow]').textContent = kind === 'permission' ? 'ACCESS REQUIRED' : kind.toUpperCase();
    banner.querySelector('[data-state-title]').textContent = title;
    banner.querySelector('[data-state-message]').textContent = message;
    banner.querySelector('[data-state-retry]').hidden = !retry;
    banner.querySelector('[data-state-signin]').hidden = !signIn;
  }

  function setListState(kind, title, message) {
    if (!reviewsContainer) return;
    reviewsContainer.setAttribute('aria-busy', kind === 'loading' ? 'true' : 'false');
    reviewsContainer.innerHTML = kind === 'loading'
      ? '<div class="skeleton-stack" aria-hidden="true"><span class="skeleton-line is-wide"></span><span class="skeleton-line"></span><span class="skeleton-line is-wide"></span></div><span class="sr-only">Loading customer reviews</span>'
      : `<div class="table-state"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span></div>`;
  }

  function normalizeReview(review) {
    const rating = Number(review?.rating);
    return {
      id: Number(review?.id),
      customer: String(review?.customer_name || review?.customer || 'Customer name unavailable'),
      product: String(review?.product_name || 'Product unavailable'),
      body: String(review?.body || ''),
      rating: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : 0,
      status: String(review?.status || 'unreported'),
      reply: review?.merchant_reply ? String(review.merchant_reply) : '',
      repliedAt: review?.replied_at ? String(review.replied_at) : null,
      createdAt: review?.created_at ? String(review.created_at) : null,
    };
  }

  function initials(name) {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '??';
    return (parts.length === 1 ? parts[0].slice(0, 2) : `${parts[0][0]}${parts.at(-1)[0]}`).toUpperCase();
  }

  function stars(rating) {
    return rating ? '★'.repeat(rating) + '☆'.repeat(5 - rating) : 'Rating unavailable';
  }

  function needsReply(review) {
    return !review.reply;
  }

  function setComposerEnabled(enabled) {
    ['reply-composer-textarea', 'btn-post-reply', 'btn-cancel-reply'].forEach((id) => {
      const control = document.getElementById(id);
      if (control) control.disabled = !enabled;
    });
  }

  function clearReplyTarget() {
    activeReplyReviewId = null;
    if (replyTextarea) replyTextarea.value = '';
    const heading = document.getElementById('heading-reply-composer');
    if (heading) heading.textContent = 'Select a review to reply';
    setComposerEnabled(false);
    updateCharCount();
  }

  function updateMetrics() {
    const needsReplyCount = reviews.filter(needsReply).length;
    const repliedCount = reviews.filter((review) => Boolean(review.reply)).length;
    const rated = reviews.filter((review) => review.rating > 0);
    const average = rated.length
      ? (rated.reduce((sum, review) => sum + review.rating, 0) / rated.length).toFixed(1)
      : null;
    const values = {
      'metric-needs-reply': needsReplyCount,
      'metric-replied-count': repliedCount,
      'chip-reply-count': needsReplyCount,
      'sidebar-reviews-count': needsReplyCount,
    };
    Object.entries(values).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.textContent = String(value);
    });
    const averageElement = document.getElementById('metric-average-rating');
    if (averageElement) averageElement.textContent = average ? `${average} / 5` : '—';
    const cohort = document.getElementById('metric-review-cohort');
    if (cohort) cohort.textContent = `${rated.length} loaded rated review${rated.length === 1 ? '' : 's'}`;
  }

  function filteredReviews() {
    return reviews.filter((review) => {
      if (filters.onlyNeedsReply && !needsReply(review)) return false;
      if (filters.rating !== 'all' && review.rating !== Number(filters.rating)) return false;
      if (!filters.search) return true;
      const haystack = `${review.customer} ${review.product} ${review.body}`.toLowerCase();
      return haystack.includes(filters.search);
    });
  }

  function renderReviews() {
    if (!reviewsContainer || !reviewsLoaded) return;
    reviewsContainer.setAttribute('aria-busy', 'false');
    const filtered = filteredReviews();
    if (!reviews.length) {
      setListState('empty', 'No customer reviews', 'Submitted reviews will appear here after the API stores them.');
      return;
    }
    if (!filtered.length) {
      setListState('empty', 'No reviews match this view', 'Clear the search, rating, or reply filter to see other loaded reviews.');
      return;
    }
    reviewsContainer.innerHTML = filtered.map((review) => `
      <article class="review-item-card" data-review-id="${review.id}" style="border: 1px solid var(--color-border); border-radius: 6px; padding: 16px; margin-bottom: 12px; background: var(--color-paper);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 10px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 34px; height: 34px; border-radius: 50%; background: var(--color-surface); border: 1px solid var(--color-border); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px; color: var(--color-ink);" aria-hidden="true">${escapeHtml(initials(review.customer))}</div>
            <div>
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <h3 style="font-size: 13px; font-weight: 700; color: var(--color-ink); margin: 0;">${escapeHtml(review.customer)}</h3>
                <span style="font-size: 11px; color: var(--color-muted);">${escapeHtml(review.createdAt || 'Date unavailable')}</span>
                <span class="status-pill ${needsReply(review) ? 'status-alert' : 'status-active'}" style="font-size: 10px; padding: 2px 6px;">${needsReply(review) ? 'Needs reply' : 'Replied'}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px; margin-top: 2px; flex-wrap: wrap;">
                <span class="td-mono" style="color: #9a6b00; font-size: 12px;" aria-label="${review.rating ? `${review.rating} out of 5 stars` : 'Rating unavailable'}">${escapeHtml(stars(review.rating))}</span>
                <span style="font-size: 11px; color: var(--color-muted); font-weight: 500;">Product: <strong>${escapeHtml(review.product)}</strong></span>
              </div>
            </div>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end;">
            <button type="button" class="btn btn-secondary btn-view-review" data-id="${review.id}" style="padding: 4px 10px; font-size: 11px;">View review</button>
            ${needsReply(review) ? `<button type="button" class="btn btn-primary btn-trigger-reply" data-id="${review.id}" style="padding: 4px 10px; font-size: 11px;">Reply</button>` : ''}
          </div>
        </div>
        <p style="font-size: 13px; line-height: 1.5; color: var(--color-ink); margin: 0 0 8px;">${escapeHtml(review.body || 'Review text unavailable')}</p>
        ${review.reply ? `
          <div style="margin-top: 12px; padding: 10px 14px; background: var(--color-surface); border-left: 3px solid var(--color-ink); border-radius: 0 4px 4px 0;">
            <div style="display: flex; justify-content: space-between; gap: 8px; margin-bottom: 4px;">
              <span style="font-size: 11px; font-weight: 700; color: var(--color-ink); text-transform: uppercase; letter-spacing: 0.5px;">Merchant response</span>
              <span style="font-size: 10px; color: var(--color-muted);">${escapeHtml(review.repliedAt || 'Time unavailable')}</span>
            </div>
            <p style="font-size: 12px; color: var(--color-ink); margin: 0; line-height: 1.4;">${escapeHtml(review.reply)}</p>
          </div>` : ''}
      </article>`).join('');
  }

  function setReplyTarget(reviewId) {
    const review = reviews.find((item) => item.id === reviewId);
    if (!review) return;
    activeReplyReviewId = review.id;
    const heading = document.getElementById('heading-reply-composer');
    if (heading) heading.textContent = `Reply to ${review.customer}`;
    if (replyTextarea) replyTextarea.value = '';
    setComposerEnabled(true);
    updateCharCount();
    document.getElementById('card-reply-composer')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    replyTextarea?.focus();
  }

  function updateCharCount() {
    const counter = document.getElementById('composer-char-count');
    if (counter) counter.textContent = `${replyTextarea?.value.length || 0} / 1,000 characters`;
  }

  function openModal(reviewId, trigger) {
    const review = reviews.find((item) => item.id === reviewId);
    if (!review || !modal) return;
    activeModalReviewId = review.id;
    lastFocusedElement = trigger || document.activeElement;
    document.getElementById('view-customer-name').textContent = review.customer;
    document.getElementById('view-star-rating').textContent = review.rating ? `${review.rating} of 5 stars` : 'Rating unavailable';
    document.getElementById('view-product-name').textContent = review.product;
    document.getElementById('view-review-body').textContent = review.body || 'Review text unavailable';
    document.getElementById('view-reply-status').textContent = review.reply
      ? `Merchant response: ${review.reply}`
      : 'No merchant reply yet';
    const replyButton = document.getElementById('btn-modal-open-reply');
    if (replyButton) replyButton.hidden = !needsReply(review);
    modal.hidden = false;
    document.getElementById('btn-close-view-modal')?.focus();
  }

  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    activeModalReviewId = null;
    lastFocusedElement?.focus?.();
    lastFocusedElement = null;
  }

  async function loadReviews() {
    reviewsLoaded = false;
    clearReplyTarget();
    setPageState('loading', 'Loading live reviews', 'Customer feedback is being requested from the server.');
    setListState('loading', '', 'Loading customer reviews');
    ['metric-needs-reply', 'metric-replied-count', 'metric-average-rating', 'chip-reply-count', 'sidebar-reviews-count']
      .forEach((id) => {
        const element = document.getElementById(id);
        if (element) element.textContent = '—';
      });
    const cohort = document.getElementById('metric-review-cohort');
    if (cohort) cohort.textContent = 'Waiting for live data';

    try {
      const payload = await requestJson('/reviews/');
      if (!Array.isArray(payload)) throw new Error('The review service returned an unsupported payload.');
      reviews = payload.map(normalizeReview).filter((review) => Number.isFinite(review.id));
      reviewsLoaded = true;
      updateMetrics();
      renderReviews();
      setPageState('ready');
    } catch (error) {
      reviews = [];
      const permission = error?.status === 401 || error?.status === 403;
      setListState('error', permission ? 'Merchant access required' : 'Reviews unavailable', error.message);
      setPageState(permission ? 'permission' : 'error', permission ? 'Merchant access required' : 'Reviews could not be loaded', error.message, {
        retry: !permission,
        signIn: permission,
      });
    }
  }

  async function postReply(event) {
    event.preventDefault();
    const review = reviews.find((item) => item.id === activeReplyReviewId);
    const reply = String(replyTextarea?.value || '').trim();
    if (!review) {
      showToast('Select a review before posting a reply.', 'error');
      return;
    }
    if (!reply) {
      showToast('Enter a reply before posting.', 'error');
      replyTextarea?.focus();
      return;
    }

    const submit = document.getElementById('btn-post-reply');
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Posting…';
    }
    try {
      const result = await requestJson(`/reviews/${review.id}/reply/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reply }),
      });
      review.reply = String(result?.merchant_reply || reply);
      review.repliedAt = result?.replied_at ? String(result.replied_at) : null;
      updateMetrics();
      renderReviews();
      clearReplyTarget();
      setPageState('ready');
      showToast(`Reply posted for ${review.customer}.`);
    } catch (error) {
      const permission = error?.status === 401 || error?.status === 403;
      setPageState(permission ? 'permission' : 'partial', 'Reply was not posted', error.message, { signIn: permission });
      showToast(`Reply was not posted: ${error.message}`, 'error');
    } finally {
      if (submit) {
        submit.disabled = activeReplyReviewId === null;
        submit.textContent = 'Post reply';
      }
    }
  }

  function initHandlers() {
    document.getElementById('btn-filter-needs-reply')?.addEventListener('click', (event) => {
      filters.onlyNeedsReply = !filters.onlyNeedsReply;
      event.currentTarget.classList.toggle('is-active', filters.onlyNeedsReply);
      event.currentTarget.setAttribute('aria-pressed', String(filters.onlyNeedsReply));
      renderReviews();
    });
    document.getElementById('btn-toggle-view-all')?.addEventListener('click', () => {
      filters.onlyNeedsReply = false;
      const button = document.getElementById('btn-filter-needs-reply');
      button?.classList.remove('is-active');
      button?.setAttribute('aria-pressed', 'false');
      renderReviews();
    });
    document.getElementById('search-reviews-input')?.addEventListener('input', (event) => {
      filters.search = event.target.value.trim().toLowerCase();
      renderReviews();
    });
    document.getElementById('filter-rating-select')?.addEventListener('change', (event) => {
      filters.rating = event.target.value;
      renderReviews();
    });
    reviewsContainer?.addEventListener('click', (event) => {
      const viewButton = event.target.closest('.btn-view-review');
      if (viewButton) return openModal(Number(viewButton.dataset.id), viewButton);
      const replyButton = event.target.closest('.btn-trigger-reply');
      if (replyButton) setReplyTarget(Number(replyButton.dataset.id));
    });
    replyTextarea?.addEventListener('input', updateCharCount);
    document.getElementById('btn-cancel-reply')?.addEventListener('click', clearReplyTarget);
    document.getElementById('form-reply-composer')?.addEventListener('submit', postReply);
    document.getElementById('btn-close-view-modal')?.addEventListener('click', closeModal);
    document.getElementById('btn-close-view-footer')?.addEventListener('click', closeModal);
    document.getElementById('btn-modal-open-reply')?.addEventListener('click', () => {
      const reviewId = activeModalReviewId;
      closeModal();
      if (reviewId !== null) setReplyTarget(reviewId);
    });
    modal?.addEventListener('click', (event) => {
      if (event.target === modal) closeModal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && modal && !modal.hidden) closeModal();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initHandlers();
    clearReplyTarget();
    loadReviews();
  });
})();
