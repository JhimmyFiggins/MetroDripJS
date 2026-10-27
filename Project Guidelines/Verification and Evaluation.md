# Verification and Evaluation

**Status:** ACADEMIC DEMO HOLD and PRODUCTION HOLD; 2026-10-27 team/logo checks pass, but hosted image recovery, PayMongo activation, and device APK checks remain open

**Current authority:** [Comprehensive Repository Audit and Academic Demo Plan — 2026-10-19](Comprehensive%20Repository%20Audit%20and%20Academic%20Demo%20Plan%20-%202026-10-19.md), this matrix, and the dated prior QA reports retained below

**Evidence rule:** An executed unit/mock/SQLite/static check is labeled separately from PostgreSQL, native-device, PayMongo, and Render evidence.

## Team content and logo visibility — 2026-10-27

The shared Our Team dataset now describes role responsibilities against the active Django/DRF modular monolith, HTML/CSS/JavaScript storefront, Expo/React Native client, SQLite/PostgreSQL path, Hosted Checkout integration, and current QA/build tooling. It no longer attributes unverified individual authorship or presents HTMX, Alpine.js, MySQL 8, completed CI/CD, or the historical five-service topology as current team work.

Customer web logos now render explicit light/dark asset pairs selected by the resolved `data-theme`; this replaces CSS `content: url(...)` source replacement. Theme resolution occurs in the document head, a saved customer choice wins over the operating-system preference, and operating-system changes apply when no choice is saved. Staff console/login branding already uses paired emblem backgrounds. Mobile logo imports are centralized in `mobile/components/BrandLogo.jsx`, and each consumer selects artwork for its actual backing surface; the active app now provides registration theme context and permits automatic native appearance changes.

| Check | Result |
|---|---|
| `npm run test:client` | **PASS**, 243/243. Includes exact five-member content synchronization, obsolete-stack exclusions, asset-pair coverage, web theme contracts, staff branding, centralized mobile consumers, Expo theme configuration, and favicon coverage. |
| `npx tsc --noEmit` | **PASS**, no diagnostics. |
| `node tests/browser/run-team-page.mjs` | **PASS** in headless Chrome. Five cards and navigation passed; Axe reported 0 WCAG A/AA violations; 320, 390, 768, and 1280 px widths had no overflow; light/dark visibility, immediate switching, saved-choice reload, system-theme changes, and loaded image dimensions passed. |
| Browser screenshots | **PASS by visual inspection** for `/tmp/metrodrip-logo-qa/team-light-1280.png` and `/tmp/metrodrip-logo-qa/team-dark-1280.png`. Header emblems and complete footer emblem/wordmarks remained visible. These are local temporary artifacts, not committed release evidence. |
| `npm run test:browser` | **PASS**, 64 mocked console layouts plus keyboard/state checks. |
| `npm run test:customer` | **PASS**, 5 public customer-page Axe/contrast scans against owned local web and Django processes. Authentication, mutations, checkout, and provider behavior are outside this smoke test. |
| `npx expo export --platform all --output-dir <temporary>` | **PASS**, exit 0; Android, iOS, and web bundles include all six mobile logo variants. This is bundle evidence, not device rendering. |
| `npx expo-doctor`; `npx expo install --check`; resolved public Expo config | **PASS**, 18/18 Doctor checks, dependencies current, and `userInterfaceStyle: automatic`. |
| Physical Android/iOS appearance switching and high-density rendering | **UNVERIFIED**; no simulator/device run was performed for this change. |

The local Django startup used for the customer smoke reported two unapplied `identity` migrations. They were not applied because this task does not change the database; the smoke pages still passed. Release status remains **HOLD** and no deployment, provider, database, or payment configuration was changed.

## Seven-issue QA evidence — 2026-10-25

Uncommitted worktree on `master` at `fe6d40e`. These are local/disposable results, not a deployed-SHA, PayMongo sandbox, or device proof.

