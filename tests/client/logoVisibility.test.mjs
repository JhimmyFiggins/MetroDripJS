import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();

test('branding assets exist in both web and mobile directories with required variants', () => {
  const requiredWeb = [
    'logo.png',
    'logo-dark.png',
    'logo-emblem.png',
    'logo-emblem-dark.png',
    'logo-wordmark.png',
    'logo-wordmark-dark.png',
    'logo-master.png',
    'logo-5.png',
  ];
  for (const file of requiredWeb) {
    const p = join(repoRoot, 'web/assets/branding', file);
    assert.ok(existsSync(p), `Missing web branding asset: ${file}`);
  }

  const requiredMobile = [
    'logo.png',
    'logo-dark.png',
    'logo-emblem.png',
    'logo-emblem-dark.png',
    'logo-wordmark.png',
    'logo-wordmark-dark.png',
  ];
  for (const file of requiredMobile) {
    const p = join(repoRoot, 'mobile/assets/branding', file);
    assert.ok(existsSync(p), `Missing mobile branding asset: ${file}`);
  }
});

test('web customer CSS defines responsive, theme-aware logo treatments without filter smudges', () => {
  const css = readFileSync(join(repoRoot, 'web/customer/customer.css'), 'utf8');
  assert.match(css, /\.header-brand-emblem/, 'customer.css must style .header-brand-emblem');
  assert.match(
    css,
    /:root\[data-theme="dark"\]\s+\.header-brand-emblem\s*\{\s*content:\s*url\('\/assets\/branding\/logo-emblem-dark\.png'\);/,
    'customer.css must swap header emblem to logo-emblem-dark.png in dark theme'
  );
  assert.match(
    css,
    /:root\[data-theme="dark"\]\s+\.footer-brand-logo\s*\{\s*content:\s*url\('\/assets\/branding\/logo-dark\.png'\);/,
    'customer.css must swap footer logo to logo-dark.png in dark theme'
  );
  assert.doesNotMatch(
    css,
    /:root\[data-theme="dark"\]\s+\.footer-brand-logo\s*\{\s*filter:\s*drop-shadow/,
    'customer.css should not rely on blurry drop-shadow filters for footer logo'
  );
});

test('web customer app renders clean dark-theme logo on auth panels without solid white box badges', () => {
  const js = readFileSync(join(repoRoot, 'web/customer/app.js'), 'utf8');
  assert.doesNotMatch(
    js,
    /\/assets\/branding\/logo-badge\.png/,
    'app.js must not reference legacy solid-box logo-badge.png'
  );
  assert.match(
    js,
    /\/assets\/branding\/logo-dark\.png/,
    'app.js must reference seamless logo-dark.png for auth cards'
  );
});

test('admin and merchant console stylesheets support dark theme branding', () => {
  const consoleCss = readFileSync(join(repoRoot, 'web/css/console.css'), 'utf8');
  assert.match(
    consoleCss,
    /:root\[data-theme='dark'\]\s+\.brand-logo::before/,
    'console.css must declare dark theme for .brand-logo::before'
  );
  assert.match(
    consoleCss,
    /\/assets\/branding\/logo-emblem-dark\.png/,
    'console.css must reference logo-emblem-dark.png in dark mode'
  );

  const loginCss = readFileSync(join(repoRoot, 'web/Registration/screens/LoginScreen.css'), 'utf8');
  assert.match(
    loginCss,
    /\/assets\/branding\/logo-emblem-dark\.png/,
    'LoginScreen.css must reference logo-emblem-dark.png for dark theme login branding'
  );
});

test('mobile welcome screen renders transparent logo-dark.png without solid white container', () => {
  const initialJs = readFileSync(join(repoRoot, 'mobile/Registration/screens/InitialScreen.js'), 'utf8');
  assert.doesNotMatch(
    initialJs,
    /logo-badge\.png/,
    'InitialScreen.js must not reference legacy solid-box logo-badge.png'
  );
  assert.match(
    initialJs,
    /logo-dark\.png/,
    'InitialScreen.js must reference seamless logo-dark.png'
  );
});

test('mobile OTP screen dynamically selects theme-appropriate emblem', () => {
  const otpJs = readFileSync(join(repoRoot, 'mobile/Registration/screens/OtpScreen.js'), 'utf8');
  assert.match(
    otpJs,
    /logo-emblem-dark\.png/,
    'OtpScreen.js must reference logo-emblem-dark.png for dark mode'
  );
});

test('SVG favicon utilizes dark-adapted emblem against dark background', () => {
  const svg = readFileSync(join(repoRoot, 'web/assets/favicon.svg'), 'utf8');
  assert.match(
    svg,
    /logo-emblem-dark\.png/,
    'favicon.svg must reference logo-emblem-dark.png'
  );
});
