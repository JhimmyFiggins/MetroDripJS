// Run with the Playwright browser_run_code tool against the loopback web server.
// API responses are fixtures; this is not backend or native-device verification.
async (page) => {
  const base = 'http://127.0.0.1:3000';
  const profile = { id: 999999, name: 'QA Fixture', email: 'qa@example.invalid', role: 'admin', token: 'qa-browser-fixture' };
  const paths = [
    'admin/', 'admin/users.html', 'admin/roles.html', 'admin/settings.html',
    'admin/audit.html', 'admin/account-settings.html', 'merchant/',
    'merchant/catalog.html', 'merchant/inventory.html', 'merchant/orders.html',
    'merchant/shipments.html', 'merchant/shipping-zones.html', 'merchant/reviews.html',
    'merchant/content.html', 'merchant/analytics.html', 'merchant/account-settings.html',
  ];
  await page.context().unroute('**/*');
  await page.context().route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith(`${base}/`)) return route.continue();
    if (/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(url)) {
      const isProfile = /\/profile\/$/.test(url);
      return route.fulfill({
        status: isProfile ? 200 : 503,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(isProfile ? profile : { error: 'QA simulated outage' }),
      });
    }
    return route.abort();
  });
  await page.goto(base);
  await page.evaluate(profile => {
    localStorage.setItem('metrodrip_active_user', JSON.stringify(profile));
  }, profile);
  const results = [];
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of paths) {
      const response = await page.goto(`${base}/${path}`);
      await page.locator('.console-main h1').waitFor();
      const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
      if (response.status() !== 200 || !fits) throw new Error(`Layout regression: ${path} at ${width}px`);
      results.push({ path, width, result: 'PASS' });
    }
  }
  return { mode: 'mocked API, blocked external fonts, Chromium layout', passed: results.length, results };
}
