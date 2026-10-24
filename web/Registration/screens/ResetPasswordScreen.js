(() => {
  const API_ROOT = (['localhost', '127.0.0.1'].includes(window.location.hostname) && window.location.port !== '3000')
    ? 'http://127.0.0.1:8000'
    : '';

  const params = new URLSearchParams(window.location.search);
  const rawToken = (params.get('token') || '').trim();
  const isForced = params.get('forced') === '1';
  const urlContext = (params.get('context') || '').toLowerCase();

  let activeUser = null;
  try {
    activeUser = JSON.parse(sessionStorage.getItem('metrodrip_active_user') || 'null');
  } catch {
    activeUser = null;
  }

  const loadingEl = document.getElementById('verify-loading');
  const alertEl = document.getElementById('token-alert');
  const formEl = document.getElementById('form-reset-password');
  const emailInput = document.getElementById('account-email');
  const currentPassField = document.getElementById('field-current-password');
  const currentPassInput = document.getElementById('current-password');
  const currentPassErr = document.getElementById('current-password-error');
  const newPassInput = document.getElementById('new-password');
  const confirmPassInput = document.getElementById('confirm-password');
  const newPassErr = document.getElementById('new-password-error');
  const confirmPassErr = document.getElementById('confirm-password-error');
  const submitBtn = document.getElementById('btn-submit-reset');
  const formStatus = document.getElementById('form-status');
  const successPane = document.getElementById('reset-success-pane');
  const signinBtn = document.getElementById('btn-goto-signin');
  const replacementPane = document.getElementById('replacement-link-pane');
  const replacementLink = document.getElementById('link-request-replacement');
  const pageEyebrow = document.getElementById('page-eyebrow');
  const formTitle = document.getElementById('form-title');
  const pageSubheading = document.getElementById('page-subheading');

  const brandEyebrow = document.getElementById('brand-eyebrow');
  const brandTitle = document.getElementById('brand-title');
  const brandDesc = document.getElementById('brand-desc');
  const brandRoute = document.getElementById('brand-route');
  const brandReturnLink = document.getElementById('brand-return-link');

  let verifiedRole = urlContext || (activeUser?.role || '').toLowerCase();

  // Eye toggle handlers
  document.querySelectorAll('.btn-toggle-eye').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (!input) return;
      if (input.type === 'password') {
        input.type = 'text';
        btn.innerHTML = '&#128064;';
      } else {
        input.type = 'password';
        btn.innerHTML = '&#128065;';
      }
    });
  });

  function showAlert(message, type = 'error') {
    if (!alertEl) return;
    alertEl.textContent = message;
    alertEl.className = `token-status-banner is-${type}`;
    alertEl.hidden = false;
  }

  function hideAlert() {
    if (alertEl) alertEl.hidden = true;
  }

  function setFieldError(el, errEl, message) {
    if (errEl) {
      errEl.textContent = message || '';
      errEl.hidden = !message;
    }
    if (el) {
      el.setAttribute('aria-invalid', message ? 'true' : 'false');
    }
  }

  function applyRoleContext(role, purpose = 'reset') {
    verifiedRole = role;
    if (role === 'admin') {
      if (brandEyebrow) brandEyebrow.textContent = 'ADMINISTRATOR CONSOLE';
      if (brandTitle) brandTitle.innerHTML = 'PASSWORD<br>RECOVERY';
      if (brandDesc) brandDesc.textContent = 'Establish your permanent administrator password or recover secure access.';
      if (brandRoute) brandRoute.textContent = '/ADMIN/RESET/';
      if (brandReturnLink) {
        brandReturnLink.href = 'AdminLoginScreen.html';
        brandReturnLink.textContent = 'Return to Admin Login';
      }
      if (pageEyebrow) pageEyebrow.textContent = purpose === 'setup' ? 'ACCOUNT PROVISIONING' : 'ADMIN SECURITY RECOVERY';
      if (formTitle) formTitle.textContent = purpose === 'setup' ? 'SET YOUR PASSWORD' : 'SET NEW PASSWORD';
      if (pageSubheading) pageSubheading.textContent = 'Choose a strong, permanent password for your administrator account.';
      if (replacementLink) {
        replacementLink.href = 'AdminForgotPasswordScreen.html';
        replacementLink.textContent = 'Request a new administrator password reset link';
      }
    } else if (role === 'merchant') {
      if (brandEyebrow) brandEyebrow.textContent = 'MERCHANT CONSOLE';
      if (brandTitle) brandTitle.innerHTML = 'PASSWORD<br>RECOVERY';
      if (brandDesc) brandDesc.textContent = 'Establish your permanent merchant staff password or recover secure access.';
      if (brandRoute) brandRoute.textContent = '/MERCHANT/RESET/';
      if (brandReturnLink) {
        brandReturnLink.href = 'MerchantLoginScreen.html';
        brandReturnLink.textContent = 'Return to Merchant Login';
      }
      if (pageEyebrow) pageEyebrow.textContent = purpose === 'setup' ? 'ACCOUNT PROVISIONING' : 'MERCHANT SECURITY RECOVERY';
      if (formTitle) formTitle.textContent = purpose === 'setup' ? 'SET YOUR PASSWORD' : 'SET NEW PASSWORD';
      if (pageSubheading) pageSubheading.textContent = 'Choose a strong, permanent password for your merchant staff account.';
      if (replacementLink) {
        replacementLink.href = 'MerchantForgotPasswordScreen.html';
        replacementLink.textContent = 'Request a new merchant password reset link';
      }
    } else {
      // Default staff
      if (brandReturnLink) {
        brandReturnLink.href = 'AdminLoginScreen.html';
        brandReturnLink.textContent = 'Return to login';
      }
      if (replacementLink) {
        replacementLink.href = 'AdminForgotPasswordScreen.html';
        replacementLink.textContent = 'Request a new password reset link';
      }
    }
  }

  // Determine initial state: Token-based reset takes ABSOLUTE precedence over session data
  if (rawToken) {
    // Flow A: EMAIL-BASED RECOVERY / PROVISIONING
    // Strictly remove Current Password field from DOM
    if (currentPassField) {
      currentPassField.remove();
    }
    if (urlContext) {
      applyRoleContext(urlContext);
    }
    verifyToken();
  } else if (isForced && activeUser?.access_token) {
    // Flow B: AUTHENTICATED MANDATORY TEMPORARY-PASSWORD CHANGE
    if (loadingEl) loadingEl.hidden = true;
    const role = (activeUser.role || '').toLowerCase();
    applyRoleContext(role, 'mandatory');
    if (pageEyebrow) pageEyebrow.textContent = 'MANDATORY SETUP';
    if (formTitle) formTitle.textContent = 'ESTABLISH PERMANENT PASSWORD';
    if (pageSubheading) pageSubheading.textContent = 'You must change your temporary password before accessing the console.';
    if (currentPassField) currentPassField.hidden = false;
    if (emailInput) emailInput.value = activeUser.email || params.get('email') || 'Staff Account';
    if (formEl) formEl.hidden = false;
  } else {
    // Neither token nor active session
    if (loadingEl) loadingEl.hidden = true;
    showAlert('Password reset token is missing or malformed. Please use the link provided in your email.', 'error');
    if (replacementPane) replacementPane.hidden = false;
    if (urlContext === 'merchant') {
      applyRoleContext('merchant');
    } else {
      applyRoleContext('admin');
    }
    return;
  }

  // Verify token on server
  async function verifyToken() {
    try {
      const res = await fetch(`${API_ROOT}/password-reset/verify/?token=${encodeURIComponent(rawToken)}`, {
        headers: { Accept: 'application/json' },
      });
      const data = await res.json();

      if (loadingEl) loadingEl.hidden = true;

      if (!res.ok || !data.valid) {
        let msg = data.error || 'This password reset link is invalid or has expired.';
        if (data.code === 'token_already_used') {
          msg = 'This password reset link has already been used. Please request another one.';
        } else if (data.code === 'token_expired') {
          msg = 'This password reset link has expired. Security links are valid for approximately 30 minutes.';
        }
        showAlert(msg, 'error');
        if (replacementPane) replacementPane.hidden = false;
        return;
      }

      // If token belongs to a customer, route to customer storefront recovery
      if (data.role === 'customer') {
        window.location.replace(`/customer/reset-password?token=${encodeURIComponent(rawToken)}`);
        return;
      }

      // Valid staff token (Admin or Merchant)
      applyRoleContext(data.role, data.purpose);

      if (emailInput) {
        emailInput.value = data.email || 'Verified Staff Account';
      }
      if (formEl) formEl.hidden = false;
    } catch {
      if (loadingEl) loadingEl.hidden = true;
      showAlert('Unable to reach the server to verify your security link. Please check your network connection and try again.', 'error');
    }
  }

  // Form Submission
  formEl?.addEventListener('submit', async event => {
    event.preventDefault();
    hideAlert();
    setFieldError(newPassInput, newPassErr, '');
    setFieldError(confirmPassInput, confirmPassErr, '');
    if (formStatus) formStatus.hidden = true;

    const newPassword = (newPassInput?.value || '').trim();
    const confirmPassword = (confirmPassInput?.value || '').trim();

    let hasClientError = false;

    // Flow B: Authenticated password change requires current password
    let currentPassword = '';
    if (!rawToken && isForced && activeUser?.access_token) {
      currentPassword = (currentPassInput?.value || '').trim();
      setFieldError(currentPassInput, currentPassErr, '');
      if (!currentPassword) {
        setFieldError(currentPassInput, currentPassErr, 'Current temporary password is required.');
        hasClientError = true;
      }
    }

    if (!newPassword) {
      setFieldError(newPassInput, newPassErr, 'New password is required.');
      hasClientError = true;
    } else if (newPassword.length < 8) {
      setFieldError(newPassInput, newPassErr, 'Password must be at least 8 characters long.');
      hasClientError = true;
    }

    if (!confirmPassword) {
      setFieldError(confirmPassInput, confirmPassErr, 'Confirm password is required.');
      hasClientError = true;
    } else if (newPassword !== confirmPassword) {
      setFieldError(confirmPassInput, confirmPassErr, 'Passwords do not match.');
      hasClientError = true;
    }

    if (hasClientError) return;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'SAVING PASSWORD…';
    }

    try {
      if (!rawToken && isForced && activeUser?.access_token) {
        // Authenticated forced password change (FLOW B)
        const res = await fetch(`${API_ROOT}/users/me/password/`, {
          method: 'PATCH',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${activeUser.access_token}`,
          },
          body: JSON.stringify({
            current_password: currentPassword,
            new_password: newPassword,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          const errMessage = data.error || data.detail || 'Failed to update password. Check your temporary password and try again.';
          showAlert(errMessage, 'error');
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'SET NEW PASSWORD';
          }
          return;
        }

        activeUser.password_change_required = false;
        sessionStorage.setItem('metrodrip_active_user', JSON.stringify(activeUser));
        formEl.hidden = true;
        if (successPane) successPane.hidden = false;

        const role = (activeUser.role || '').toLowerCase();
        if (role === 'admin' || role === 'administrator') {
          signinBtn.href = '/admin/index.html';
          signinBtn.textContent = 'ENTER ADMINISTRATOR CONSOLE';
        } else if (role === 'merchant') {
          signinBtn.href = '/merchant/index.html';
          signinBtn.textContent = 'ENTER MERCHANT CONSOLE';
        } else {
          signinBtn.href = '/customer/';
          signinBtn.textContent = 'PROCEED TO STORE';
        }
        return;
      }

      // Flow A: Token-based reset (Does NOT send or require current password)
      const res = await fetch(`${API_ROOT}/password-reset/confirm/`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: rawToken,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errMessage = data.error || 'Failed to update password. Please check requirements and try again.';
        if (data.code === 'password_guessable' || data.code === 'password_policy_failed' || data.code === 'password_too_short') {
          setFieldError(newPassInput, newPassErr, errMessage);
        } else if (data.code === 'password_mismatch') {
          setFieldError(confirmPassInput, confirmPassErr, errMessage);
        } else {
          showAlert(errMessage, 'error');
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'SET NEW PASSWORD';
        }
        return;
      }

      // Success!
      formEl.hidden = true;
      if (successPane) successPane.hidden = false;

      // Role-specific return destination
      const role = (data.role || verifiedRole || '').toLowerCase();
      if (role === 'admin') {
        signinBtn.href = '/Registration/screens/AdminLoginScreen.html';
        signinBtn.textContent = 'PROCEED TO ADMINISTRATOR LOGIN';
      } else if (role === 'merchant') {
        signinBtn.href = '/Registration/screens/MerchantLoginScreen.html';
        signinBtn.textContent = 'PROCEED TO MERCHANT LOGIN';
      } else {
        signinBtn.href = '/customer/sign-in';
        signinBtn.textContent = 'PROCEED TO SIGN IN';
      }
    } catch {
      showAlert('A network error occurred while updating your password. Please try again.', 'error');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'SET NEW PASSWORD';
      }
    }
  });
})();
