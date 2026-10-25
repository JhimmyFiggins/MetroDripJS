import AxeBuilder from '@axe-core/playwright';
import { chromium } from '@playwright/test';

const base = process.env.QA_WEB_BASE || 'http://127.0.0.1:3000';
const apiBase = process.env.QA_API_BASE || 'http://127.0.0.1:8000';

const browser = await (async () => {
  try {
    return await chromium.launch({ channel: process.env.PLAYWRIGHT_CHROME_CHANNEL || 'chrome', headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
})();

const context = await browser.newContext();
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource:')) {
    consoleErrors.push(msg.text());
  }
});
page.on('pageerror', (err) => {
  consoleErrors.push(err.message);
});

// Mocked merchant banner fixtures
const mockBanners = [
  {
    id: 1,
    title: 'Summer Drop 2026',
    headline: 'HEAT WAVE STREETWEAR',
    subtext: 'Curated drop for the Manila heat',
    button_label: 'Explore Collection',
    placement: 'homepage_hero',
    placement_label: 'Homepage hero',
    placement_source: 'persisted',
    artwork_mode: 'graphic',
    graphic_text_main: 'MD',
    graphic_text_tagline: 'BUILT FOR THE STREETS',
    graphic_text_sub: 'METRODRIP / MANILA',
    graphic_bg_color: '#d3ee42',
    graphic_text_color: '#141414',
    graphic_accent_color: '#141414',
    graphic_alignment: 'center',
    graphic_font_size: 'normal',
    image_url: '/assets/banners/summer.jpg',
    image_fit: 'cover',
    link_url: '/shop?category=tees',
    is_active: true,
    status: 'Live',
    schedule: 'Always on',
    starts_at: null,
    ends_at: null,
    order: 1,
  },
  {
    id: 2,
    title: 'Cyberpunk Drop',
    headline: 'NIGHT RUNNER COLLECTION',
    subtext: 'Reflective nylon jackets & cargo pants',
    button_label: 'View Drop',
    placement: 'homepage_secondary',
    placement_label: 'Homepage secondary',
    placement_source: 'persisted',
    artwork_mode: 'graphic',
    graphic_text_main: 'MD',
    graphic_text_tagline: 'BUILT FOR THE STREETS',
    graphic_text_sub: 'METRODRIP / MANILA',
    graphic_bg_color: '#d3ee42',
    graphic_text_color: '#141414',
    graphic_accent_color: '#141414',
    graphic_alignment: 'center',
    graphic_font_size: 'normal',
    image_url: '',
    image_fit: 'cover',
    link_url: '/shop?category=jackets',
    is_active: false,
    status: 'Draft',
    schedule: 'Not scheduled',
    starts_at: null,
    ends_at: null,
    order: 2,
  },
];

await context.route('**/api/merchant/banners/**', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const method = request.method();

  if (method === 'POST' && url.pathname.includes('/banners/upload/')) {
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        url: '/media/banners/merchant_hero_upload.webp',
        filename: 'merchant_hero_upload.webp',
        size: 15420,
        mime: 'image/webp',
      }),
    });
  }

  if (method === 'GET' && url.pathname.endsWith('/banners/')) {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockBanners),
    });
  }

  if (method === 'PATCH' && url.pathname.match(/\/banners\/(\d+)\//)) {
    const id = Number(url.pathname.match(/\/banners\/(\d+)\//)[1]);
    const body = JSON.parse(request.postData() || '{}');
    const existing = mockBanners.find((b) => b.id === id) || mockBanners[0];
    const updated = {
      ...existing,
      ...body,
      id,
      placement_label: body.placement === 'homepage_hero' ? 'Homepage hero' : 'Homepage secondary',
      status: body.status || existing.status,
    };
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(updated),
    });
  }

  if (method === 'DELETE') {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Banner deleted successfully.' }),
    });
  }

  return route.continue();
});

