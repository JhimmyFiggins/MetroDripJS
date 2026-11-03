# MetroDripJS — Bug Fix & Remediation Log

**Log Updated:** 2026-11-03  
**Auditor:** Autonomous Senior QA & Full-Stack Engineer  

---

## 1. Summary of Defects Remediated

| Bug ID | Subsystem | Defect Title | Severity | Root Cause | Fix Applied | Verification Status |
|---|---|---|---|---|---|---|
| **MD-BUG-01** | Admin & Merchant Consoles | Light Theme Warning Badge (`.pending`) WCAG AA Contrast Violation | Serious | CSS `--color-warning: #b45309` on `--color-warning-bg` yielded 4.49:1 contrast (below 4.5:1 required by WCAG AA) | Updated `--color-warning` to `#92400e` (contrast 6.35:1) in `web/css/console.css` | **Verified**: 0 Axe violations in `run-console-integration.mjs` |
| **MD-BUG-02** | Browser Test Automation | Team Page Browser Test Navigation Selector Drift | Medium | Test checked `.desktop-nav-link[href="/customer/team"]` in header, but team link was shifted to footer/drawer in navigation redesign | Updated selector in `tests/browser/run-team-page.mjs` to target `footer a[href="/customer/team"]` | **Verified**: `node tests/browser/run-team-page.mjs` PASSED |
| **MD-BUG-03** | Local Test Environment | Disposable Live Account E2E Blocked by Email OTP Requirement | Medium | Fresh database defaults `EMAIL_OTP_ENFORCED=True`, which attempts external Brevo delivery unless explicitly configured or bypassed | Configured test launcher with `EMAIL_OTP_ENFORCED=false` for synthetic disposable SQLite testing | **Verified**: `run-customer-live-account.mjs` PASSED |

---

## 2. Detailed Bug Reports & Resolutions

### MD-BUG-01: Warning Status Badge WCAG AA Color Contrast Deficiency
- **Application**: Admin Console & Merchant Console (`web/admin/`, `web/merchant/`, `web/css/console.css`)
- **Symptoms**: Automated AxeBuilder accessibility audit failed during `node tests/browser/run-console-integration.mjs` on the Admin Users page (`/admin/users.html`).
- **Error Output**:
  ```text
  Error: admin users has Axe violations:
  color-contrast (serious):
  .pending — Fix any of the following:
    Element has insufficient color contrast of 4.49 (foreground color: #b45309, background color: #f9f1eb, font size: 7.5pt (10px), font weight: normal). Expected contrast ratio of 4.5:1
  ```
- **Root Cause**:
  `web/css/console.css` defined `--color-warning: #b45309;` and `--color-warning-bg: rgba(180, 83, 9, 0.08);`. When rendered in `.status-pill.pending` against the light-theme background `#f9f1eb`, the contrast ratio was 4.49:1. While very close, it fell short of the 4.5:1 ratio mandated by WCAG 2.1 AA for regular small text.
- **Remediation**:
  In `web/css/console.css`:
  ```css
  /* Before */
  --color-warning: #b45309;
  --color-warning-bg: rgba(180, 83, 9, 0.08);

  /* After */
  --color-warning: #92400e;
  --color-warning-bg: rgba(146, 64, 14, 0.08);
  ```
  The deeper amber shade (`#92400e`) provides a 6.35:1 contrast ratio against the console background, easily exceeding WCAG 2.1 AA requirements while preserving visual hierarchy and aesthetic intent.
- **Regression Verification**:
  Executed `QA_MANAGE_SERVERS=1 node tests/browser/run-console-integration.mjs`. All 4 console pages passed Axe WCAG A/AA audits with 0 violations.

---

### MD-BUG-02: Team Page Navigation Link Selector Drift
- **Application**: Browser Test Suite (`tests/browser/run-team-page.mjs`)
- **Symptoms**: Step 7 of `run-team-page.mjs` timed out waiting for `.desktop-nav-link[href="/customer/team"]`.
- **Root Cause**:
  In earlier iterations, the customer header included a direct `<a class="desktop-nav-link" href="/customer/team">`. In the 2026-11-02 customer navigation update, `initializeCustomerNavigation()` in `web/customer/app.js` restructured the desktop navigation into dynamic `Shop` and `Discover` category dropdowns, relocating the "Our Team" link to the site footer (`.site-footer`) and mobile navigation drawer (`.site-nav`). The test script had not been updated to reflect this intentional architectural reorganization.
- **Remediation**:
  In `tests/browser/run-team-page.mjs`:
  ```javascript
  // Before
  const teamNavLink = page.locator('.desktop-nav-link[href="/customer/team"]');

  // After
  const teamNavLink = page.locator('footer a[href="/customer/team"], .desktop-nav-link[href="/customer/team"]').first();
  ```
- **Regression Verification**:
  Executed `node tests/browser/run-team-page.mjs`. The test successfully clicked the footer link, navigated to `/customer/team`, and verified heading, member cards, and theme responsiveness.

---

### MD-BUG-03: Disposable E2E Test Blocked by Email OTP Service Requirement
- **Application**: Customer Live Account Test (`tests/browser/run-customer-live-account.mjs`)
- **Symptoms**: `POST /signup/` failed with HTTP 503 Service Unavailable (`{"error":"The account was not activated because the verification email could not be sent.","code":"reset_delivery_unconfigured"}`).
- **Root Cause**:
  `metrodrip_backend/identity/views.py` enforces email OTP delivery (`otp_enforced()`) during signup unless `EMAIL_OTP_ENFORCED` is set to `False`. When running disposable end-to-end tests without live Brevo credentials, the email delivery check failed closed.
- **Remediation**:
  Documented and ensured that disposable local test servers launch with `EMAIL_OTP_ENFORCED=false` when running automated browser scripts that do not test Brevo integration (`QA_DISPOSABLE_DB=1 EMAIL_OTP_ENFORCED=false`).
- **Regression Verification**:
  Launched disposable Django server with `EMAIL_OTP_ENFORCED=false` and ran `node tests/browser/run-customer-live-account.mjs`. Signup succeeded with HTTP 201, followed by successful sign-in, profile update, and account closure.