| Check | Result |
|---|---|
| `npm run test:client` | PASS after the order-history syntax fix. |
| `npx tsc --noEmit` | PASS after closing the order-history confirmation expression. |
| `python manage.py test` on temporary SQLite | PASS, 173 tests, 6 PostgreSQL-only skips. |
| Same suite on disposable PostgreSQL 16 at `127.0.0.1:5433` | PASS, 173 tests, 0 skips. Container `metrodrip-qa-20261025` was removed after the run. |
| `python manage.py check` and `makemigrations --check --dry-run` | PASS, no drift. |
| `npm run test:browser` | PASS, 64 mocked layouts plus cancellation/state flows. |
| `npm run test:customer` | PASS, 5 public-page contrast scans, only after Django was listening on `127.0.0.1:8000`. The first run failed with six proxy 502s because that backend was down. This is not checkout or cancellation coverage. |
| `npm run test:merchant:catalog` | PASS, including one Axe WCAG 2.1 AA scan. |
| Expo Doctor, dependency check, public config, all-platform export | PASS. Doctor 18/18. Export wrote Android, iOS, and web bundles under `/tmp/kilo/metrodrip-export-20261025`. Public API was `https://metrodripjs-q4ik.onrender.com`; Android cleartext was false. |
| `npm run eas:config:android:preview` | PASS. Internal APK profile with the public HTTPS API variable. No APK was built or installed. |
| `adb devices` | No connected device. Native Back, upgrade-in-place, and release image loading are UNVERIFIED. |
| Read-only production probes | `/health/` returned ok. Capabilities were COD-only with `provider_ready: true` and an empty hosted allowlist. All 19 catalog image URLs returned HTTP 404. |
| `npm audit --omit=dev` | 12 findings: 7 high, 5 moderate. No forced Expo downgrade was applied. |
| Render schema validation | NOT RUN. `check-jsonschema` was not installed. |

## Banner and settings verification — 2026-10-24

A disposable Django process published a live `homepage_hero` banner and Playwright opened `/customer/`. The heading was `Cyber Monday Sale`, and the default Urban Style hero was absent. PostgreSQL concurrency tests passed 3/3 on a socket-only cluster. PayMongo sandbox, hosted-account rotation, and a device mobile launch were not run.

## Remaining-task evidence — 2026-10-23

| Check | Result |
|---|---|
| `node --test tests/client/customerWeb.test.mjs` | PASS, 17/17 |
| Targeted Django seed, warehouse, recovery, and customer contracts | PASS, 18/18 on Django 5.2.16 and disposable SQLite |
| Full `python manage.py test` | 116 passed, 1 error, 4 skipped. The error was an empty return URL overriding the HTTPS default. Blank return URLs now fall back to the default. The affected Maya mapping test was rerun and passed. The other 115 passing tests were not all rerun after that one-line settings change. |
| `orders.tests_postgres_concurrency` on disposable PostgreSQL 16.15 | PASS, 3/3. Socket-only owned cluster. Throttle concurrency test was not repeated there. |
| `node tests/browser/run-customer-qa.mjs` | PASS after the 320px header rule was ordered after the 600px rule. This is a local smoke check, not axe, screen-reader, or Figma coverage. |
| PayMongo sandbox, live Figma, hosted account rotation | NOT RUN. No provider, design-connector, or hosted-account authorization was available. |

## Customer QA evidence — 2026-10-23

Local QA on branch `fix/customer-qa-20261022` from `84a6bafa`. Fixes cover checkout terminal replay, owned checkout recovery lookup, single-warehouse purchasable stock, fresh-database fixed-login seeding, browser session isolation, and truthful customer copy. Previously seeded accounts are not rotated. Browser viewport/axe execution, full Django suite, PostgreSQL, and PayMongo sandbox were not rerun after the last UI edits.

| Check | Result |
|---|---|
| `node --test tests/client/customerWeb.test.mjs` | PASS, 17/17 |
| `node --check` on customer `app.js`, `api.js`, `contracts.js` | PASS |
| Focused Django: recovery, payments, customer contracts, seed migration, warehouse stock | 48/49 then warehouse assertion corrected; warehouse stock rerun PASS 2/2 |
| Full `python manage.py test` after the combined QA diff | NOT RUN |
| Browser smoke/axe at listed viewports | NOT RUN in this session |
| PayMongo sandbox and PostgreSQL concurrency | UNVERIFIED |

## Customer website evidence — 2026-10-20

Executed on disposable SQLite with PayMongo secrets empty unless a test set them. The active virtualenv was missing pinned `whitenoise==6.12.0`; the Django commands below passed only after that pinned package was placed on a temporary `PYTHONPATH`. That is an environment gap, not a customer-route assertion failure.

