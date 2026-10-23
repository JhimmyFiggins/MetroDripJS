let authToken = null;
let authGeneration = 0;
let onAuthInvalidated = null;

export class ApiError extends Error {
  constructor(message, status = 0, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export function setAuthToken(token, onInvalidated = null) {
  authToken = token || null;
  authGeneration += 1;
  onAuthInvalidated = onInvalidated;
}

export function getAuthToken() {
  return authToken;
}

export function getAuthSnapshot() {
  return Object.freeze({ token: authToken, generation: authGeneration });
}

export function isAuthCurrent(snapshot) {
  return snapshot?.generation === authGeneration && snapshot.token === authToken;
}

function errorMessage(data, status) {
  if (typeof data === 'string' && data.trim()) return data.trim();
  if (data && typeof data === 'object') {
    const direct = data.error || data.detail || data.message;
    if (typeof direct === 'string' && direct.trim()) return direct.trim();
    const parts = [];
    for (const [field, value] of Object.entries(data)) {
      const text = Array.isArray(value) ? value.join(' ') : value;
      if (text) parts.push(`${field}: ${text}`);
    }
    if (parts.length) return parts.join('\n');
  }
  return `Request failed with status ${status}.`;
}

export async function api(path, { method = 'GET', body, auth = true, authSnapshot = getAuthSnapshot() } = {}) {
  let url;
  try {
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')
      || /[\\\s\u0000-\u001f\u007f#]/u.test(path)) throw new Error('Invalid path');
    const decoded = decodeURIComponent(path);
    if (decoded.startsWith('//') || /[\\\u0000-\u001f\u007f]/u.test(decoded)) throw new Error('Invalid path');
    const origin = globalThis.location?.origin;
    url = new URL(path, origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password) {
      throw new Error('Invalid origin');
    }
  } catch {
    throw new ApiError('Customer requests must use a same-origin path.', 0);
  }
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && authSnapshot.token) headers.Authorization = `Bearer ${authSnapshot.token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  let response;
  let text;
  try {
    response = await fetch(url.href, {
      method,
      headers,
      mode: 'same-origin',
      credentials: 'omit',
      redirect: 'error',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    // A failed old request must not invalidate a later login, even if its token is identical.
    if (response.status === 401 && auth && authSnapshot.token && isAuthCurrent(authSnapshot)) {
      const notify = onAuthInvalidated;
      setAuthToken(null);
      notify?.();
    }
    text = await response.text();
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ApiError('Request timed out. Please try again.', 0);
    }
    throw new ApiError('Network request failed. Check your connection.', 0);
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    throw new ApiError(errorMessage(data, response.status), response.status, data);
  }
  return data;
}
