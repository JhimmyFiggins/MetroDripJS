import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, isAbsolute, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Convert the module URL before joining paths so Windows drive letters stay valid.
const root = fileURLToPath(new URL('../../web/', import.meta.url)).replace(/[\\/]+$/, '');
const widths = [320, 390, 768, 1280, 1440];
const types = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
};

function startServer() {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/products') || url.pathname.startsWith('/categories') || url.pathname.startsWith('/variants')) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify([]));
      return;
    }
    let path = url.pathname === '/customer' || url.pathname.startsWith('/customer/') && !extname(url.pathname)
      ? '/customer/index.html'
      : url.pathname;
    const file = normalize(join(root, path.replace(/^\/+/, '')));
    const location = relative(root, file);
    if (location === '..' || location.startsWith('..\\') || location.startsWith('../') || isAbsolute(location)) {
      response.writeHead(403);
      response.end();
      return;
    }
    try {
      const body = await readFile(file);
      response.writeHead(200, { 'content-type': types[extname(file)] || 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const server = await startServer();
const { port } = server.address();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const failures = [];
try {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`http://127.0.0.1:${port}/customer/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('h1');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    if (overflow) failures.push(`horizontal overflow at ${width}px`);
    const bag = await page.locator('#bag-link').boundingBox();
    if (!bag || bag.width < 44 || bag.height < 40) failures.push(`bag control below target at ${width}px`);
  }
  await page.goto(`http://127.0.0.1:${port}/customer/notifications`);
  await page.waitForSelector('h1');
  const heading = await page.locator('h1').innerText();
  assert.match(heading, /sign in|notification/i);
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  throw new Error(failures.join('\n'));
}
console.log('customer browser smoke passed');