| Check | Result |
|---|---|
| `node --test tests/client/customerWeb.test.mjs` | PASS, 6/6 |
| `python manage.py test orders.tests_customer_contracts metrodrip_backend.tests_console_views orders.tests_transitions_and_snapshots` | PASS, 18/18 with temporary WhiteNoise import path |
| `python manage.py test orders.tests_payments.HostedCheckoutAPITest` | PASS, 26/26 with the same import path and explicit test allowlist |
| Browser layout/accessibility at 320/390/768/1280/1440, light/dark | UNVERIFIED |
| Live Figma screenshot comparison | UNVERIFIED; no design connector returned frames |
| PostgreSQL checkout concurrency for this change | UNVERIFIED; no PostgreSQL executable in the session |
| PayMongo sandbox redirect/webhook | UNVERIFIED |
| Full `npm run test:client` and staff browser suite | Not rerun in this change |

## Current implementation verification matrix

| ID | Requirement / risk | Required check and positive result | Negative/failure case | Status |
|---|---|---|---|---|
| PAY-01 | COD compatibility | COD creates one order from server totals, commits inventory once, returns `payment_action: null`, and replays the same key/payload | Changed owner/payload with the key returns `409 idempotency_conflict` | Implemented; 75-test local backend rerun passed |
| PAY-02 | Hosted method mapping | GCash, Maya, and card serialize a single selected method with server totals; `maya` maps only in the adapter to `paymaya` | Unknown method and missing/rejected provider configuration fail closed; no COD fallback | Implemented with mocked adapter; PayMongo sandbox/live UNVERIFIED |
| PAY-03 | No raw credentials | Runtime/source inspection contains no MetroDrip PAN/CVV/wallet login/PIN/OTP form or persistence | Nested credential keys are rejected with `raw_payment_credentials_rejected` | Implemented; local source/test rerun passed |
| PAY-04 | Redirect safety | Client/server accept only the exact HTTPS PayMongo hosted-checkout origin and retain the cart while pending | Non-HTTPS, credentials-in-URL, alternate host/port, and redirect-only paid claims are blocked | Implemented in source tests; native handoff UNVERIFIED |
| PAY-05 | Webhook authenticity | Exact raw bytes, timestamp, correct test/live digest, event shape, reference/fingerprint, amount, currency, and supplied mode are verified | Bad/missing/stale signature, mismatched supplied mode, malformed event, amount/currency/reference mismatch cannot mark paid | Local signed fixtures implemented; official sandbox delivery UNVERIFIED |
| PAY-06 | Webhook idempotency/order | Duplicate event ID/body is one effect; changed body under the same ID is a `409` collision; paid state is not reapplied | Concurrent duplicate delivery cannot double-commit stock/payment | Implemented; concurrent duplicate delivery passed on disposable PostgreSQL 16; provider sandbox UNVERIFIED |
| PAY-07 | Lost create response | A signed paid event can bind an unbound `cs_…` session only when order ID, MetroDrip reference, fingerprint, amount, currency, and paid status match | Wrong amount or identity cannot claim an unbound payment; retry does not clear cart early | Implemented; local rerun passed; live uncertainty UNVERIFIED |
| PAY-08 | Reconciliation/expiry | Referenced eligible owned reads skip provider calls for 30 seconds after a successful lookup, and checkout triggers one stale expiry | Provider failure returns durable state plus `deferred` and starts no cooldown; no fake failure/success | Implemented without lease/GET throttle; concurrent failure fan-out remains open |
| DB-01 | Target migrations | Fresh and legacy-shaped disposable PostgreSQL migrate forward; data invariants/counts/totals pass | Rollback before contract step preserves paid/audit evidence and prior compatible app can run | PASS on disposable PostgreSQL 16; connected target UNVERIFIED |
| DB-02 | Checkout concurrency | Concurrent stock/idempotency/payment transitions cannot oversell or double-create | Lock/deadlock retry is bounded and idempotent | PASS for same-key replay, stock=1 contention, and duplicate paid webhook on disposable PostgreSQL 16 |
| SEC-01 | Authentication and coarse RBAC | Opaque hashed tokens, revocation/expiry, owner filters, `admin` admin APIs, and `merchant|admin` merchant APIs work | Numeric/short/invalid token, inactive account, cross-customer order, nonstaff, and wrong role fail | Implemented; local backend/client reruns passed |
| SEC-02 | Missing fine-grained controls | Store membership/permission ABAC, MFA, and recent-auth cannot be represented as active controls | UI does not claim 2FA; MFA endpoint returns `501`; high-impact production use remains blocked | Explicit release gap |
| SEC-03 | Production settings | Django deploy check reports configuration warnings/errors without exposing secrets | Missing Django production secret prevents boot; missing PayMongo/webhook secret fails only the affected capability closed | Local production-like check completed with only HSTS subdomain/preload policy warnings; Render environment UNVERIFIED |
| CAP-01 | Fail-closed unavailable features | Reset delivery, MFA, analytics, courier, eligibility, custom-role persistence, settings persistence, and account switching return documented `501`/`503`/`410` responses | No sample metrics, token, waybill, quote, role, setting, or switched identity is fabricated | Implemented; console/backend local reruns passed |
| PERF-01 | Warm/cold behavior | Load test reports p50/p95/p99, error rate, query count, and cold-start separately against production-like PostgreSQL | Provider latency/timeouts and sleeping service do not cause duplicate orders/payments | Partial: bounded local PostgreSQL probe reports cold start, p50/p95/max, and zero errors; resource/query/connected capacity UNVERIFIED |
| UI-01 | State coverage | Figma nodes `708:4544`, `709:5008`, `710:4846`, `711:4544/4545`, and `720:4544/4545` plus runtime source cover default/loading/empty/error/partial states | Session/permission/API/write/payment failures stay truthful and recoverable | **Current regression:** 64 layout checks pass, but client POST/error-path tests and browser state flows fail; native acceptance UNVERIFIED |
| NATIVE-01 | Mobile return flow | Physical Android external browser/app return and foreground refresh return to the owned order | App kill, cancelled payment, offline return, stale session, and repeated link remain recoverable | UNVERIFIED; no `eas.json`, APK, device install, persisted pending order, or app return link |
| RENDER-01 | Free-tier topology | Schema/config confirms the approved same-origin free web service and no-cost database | No broken second origin, worker, cron, Key Value/Redis, disk, autoscaling, HA, replica, or paid plan; stop if payment is requested | **Current divergence:** Blueprint validates structurally but declares a separate static console, pins stale `archim`, and does not disable static auto-deploy explicitly |
| RENDER-02 | Durable production database | Retention/backup/restore can satisfy approved RPO/RTO without an unauthorized paid change | Current free PostgreSQL expiry/no-managed-backup lifecycle is not represented as production durable | Release HOLD/blocker |
| OPS-01 | Recovery/restore | Logical export restores to disposable PostgreSQL with integrity checks and a redacted incident/reconciliation procedure | No secret/payment/address leakage; restored ownership/money/payment invariants hold | PASS locally for custom-format dump/separate restore and key invariants; hosted recovery and structured correlation logging remain incomplete |
| DATA-01 | Demo notification cleanup | Migration removes only the five exact `0002` demo rows and preserves nonmatching legitimate records | Reverse migration does not reintroduce fabricated notifications | Implemented migration; local test rerun passed; target application UNVERIFIED |

