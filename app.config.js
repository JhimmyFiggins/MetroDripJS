const LOCAL_API_HOSTS = new Set(['localhost', '127.0.0.1', '10.0.2.2', '[::1]']);

function normalizeApiUrl(rawValue) {
  const value = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (!value) return undefined;

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('EXPO_PUBLIC_API_URL must be a valid absolute URL.');
  }

  const host = parsed.hostname.toLowerCase();
  const isLocalHost = LOCAL_API_HOSTS.has(host);
  const isAllowedProtocol = parsed.protocol === 'https:' || (parsed.protocol === 'http:' && isLocalHost);

  if (!isAllowedProtocol) {
    throw new Error(
      'EXPO_PUBLIC_API_URL must use HTTPS, except for localhost, 127.0.0.1, ::1, or the Android emulator host 10.0.2.2.',
    );
  }
  if (parsed.username || parsed.password) {
    throw new Error('EXPO_PUBLIC_API_URL must not contain credentials.');
  }
  if (parsed.search || parsed.hash) {
    throw new Error('EXPO_PUBLIC_API_URL must not contain a query string or fragment.');
  }

  parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
  return parsed.pathname === '/' ? parsed.origin : parsed.toString();
}

module.exports = ({ config }) => {
  const apiUrl = normalizeApiUrl(process.env.EXPO_PUBLIC_API_URL);
  const isLocalHttpApi = apiUrl ? new URL(apiUrl).protocol === 'http:' : true;
  const plugins = (config.plugins || []).filter((plugin) => {
    const pluginName = Array.isArray(plugin) ? plugin[0] : plugin;
    return pluginName !== 'expo-build-properties';
  });

  return {
    ...config,
    android: {
      ...config.android,
    },
    plugins: [
      ...plugins,
      [
        'expo-build-properties',
        {
          android: {
            // Preview builds supply the HTTPS API in eas.json. Cleartext is
            // enabled only for an explicit loopback/emulator development URL
            // (or the local fallback when this variable is intentionally unset).
            usesCleartextTraffic: isLocalHttpApi,
          },
        },
      ],
    ],
    extra: {
      ...config.extra,
      apiUrl: apiUrl || undefined,
    },
  };
};
