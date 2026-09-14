// Login controller shared by the Merchant and Administrator screens.
// Mirrors mobile/Registration/screens/LoginScreen.js: same validation rules and a simulated
// sign-in, because metrodrip_backend does not expose a staff login endpoint yet.
// Replace simulateSignIn() with the real request once it exists; the backend must enforce
// roles and 2FA — nothing here is an access control.
(() => {
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const CODE_PATTERN = /^\d{6}$/;
  const MIN_PASSWORD_LENGTH = 6;
  const SIMULATED_SIGN_IN_MS = 900;

  const ROLE_LABELS = { merchant: 'Merchant', admin: 'Administrator' };

  function validate({ email, password, code }) {
    const errors = {};

    if (!email) errors.email = 'Email is required.';
    else if (!EMAIL_PATTERN.test(email)) errors.email = 'Enter a valid email address.';

    if (!password) errors.password = 'Password is required.';
    else if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }

    // Optional: only accounts with an enrolled two-factor device use it.
    if (code && !CODE_PATTERN.test(code)) errors.code = 'Authentication code must be 6 digits.';

    return errors;
  }

  function simulateSignIn() {
    return new Promise((resolve) => window.setTimeout(resolve, SIMULATED_SIGN_IN_MS));
  }

  function setFieldError(input, message) {
    const errorEl = document.getElementById(`${input.id}-error`);
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    errorEl.textContent = message || '';
    errorEl.hidden = !message;
  }

  function initLoginForm(form) {
    const roleLabel = ROLE_LABELS[form.dataset.loginRole] || 'Staff';
    const fields = {
      email: form.elements.email,
      password: form.elements.password,
      code: form.elements.code,
    };
    const submit = form.querySelector('[type="submit"]');
    const status = form.querySelector('[data-form-status]');
    const idleLabel = submit.textContent;

    const setStatus = (message) => {
      status.textContent = message;
      status.hidden = !message;
    };

    const setLoading = (loading) => {
      // aria-disabled (not disabled) keeps keyboard focus on the button while it is busy.
      submit.setAttribute('aria-disabled', String(loading));
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

      const values = {
        email: fields.email.value.trim(),
        password: fields.password.value,
        code: fields.code.value.trim(),
      };
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
      await simulateSignIn();
      setLoading(false);

      fields.password.value = '';
      fields.code.value = '';
      setStatus(`✓ Signed in as ${values.email}. The ${roleLabel} dashboard is not part of the web build yet.`);
    });
  }

  document.querySelectorAll('form[data-login-role]').forEach(initLoginForm);
})();
