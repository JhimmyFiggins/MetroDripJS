// Runs mocked console layout checks and the Add User dialog keyboard regression.
// Requires the dev server to be running: npm run dev
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..', '..');

const layoutSource = readFileSync(join(repoRoot, 'tests/browser/console-layout.js'), 'utf8');
// The file is an async (page) => { ... } expression; wrap and evaluate it.
const layoutTest = new Function('page', `"use strict"; return (${layoutSource})`)();

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

try {
  const result = await layoutTest(page);
  console.log(`Browser layout: ${result.passed} passed (${result.mode})`);
  await page.goto('http://127.0.0.1:3000/admin/users.html');
  await page.locator('#btn-open-add-user').click();
  if (await page.locator('#modal-add-user').getAttribute('hidden') !== null) {
    throw new Error('Add User dialog did not open');
  }
  await page.keyboard.press('Escape');
  if (await page.locator('#modal-add-user').getAttribute('hidden') === null) {
    throw new Error('Escape did not close Add User dialog');
  }
  if (!(await page.locator('#btn-open-add-user').evaluate(element => element === document.activeElement))) {
    throw new Error('Closing Add User dialog did not restore focus');
  }
  await page.locator('#btn-open-add-user').click();
  await page.locator('#btn-submit-add-user').focus();
  await page.keyboard.press('Tab');
  if (!(await page.locator('#btn-close-modal').evaluate(element => element === document.activeElement))) {
    throw new Error('Tab escaped the Add User dialog');
  }
  await page.keyboard.press('Shift+Tab');
  if (!(await page.locator('#btn-submit-add-user').evaluate(element => element === document.activeElement))) {
    throw new Error('Shift+Tab escaped the Add User dialog');
  }
  console.log('Browser Add User dialog: Escape, focus return and Tab containment passed');
} catch (err) {
  console.error('Browser test failed:', err.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