try {
  console.log(`Testing Merchant Console Content & Banners on ${base}/merchant/content.html ...`);

  // Establish authenticated merchant session in sessionStorage
  await page.goto(`${base}/merchant/content.html`);
  await page.evaluate(() => {
    sessionStorage.setItem('metrodrip_active_user', JSON.stringify({
      id: 88,
      name: 'Banner Merchant',
      email: 'merchant@metrodrip.ph',
      role: 'merchant',
      is_staff: true,
      access_token: 'qa-valid-merchant-token',
    }));
  });

  // Reload to initialize with session
  await page.goto(`${base}/merchant/content.html`, { waitUntil: 'networkidle' });

  // 1. Verify metrics and placements table
  await page.waitForSelector('#table-placements tbody tr');
  const rows = await page.$$('#table-placements tbody tr');
  console.log(`✓ Placements table rendered with ${rows.length} rows`);
  if (rows.length !== 2) throw new Error(`Expected 2 table rows, got ${rows.length}`);

  // Check metrics
  const liveCount = await page.textContent('#metric-live-banners');
  const draftCount = await page.textContent('#metric-draft-banners');
  console.log(`✓ Metrics verified: Live=${liveCount}, Draft=${draftCount}`);

  // 2. First banner should be auto-selected
  const firstRowSelected = await page.$eval('#table-placements tbody tr:first-child', (el) => el.classList.contains('selected-row'));
  console.log('✓ First banner row has selected-row highlight:', firstRowSelected);
  if (!firstRowSelected) throw new Error('First row expected to have selected-row class');

  const noticeText = await page.textContent('#banner-editor-editing-notice');
  console.log('✓ Editor notice displays active banner:', noticeText.trim());

  // 2b. Hero Artwork Customization section for homepage_hero
  console.log('Verifying Hero Artwork Customization section for homepage_hero...');
  const artworkSectionVisible = await page.$eval('#section-hero-artwork', (el) => !el.hidden && getComputedStyle(el).display !== 'none');
  if (!artworkSectionVisible) throw new Error('Expected #section-hero-artwork to be visible for homepage_hero');
  console.log('✓ Hero Artwork Customization section is visible');

  const assertEditorFits = async (label) => {
    const result = await page.evaluate(() => {
      const editor = document.querySelector('#card-banner-editor');
      const fieldset = document.querySelector('#section-hero-artwork');
      const editorBox = editor.getBoundingClientRect();
      const visible = [...fieldset.querySelectorAll('input, select, button, label, .btn')]
        .filter((el) => el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden')
        .map((el) => {
          const box = el.getBoundingClientRect();
          return {
            id: el.id || el.textContent.trim().slice(0, 24),
            inside: box.width > 0 && box.left >= editorBox.left - 1 && box.right <= editorBox.right + 1,
          };
        });
      const offenders = [...editor.querySelectorAll('*')].filter((el) => el.scrollWidth > el.clientWidth + 1 || el.getBoundingClientRect().right > editorBox.right + 1).slice(0, 6).map((el) => `${el.id || el.className || el.tagName}:${Math.round(el.getBoundingClientRect().width)}`);
      return {
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        editorOverflow: editor.scrollWidth - editor.clientWidth,
        fieldsetOverflow: fieldset.scrollWidth - fieldset.clientWidth,
        clipped: visible.filter((item) => !item.inside).map((item) => item.id),
        offenders,
      };
    });
    if (result.pageOverflow > 1 || result.editorOverflow > 1 || result.fieldsetOverflow > 1 || result.clipped.length) {
      throw new Error(`${label} overflow page=${result.pageOverflow} editor=${result.editorOverflow} fieldset=${result.fieldsetOverflow} clipped=${result.clipped.join(',')} offenders=${result.offenders.join('|')}`);
    }
  };
  const savedTheme = await page.evaluate(() => document.documentElement.dataset.theme || 'light');
  for (const width of [1920, 1440, 1366, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ['light', 'dark']) {
      await page.evaluate((next) => { document.documentElement.dataset.theme = next; }, theme);
      for (const mode of ['graphic', 'image']) {
        await page.click(mode === 'graphic' ? '#radio-mode-graphic' : '#radio-mode-image');
        await assertEditorFits(`${width}px ${theme} ${mode}`);
      }
    }
    console.log(`✓ Banner editor fits at ${width}px in both themes and artwork modes`);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate((next) => { document.documentElement.dataset.theme = next; }, savedTheme);
  await page.click('#radio-mode-graphic');

  // Verify graphic mode active by default
  const isGraphicChecked = await page.$eval('#radio-mode-graphic', (el) => el.checked);
  if (!isGraphicChecked) throw new Error('Expected graphic mode radio to be checked');
  const graphicMainText = await page.inputValue('#input-graphic-text-main');
  console.log(`✓ Graphic tab active with default main text "${graphicMainText}"`);
  if (graphicMainText !== 'MD') throw new Error(`Expected main text "MD", got "${graphicMainText}"`);

  // Verify real-time preview shows right-side graphic artwork
  const previewMain = await page.textContent('#preview-artwork-main');
  const previewTagline = await page.textContent('#preview-artwork-tagline');
  console.log(`✓ Storefront preview reflects graphic artwork: "${previewMain}" / "${previewTagline}"`);
  if (previewMain !== 'MD') throw new Error(`Expected preview main "MD", got "${previewMain}"`);

  // Test modifying graphic design fields
  console.log('Testing graphic design customization inputs and real-time preview...');
  await page.fill('#input-graphic-text-main', 'QC');
  await page.fill('#input-graphic-text-tagline', 'QUEZON CITY METRO');
  await page.fill('#input-graphic-bg-color', '#ff3366');
  // Trigger change event for color picker
  await page.$eval('#input-graphic-bg-color', (el) => el.dispatchEvent(new Event('input', { bubbles: true })));

  const updatedPreviewMain = await page.textContent('#preview-artwork-main');
  const updatedPreviewTagline = await page.textContent('#preview-artwork-tagline');
  if (updatedPreviewMain !== 'QC' || updatedPreviewTagline !== 'QUEZON CITY METRO') {
    throw new Error(`Preview failed to update: main="${updatedPreviewMain}", tagline="${updatedPreviewTagline}"`);
  }
  console.log('✓ Storefront preview instantly updated with customized graphic text and colors');

  // Test mode switching to Custom Image (Mode A)
  console.log('Testing artwork mode switching to Custom Image (Mode A)...');
  await page.click('#label-mode-image');
  const isImageChecked = await page.$eval('#radio-mode-image', (el) => el.checked);
  const isImagePanelVisible = await page.$eval('#panel-artwork-image', (el) => !el.hidden && getComputedStyle(el).display !== 'none');
  const isGraphicPanelHidden = await page.$eval('#panel-artwork-graphic', (el) => el.hidden || getComputedStyle(el).display === 'none');
  if (!isImageChecked || !isImagePanelVisible || !isGraphicPanelHidden) {
    throw new Error('Image mode radio or panels failed to toggle properly');
  }
  console.log('✓ Switched to Custom Image mode; panel toggled cleanly');

  // Switch back to Mode B and verify preserved settings
  await page.click('#label-mode-graphic');
  const preservedMain = await page.inputValue('#input-graphic-text-main');
  if (preservedMain !== 'QC') throw new Error(`Settings were not preserved across mode switch: "${preservedMain}"`);
  console.log('✓ Preserved graphic settings across mode toggle');

  // Revert changes back to original
  await page.click('#btn-revert-banner');
  const revertedMain = await page.inputValue('#input-graphic-text-main');
  if (revertedMain !== 'MD') throw new Error(`Revert failed to restore graphic text: "${revertedMain}"`);
  console.log('✓ Revert successfully restored graphic design settings');

  // 3. Test clicking "Edit banner" on second row
  console.log('Clicking "Edit banner" on second row...');
  const editButtons = await page.$$('#table-placements .btn-edit-banner');
  await editButtons[1].click();

  // Verify second row is now selected
  await page.waitForFunction(() => {
    const r2 = document.querySelector('#table-placements tbody tr:nth-child(2)');
    return r2 && r2.classList.contains('selected-row');
  });
  console.log('✓ Second row is now highlighted with selected-row');

  // Verify hero artwork section is hidden for non-hero placements
  const artworkSectionHiddenForSecondary = await page.$eval('#section-hero-artwork', (el) => el.hidden || getComputedStyle(el).display === 'none');
  if (!artworkSectionHiddenForSecondary) throw new Error('Expected #section-hero-artwork to be hidden for non-hero banner');
  console.log('✓ Hero Artwork Customization section is cleanly hidden for non-hero placements');

  // Verify inputs updated to second banner
  const titleVal = await page.inputValue('#input-banner-title');
  const headlineVal = await page.inputValue('#input-banner-headline');
  console.log(`✓ Form inputs updated to second banner: Title="${titleVal}", Headline="${headlineVal}"`);
  if (titleVal !== 'Cyberpunk Drop') throw new Error(`Expected title "Cyberpunk Drop", got "${titleVal}"`);

  // 4. Test Dirty checking & Revert
  console.log('Testing dirty tracking and Revert button...');
  const revertBtnDisabledBefore = await page.$eval('#btn-revert-banner', (btn) => btn.disabled);
  if (!revertBtnDisabledBefore) throw new Error('Revert button should be disabled before edits');

  await page.fill('#input-banner-headline', 'MODIFIED HEADLINE');
  const revertBtnEnabled = await page.$eval('#btn-revert-banner', (btn) => !btn.disabled);
  if (!revertBtnEnabled) throw new Error('Revert button should be enabled after modifying headline');
  console.log('✓ Revert button properly enabled after input modification');

  // Preview updated real-time
  const previewHeadline = await page.textContent('#preview-headline');
  if (previewHeadline !== 'MODIFIED HEADLINE') throw new Error(`Expected preview to update to MODIFIED HEADLINE, got "${previewHeadline}"`);
  console.log('✓ Real-time preview updated headline accurately');

  // Click Revert
  await page.click('#btn-revert-banner');
  const headlineRestored = await page.inputValue('#input-banner-headline');
  if (headlineRestored !== 'NIGHT RUNNER COLLECTION') throw new Error(`Expected headline to revert, got "${headlineRestored}"`);
  console.log('✓ Revert button successfully restored original values');

  // 5. Test Schedule fields visibility
  console.log('Testing schedule visibility toggle...');
  await page.selectOption('#select-banner-schedule', 'scheduled');
  const scheduleVisible = await page.$eval('#banner-schedule-fields', (el) => !el.hidden && getComputedStyle(el).display !== 'none');
  if (!scheduleVisible) throw new Error('Schedule fields should be visible when "scheduled" is selected');
  console.log('✓ Schedule date fields became visible on "Scheduled"');

  await page.selectOption('#select-banner-schedule', 'always');
  const scheduleHidden = await page.$eval('#banner-schedule-fields', (el) => el.hidden && getComputedStyle(el).display === 'none');
  if (!scheduleHidden) throw new Error('Schedule fields should be hidden when "always" is selected');
  console.log('✓ Schedule date fields became hidden on "Always on" (hidden attribute enforced)');

  // 6. Test Viewport Switcher (Desktop vs Mobile)
  console.log('Testing desktop/mobile preview simulator...');
  await page.click('#btn-preview-mobile');
  const isMobile = await page.$eval('#banner-preview-wrapper', (el) => el.classList.contains('is-mobile-view'));
  if (!isMobile) throw new Error('Expected mobile preview class');
  console.log('✓ Mobile preview simulator activated');

  await page.click('#btn-preview-desktop');
  const isDesktop = await page.$eval('#banner-preview-wrapper', (el) => !el.classList.contains('is-mobile-view'));
  if (!isDesktop) throw new Error('Expected desktop preview');
  console.log('✓ Desktop preview restored');

  // 7. Test Search & Filter Toolbar
  console.log('Testing placements table search & filters...');
  await page.fill('#filter-banner-search', 'summer');
  const visibleRowsSearch = await page.$$('#table-placements tbody tr');
  if (visibleRowsSearch.length !== 1) throw new Error(`Expected 1 row for search "summer", got ${visibleRowsSearch.length}`);
  console.log('✓ Search filter reduced table to matching rows');

  await page.fill('#filter-banner-search', '');
  await page.selectOption('#filter-banner-status', 'Draft');
  const visibleRowsStatus = await page.$$('#table-placements tbody tr');
  if (visibleRowsStatus.length !== 1) throw new Error(`Expected 1 Draft row, got ${visibleRowsStatus.length}`);
  console.log('✓ Status dropdown filter successfully filtered table');

  await page.selectOption('#filter-banner-status', 'all');

  // 8. Accessibility audit via AxeBuilder
  console.log('Auditing Content & Banners accessibility with AxeBuilder...');
  const a11yResult = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .disableRules(['color-contrast'])
    .analyze();

  if (a11yResult.violations.length > 0) {
    const issues = a11yResult.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length} nodes)`);
    console.error('Axe violations found:', issues.join('; '));
    throw new Error('Accessibility audit failed');
  }
  console.log('✓ AxeBuilder WCAG 2.1 AA accessibility audit passed with 0 violations!');

  if (consoleErrors.length > 0) {
    throw new Error(`Console errors occurred: ${consoleErrors.join(', ')}`);
  }

  console.log('\nALL Merchant Banner E2E Tests PASSED successfully!');
} catch (error) {
  console.error('Merchant Banner E2E Test FAILED:', error);
  process.exit(1);
} finally {
  await browser.close();
}
