import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const app = require(path.join(repoRoot, 'app.json')).expo;
const eas = require(path.join(repoRoot, 'eas.json'));
const configureExpo = require(path.join(repoRoot, 'app.config.js'));
const packageJson = require(path.join(repoRoot, 'package.json'));
const CANONICAL_PREVIEW_API_URL = 'https://metrodripjs-q4ik.onrender.com';

function resolvedConfig(apiUrl) {
  const previous = process.env.EXPO_PUBLIC_API_URL;
  if (apiUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
  else process.env.EXPO_PUBLIC_API_URL = apiUrl;

  try {
    return configureExpo({ config: structuredClone(app) });
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = previous;
  }
}

function cleartextSetting(config) {
  const plugin = config.plugins.find((entry) => Array.isArray(entry) && entry[0] === 'expo-build-properties');
  return plugin?.[1]?.android?.usesCleartextTraffic;
}

test('preview is a standalone internally distributed APK with local app versioning', () => {
  assert.equal(eas.cli.version, '25.2.0');
  assert.equal(eas.cli.appVersionSource, 'local');
  assert.equal(eas.build.preview.developmentClient, false);
  assert.equal(eas.build.preview.distribution, 'internal');
  assert.equal(eas.build.preview.android.buildType, 'apk');
  assert.equal(app.android.versionCode, 2);
  assert.equal(app.ios.buildNumber, '1');
  assert.equal(app.owner, undefined);
  assert.equal(app.extra?.eas?.projectId, undefined);
});

test('preview exposes only the public HTTPS API build variable', () => {
  const variables = eas.build.preview.env;
  assert.deepEqual(Object.keys(variables), ['EXPO_PUBLIC_API_URL']);
  assert.equal(variables.EXPO_PUBLIC_API_URL, CANONICAL_PREVIEW_API_URL);

  const apiUrl = new URL(variables.EXPO_PUBLIC_API_URL);
  assert.equal(apiUrl.protocol, 'https:');
  assert.equal(apiUrl.username, '');
  assert.equal(apiUrl.password, '');
  assert.equal(apiUrl.search, '');
  assert.equal(apiUrl.hash, '');
});

test('API configuration canonicalizes HTTPS and disables cleartext', () => {
  const config = resolvedConfig('  https://api.example.test/base///  ');
  assert.equal(config.extra.apiUrl, 'https://api.example.test/base');
  assert.equal(cleartextSetting(config), false);
});

test('HTTP API configuration is restricted to explicit development hosts', () => {
  for (const allowed of [
    'http://localhost:8000/',
    'http://127.0.0.1:8000/',
    'http://10.0.2.2:8000/',
    'http://[::1]:8000/',
  ]) {
    const config = resolvedConfig(allowed);
    assert.equal(cleartextSetting(config), true, allowed);
  }

  for (const rejected of [
    'http://api.example.test',
    'http://localhost.example.test:8000',
    'http://192.168.1.25:8000',
    'ftp://localhost:8000',
  ]) {
    assert.throws(() => resolvedConfig(rejected), /must use HTTPS/, rejected);
  }
});

test('API base URLs reject embedded credentials, queries, and fragments', () => {
  assert.throws(
    () => resolvedConfig('https://user:password@api.example.test'),
    /must not contain credentials/,
  );
  assert.throws(
    () => resolvedConfig('https://api.example.test?token=public-but-wrong-place'),
    /must not contain a query string or fragment/,
  );
  assert.throws(
    () => resolvedConfig('https://api.example.test/#fragment'),
    /must not contain a query string or fragment/,
  );
});

test('package scripts pin the same EAS CLI and preview profile', () => {
  assert.match(packageJson.scripts['eas:config:android:preview'], /eas-cli@25\.2\.0 config .*--profile preview/);
  assert.match(packageJson.scripts['eas:build:android:preview'], /eas-cli@25\.2\.0 build .*--profile preview/);
});