## Current audit ledger — 2026-10-19

These results supersede the 2026-10-13 ledger only for the current audited commit. Older PostgreSQL and integration evidence remains historical evidence and was not silently upgraded to a current pass.

| Check | Command/environment | Current status |
|---|---|---|
| Revision/topology | `master` `bc8407c`; compare `archim` `6f537ce`; inspect `render.yaml` | Blueprint pins `archim`; separate static console cannot route relative login/API calls; production CORS has no console origin |
| Privileged provisioning | Inspect build command and `seed_demo_staff` | **BLOCKER:** every deploy creates/resets fixed administrator and merchant passwords |
| Active Django suite | Temporary SQLite execution | **81 run: 77 passed, 4 PostgreSQL-only skipped**; main audit used Python 3.14.6/Django 6.1.1 rather than declared versions, so target-runtime/PostgreSQL acceptance remains open |
| Client/source contracts | `npm run test:client` | **FAIL:** 128 assertions passed, then harness could not spawn `python` |
| Client/source contracts with Python selected | `PYTHON=python3 npm run test:client` | **FAIL:** 137/148 passed; 11 development-server POST/error-path failures due to missing `_send_json` |
| TypeScript | `npx tsc --noEmit` | **PASS** |
| Console browser harness | `npm run test:browser` | **FAIL:** 64 layout checks passed; state suite timed out because same-origin API traffic escaped its mock route |
| Expo client | dependency check, Doctor, public config, isolated all-platform export | **PASS:** Doctor 18/18; export generated Android/iOS/web bundles; not an APK/native test |
| Dependency audit | `npm audit --omit=dev` | 36 advisories: 0 critical, 24 high, 12 moderate; automatic fixes require incompatible framework changes |
| Blueprint | YAML parse + current official Render JSON Schema | **PASS structurally**; Render CLI/account validation and apply UNVERIFIED |
| Public probes | backend health, console root, console-origin API and CORS | Health/root returned `200`; console API returned `404`; backend omitted console-origin CORS; `/health/` does not query DB |
| EAS/APK/device | Repository inspection and device availability | **UNVERIFIED:** no `eas.json`/project ID/build/install; no device connected during audit |
| PayMongo | Source/contracts only | **UNVERIFIED:** no test checkout, enabled-rail confirmation, webhook delivery, or app return |

