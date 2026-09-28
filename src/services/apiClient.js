import { Platform } from 'react-native';

let Constants = null;
try {
  // expo-constants ships as a dependency of expo; guard so the client still
  // resolves if the package is absent from node_modules.
  Constants = require('expo-constants').default || null;
} catch (e) {
  Constants = null;
}

const extraApiUrl =
  Constants && Constants.expoConfig && Constants.expoConfig.extra
    ? Constants.expoConfig.extra.apiUrl
    : null;

export const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  extraApiUrl ||
  (Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://127.0.0.1:8000');

const REQUEST_TIMEOUT_MS = 15000;

let currentAuthToken = null;

export function setAuthToken(token) {
  currentAuthToken = token ?? null;
}

export function clearCustomer() {
  currentAuthToken = null;
}

export function getAuthToken() {
  return currentAuthToken;
}

export class ApiError extends Error {
  constructor(message, { status, data } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

// Django REST Framework reports validation failures as { field: [messages] }.
// Forms render `error.message`, so a bare status string hides the real reason a
// login or checkout was rejected.
function describeErrorPayload(data) {
  if (typeof data === 'string') return data.trim() || null;
  if (!data || typeof data !== 'object') return null;

  const direct = data.error || data.detail || data.message;
  if (typeof direct === 'string' && direct) return direct;

  const parts = [];
  for (const [field, value] of Object.entries(data)) {
    const text = Array.isArray(value) ? value.join(' ') : value;
    if (text === undefined || text === null || text === '') continue;
    parts.push(`${field}: ${text}`);
  }
  return parts.length > 0 ? parts.join('\n') : null;
}

export async function apiFetch(path, { method = 'GET', body, auth = true, headers = {} } = {}) {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;

  const finalHeaders = {
    Accept: 'application/json',
    ...headers,
  };

  let serializedBody;
  if (body !== undefined && body !== null) {
    finalHeaders['Content-Type'] = 'application/json';
    serializedBody = JSON.stringify(body);
  }

  if (auth && currentAuthToken) {
    finalHeaders['Authorization'] = `Bearer ${currentAuthToken}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: finalHeaders,
      body: serializedBody,
      signal: controller.signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new ApiError('Request timed out. Please try again.', { status: 0 });
    }
    throw new ApiError('Network request failed. Check your connection.', { status: 0 });
  } finally {
    clearTimeout(timeoutId);
  }

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = text;
    }
  }

  if (!response.ok) {
    const message =
      describeErrorPayload(data) || `Request failed with status ${response.status}.`;
    throw new ApiError(message, { status: response.status, data });
  }

  return data;
}
