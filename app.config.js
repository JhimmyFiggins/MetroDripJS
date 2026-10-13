const apiUrl = (process.env.EXPO_PUBLIC_API_URL || '').trim();
const isLocalHttpApi = !apiUrl || /^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(?::|\/|$)/i.test(apiUrl);

module.exports = ({ config }) => {
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
            // Permit cleartext only for explicit loopback/emulator development.
            // Configured remote APIs must use HTTPS.
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