### Required execution order

1. Static/source-contract and focused unit tests.
2. Django checks plus migration drift checks.
3. Disposable PostgreSQL forward migration, rollback rehearsal, constraints, concurrency, and query plans.
4. Integration tests with PayMongo sandbox delivery, signature replay, failure injection, lost-create-response recovery, and bounded reconciliation.
5. Customer/merchant/admin browser accessibility and responsive tests; Expo compile plus physical-device return flows.
6. Render free-tier configuration validation and authorized staging deployment without applying a paid change.
7. Separately approved live-provider capability verification. Do not make a real charge/refund unless explicitly authorized.

### Evidence record format

For every command or manual check record the date, git commit/worktree state, exact command/environment, fixtures/account mode, result, relevant artifact path, limitations, and cleanup. Redact secrets and personal/payment data. Do not upgrade a `PASS` from mocks/SQLite into provider/PostgreSQL/native/production proof.

## Prior rerun ledger — 2026-10-13

These are observed local/disposable results. They do not replace native-device, provider, connected-database, or connected-Render acceptance.

| Check | Command/environment | Current status |
|---|---|---|
| Active Django suite | `cd metrodrip_backend; python manage.py test` | **81 passed** on disposable PostgreSQL 16; **77 passed + 4 PostgreSQL-only skips** on temporary SQLite, using Python 3.14.5 + Django 5.2.16 + DRF 3.18.1 |
| Django production diagnostics | production-like environment + `python manage.py check --deploy` | Completed with only `security.W005` and `security.W021`; HSTS subdomain/preload require an explicit domain policy decision |
| Migration drift/plan | `python manage.py makemigrations --check --dry-run`; `python manage.py migrate --plan` | No model drift; existing local database has pending migrations and was not changed |
| Client/source contracts | `npm run test:client` | **148 passed** |
| TypeScript | `npx tsc --noEmit` | **PASS**, 0 errors |
| Console browser harness | `npm run test:browser`; `npm run test:browser:integration` against owned servers | **64 mocked layouts passed** plus dialog keyboard checks; **7 real Django/API checks** and Axe WCAG A/AA scans on 4 pages passed |
| Expo client | `npx expo install --check`; `npx expo-doctor`; resolved config; all-platform export | Dependencies current; Doctor **18/18**; remote cleartext false/local emulator true; web/iOS/Android export succeeded with 106 files |
| Dependency audit | compatible `npm audit fix`; final audit/dry run | Reduced from 38 to **36**: 0 critical, 24 high, 12 moderate; remaining forced paths are incompatible Expo downgrade/React Native major |
| PostgreSQL migration/recovery | fresh + previous-schema upgrade, reverse/forward, `pg_dump -Fc`, separate `pg_restore` | **PASS**; source/restored key counts and password/reservation invariants matched |
| PostgreSQL concurrency | same-key checkout, stock=1 contention, duplicate paid webhook, parallel limiter | **PASS**; no duplicate order/movement, no oversell, one paid effect, one `1/min` admission |
| Local bounded load | 100 requests/path at concurrency 10 | Cold 1,741.2 ms; health p95 23.3 ms; catalog p95 96.0 ms; zero errors; provisional thresholds only |
| Read-only local database audit | SQLite integrity, FK, duplicate, orphan, stock, review, and money checks | Integrity `ok`; all audited invalid counts 0 |
| Modified JavaScript syntax | changed web console files | N/A; no administrator/merchant web-console source changed in this pass |
| Free-only Blueprint parse/policy | assert service/database/plan and prohibited topology keys in `render.yaml` | **PASS**; no Render apply |
| Worktree whitespace | `git diff --check` | **PASS**; rerun after documentation edits in final handoff |

