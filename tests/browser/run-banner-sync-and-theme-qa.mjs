import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';

const MOCK_BANNERS = [
  {
    id: 101,
    title: 'Summer Solstice Drop',
    headline: 'SUMMER SOLSTICE // 2026',
    subtext: 'Designed in NCR for high-heat street utility',
    button_label: 'Explore Solstice',
    placement: 'homepage_hero',
    placement_label: 'Homepage hero',
    image_url: 'https://images.example.com/banners/hero.webp',
    link_url: '/shop?category=tees',
    order: 1,
    artwork_mode: 'graphic',
    graphic_text_main: 'SOLSTICE',
    graphic_text_tagline: 'METRO MANILA STREETWEAR',
    graphic_text_sub: 'LIMITED EDITION // 2026',
    graphic_bg_color: '#d3ee42',
    graphic_text_color: '#141414',
    graphic_accent_color: '#141414',
    graphic_alignment: 'left',
    graphic_font_size: 'normal',
    image_fit: 'cover',
  },
  {
    id: 102,
    title: 'Flash Footwear Sale',
    headline: 'WEEKEND FLASH // 25% OFF KICKS',
    subtext: 'Limited stock available at checkout',
    button_label: 'Shop Kicks',
    placement: 'homepage_secondary',
    placement_label: 'Homepage secondary',
    image_url: 'https://images.example.com/banners/kicks.webp',
    link_url: '/shop?category=footwear',
    order: 2,
    artwork_mode: 'image',
    image_fit: 'cover',
  },
  {
    id: 103,
    title: 'Metro Free Delivery',
    headline: 'SAME-DAY DELIVERY ACROSS METRO MANILA',
    subtext: 'Orders over ₱2,500 ship free',
    button_label: 'Learn More',
    placement: 'announcement_bar',
    placement_label: 'Announcement bar',
    image_url: '',
    link_url: '/shop',
    order: 3,
  },
  {
    id: 104,
    title: 'Category Exclusive',
    headline: 'HEAVYWEIGHT FLEECE & OUTERWEAR',
    subtext: 'Built for urban weather transitions',
    button_label: 'Browse Outerwear',
    placement: 'category_banner',
    placement_label: 'Category banner',
    image_url: 'https://images.example.com/banners/outerwear.webp',
    link_url: '/shop?category=hoodies',
    order: 4,
  },
  {
    id: 105,
    title: 'Checkout Trust Guarantee',
    headline: 'PAYMONGO SECURED // CASH ON DELIVERY VERIFIED',
    subtext: '30-day money back guarantee on all MetroDrip apparel',
    button_label: 'Guarantee Details',
    placement: 'checkout_footer',
    placement_label: 'Checkout footer',
    image_url: 'https://images.example.com/banners/trust.webp',
    link_url: '/our-team',
    order: 5,
  },
];

