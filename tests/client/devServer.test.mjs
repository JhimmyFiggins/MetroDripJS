// End-to-end check that `npm run dev` actually serves the web/ tree.
//
// Regression guard: the handler used to inherit the current working directory,
// so launching `python web/dev_server.py 3000` from the repo root served the
// repository root and every console URL 404'd.
//
// Also guards the /save-favicon write route, which used to join a caller-supplied
// filename onto web/assets and crash with a traceback on malformed JSON.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = path.join(repoRoot, 'web', 'dev_server.py');
const PORT = Number(process.env.CLIENT_DEV_SERVER_PORT || 34517);

function portAnswers(port) {
  return fetch(`http://127.0.0.1:${port}/index.html`, { signal: AbortSignal.timeout(1500) })
    .then(() => true)
    .catch(() => false);
}

const available = !(await portAnswers(PORT));
let server = null;

if (available) {
  // stdio is fully detached: reading the child's pipes would keep this process
  // alive after the assertions finish, and closing them early kills the server.
  server = spawn(process.env.PYTHON || 'python', ['-u', script, String(PORT)], {
    cwd: repoRoot,
    stdio: 'ignore',
  });

  const deadline = Date.now() + 20000;
  for (;;) {
    if (server.exitCode !== null) {
      throw new Error(`dev server exited early with code ${server.exitCode}`);
    }
    if (await portAnswers(PORT)) break;
    if (Date.now() > deadline) throw new Error('dev server did not start in time');
    await new Promise((r) => setTimeout(r, 150));
  }

  server.unref();
}

test.after(() => {
  server?.kill();
});

const skip = available ? false : `port ${PORT} is busy; another agent may be using it`;

async function get(pathname) {
  const res = await fetch(`http://127.0.0.1:${PORT}${pathname}`);
  return { status: res.status, type: res.headers.get('content-type'), body: await res.text() };
}

test('the storefront index resolves at the server root, not under /web/', { skip }, async () => {
  const res = await get('/index.html');
  assert.equal(res.status, 200);
  assert.match(res.type, /text\/html/);
  assert.match(res.body, /<html/i);
});

test('the admin console resolves at /admin/index.html', { skip }, async () => {
  const res = await get('/admin/index.html');
  assert.equal(res.status, 200);
  assert.match(res.type, /text\/html/);
});

test('the merchant console resolves at /merchant/index.html', { skip }, async () => {
  assert.equal((await get('/merchant/index.html')).status, 200);
});

test('shared JS and CSS resolve from the console pages via the path rewrite', { skip }, async () => {
  assert.equal((await get('/admin/js/user-session.js')).status, 200);
  assert.equal((await get('/merchant/js/user-session.js')).status, 200);
  assert.equal((await get('/admin/css/console.css')).status, 200);
});

test('the clean account-settings URL rewrites to its html file', { skip }, async () => {
  const res = await get('/admin/account/settings');
  assert.equal(res.status, 200);
  assert.match(res.type, /text\/html/);
});

test('favicon requests are served from assets', { skip }, async () => {
  assert.equal((await get('/favicon.svg')).status, 200);
});

test('static assets are served no-store so a QA reload is not stale', { skip }, async () => {
  const res = await fetch(`http://127.0.0.1:${PORT}/index.html`);
  assert.match(res.headers.get('cache-control') || '', /no-store/);
});

test('the repository root is no longer exposed as the document root', { skip }, async () => {
  // package.json lives at the repo root; before the fix this returned 200.
  assert.equal((await get('/package.json')).status, 404);
});

// --- /save-favicon hardening --------------------------------------------------

async function postFavicon(payload, { raw = null, headers = {} } = {}) {
  const res = await fetch(`http://127.0.0.1:${PORT}/save-favicon`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: raw !== null ? raw : JSON.stringify(payload),
  });
  return { status: res.status, body: await res.text() };
}

const canary = path.join(repoRoot, 'tests', 'client', '.favicon-traversal-canary.txt');
fs.rmSync(canary, { force: true });