The Figma completion record is in [Design Prototype](Design%20Prototype.md). Native Android/iOS rendering, real screen-reader behavior, PayMongo sandbox/live delivery, the persistent SQLite migration, connected PostgreSQL, and connected Render remain **UNVERIFIED** regardless of the local/disposable rerun. Full evidence and manual gates are in [Release Blocker Verification — 2026-10-12 to 2026-10-13](Release%20Blocker%20Verification%20-%202026-10-12.md).

## Historical five-service evidence — 2026-09-27

The material below is retained exactly as migration/regression evidence for the earlier distributed baseline. Its readiness, security, concurrency, and E2E claims are not evidence for the approved modular-monolith, Hosted Checkout, PostgreSQL, or Render target.

**Historical test suite:** 46 unit/contract tests + 5-phase end-to-end integration saga suite

**Historical result:** 46/46 unit tests and 5/5 isolated phases passed on the documented environment

---

## 1. Requirement-to-Check Verification Matrix

| Requirement / Risk | Check & Expected Result | Type | Command / Environment | Actual Result | Status |
|---|---|---|---|---|---|
| **Identity: Password Hashing** | Legacy plaintext password auto-upgrades to PBKDF2 on login. Plaintext purged. | Executed | `services/identity manage.py test identity.tests` | PBKDF2 hash confirmed; login returns valid `AuthToken`. | **PASSED** |
| **Identity: RBAC & Tokens** | Unauthenticated requests to protected endpoints return `401 Unauthorized`. | Executed | `services/identity manage.py test identity.tests` | `401` returned on missing/malformed token; roles verified. | **PASSED** |
| **Catalog: Authoritative Quotes** | Catalog returns canonical unit prices in whole PHP; ignores requested prices. | Executed | `services/catalog manage.py test catalog.tests` | Returns whole-peso integer quotes matching database records. | **PASSED** |
| **Catalog: Atomic Stock Holds** | Hold reserves inventory with 600s TTL using `select_for_update()`; blocks overselling. | Executed | `services/catalog manage.py test catalog.tests` | Exclusive row lock prevents race conditions; hold registered. | **PASSED** |
| **Orders: COD Checkout Saga** | Full distributed transaction completes: quote, hold, order snapshot, commit, outbox. | Executed | `services/orders manage.py test orders.tests` | Order created; line snapshots preserved; hold committed. | **PASSED** |
| **Orders: Purchase Snapshots** | Line items preserve `sku_snapshot`, `product_name_snapshot`, `unit_price` at purchase. | Executed | `services/orders manage.py test orders.tests` | Modifying catalog product does not alter existing order line. | **PASSED** |
| **Fulfillment: Shipping Zones** | Shipping fee computed based on geographic zone code in whole PHP. | Executed | `services/fulfillment manage.py test fulfillment.tests` | Zone quotes return exact configured base fee without decimals. | **PASSED** |
| **Fulfillment: Event Idempotency** | Duplicate `OrderPlaced` events do not generate redundant shipments. | Executed | `services/fulfillment manage.py test fulfillment.tests` | Second event delivery acknowledged with `200` without duplicates. | **PASSED** |
| **Content: Merchant Banners** | Merchant endpoints allow CRUD on promotional homepage banners. | Executed | `services/content manage.py test content.tests` | Active banners filtered; merchant authentication enforced. | **PASSED** |
| **Gateway: Routing & Tracing** | Gateway proxies all service paths and injects `X-Correlation-ID`. | Executed | `gateway/test_gateway_routing.py` | 6/6 route tests pass; correlation headers inspected. | **PASSED** |
| **End-to-End Saga Flow** | Full multi-service purchase decrements stock from 25 to 23 and updates merchant console. | Executed | `scripts/verify_microservices_e2e.py` | 5/5 phases pass; inventory decremented; order visible in UI. | **PASSED** |

---

## 2. Automated Test Execution Commands and Summary

### Test Suite Execution Breakdown

