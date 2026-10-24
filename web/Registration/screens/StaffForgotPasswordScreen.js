(() => {
  const API_ROOT = (['localhost', '127.0.0.1'].includes(window.location.hostname) && window.location.port !== '3000')
    ? 'http://127.0.0.1:8000'
    : '';

  const form = document.querySelector('form[data-forgot-role]');
  if (!form) return;

  const role = form.dataset.forgotRole || 'staff';
  const emailInput = document.getElementById('email');
  const emailError = document.getElementById('email-error');
  const submitBtn = form.querySelector('button[type="submit"]');
  const statusEl = form.querySelector('[data-form-status]');
  const idleLabel = submitBtn ? submitBtn.textContent : 'SEND RESET LINK';

  function setStatus(message, type = 'info') {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.hidden = !message;
    statusEl.setAttribute('role', type === 'error' ? 'alert' : 'status');
    statusEl.className = `form-status is-${type}`;
    if (type === 'success') {
      statusEl.style.borderLeftColor = 'var(--color-volt, #E6FF00)';
      statusEl.style.background = 'rgba(230, 255, 0, 0.08)';
    } else if (type === 'error') {
      statusEl.style.borderLeftColor = 'var(--color-danger, #ef4444)';
      statusEl.style.background = 'rgba(239, 68, 68, 0.08)';
    } else {
      statusEl.style.borderLeftColor = 'var(--color-volt, #E6FF00)';
      statusEl.style.background = 'var(--color-surface)';
    }
  }

  function setFieldError(input, errEl, message) {
    if (errEl) {
      errEl.textContent = message || '';
      errEl.hidden = !message;
    }
    if (input) {
      input.setAttribute('aria-invalid', message ? 'true' : 'false');
    }
  }

  emailInput?.addEventListener('input', () => {
    if (emailInput.getAttribute('aria-invalid') === 'true') {
      setFieldError(emailInput, emailError, '');
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus('');
    setFieldError(emailInput, emailError, '');

    const email = (emailInput?.value || '').trim();
    if (!email) {
      setFieldError(emailInput, emailError, 'Email is required.');
      emailInput?.focus();
      return;
    }

    if (!email.includes('@') || !email.split('@')[1]?.includes('.')) {
      setFieldError(emailInput, emailError, 'Enter a valid email address.');
      emailInput?.focus();
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'DISPATCHING RESET LINK…';
    }

    try {
      const res = await fetch(`${API_ROOT}/forgot-password/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok && res.status !== 200) {
        const errorMsg = data.error || data.detail || 'Password recovery is temporarily unavailable. Please try again later.';
        setStatus(errorMsg, 'error');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = idleLabel;
        }
        return;
      }

      // Neutral, enumeration-safe confirmation
      const successMsg = data.message || 'If an eligible account is associated with this email, password reset instructions have been sent. Please check your inbox and spam folder.';
      setStatus(successMsg, 'success');
      if (emailInput) {
        emailInput.disabled = true;
      }
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'RESET LINK DISPATCHED';
      }
    } catch {
      setStatus('Network error. Unable to reach the authentication service. Check your connection.', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = idleLabel;
      }
    }
  });
})();
