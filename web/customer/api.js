let authToken = null;

export class ApiError extends Error {
  constructor(message, status = 0, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export function setAuthToken(token) {
  authToken = token || null;
}

export function getAuthToken() {
  return authToken;
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

export async function api(path, { method = 'GET', body, auth = true } = {}) {
  if (typeof path !== 'string' || !path.startsWith('/')) {
    throw new ApiError('Customer requests must use a same-origin path.', 0);
  }
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && authToken) headers.Authorization = `Bearer ${authToken}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ApiError('Request timed out. Please try again.', 0);
    }
    throw new ApiError('Network request failed. Check your connection.', 0);
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
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