```
======================================================================
METRODRIPJS MICROSERVICES AUTOMATED TEST SUMMARY (2026-09-27)
======================================================================
Suite 1: Identity Service    [services/identity]       11/11 PASSED (0.42s)
Suite 2: Catalog Service     [services/catalog]         8/8  PASSED (0.38s)
Suite 3: Orders Service      [services/orders]         11/11 PASSED (0.51s)
Suite 4: Fulfillment Service [services/fulfillment]     5/5  PASSED (0.29s)
Suite 5: Content Service     [services/content]         5/5  PASSED (0.24s)
Suite 6: Gateway Routing     [gateway/]                 6/6  PASSED (0.18s)
----------------------------------------------------------------------
TOTAL AUTOMATED UNIT/CONTRACT TESTS:                   46/46 PASSED (100%)
======================================================================
```

### Reproducible Commands

```powershell
# Run Identity tests (11 tests)
cd services\identity
..\..\metrodrip_backend\.venv\Scripts\python.exe manage.py test identity.tests

# Run Catalog tests (8 tests)
cd services\catalog
..\..\metrodrip_backend\.venv\Scripts\python.exe manage.py test catalog.tests

# Run Orders tests (11 tests)
cd services\orders
..\..\metrodrip_backend\.venv\Scripts\python.exe manage.py test orders.tests

# Run Fulfillment tests (5 tests)
cd services\fulfillment
..\..\metrodrip_backend\.venv\Scripts\python.exe manage.py test fulfillment.tests

# Run Content tests (5 tests)
cd services\content
..\..\metrodrip_backend\.venv\Scripts\python.exe manage.py test content.tests

# Run Gateway Routing tests (6 tests)
metrodrip_backend\.venv\Scripts\python.exe gateway\test_gateway_routing.py
```

---

## 3. End-to-End Integration Suite (`verify_microservices_e2e.py`)

The end-to-end integration test runner ([scripts/verify_microservices_e2e.py](../scripts/verify_microservices_e2e.py)) validates cross-service distributed workflows against live running servers:

- **Phase 1: Gateway Routing & Aggregated Health Verification**
  - Sends requests to `http://localhost:8000/health/` and individual path prefixes (`/api/v1/auth/`, `/api/v1/catalog/`, `/api/v1/orders/`, `/api/v1/fulfillment/`, `/api/v1/content/`).
  - Confirms all 5 downstream services and the edge reverse proxy respond with HTTP `200 OK`.
- **Phase 2: Authentication & PBKDF2 Password Upgrade**
  - Authenticates test user `merchant@metrodrip.com`.
  - Verifies legacy password was hashed to PBKDF2 in `db_identity`.
  - Confirms issuance of valid opaque Bearer token.
- **Phase 3: Expiring Stock Holds & Hold Sweeper**
  - Reserves 2 units of variant `METRO-HOOD-BLK-L` with a 600s TTL.
  - Artificially ages hold timestamp past expiration in `db_catalog`.
  - Executes hold sweeper command; verifies status transitions from `held` to `released`.
  - Confirms available stock is fully restored to original pool.
- **Phase 4: Full Cash on Delivery (COD) Checkout Saga**
  - Submits live purchase request for 2 units of heavyweight hoodie.
  - Verifies Catalog quotes returned authoritative unit price (₱2,499).
  - Verifies Fulfillment returned zone shipping fee (₱150).
  - Verifies Orders created order `MD-2026-XXXXX` with total amount ₱5,148.
  - Verifies physical stock decremented from 25 to 23.
  - Verifies immutable snapshots saved in `orders_orderline`.
- **Phase 5: Merchant Console Live Parity**
  - Queries `GET /api/merchant/orders/` using merchant Bearer token.
  - Confirms the newly placed order is present with full snapshot details.
  - Verifies all legacy mock orders were purged from [web/merchant/orders.js](../web/merchant/orders.js).

---

## 4. Negative and Edge Case Evidence

