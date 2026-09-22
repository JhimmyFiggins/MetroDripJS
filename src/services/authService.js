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
export async function forgotPassword(email) {
  return apiFetch('/forgot-password/', {
    method: 'POST',
    body: { email },
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
