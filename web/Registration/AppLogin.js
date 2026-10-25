// Shared staff login controller. Access is ultimately enforced by the Django
// role permissions on every console API, not by this browser-side redirect.
(() => {
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const MIN_PASSWORD_LENGTH = 8;
  const STORAGE_KEY = 'metrodrip_active_user';
  const API_ROOT = ((['localhost', '127.0.0.1'].includes(window.location.hostname) && window.location.port !== '3000') && window.location.port !== '3000')
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
    if (account.otp_required) {
      if (account.role && account.role !== expectedRole) {
        const error = new Error('This account does not have access to the selected console.');
        error.code = 'role_mismatch';
        throw error;
      }
      return { otpRequired: true, ...account };
    }
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
      password_change_required: Boolean(account.password_change_required),
    };
  }

  function initLoginForm(form) {
    const expectedRole = form.dataset.loginRole;
    const roleLabel = ROLE_LABELS[expectedRole] || 'Staff';
    const fields = { email: form.elements.email, password: form.elements.password };
    const submit = form.querySelector('[type="submit"]');
    const status = form.querySelector('[data-form-status]');
    const idleLabel = submit.textContent;
    let pendingChallenge = null;
    let cooldownTimer = 0;
    const otpPanel = document.createElement('div');
    otpPanel.className = 'otp-panel';
    otpPanel.hidden = true;
    const otpLabel = document.createElement('p');
    otpLabel.textContent = 'Email code';
    const otpBoxes = document.createElement('div');
    otpBoxes.className = 'otp-boxes';
    otpBoxes.setAttribute('role', 'group');
    otpBoxes.setAttribute('aria-label', 'Email verification code');
    const boxInputs = [];
    const codeLength = () => Number(pendingChallenge?.code_length) || 6;
    const codeValue = () => boxInputs.map((box) => box.value).join('');
    const buildBoxes = (length) => {
      otpBoxes.replaceChildren();
      boxInputs.length = 0;
      for (let index = 0; index < length; index += 1) {
        const box = document.createElement('input');
        box.className = 'otp-box';
        box.inputMode = 'numeric';
        box.autocomplete = index === 0 ? 'one-time-code' : 'off';
        box.maxLength = 1;
        box.setAttribute('aria-label', `Digit ${index + 1}`);
        box.addEventListener('input', () => {
          const digits = box.value.replace(/\D/g, '');
          if (digits.length > 1) {
            digits.slice(0, length - index).split('').forEach((digit, offset) => {
              boxInputs[index + offset].value = digit;
            });
            boxInputs[Math.min(index + digits.length, length - 1)].focus();
            return;
          }
          box.value = digits;
          if (digits && boxInputs[index + 1]) boxInputs[index + 1].focus();
        });
        box.addEventListener('keydown', (event) => {
          if (event.key === 'Backspace' && !box.value && boxInputs[index - 1]) {
            boxInputs[index - 1].value = '';
            boxInputs[index - 1].focus();
          }
        });
        box.addEventListener('paste', (event) => {
          event.preventDefault();
          const digits = (event.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, length);
          digits.split('').forEach((digit, offset) => { boxInputs[offset].value = digit; });
          boxInputs[Math.min(digits.length, length) - 1]?.focus();
        });
        boxInputs.push(box);
        otpBoxes.append(box);
      }
    };
    const resend = document.createElement('button');
    resend.type = 'button';
    resend.className = 'otp-resend';
    resend.textContent = 'Resend code';
    const paintCooldown = (seconds) => {
      resend.disabled = seconds > 0;
      resend.textContent = seconds > 0 ? `Resend code in ${seconds}s` : 'Resend code';
    };
    const startCooldown = (seconds) => {
      window.clearInterval(cooldownTimer);
      let remaining = seconds;
      paintCooldown(remaining);
      cooldownTimer = window.setInterval(() => {
        remaining -= 1;
        paintCooldown(remaining);
        if (remaining <= 0) window.clearInterval(cooldownTimer);
      }, 1000);
    };
    resend.addEventListener('click', async () => {
      if (!pendingChallenge || resend.disabled) return;
      resend.disabled = true;
      resend.textContent = 'Sending…';
      try {
        const response = await fetch(`${API_ROOT}/auth/otp/resend/`, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ challenge_id: pendingChallenge.challenge_id }),
        });
        if (!response.ok) throw new Error(await parseError(response));
        const next = await response.json();
        pendingChallenge = { ...pendingChallenge, ...next, otpRequired: true };
        setStatus(`A new code was sent to ${next.masked_email}.`);
        startCooldown(Number(next.resend_after) || 60);
      } catch (error) {
        setStatus(error.message || 'A new code could not be sent.', true);
        paintCooldown(0);
      }
    });
    otpPanel.append(otpLabel, otpBoxes, resend);
    submit.before(otpPanel);

    const setStatus = (message, isError = false) => {
      status.textContent = message;
      status.hidden = !message;
      status.setAttribute('role', isError ? 'alert' : 'status');
    };
    const setLoading = (loading) => {
      submit.disabled = loading;
      submit.textContent = loading ? 'SIGNING IN…' : (pendingChallenge ? 'VERIFY CODE' : idleLabel);
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
        if (pendingChallenge) {
          const verifyResponse = await fetch(`${API_ROOT}/auth/otp/verify/`, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ challenge_id: pendingChallenge.challenge_id, code: codeValue() }),
          });
          if (!verifyResponse.ok) throw new Error(await parseError(verifyResponse));
          const verified = await verifyResponse.json();
          const token = verified.access_token || verified.token;
          if (!token || verified.role !== expectedRole) {
            await revokeUnexpectedToken(token);
            throw new Error('This account does not have access to the selected console.');
          }
          pendingChallenge = null;
          localStorage.removeItem(STORAGE_KEY);
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
            id: verified.id,
            name: verified.name,
            email: verified.email,
            role: verified.role,
            is_staff: verified.is_staff,
            access_token: token,
            token_type: 'Bearer',
            expires_at: verified.expires_at,
            password_change_required: Boolean(verified.password_change_required),
          }));
          boxInputs.forEach((box) => { box.value = ''; });
          setStatus(`Signed in. Opening the ${roleLabel} console…`);
          window.location.assign(expectedRole === 'admin' ? '../../admin/index.html' : '../../merchant/index.html');
          return;
        }
        const account = await authenticate(values.email, values.password, expectedRole);
        if (account.otpRequired) {
          pendingChallenge = account;
          buildBoxes(codeLength());
          otpPanel.hidden = false;
          fields.password.disabled = true;
          submit.textContent = 'VERIFY CODE';
          setStatus(`Enter the code sent to ${account.masked_email}.`);
          startCooldown(Number(account.resend_after) || 60);
          boxInputs[0]?.focus();
          return;
        }
        localStorage.removeItem(STORAGE_KEY);
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(account));
        fields.password.value = '';

        if (account.password_change_required) {
          setStatus('Temporary password detected. Redirecting to establish your permanent password…');
          setTimeout(() => {
            window.location.assign(`../screens/ResetPasswordScreen.html?forced=1&email=${encodeURIComponent(account.email)}`);
          }, 800);
          return;
        }

        setStatus(`Signed in. Opening the ${roleLabel} console…`);
        window.location.assign(expectedRole === 'admin' ? '../../admin/index.html' : '../../merchant/index.html');
      } catch (error) {
        if (!pendingChallenge) fields.password.value = '';
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
