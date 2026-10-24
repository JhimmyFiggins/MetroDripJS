import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const base = process.env.BANNER_BASE_URL || 'http://127.0.0.1:8000';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
try {
  await page.goto(`${base}/customer/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1', { timeout: 15000 });
  const heading = await page.locator('h1').innerText();
  const body = await page.locator('body').innerText();
  assert.match(heading, /Cyber Monday Sale/);
  assert.equal(body.includes('Urban Style'), false);
  assert.match(body, /Shop Now/);
  console.log('live banner sync passed');
} finally {
  await browser.close();
}
