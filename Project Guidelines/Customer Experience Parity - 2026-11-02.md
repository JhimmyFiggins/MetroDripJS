# Customer experience parity audit — 2026-11-02

Scope: active Django API in `metrodrip_backend/`, customer website in `web/customer/`, and Expo app in `mobile/`. Status here is a source audit before changes, not a runtime pass. The retained `services/` tree is historical. Unrelated working-tree favicon and dev-server edits are excluded.

| Capability | Website source | Mobile source | API/source of truth | Initial finding |
| --- | --- | --- | --- | --- |
| Home and discovery | `web/customer/app.js` | `mobile/Home/Home.jsx` | catalog/banner endpoints | Partial: different presentation; runtime parity unverified |
| Products and details | `web/customer/app.js` | `mobile/Products/Shop.jsx` and `ProductDetails.jsx` | `catalog/views.py` | Implemented; end-to-end unverified |
| Active categories | `web/customer/app.js` shop/home; static desktop nav | `mobile/Products/Shop.jsx` | `GET /categories/` | Partial: website nav static |
| Search and filters | `web/customer/app.js` | `mobile/Products/Shop.jsx` | `GET /products/` | Implemented; parity unverified |
| Variants and availability | `web/customer/app.js` | `mobile/Products/ProductDetails.jsx` | catalog variant/stock APIs | Partial per current repository audit; native unverified |
| Cart | `web/customer/app.js` | `mobile/Cart/CartScreen.jsx` | client state and checkout API | Implemented; cross-device cart sync not present |
| Checkout/payment | `web/customer/app.js` | `mobile/Checkout/src/screens/` | `orders/checkout.py` | Implemented; live provider/native return unverified |
| Orders and tracking | `web/customer/app.js` | `mobile/Orders/` | orders and fulfillment APIs | Implemented; end-to-end unverified |
| Wishlist | `web/customer/app.js` | `mobile/Wishlist/Wishlist.jsx` | `identity/views.py` | Shared API; cross-device refresh unverified |
| Reviews | `web/customer/app.js` | product reviews and account placeholder | `orders/models.py`, catalog reviews API | Partial: account review history unavailable in mobile |
| Notifications | `web/customer/app.js` | `mobile/Notifications/NotificationsScreen.jsx` | fulfillment API | Shared API; native push unverified |
| Profile and address | `web/customer/app.js` | `mobile/Account_Management/ProfileManagement.jsx` | `GET/PUT /profile/` | Partial: weak validation and duplicated mobile address control |
| Account settings | flat actions in `web/customer/app.js` | `mobile/Account_Management/Account.jsx` | identity API | Partial: no structured closure action |
| Account closure | missing | missing | missing | Missing; retention policy also missing |
| Authentication/sign out | `web/customer/app.js` | `mobile/context/AuthContext.jsx` | identity token API | Implemented; native server logout unverified |
| Team/help | footer and routes | account/Team screen | static content | Present; primary website nav is crowded |

The 2026-10-19 comprehensive audit and `Database Structure.md` remain the authority for release blockers. This matrix will be updated with executed checks and residual gaps after implementation.

## Final development report — 2026-11-02

### A. Executive summary

Implemented dynamic website Shop navigation, a responsive mobile-browser drawer/search, a structured website account page, customer-specific review history, stronger profile validation, and a password-confirmed account closure shared by the website and Expo client. A disposable real-browser COD journey also exposed and corrected misleading guest-checkout and fixed-shipping copy. This is a local implementation, not a native-device or production acceptance claim.

### B. Initial findings

The desktop navbar used static links; Team and Help occupied primary navigation even though footer links existed. Website account actions were scattered. The mobile profile repeated the saved-address control and silently failed load/save operations. Expo Home treated category ID `1` as “All,” masking a real category, and native category request failures had no recovery UI. Both account pages lacked closure. Both account review sections were placeholders. The active category API already filtered active categories; `src/services/categoryService.js` is an inactive mock and was not selected as a source of truth. The active backend has no approved account, order, payment, shipping, audit, or backup retention schedule.

### C. Implementation and data handling

The website now constructs Shop and Discover groups from `GET /categories/`, New Arrivals, and a new backend `featured=1` filter. Category links use the backend slug, refresh on menu opening, and expose loading/empty/retry states. The Expo Shop has the same featured filter. Expo Home uses an explicit All Products selection and compares real category IDs; Home and Shop display category loading, empty, error, and retry states. The homepage category pills remain as quick shortcuts because they serve a different, visible entry point. Team and Help remain in the footer. The navigation is constructed in `app.js` to avoid overwriting the concurrent favicon edit to `index.html`.