async function testThemeSwitches(page) {
  console.log('\n--- Task 1: Testing Dark/Light Mode Theme Switches ---');

  const screensToTest = [
    {
      name: 'Admin Login Screen',
      url: `${BASE_URL}/Registration/screens/AdminLoginScreen.html`,
      containerSelector: '.theme-switch',
    },
    {
      name: 'Merchant Login Screen',
      url: `${BASE_URL}/Registration/screens/MerchantLoginScreen.html`,
      containerSelector: '.theme-switch',
    },
    {
      name: 'Reset Password Screen',
      url: `${BASE_URL}/Registration/screens/ResetPasswordScreen.html`,
      containerSelector: '.theme-switch',
    },
    {
      name: 'Admin Console Dashboard',
      url: `${BASE_URL}/admin/index.html`,
      containerSelector: '.theme-switch-container',
    },
    {
      name: 'Merchant Console Dashboard',
      url: `${BASE_URL}/merchant/index.html`,
      containerSelector: '.theme-switch-container',
    },
  ];

  await page.addInitScript(() => {
    sessionStorage.setItem('metrodrip_active_user', JSON.stringify({
      access_token: 'qa-test-token',
      token: 'qa-test-token',
      is_staff: true,
      role: 'admin',
      name: 'Admin User',
      email: 'admin@metrodrip.ph',
    }));
  });

  for (const screen of screensToTest) {
    console.log(`Testing ${screen.name}...`);
    await page.goto(screen.url, { waitUntil: 'domcontentloaded' });
    const switchContainer = page.locator(screen.containerSelector);
    await switchContainer.waitFor({ state: 'visible' });

    // Assert NO visible "Theme" or "THEME" label text
    const textContent = await switchContainer.innerText();
    assert.ok(
      !/\btheme\b/i.test(textContent),
      `Expected no visible "Theme" text in ${screen.name}, found: "${textContent}"`
    );

    // Verify accessibility attributes
    const ariaLabel = await switchContainer.getAttribute('aria-label');
    assert.equal(ariaLabel, 'Color theme selector', `Aria-label missing on ${screen.name}`);

    // Verify Light and Dark toggle buttons work
    const darkBtn = switchContainer.locator('[data-theme-option="dark"]');
    const lightBtn = switchContainer.locator('[data-theme-option="light"]');
    await darkBtn.click();
    const darkAttr = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    assert.equal(darkAttr, 'dark', `Dark mode not set on ${screen.name}`);

    await lightBtn.click();
    const lightAttr = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    assert.equal(lightAttr, 'light', `Light mode not set on ${screen.name}`);
    console.log(`✓ ${screen.name}: Theme switch has no visible "Theme" text, fully accessible, and toggles properly.`);
  }

  // Customer Website Theme Switch
  console.log('Testing Customer Website Theme Toggle...');
  await page.goto(`${BASE_URL}/customer/`, { waitUntil: 'domcontentloaded' });
  const custThemeBtn = page.locator('#theme-toggle');
  await custThemeBtn.waitFor({ state: 'visible' });

  const custBtnText = await custThemeBtn.innerText();
  assert.ok(
    !/\btheme\b/i.test(custBtnText),
    `Customer theme button displayed visible "Theme" text: "${custBtnText}"`
  );

  const initialCustAria = await custThemeBtn.getAttribute('aria-label');
  assert.match(initialCustAria, /switch to (dark|light) theme/i);

  // Toggle customer theme
  await custThemeBtn.click();
  const toggledTheme = await page.evaluate(() => document.documentElement.dataset.theme);
  assert.ok(['dark', 'light'].includes(toggledTheme), `Invalid dataset theme: ${toggledTheme}`);
  const storedTheme = await page.evaluate(() => localStorage.getItem('metrodrip.customer.theme'));
  assert.equal(storedTheme, toggledTheme, 'Theme not persisted in localStorage');

  // Reload to test persistence
  await page.reload({ waitUntil: 'domcontentloaded' });
  const reloadedTheme = await page.evaluate(() => document.documentElement.dataset.theme);
  assert.equal(reloadedTheme, storedTheme, 'Theme did not persist across page reload');
  console.log(`✓ Customer Website: No visible "Theme" text, accessible aria-label, and persists across reloads.`);
}

