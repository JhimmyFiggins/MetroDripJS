import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();
const read = (...parts) => readFileSync(join(repoRoot, ...parts), 'utf8');

test('branding assets exist in both web and mobile directories with complete light/dark pairs', () => {
  const variants = ['logo', 'logo-emblem', 'logo-wordmark'];
  for (const directory of ['web/assets/branding', 'mobile/assets/branding']) {
    for (const variant of variants) {
      for (const suffix of ['', '-dark']) {
        const file = `${variant}${suffix}.png`;
        assert.ok(existsSync(join(repoRoot, directory, file)), `Missing ${directory}/${file}`);
      }
    }
  }
});

test('customer markup exposes both logo variants and CSS switches visibility without image content replacement', () => {
  const html = read('web', 'customer', 'index.html');
  const css = read('web', 'customer', 'customer.css');

  for (const file of ['logo.png', 'logo-dark.png', 'logo-emblem.png', 'logo-emblem-dark.png']) {
    assert.match(html, new RegExp(`/assets/branding/${file.replace('.', '\\.')}"`));
  }
  assert.match(html, /class="theme-logo header-brand-emblem" aria-hidden="true"/);
  assert.match(html, /class="theme-logo footer-brand-logo" aria-hidden="true"/);
  assert.match(css, /:root\[data-theme="dark"\]\s+\.theme-logo-light\s*\{[^}]*display:\s*none/s);
  assert.match(css, /:root\[data-theme="dark"\]\s+\.theme-logo-dark\s*\{[^}]*display:\s*block/s);
  assert.doesNotMatch(css, /content:\s*url\([^)]*branding\/logo/);
  assert.doesNotMatch(css, /filter:\s*(?:drop-shadow|invert)/);
});

test('customer theme resolves before paint, persists explicit choices, and follows system changes only without a choice', () => {
  const html = read('web', 'customer', 'index.html');
  const js = read('web', 'customer', 'app.js');

  assert.match(html, /matchMedia\('\(prefers-color-scheme: dark\)'\)/);
  assert.match(html, /document\.documentElement\.dataset\.theme\s*=/);
  assert.match(js, /const systemThemeQuery = window\.matchMedia\?\.\('\(prefers-color-scheme: dark\)'\)/);
  assert.match(js, /systemThemeQuery\?\.addEventListener\('change'/);
  assert.match(js, /if \(!readThemePreference\(\)\) applyTheme\(systemTheme\(\)\)/);
  assert.match(js, /localStorage\.setItem\(THEME_STORAGE_KEY, next\)/);
});

test('customer auth branding uses the dark-surface asset while theme-sensitive OTP branding uses the shared pair', () => {
  const js = read('web', 'customer', 'app.js');
  assert.doesNotMatch(js, /\/assets\/branding\/logo-badge\.png/);
  assert.match(js, /src: '\/assets\/branding\/logo-dark\.png'/);
  assert.match(js, /themeLogo\('emblem'\)/);
});

test('staff console and login branding select the contrasting emblem for each theme', () => {
  const consoleCss = read('web', 'css', 'console.css');
  const loginCss = read('web', 'Registration', 'screens', 'LoginScreen.css');
  for (const css of [consoleCss, loginCss]) {
    assert.match(css, /logo-emblem\.png/);
    assert.match(css, /logo-emblem-dark\.png/);
    assert.doesNotMatch(css, /filter:\s*(?:drop-shadow|invert)/);
  }
});

test('mobile logo rendering is centralized and every consumer declares the actual backing surface', () => {
  const component = read('mobile', 'components', 'BrandLogo.jsx');
  for (const file of [
    'logo.png', 'logo-dark.png',
    'logo-emblem.png', 'logo-emblem-dark.png',
    'logo-wordmark.png', 'logo-wordmark-dark.png',
  ]) {
    assert.match(component, new RegExp(file.replace('.', '\\.')));
  }
  assert.match(component, /surface === 'dark' \? assets\.dark : assets\.light/);

  const consumers = [
    ['mobile/Registration/screens/InitialScreen.js', /<BrandLogo[\s\S]*surface="dark"/],
    ['mobile/Registration/screens/OtpScreen.js', /<BrandLogo[\s\S]*surface=\{theme\.mode\}/],
    ['mobile/components/Header.jsx', /<BrandLogo[\s\S]*surface="light"/],
    ['mobile/components/HomeHeader.jsx', /<BrandLogo[\s\S]*surface="light"/],
    ['mobile/Account_Management/Account.jsx', /<BrandLogo[\s\S]*surface="light"/],
    ['mobile/Checkout/src/screens/OrderConfirmationScreen.jsx', /<BrandLogo[\s\S]*surface="light"/],
  ];
  for (const [file, pattern] of consumers) {
    assert.match(read(...file.split('/')), pattern, `${file} must select its logo by surface`);
  }
});

test('the active Expo root provides system theme context and permits native appearance changes', () => {
  const app = read('App.js');
  const config = JSON.parse(read('app.json'));
  assert.match(app, /<ThemeProvider>/);
  assert.equal(config.expo.userInterfaceStyle, 'automatic');
});

test('SVG favicon keeps the dark-adapted emblem on its dark tile', () => {
  const svg = read('web', 'assets', 'favicon.svg');
  assert.match(svg, /fill: #141414/);
  assert.match(svg, /logo-emblem-dark\.png/);
});
