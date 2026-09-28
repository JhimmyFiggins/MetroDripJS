# Verification and Evaluation

**Status:** Release HOLD; implementation present, final local rerun pending, external/native/PostgreSQL/Render verification outstanding

**Current authority:** This matrix plus [QA Report 2026-09-28](QA%20Report%202026-09-28.md) and its unresolved [2026-09-27 coverage matrix](QA%20Report%202026-09-27.md)

**Evidence rule:** An executed unit/mock/SQLite/static check is labeled separately from PostgreSQL, native-device, PayMongo, and Render evidence.

## Current implementation verification matrix

| ID | Requirement / risk | Required check and positive result | Negative/failure case | Status |
|---|---|---|---|---|
| PAY-01 | COD compatibility | COD creates one order from server totals, commits inventory once, returns `payment_action: null`, and replays the same key/payload | Changed owner/payload with the key returns `409 idempotency_conflict` | Implemented; final local rerun pending |
| PAY-02 | Hosted method mapping | GCash, Maya, and card serialize a single selected method with server totals; `maya` maps only in the adapter to `paymaya` | Unknown method and missing/rejected provider configuration fail closed; no COD fallback | Implemented with mocked adapter; PayMongo sandbox/live UNVERIFIED |
| PAY-03 | No raw credentials | Runtime/source inspection contains no MetroDrip PAN/CVV/wallet login/PIN/OTP form or persistence | Nested credential keys are rejected with `raw_payment_credentials_rejected` | Implemented; final source/test rerun pending |
| PAY-04 | Redirect safety | Client/server accept only the exact HTTPS PayMongo hosted-checkout origin and retain the cart while pending | Non-HTTPS, credentials-in-URL, alternate host/port, and redirect-only paid claims are blocked | Implemented in source tests; native handoff UNVERIFIED |
| PAY-05 | Webhook authenticity | Exact raw bytes, timestamp, correct test/live digest, event shape, reference/fingerprint, amount, currency, and supplied mode are verified | Bad/missing/stale signature, mismatched supplied mode, malformed event, amount/currency/reference mismatch cannot mark paid | Local signed fixtures implemented; official sandbox delivery UNVERIFIED |
| PAY-06 | Webhook idempotency/order | Duplicate event ID/body is one effect; changed body under the same ID is a `409` collision; paid state is not reapplied | Concurrent duplicate delivery cannot double-commit stock/payment | Implemented in SQLite tests; PostgreSQL concurrency UNVERIFIED |
| PAY-07 | Lost create response | A signed paid event can bind an unbound `cs_…` session only when order ID, MetroDrip reference, fingerprint, amount, currency, and paid status match | Wrong amount or identity cannot claim an unbound payment; retry does not clear cart early | Implemented; final local rerun pending; live uncertainty UNVERIFIED |
| PAY-08 | Reconciliation/expiry | Referenced eligible owned reads skip provider calls for 30 seconds after a successful lookup, and checkout triggers one stale expiry | Provider failure returns durable state plus `deferred` and starts no cooldown; no fake failure/success | Implemented without lease/GET throttle; concurrent failure fan-out remains open |
| DB-01 | Target migrations | Fresh and legacy-shaped disposable PostgreSQL migrate forward; data invariants/counts/totals pass | Rollback before contract step preserves paid/audit evidence and prior compatible app can run | PostgreSQL UNVERIFIED |
| DB-02 | Checkout concurrency | Concurrent stock/idempotency/payment transitions cannot oversell or double-create | Lock/deadlock retry is bounded and idempotent | PostgreSQL UNVERIFIED |
| SEC-01 | Authentication and coarse RBAC | Opaque hashed tokens, revocation/expiry, owner filters, `admin` admin APIs, and `merchant|admin` merchant APIs work | Numeric/short/invalid token, inactive account, cross-customer order, nonstaff, and wrong role fail | Implemented; final local rerun pending |
| SEC-02 | Missing fine-grained controls | Store membership/permission ABAC, MFA, and recent-auth cannot be represented as active controls | UI does not claim 2FA; MFA endpoint returns `501`; high-impact production use remains blocked | Explicit release gap |
| SEC-03 | Production settings | Django deploy check reports configuration warnings/errors without exposing secrets | Missing Django production secret prevents boot; missing PayMongo/webhook secret fails only the affected capability closed | Local check rerun pending; Render environment UNVERIFIED |
| CAP-01 | Fail-closed unavailable features | Reset delivery, MFA, analytics, courier, eligibility, custom-role persistence, settings persistence, and account switching return documented `501`/`503`/`410` responses | No sample metrics, token, waybill, quote, role, setting, or switched identity is fabricated | Implemented; final console/backend rerun pending |
| PERF-01 | Warm/cold behavior | Load test reports p50/p95/p99, error rate, query count, and cold-start separately against production-like PostgreSQL | Provider latency/timeouts and sleeping service do not cause duplicate orders/payments | UNVERIFIED |
| UI-01 | State coverage | Figma nodes `708:4544`, `709:5008`, `710:4846`, `711:4544/4545`, and `720:4544/4545` plus runtime source cover default/loading/empty/error/partial states | Session/permission/API/write/payment failures stay truthful and recoverable | Figma additions and 2FA-label cleanup completed; code/browser final rerun pending |
| NATIVE-01 | Mobile return flow | Physical Android/iOS external browser/deep-link and foreground refresh return to the owned order | App kill, cancelled payment, offline return, stale session, and repeated link remain recoverable | UNVERIFIED |
| RENDER-01 | Free-tier topology | Static parse confirms previews/auto-deploy off, one free web service, and one free PostgreSQL database | No worker, cron, Key Value/Redis, disk, autoscaling, HA, replica, or paid plan; stop if payment is requested | Static rerun pending; connected/live mutation not authorized |
| RENDER-02 | Durable production database | Retention/backup/restore can satisfy approved RPO/RTO without an unauthorized paid change | Current free PostgreSQL expiry/no-managed-backup lifecycle is not represented as production durable | Release HOLD/blocker |
| OPS-01 | Recovery/restore | Logical export restores to disposable PostgreSQL with integrity checks and a redacted incident/reconciliation procedure | No secret/payment/address leakage; restored ownership/money/payment invariants hold | UNVERIFIED; structured correlation logging also incomplete |
| DATA-01 | Demo notification cleanup | Migration removes only the five exact `0002` demo rows and preserves nonmatching legitimate records | Reverse migration does not reintroduce fabricated notifications | Implemented migration; final migration/test rerun pending |

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

