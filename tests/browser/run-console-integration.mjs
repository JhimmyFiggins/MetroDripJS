import AxeBuilder from '@axe-core/playwright';
import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webBase = process.env.QA_WEB_BASE || 'http://127.0.0.1:3000';
const apiBase = process.env.QA_API_BASE || 'http://127.0.0.1:8000';
const password = process.env.QA_STAFF_PASSWORD;
const adminEmail = process.env.QA_ADMIN_EMAIL || 'qa-admin@example.invalid';
const merchantEmail = process.env.QA_MERCHANT_EMAIL || 'qa-merchant@example.invalid';
const manageServers = process.env.QA_MANAGE_SERVERS === '1';
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const backendRoot = join(repoRoot, 'metrodrip_backend');
const managedProcesses = [];
const observedOrigins = new Set([new URL(webBase).origin, new URL(apiBase).origin]);

if (!password) {
  throw new Error('QA_STAFF_PASSWORD is required; use a synthetic credential for the disposable QA database.');
}

function findPython(explicit = process.env.QA_PYTHON) {
  const candidates = [];
  if (explicit) candidates.push({ command: explicit, prefix: [] });
  if (process.platform === 'win32') {
    candidates.push({ command: 'py', prefix: ['-3'] }, { command: 'python', prefix: [] });
  } else {
    candidates.push({ command: 'python3', prefix: [] }, { command: 'python', prefix: [] });
  }

  for (const candidate of candidates) {
    const result = spawnSync(candidate.command, [...candidate.prefix, '--version'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    if (!result.error && result.status === 0) return candidate;
  }
  throw new Error('No usable Python 3 interpreter was found. Set QA_PYTHON to its executable path.');
}

async function assertPortAvailable(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', error => reject(new Error(`Loopback port ${port} is unavailable: ${error.code || error.message}`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}

function startProcess(command, args, options) {
  const child = spawn(command, args, { ...options, windowsHide: true });
  let output = '';
  const capture = chunk => {
    output = `${output}${chunk}`.slice(-50000);
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.once('error', error => {
    child.spawnError = error;
    capture(`spawn error: ${error.message}`);
  });
  child.output = () => output;
  managedProcesses.push(child);
  return child;
}

async function waitForUrl(url, predicate) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok && await predicate(response)) return;
    } catch {
      // The owned loopback process may still be starting.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

async function stopManagedProcesses() {
  await Promise.all(managedProcesses.map(child => new Promise(resolve => {
    if (child.exitCode !== null || child.killed || !child.pid) return resolve();
    const timeout = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
      resolve();
    }, 5000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill();
  })));
}

async function startManagedServers() {
  const python = findPython();
  const databaseUrl = process.env.QA_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('QA_DATABASE_URL is required when QA_MANAGE_SERVERS=1.');
  }
  await assertPortAvailable(3000);
  await assertPortAvailable(8000);

  const serverEnv = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    DJANGO_SECRET_KEY: process.env.QA_DJANGO_SECRET_KEY || 'disposable-browser-integration-secret-with-more-than-fifty-characters-2026',
    DJANGO_DEBUG: 'true',
    QA_ADMIN_EMAIL: adminEmail,
    QA_MERCHANT_EMAIL: merchantEmail,
    QA_STAFF_PASSWORD: password,
    BACKEND_URL: apiBase,
  };
  const seedCode = `
import os
from django.utils import timezone
from identity.models import AccountsCustomer
password = os.environ['QA_STAFF_PASSWORD']
for email, name, role in [
    (os.environ['QA_ADMIN_EMAIL'], 'QA Admin', 'admin'),
    (os.environ['QA_MERCHANT_EMAIL'], 'QA Merchant', 'merchant'),
]:
    user, _ = AccountsCustomer.objects.update_or_create(
        email=email,
        defaults={
            'name': name,
            'phone': '',
            'addresses': {},
            'is_active': True,
            'is_staff': True,
            'is_superuser': role == 'admin',
            'role': role,
            'date_joined': timezone.now(),
        },
    )
    user.set_password(password)
    user.save(update_fields=['password'])
print('synthetic_staff_ready=2')
`;
  const seeded = spawnSync(python.command, [...python.prefix, 'manage.py', 'shell', '-c', seedCode], {
    cwd: backendRoot,
    env: serverEnv,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (seeded.status !== 0) {
    throw new Error(`Synthetic staff setup failed: ${seeded.stderr || seeded.stdout}`);
  }

  const backend = startProcess(
    python.command,
    [...python.prefix, 'manage.py', 'runserver', '127.0.0.1:8000', '--noreload'],
    { cwd: backendRoot, env: serverEnv },
  );
  const web = startProcess(
    python.command,
    [...python.prefix, 'web/dev_server.py', '3000'],
    { cwd: repoRoot, env: serverEnv },
  );
  try {
    await waitForUrl(`${apiBase}/health/`, async response => (await response.json()).status === 'ok');
    await waitForUrl(`${webBase}/Registration/screens/AdminLoginScreen.html`, async () => true);
  } catch (error) {
    throw new Error(`${error.message}\nBackend output:\n${backend.output()}\nWeb output:\n${web.output()}`);
  }
}

if (manageServers) {
  try {
    await startManagedServers();
  } catch (error) {
    await stopManagedProcesses();
    throw error;
  }
}

let browser;
try {
  browser = await (async () => {
    try {
      return await chromium.launch({ channel: process.env.PLAYWRIGHT_CHROME_CHANNEL || 'chrome', headless: true });
    } catch {
      return chromium.launch({ headless: true });
    }
  })();
} catch (error) {
  await stopManagedProcesses();
  throw error;
}

const failures = [];
let accessibilityPagesChecked = 0;

async function assertAccessible(page, label) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  accessibilityPagesChecked += 1;
  if (!result.violations.length) return;
  const details = result.violations.map(violation => {
    const nodes = violation.nodes.map(node => (
      `${node.target.join(', ')} — ${node.failureSummary || node.html}`
    ));
    return `${violation.id} (${violation.impact || 'unknown'}):\n${nodes.join('\n')}`;
  });
  throw new Error(`${label} has Axe violations:\n${details.join('\n')}`);
}

async function newObservedPage() {
  const context = await browser.newContext();
  const page = await context.newPage();
  const localServerErrors = [];

  page.on('console', message => {
    const browserNetworkMessage = message.text().startsWith('Failed to load resource:');
    if (message.type() === 'error' && !browserNetworkMessage) failures.push(`console: ${message.text()}`);
  });
  page.on('pageerror', error => failures.push(`pageerror: ${error.message}`));
  page.on('response', response => {
    const url = response.url();
    const expectedInvalidLogin = new URL(url).pathname === '/login/' && response.status() === 401;
    if (
      (url.startsWith(webBase) || url.startsWith(apiBase))
      && response.status() >= 400
      && !expectedInvalidLogin
    ) {
      localServerErrors.push(`${response.status()} ${response.request().method()} ${url}`);
    }
  });
  page.on('requestfailed', request => {
    const url = request.url();
    if (url.startsWith(webBase) || url.startsWith(apiBase)) {
      failures.push(`requestfailed: ${request.method()} ${url} (${request.failure()?.errorText || 'unknown'})`);
    }
  });

  return { context, page, localServerErrors };
}

function matchesApiResponse(response, pathname, method, { prefix = false } = {}) {
  const url = new URL(response.url());
  return (
    observedOrigins.has(url.origin)
    && (prefix ? url.pathname.startsWith(pathname) : url.pathname === pathname)
    && response.request().method() === method
  );
}

async function login(role, email) {
  const observed = await newObservedPage();
  const { page } = observed;
  const loginPath = role === 'admin'
    ? '/Registration/screens/AdminLoginScreen.html'
    : '/Registration/screens/MerchantLoginScreen.html';
  const destination = role === 'admin' ? '/admin/index.html' : '/merchant/index.html';
  const dashboardPath = role === 'admin' ? '/api/admin/dashboard/' : '/api/merchant/dashboard/';

  await page.goto(`${webBase}${loginPath}`);
  await assertAccessible(page, `${role} login`);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await Promise.all([
    page.waitForURL(url => url.pathname === destination),
    page.locator('button[type="submit"]').click(),
  ]);
  await page.waitForLoadState('networkidle');

  const session = await page.evaluate(() => JSON.parse(sessionStorage.getItem('metrodrip_active_user') || 'null'));
  if (!session?.access_token || session.role !== role || session.is_staff !== true) {
    throw new Error(`${role} login did not create the expected in-memory staff session.`);
  }
  const dashboardResponse = await page.request.get(`${apiBase}${dashboardPath}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (dashboardResponse.status() !== 200) {
    throw new Error(`${role} dashboard API returned ${dashboardResponse.status()}.`);
  }

  return { ...observed, session };
}

try {
  const healthObserved = await newObservedPage();
  const health = await healthObserved.context.request.get(`${apiBase}/health/`);
  if (health.status() !== 200 || (await health.json()).status !== 'ok') {
    throw new Error(`Django health check returned ${health.status()}.`);
  }
  await healthObserved.context.close();

  const admin = await login('admin', adminEmail);
  const adminUsersResponse = admin.page.waitForResponse(response => (
    matchesApiResponse(response, '/api/admin/users/', 'GET')
  ));
  await admin.page.goto(`${webBase}/admin/users.html`);
  if ((await adminUsersResponse).status() !== 200) throw new Error('Admin users UI did not receive a 200 Django response.');
  await admin.page.getByText(adminEmail, { exact: true }).waitFor();
  await assertAccessible(admin.page, 'admin users');

  const merchant = await login('merchant', merchantEmail);
  const merchantOrdersResponse = merchant.page.waitForResponse(response => (
    matchesApiResponse(response, '/api/merchant/orders/', 'GET', { prefix: true })
  ));
  await merchant.page.goto(`${webBase}/merchant/orders.html`);
  if ((await merchantOrdersResponse).status() !== 200) throw new Error('Merchant orders UI did not receive a 200 Django response.');
  await assertAccessible(merchant.page, 'merchant orders');

  const merchantDenied = await merchant.page.request.get(`${apiBase}/api/admin/users/`, {
    headers: { Authorization: `Bearer ${merchant.session.access_token}` },
  });
  if (merchantDenied.status() !== 403) {
    throw new Error(`Merchant-to-admin authorization returned ${merchantDenied.status()} instead of 403.`);
  }

  const mismatch = await newObservedPage();
  await mismatch.page.goto(`${webBase}/Registration/screens/MerchantLoginScreen.html`);
  await mismatch.page.locator('input[name="email"]').fill(adminEmail);
  await mismatch.page.locator('input[name="password"]').fill(password);
  await mismatch.page.locator('button[type="submit"]').click();
  await mismatch.page.locator('[data-form-status][role="alert"]').waitFor();
  const mismatchMessage = (await mismatch.page.locator('[data-form-status]').textContent())?.trim();
  if (mismatchMessage !== 'This account does not have access to the selected console.') {
    throw new Error(`Unexpected role-mismatch message: ${mismatchMessage}`);
  }
  const mismatchSession = await mismatch.page.evaluate(() => sessionStorage.getItem('metrodrip_active_user'));
  if (mismatchSession !== null) throw new Error('Role-mismatched login retained a browser session.');

  const invalid = await newObservedPage();
  await invalid.page.goto(`${webBase}/Registration/screens/AdminLoginScreen.html`);
  await invalid.page.locator('input[name="email"]').fill(adminEmail);
  await invalid.page.locator('input[name="password"]').fill(`${password}-wrong`);
  await invalid.page.locator('button[type="submit"]').click();
  await invalid.page.locator('[data-form-status][role="alert"]').waitFor();
  if (await invalid.page.evaluate(() => sessionStorage.getItem('metrodrip_active_user')) !== null) {
    throw new Error('Invalid-password login retained a browser session.');
  }

  for (const observed of [admin, merchant, mismatch, invalid]) {
    if (observed.localServerErrors.length) failures.push(...observed.localServerErrors);
    await observed.context.close();
  }

  if (failures.length) throw new Error(failures.join('\n'));
  console.log(`Browser-to-Django integration: 7 checks passed; Axe WCAG A/AA scan passed on ${accessibilityPagesChecked} pages.`);
} finally {
  await browser.close();
  await stopManagedProcesses();
}