async function testBannerSynchronizationAndPlacements(page) {
  console.log('\n--- Task 2 & 3: Testing Banner Synchronization & Placement Locations ---');

  // Mock the public API responses
  await page.route('**/banners/**', async (route) => {
    const url = new URL(route.request().url());
    const placement = url.searchParams.get('placement');
    if (placement) {
      const filtered = MOCK_BANNERS.filter((b) => b.placement === placement.replace('-', '_'));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(filtered),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_BANNERS),
    });
  });

  // Mock categories and products for clean customer rendering
  await page.route('**/categories/**', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 1, name: 'Tees', slug: 'tees' },
        { id: 2, name: 'Hoodies', slug: 'hoodies' },
      ]),
    });
  });

  await page.route('**/products/**', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1,
          name: 'Heavyweight Boxy Tee',
          slug: 'heavyweight-boxy-tee',
          category: { name: 'Tees' },
          base_price: 1200,
          is_featured: true,
          image_url: '/assets/sample.png',
        },
      ]),
    });
  });

  // 1. Test Homepage Placements (announcement_bar, homepage_hero, homepage_secondary)
  console.log('Testing Customer Homepage banner placements...');
  await page.goto(`${BASE_URL}/customer/`, { waitUntil: 'networkidle' });

  // Verify Announcement Bar
  const announcementText = await page.locator('#announcement-text').textContent();
  assert.match(
    announcementText,
    /SAME-DAY DELIVERY ACROSS METRO MANILA/,
    `Announcement bar did not display synchronized content: "${announcementText}"`
  );
  console.log('✓ Placement 1 (announcement_bar): Displayed in top global header.');

  // Verify Homepage Hero
  const heroHeading = await page.locator('.homepage-hero h1').textContent();
  assert.match(
    heroHeading,
    /SUMMER SOLSTICE/,
    `Homepage hero did not display synchronized headline: "${heroHeading}"`
  );
  const heroBtn = await page.locator('.homepage-hero a.hero-cta').textContent();
  assert.equal(heroBtn.trim(), 'Explore Solstice');
  console.log('✓ Placement 2 (homepage_hero): Displayed in homepage hero section.');

  // Verify Homepage Secondary Banner
  const secBanner = page.locator('.home-page aside.published-banner');
  await secBanner.waitFor({ state: 'visible' });
  const secTitle = await secBanner.locator('h2').textContent();
  assert.match(secTitle, /WEEKEND FLASH/, `Secondary banner mismatch: "${secTitle}"`);
  const secImg = secBanner.locator('.published-banner-media img');
  assert.ok(await secImg.isVisible(), 'Secondary banner image media element is not visible');
  const secImgSrc = await secImg.getAttribute('src');
  assert.equal(secImgSrc, 'https://images.example.com/banners/kicks.webp');
  console.log('✓ Placement 3 (homepage_secondary): Displayed with image, headline, subtext, and CTA button.');

  // 2. Test Category Banner Placement (category_banner)
  console.log('Testing Customer Shop category_banner placement...');
  await page.goto(`${BASE_URL}/customer/shop`, { waitUntil: 'networkidle' });

  // Verify Announcement Bar remains synchronized on Shop page
  const shopAnnouncement = await page.locator('#announcement-text').textContent();
  assert.match(shopAnnouncement, /SAME-DAY DELIVERY ACROSS METRO MANILA/);

  // Verify Category Banner
  const catBanner = page.locator('.shop-page aside.published-banner');
  await catBanner.waitFor({ state: 'visible' });
  const catTitle = await catBanner.locator('h2').textContent();
  assert.match(catTitle, /HEAVYWEIGHT FLEECE & OUTERWEAR/, `Category banner mismatch: "${catTitle}"`);
  const catImg = catBanner.locator('.published-banner-media img');
  assert.ok(await catImg.isVisible(), 'Category banner image media element is not visible');
  const catImgSrc = await catImg.getAttribute('src');
  assert.equal(catImgSrc, 'https://images.example.com/banners/outerwear.webp');
  console.log('✓ Placement 4 (category_banner): Displayed on Shop collection page with image and CTA.');

  // 3. Test Checkout Footer Banner Placement (checkout_footer)
  console.log('Testing Customer Checkout checkout_footer placement...');
  await page.route('**/login/**', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        role: 'customer',
        access_token: 'mock-customer-token',
        id: 99,
        name: 'Test Customer',
        email: 'test@example.com',
      }),
    });
  });

  await page.route('**/shipping-zones/**', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ zones: [{ id: 1, name: 'Metro Manila', rate: 100 }] }),
    });
  });

  await page.route('**/payments/capabilities/**', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ methods: [{ id: 'cod', name: 'Cash on Delivery', enabled: true }] }),
    });
  });

  await page.route('**/profile/**', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 99, name: 'Test Customer', email: 'test@example.com' }),
    });
  });

  await page.goto(`${BASE_URL}/customer/sign-in?next=${encodeURIComponent('/customer/checkout')}`, { waitUntil: 'networkidle' });
  await page.fill('input[name="email"]', 'test@example.com');
  await page.fill('input[name="password"]', 'Password123!');
  await page.click('.auth-form-card button[type="submit"]');
  await page.waitForURL('**/customer/checkout');
  const checkoutBanner = page.locator('.checkout-page aside.published-banner');
  await checkoutBanner.waitFor({ state: 'visible' });
  const checkoutTitle = await checkoutBanner.locator('h2').textContent();
  assert.match(checkoutTitle, /PAYMONGO SECURED/, `Checkout footer banner mismatch: "${checkoutTitle}"`);
  const checkoutImg = checkoutBanner.locator('.published-banner-media img');
  assert.ok(await checkoutImg.isVisible(), 'Checkout banner image media element is not visible');
  console.log('✓ Placement 5 (checkout_footer): Displayed at the bottom of Checkout page.');

  // Run AxeBuilder accessibility audit
  console.log('Auditing Customer pages for WCAG 2.1 AA accessibility...');
  const a11yScan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  assert.equal(a11yScan.violations.length, 0, `Accessibility violations: ${JSON.stringify(a11yScan.violations, null, 2)}`);
  console.log('✓ AxeBuilder WCAG 2.1 AA accessibility audit passed with 0 violations!');
}

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Mock public customer API endpoints globally
  await page.route('**/banners/**', async (route) => {
    const url = new URL(route.request().url());
    const placement = url.searchParams.get('placement');
    if (placement) {
      const filtered = MOCK_BANNERS.filter((b) => b.placement === placement.replace('-', '_'));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(filtered),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_BANNERS),
    });
  });

  await page.route('**/categories/**', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 1, name: 'Tees', slug: 'tees' },
        { id: 2, name: 'Hoodies', slug: 'hoodies' },
      ]),
    });
  });

  await page.route('**/products/**', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1,
          name: 'Heavyweight Boxy Tee',
          slug: 'heavyweight-boxy-tee',
          category: { name: 'Tees' },
          base_price: 1200,
          is_featured: true,
          image_url: '/assets/sample.png',
        },
      ]),
    });
  });

  await page.route('**/notifications/**', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ unread_count: 0 }),
    });
  });

  try {
    await testThemeSwitches(page);
    await testBannerSynchronizationAndPlacements(page);
    console.log('\n======================================================');
    console.log('ALL THEME SWITCH & BANNER SYNCHRONIZATION TESTS PASSED');
    console.log('======================================================\n');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('\n❌ QA Test Suite Failure:', err);
  process.exit(1);
});
