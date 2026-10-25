import { apiFetch } from './apiClient';

// Response: { id, name, email, phone, addresses } (see identity/views.py LoginAPIView).
export async function login(email, password) {
  return apiFetch('/login/', {
    method: 'POST',
    body: { email, password },
    auth: false,
  });
}

// Payload: { name, email, password } — all required. Response: { id, name, email }.
export async function signup(payload) {
  return apiFetch('/signup/', {
    method: 'POST',
    body: payload,
    auth: false,
  });
}

// Response: { success, message, email } on 200, or { success:false, error } on 404.
export async function verifyOtp(challengeId, code) {
  return apiFetch('/auth/otp/verify/', {
    method: 'POST',
    body: { challenge_id: challengeId, code },
    auth: false,
  });
}

export async function resendOtp(challengeId) {
  return apiFetch('/auth/otp/resend/', {
    method: 'POST',
    body: { challenge_id: challengeId },
    auth: false,
  });
}

export async function forgotPassword(email) {
  return apiFetch('/forgot-password/', {
    method: 'POST',
    body: { email },
    auth: false,
  });
}

export async function resetPasswordConfirm(token, newPassword, confirmPassword) {
  return apiFetch('/password-reset/confirm/', {
    method: 'POST',
    body: {
      token,
      new_password: newPassword,
      confirm_password: confirmPassword,
    },
    auth: false,
  });
}

export async function verifyResetToken(token) {
  return apiFetch(`/password-reset/verify/?token=${encodeURIComponent(token)}`, {
    method: 'GET',
    auth: false,
  });
}

// Response: { id, name, email, phone, addresses, role }.
export async function getProfile() {
  return apiFetch('/profile/');
}

// Payload: any of { name, email, phone, addresses }. Response: updated profile + message.
export async function updateProfile(data) {
  return apiFetch('/profile/', {
    method: 'PUT',
    body: data,
  });
}

// Authenticated password change (requires existing bearer token and current_password)
export async function changePassword(currentPassword, newPassword, confirmPassword) {
  const body = {
    current_password: currentPassword,
    new_password: newPassword,
  };
  if (confirmPassword) {
    body.confirm_password = confirmPassword;
  }
  return apiFetch('/users/me/password/', {
    method: 'POST',
    body,
  });
}