### Current rerun ledger — results pending

The root delivery agent will replace `RERUN PENDING` with observed results after the implementation stops changing. Until then, no count below is a completion claim.

| Check | Command/environment | Current status |
|---|---|---|
| Active Django suite | `cd metrodrip_backend; python manage.py test` | RERUN PENDING |
| Django production diagnostics | `python manage.py check --deploy` | RERUN PENDING |
| Migration drift/plan | `python manage.py makemigrations --check`; `python manage.py migrate --plan` | RERUN PENDING |
| Client/source contracts | `npm run test:client` | RERUN PENDING |
| TypeScript | `npx tsc --noEmit` | RERUN PENDING |
| Console browser harness | local `npm run dev` + `npm run test:browser` | RERUN PENDING; mocked APIs even when passing |
| Modified JavaScript syntax | `node --check` on changed web files | RERUN PENDING |
| Free-only Blueprint parse/policy | parse `render.yaml` and assert all plans/resources | RERUN PENDING; no Render apply |
| Worktree whitespace | `git diff --check` | RERUN PENDING |

The Figma completion record is in [Design Prototype](Design%20Prototype.md). Native Android/iOS rendering, real browser-to-Django console flows, PayMongo sandbox/live delivery, disposable PostgreSQL, and connected Render remain **UNVERIFIED** regardless of the local rerun.

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