`POST /account/close/` authenticates the bearer token, limits password attempts to five per hour, locks the customer row, verifies the current password and explicit phrase, refuses staff and open-order closure, disables sign-in, anonymizes the profile, and deletes wishlist, reviews, notifications, device tokens, reset/OTP credentials and access tokens in one transaction. Historical orders, payment references, shipping address snapshots, and audit records remain. The response explicitly says erasure is incomplete. Both clients disclose this and clear local account state on success. The owner must approve the retention and erasure policy, including backups, before any claim of complete erasure. The [National Privacy Commission's erasure guidance](https://privacy.gov.ph/right-to-erasure-or-blocking/) and [BIR accounting-record regulation](https://bir-cdn.bir.gov.ph/BIR/pdf/RR%205-2014.pdf) are references for that owner review, not a project-specific retention decision.

The cart now labels its price as an estimate and defers shipping to checkout. Its previous fixed NCR fee could misstate the amount for another delivery zone, and its guest-checkout statement contradicted the sign-in requirement. The checkout action now covers both COD placement and online payment continuation; Django still computes the final total. The real cart Axe scan also found a skipped product heading level, corrected from `h4` to `h2`.

### D. Changed files

| Area | Files | Purpose |
| --- | --- | --- |
| Backend | `metrodrip_backend/identity/views.py`, `urls.py`, `tests_account_closure.py`, `metrodrip_backend/metrodrip_backend/settings.py` | Profile validation/date, owned review history, throttled closure and regression tests |
| Catalog | `metrodrip_backend/catalog/views.py`, `tests_featured.py`, `src/services/productService.js`, `mobile/Home/Home.jsx`, `mobile/Products/Shop.jsx`, `ProductCards.jsx` | Shared featured filter, real category ID matching and native request states |
| Website | `web/customer/app.js`, `customer.css`, `web/dev_server.py` | Runtime navigation, account dashboard, closure and review history; proxy the new account APIs |
| Expo | `mobile/Account_Management/Account.jsx`, `ProfileManagement.jsx`, `mobile/context/AuthContext.jsx`, `src/services/authService.js` | Native account sections, closure, reviews, profile states and token revocation on sign-out |
| Browser | `tests/browser/run-customer-integration.mjs`, `run-customer-live-account.mjs`, `run-customer-live-checkout.mjs`, `seed_disposable_checkout.py`, `run-customer-qa.mjs` | Responsive nav, keyboard, mocked and real disposable-account/COD journeys; portable local smoke paths |
| Record | this file | Initial and final parity evidence |

The concurrent favicon/dev-server edits and other staff-console changes in the working tree are outside this task and were not incorporated into this report.

### E. Final parity matrix

`PASS` requires an executed check of the stated behavior. `PARTIAL` indicates implemented pieces with a material gap. `UNVERIFIED` means source exists but its end-to-end workflow was not observed.

| Capability | Website | Expo/mobile | Backend | Result and limit |
| --- | --- | --- | --- | --- |
| Home/discovery | `web/customer/app.js` | `mobile/Home/Home.jsx`, `mobile/Products/Shop.jsx` | catalog/banner APIs, `featured=1` | PARTIAL — public browser smoke and featured filter tests passed; native content flow unverified |
| Product browse/categories | `app.js` | `mobile/Home/Home.jsx`, `mobile/Products/Shop.jsx`, `ProductCards.jsx` | `catalog/views.py` | PARTIAL — browser category count/navigation passed at 390/768/1280 px; native category fix unverified on device |
| Search/filter/details/variants | `app.js` | `mobile/Products/` | catalog API | PARTIAL — real browser product, variant and stock selection passed; native and other filters unverified |
| Cart/checkout/payment | `app.js` | `mobile/Cart/`, `mobile/Checkout/` | orders checkout/payment API | PARTIAL — real browser COD order and authoritative total passed; PayMongo provider and native return unverified |
| Orders/tracking | `app.js` | `mobile/Orders/` | orders/fulfillment API | PARTIAL — real browser COD order detail passed; fulfillment tracking and native journey unverified |
| Wishlist | `app.js` | `mobile/Wishlist/` | identity wishlist API | UNVERIFIED cross-device sync; both clients call shared endpoint |
| Reviews | `app.js` | `mobile/Account_Management/Account.jsx`, product reviews | `/reviews/mine/`, catalog review API | PARTIAL — owned history endpoint and real browser empty-history request passed; native rendering unverified |
| Notifications | `app.js` | `mobile/Notifications/` | fulfillment API | UNVERIFIED native push and cross-device read state |
| Profile | `app.js` | `mobile/Account_Management/ProfileManagement.jsx` | `/profile/` | PARTIAL — backend validation and real browser update passed; native save unverified |
| Account settings/closure | `app.js` | `mobile/Account_Management/Account.jsx` | `/account/close/` | PARTIAL — real browser cancellation/closure and backend revocation passed; native interaction and retention policy unverified |
| Authentication/sign-out | `app.js` | `mobile/context/AuthContext.jsx` | identity token API | PARTIAL — real browser sign-in and closed-token rejection passed; live native/session behavior unverified |
| Team/help/theme | footer/routes and `app.js` | Account/Team screens and theme | static/browser state | PARTIAL — public browser contrast passed; native appearance unverified |

### F. Executed checks

| Check | Result |
| --- | --- |
| `python manage.py test` on disposable SQLite | PASS: 246 tests, 6 skipped, 0 failures after all implementation edits |
| `python manage.py test` with an isolated temporary media root | FAIL: 2 existing media-serving assertions expected JPG fixtures and fallback files at the default media path; rerun with the repository's normal media configuration passed |
| `python manage.py test identity.tests_account_closure identity.tests_mobile_backend` | PASS: 17 tests, 0 failures, 0 skipped |
| `python manage.py test identity.tests_account_closure` after adding failure/ownership cases | PASS: 11 tests, 0 failures, 0 skipped |
| `python manage.py test catalog.tests_featured identity.tests_account_closure` | PASS: 12 tests, 0 failures, 0 skipped |
| `python manage.py test identity.tests_account_closure catalog.tests_featured` after throttle coverage | PASS: 13 tests, 0 failures, 0 skipped |
| `npm run test:client` | PASS: 250 tests, 0 failures, 0 skipped |
| `npm run test:customer` with disposable local Django through `127.0.0.1:3011` | PASS: 5 public-page Axe scans, 3 viewport navigation checks including live featured filter, 3 mocked account checks; checkout/provider not included |
| `QA_DISPOSABLE_DB=1 node tests/browser/run-customer-live-account.mjs` with disposable SQLite and local proxy | PASS: actual browser sign-in, profile save, owned reviews, closure cancellation, closure, old-token rejection and blocked re-login; account Axe scan 0 violations; no real customer data |
| `QA_DISPOSABLE_DB=1 python tests/browser/seed_disposable_checkout.py` then `node tests/browser/run-customer-live-checkout.mjs` with disposable SQLite and local proxy | PASS: actual browser product/variant/stock selection, cart estimate, COD checkout, order detail, and server total of PHP 185 (PHP 100 item + PHP 85 shipping); cart and checkout Axe scans 0 violations; no live payment |
| `node tests/browser/run-customer-qa.mjs` | PASS: 5-width local storefront smoke after fixing Windows path handling in its test server |
| `node tests/browser/run-customer-auth-qa.mjs` with disposable local Django proxy | PASS: 8 viewport overflow checks, light/dark Axe scans with 0 violations, sign-in layout and auth navigation |
| `npx tsc --noEmit`, JavaScript syntax, Babel JSX parse | PASS: no diagnostics |
| `python manage.py makemigrations --check` | PASS: no model drift |
| `python manage.py check --deploy` | 5 existing configuration warnings (HSTS, HTTPS redirect, secure cookies, DEBUG) |
| `npm ci --ignore-scripts --no-audit --no-fund` followed by `npx expo export --platform all` | PASS: restored missing installed `expo-notifications` from lockfile; web, iOS and Android bundles exported to temporary directory; this does not verify native runtime |

### G–I. Security, outstanding work, and completion status

Closure API and the website closure journey are **implemented and verified on disposable SQLite**, with no real customer data changed. The first live browser trial exposed missing account API paths in `web/dev_server.py`; those paths were added and the real browser journey passed. Customer closure on native UI is **implemented but unverified on a device**. A `medium_phone` Android emulator appeared in `adb` only as `offline` and exited on cold boot, so native runtime acceptance could not run; Expo's successful Android/iOS export is bundle evidence only. Full erasure is **not implemented** while retention of order, payment, shipping, audit and backup data is undecided. PostgreSQL concurrency, PayMongo sandbox, live deployment, and cross-device sync remain **UNVERIFIED**. The current repository release and academic-demo HOLD remains in force. The owner needs to approve a data lifecycle policy and provide a disposable native/provider environment for the remaining acceptance checks.

The Django test suite created small image fixtures under `metrodrip_backend/media/products/2026/11/`. Automatic approval review rejected both recursive and individually validated file cleanup, so these untracked fixtures remain. Automatic approval review also rejected cleanup of the disposable SQLite database, temporary Expo export, and isolated media folder under the system Temp directory; the local test servers were stopped. The tracked generated `.pyc` changes were restored. The separate concurrent favicon and console edits were preserved.
