// Shared staff login controller. Access is ultimately enforced by the Django
// role permissions on every console API, not by this browser-side redirect.
(() => {
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const MIN_PASSWORD_LENGTH = 8;
  const STORAGE_KEY = 'metrodrip_active_user';
  const API_ROOT = ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://127.0.0.1:8000'
    : '';
  const ROLE_LABELS = { merchant: 'Merchant', admin: 'Administrator' };

  function validate({ email, password }) {
    const errors = {};
    if (!email) errors.email = 'Email is required.';
    else if (!EMAIL_PATTERN.test(email)) errors.email = 'Enter a valid email address.';
    if (!password) errors.password = 'Password is required.';
    else if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    return errors;
  }

  function setFieldError(input, message) {
    const errorElement = document.getElementById(`${input.id}-error`);
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (!errorElement) return;
    errorElement.textContent = message || '';
    errorElement.hidden = !message;
  }

  async function parseError(response) {
    try {
      const data = await response.json();
      return data?.error || data?.detail || 'Sign-in failed. Check your credentials and try again.';
    } catch {
      return 'Sign-in failed. Check your credentials and try again.';
    }
  }

  async function revokeUnexpectedToken(token) {
    if (!token) return;
    try {
      await fetch(`${API_ROOT}/logout/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // The short-lived token remains server-expiring if revocation cannot reach the API.
    }
  }

  async function authenticate(email, password, expectedRole) {
    const response = await fetch(`${API_ROOT}/login/`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) throw new Error(await parseError(response));

    const account = await response.json();
    const token = account.access_token || account.token;
    if (!token || !account.is_staff || account.role !== expectedRole) {
      await revokeUnexpectedToken(token);
      const error = new Error('This account does not have access to the selected console.');
      error.code = 'role_mismatch';
      throw error;
    }
    return {
      id: account.id,
      name: account.name,
      email: account.email,
      role: account.role,
      is_staff: account.is_staff,
      access_token: token,
      token_type: 'Bearer',
      expires_at: account.expires_at,
    };
  }

  function initLoginForm(form) {
    const expectedRole = form.dataset.loginRole;
    const roleLabel = ROLE_LABELS[expectedRole] || 'Staff';
    const fields = { email: form.elements.email, password: form.elements.password };
    const submit = form.querySelector('[type="submit"]');
    const status = form.querySelector('[data-form-status]');
    const idleLabel = submit.textContent;

    const setStatus = (message, isError = false) => {
      status.textContent = message;
      status.hidden = !message;
      status.setAttribute('role', isError ? 'alert' : 'status');
    };
    const setLoading = (loading) => {
      submit.disabled = loading;
      submit.textContent = loading ? 'SIGNING IN…' : idleLabel;
      form.setAttribute('aria-busy', String(loading));
    };

    Object.values(fields).forEach((input) => {
      input.addEventListener('input', () => {
        if (input.getAttribute('aria-invalid') === 'true') setFieldError(input, '');
      });
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (form.getAttribute('aria-busy') === 'true') return;

      const values = { email: fields.email.value.trim().toLowerCase(), password: fields.password.value };
      const errors = validate(values);
      Object.entries(fields).forEach(([name, input]) => setFieldError(input, errors[name]));
      const firstInvalid = Object.keys(fields).find((name) => errors[name]);
      if (firstInvalid) {
        setStatus('');
        fields[firstInvalid].focus();
        return;
      }

      setStatus('');
      setLoading(true);
      try {
        const account = await authenticate(values.email, values.password, expectedRole);
        localStorage.removeItem(STORAGE_KEY);
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(account));
        fields.password.value = '';
        setStatus(`Signed in. Opening the ${roleLabel} console…`);
        window.location.assign(expectedRole === 'admin' ? '../../admin/index.html' : '../../merchant/index.html');
      } catch (error) {
        fields.password.value = '';
        setStatus(error?.message || 'The sign-in service is unavailable. Try again.', true);
        fields.password.focus();
      } finally {
        setLoading(false);
      }
    });
  }

  localStorage.removeItem(STORAGE_KEY);
  document.querySelectorAll('form[data-login-role]').forEach(initLoginForm);
})();