test('a traversal filename is refused with 400 and writes nothing', { skip }, async () => {
  const res = await postFavicon({
    filename: '../.favicon-traversal-canary.txt',
    data: 'data:image/png;base64,aGk=',
  });
  assert.equal(res.status, 400);
  assert.equal(fs.existsSync(canary), false, 'a file outside web/assets was written');
});

test('a deep traversal filename is refused with 400', { skip }, async () => {
  const res = await postFavicon({
    filename: '../../../../Windows/win.ini',
    data: 'data:image/png;base64,aGk=',
  });
  assert.equal(res.status, 400);
});

test('an absolute filename is refused rather than joined onto the assets path', { skip }, async () => {
  const res = await postFavicon({
    filename: path.join(repoRoot, 'evil.png'),
    data: 'data:image/png;base64,aGk=',
  });
  assert.equal(res.status, 400);
});

test('an unknown asset name is refused, so the route cannot overwrite app files', { skip }, async () => {
  for (const filename of ['index.html', 'js/user-session.js', 'favicon.exe', 'favicon.php']) {
    const res = await postFavicon({ filename, data: 'data:image/png;base64,aGk=' });
    assert.equal(res.status, 400, `${filename} must be rejected`);
  }
});

test('malformed JSON is a 400, not a traceback and not a dead connection', { skip }, async () => {
  const res = await postFavicon(null, { raw: '{not json' });
  assert.equal(res.status, 400);
});

test('a JSON array or scalar is a 400', { skip }, async () => {
  assert.equal((await postFavicon(null, { raw: '[]' })).status, 400);
  assert.equal((await postFavicon(null, { raw: '"favicon.png"' })).status, 400);
});

test('a payload whose data is not base64 is a 400 and does not write a truncated file', { skip }, async () => {
  const res = await postFavicon({ filename: 'favicon.png', data: 'data:image/png;base64,!!!!not-base64!!!!' });
  assert.equal(res.status, 400);
});

test('a missing or non-string filename is a 400', { skip }, async () => {
  assert.equal((await postFavicon({ data: 'data:image/png;base64,aGk=' })).status, 400);
  assert.equal((await postFavicon({ filename: 42, data: 'data:image/png;base64,aGk=' })).status, 400);
  assert.equal((await postFavicon({ filename: 'favicon.png' })).status, 400);
});

test('an unknown POST path is a 404 JSON, not an empty body', { skip }, async () => {
  const res = await fetch(`http://127.0.0.1:${PORT}/nope`, { method: 'POST', body: '{}' });
  assert.equal(res.status, 404);
  assert.match(await res.text(), /Not found/);
});

test('an empty body is a 400', { skip }, async () => {
  const res = await postFavicon(null, { raw: '' });
  assert.equal(res.status, 400);
});

test('a valid favicon name is still accepted, so the feature is not broken by the guard', { skip }, async () => {
  const assets = path.join(repoRoot, 'web', 'assets', 'favicon.png');
  const before = fs.existsSync(assets) ? fs.readFileSync(assets) : null;
  const res = await postFavicon({ filename: 'favicon.png', data: 'data:image/png;base64,aGk=' });
  assert.equal(res.status, 200);
  assert.match(res.body, /"status":\s*"ok"/);
  // Restore the real asset so the test leaves no side effect.
  if (before) fs.writeFileSync(assets, before);
  else fs.rmSync(assets, { force: true });
});

// --- bind address -------------------------------------------------------------

test('the server is not reachable on a non-loopback interface', { skip: !available }, async () => {
  // A dev server that accepts a write request must not listen on every
  // interface. Probe the host's LAN address and expect a connection refusal.
  const addrs = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal);
  if (addrs.length === 0) return; // isolated CI container: nothing to probe

  for (const addr of addrs) {
    const reachable = await new Promise((resolve) => {
      const socket = net.connect({ host: addr.address, port: PORT });
      socket.setTimeout(1200);
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('error', () => resolve(false));
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
    });
    assert.equal(reachable, false, `dev server accepted a connection on ${addr.address}`);
  }
});

