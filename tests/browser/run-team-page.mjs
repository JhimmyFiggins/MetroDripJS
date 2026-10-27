import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log(`Navigating to ${BASE_URL}/customer/team ...`);
  await page.goto(`${BASE_URL}/customer/team`, { waitUntil: 'networkidle' });

  // 1. Heading and Subtitle check
  const h1 = await page.locator('main h1').textContent();
  console.log(`✓ Page h1: "${h1}"`);
  assert.equal(h1.trim(), 'THE TEAM');

  const subtitle = await page.locator('.team-subtitle').textContent();
  console.log(`✓ Page subtitle verified: "${subtitle.slice(0, 50)}..."`);
  assert.match(subtitle, /Technological Institute of the Philippines/);

  // 2. Card count check
  const cards = page.locator('.team-card');
  const count = await cards.count();
  console.log(`✓ Team cards count: ${count}`);
  assert.equal(count, 5);

  // 3. Member details check
  const expectedNames = [
    'Navarro, Arshad Edwin',
    'Pameroyan, Archim Paul C.',
    'De Borja, John Meickann M.',
    'Carlos, Reuel L.',
    'Nogoy, Marcus Dylan',
  ];

  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);
    const name = await card.locator('.team-member-name').textContent();
    const role = await card.locator('.team-member-role').textContent();
    const badge = await card.locator('.team-badge').textContent();
    const bio = await card.locator('.team-member-bio').textContent();
    const img = card.locator('.team-avatar-img');

    assert.equal(name.trim(), expectedNames[i]);
    assert.ok(role.trim().length > 0, `Role empty for ${name}`);
    assert.ok(badge.trim().length > 0, `Badge empty for ${name}`);
    assert.ok(bio.trim().length > 20, `Bio too short for ${name}`);
    assert.ok(await img.isVisible(), `Avatar image not visible for ${name}`);
    console.log(`  [${i + 1}/5] Verified: ${name.trim()} (${role.trim()} - ${badge.trim()})`);
  }

  // 4. Accessibility audit with AxeBuilder
  console.log('Auditing Our Team page with AxeBuilder for WCAG 2.1 AA...');
  const accessibilityScan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();

  const violations = accessibilityScan.violations;
  if (violations.length > 0) {
    console.error('Axe violations found:', JSON.stringify(violations, null, 2));
    throw new Error(`AxeBuilder found ${violations.length} accessibility violations`);
  }
  console.log('✓ AxeBuilder WCAG 2.1 AA accessibility audit passed with 0 violations!');

  // 5. Test responsive layouts
  const viewports = [
    { name: 'Desktop', width: 1280, height: 800 },
    { name: 'Tablet', width: 800, height: 1000 },
    { name: 'Mobile', width: 375, height: 667 },
  ];

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.waitForTimeout(100);
    const gridBounding = await page.locator('.team-grid').boundingBox();
    assert.ok(gridBounding.width <= vp.width, `Grid width ${gridBounding.width} overflows viewport ${vp.width}`);
    console.log(`✓ Responsive check passed at ${vp.name} (${vp.width}px): no overflow`);
  }

  // 6. Navigation link test from Home
  console.log('Testing navigation from /customer/ to /customer/team via header link...');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE_URL}/customer/`, { waitUntil: 'networkidle' });
  const teamNavLink = page.locator('.desktop-nav-link[href="/customer/team"]');
  await teamNavLink.click();
  await page.waitForURL('**/customer/team');
  assert.equal(await page.locator('main h1').textContent(), 'THE TEAM');
  console.log('✓ Desktop header navigation to /customer/team verified!');

  await browser.close();
  console.log('ALL Our Team Browser E2E Tests PASSED successfully!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