| Scenario / Edge Case | Test Condition | Expected Behavior | Observed Result |
|---|---|---|---|
| **Insufficient Stock Rejection** | Attempting to reserve 50 units when variant inventory is 25. | Rejection with HTTP `409 Conflict`; zero holds created. | `409 Conflict` returned with message `"Insufficient stock available"`. |
| **Client-Side Price Tampering** | Submitting checkout payload with modified price `unit_price: 1`. | Client prices ignored; server uses authoritative quote. | Order placed with server-calculated price (₱2,499); client price ignored. |
| **Invalid Bearer Token** | Calling `GET /api/v1/orders/` with header `Authorization: Bearer invalid_hex_token`. | Immediate HTTP `401 Unauthorized` response. | `401 Unauthorized` with JSON error payload. |
| **Idempotent Checkout Retry** | Submitting identical payload twice with the same `Idempotency-Key`. | First call creates order; second call returns original order without re-billing or re-decrementing stock. | Second call returns HTTP `200` with existing `order_number`; stock only decremented once. |
| **Saga Rollback on Failure** | Simulating order database failure after stock hold reservation. | Catch exception, issue compensating `POST /holds/release/`. | Stock reservation immediately marked `released`; stock restored. |

---

## 5. Client Accessibility & Responsive Viewport Evidence

- **Headless Chrome Automation (Chrome DevTools Protocol)**:
  - Verified across 4 viewports: `320×640` (Compact Mobile), `390×844` (iPhone 14/15 base), `768×1024` (Tablet), and `1280×800` (Widescreen Desktop).
  - Verified 2-column desktop layout on 768px and 1280px viewports (delivery form left, sticky payment panel right).
  - Verified single-column mobile layout with sticky safe payment footer on 320px and 390px viewports.
  - Verified 44×44px touch targets on all interactive elements.
  - Verified visible inline error text and `aria-invalid="true"` attributes.

---

## 6. Repository Cleanup Verification — 2026-09-28

The [cleanup manifest](Decisions%20and%20Handover.md#5-repository-cleanup-record--2026-09-28) was checked against the final working tree. These results verify the cleanup scope only; they do not change the release **HOLD** status or close the QA report's production, native-device, PostgreSQL, staff-session, or automatic outbox/reconciliation gaps.

| Check | Observed result | Status |
| --- | --- | --- |
| `npm run test:client` | 114 tests passed, 0 failed after the legacy-runtime guard was narrowed to ignore only deleted bytecode and the known empty `inspectdb` stub. Node emitted the existing module-type warning. | PASS |
| Identity service tests | 19 passed against an in-memory SQLite test database. | PASS |
| Catalog service tests | 21 passed against an in-memory SQLite test database. | PASS |
| Orders service tests | 28 passed against an in-memory SQLite test database. | PASS |
| Fulfillment service tests | 18 passed against an in-memory SQLite test database. | PASS |
| Content service tests | 19 passed against an in-memory SQLite test database. | PASS |
| Gateway unit/HTTP tests | 17 passed. | PASS |
| E2E safety tests | 4 passed. | PASS |
| `scripts/verify_microservices_e2e.py` | All 5 isolated API integration phases passed; child services terminated cleanly. Automatic outbox delivery/reconciliation remains explicitly unverified. | PASS with stated gap |
| Python source compilation in memory | 191 retained `.py` files compiled with 0 syntax errors; no bytecode was written. | PASS |
| Relative JavaScript import resolution | 160 relative imports across 87 JS/JSX/MJS/TS/TSX files resolved to retained files. | PASS |
| Local documentation links | 38 Markdown files checked with 0 missing local targets; 0 `file:///A:/...` links remain. | PASS |
| Static HTML asset pointers | 19 HTML files checked with 0 missing local `href`/`src` targets. | PASS |
| Python dependency consistency | `python -m pip check` reported no broken requirements. | PASS |
| Node lockfile/dependency resolution | `npm ci --dry-run --ignore-scripts` completed successfully without installing packages or changing the lockfile. | PASS |
| Compose parse | `docker compose -f docker-compose.microservices.yml config --quiet` exited 0; Compose warned that the top-level `version` attribute is obsolete. | PASS with warning |
| Whitespace/error check | `git diff --check` passed for the cleanup change set when the three pre-existing governance-file edits were excluded. The full worktree check still reports their intentional Markdown line-break whitespace. | PASS for cleanup scope |
| Generated cache scan | 0 `__pycache__` or `.pytest_cache` directories remain outside `.venv`, `.git`, and the untouched nested `.kilo/worktrees` state. | PASS |

Automated total: **240 tests passed** across client, five services, gateway, and E2E safety suites, plus the five live isolated-service integration phases. Browser layout automation, native Expo builds/devices, live PostgreSQL behavior, and production deployment were not rerun for this structural-only cleanup.
