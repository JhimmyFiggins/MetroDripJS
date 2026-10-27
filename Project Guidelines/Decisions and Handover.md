# Decisions and Handover

**Status:** ACADEMIC DEMO HOLD and PRODUCTION HOLD; 2026-10-27 team content and logo checkpoint

**Project:** MetroDripJS urban streetwear commerce platform

**Current target:** One secured same-origin Django monolith + one no-cost PostgreSQL database + an EAS internal Android APK

**Decision updated:** 2026-10-27

**Owner:** Core Engineering & Architecture Team  

---

## Team content and logo checkpoint — 2026-10-27

- `web/customer/teamData.js` remains the authoritative five-member dataset and `src/data/teamData.js` remains a re-export. Biographies describe evidence-backed responsibilities rather than unverified personal authorship.
- Customer web header, OTP, and footer theme-sensitive branding use explicit paired images. Theme selection is resolved before paint; a saved user choice wins, while system changes are followed when no choice exists. Fixed dark authentication panels continue to use the dark-surface asset intentionally.
- Staff console and login branding already selected paired emblems through theme-aware background images and needed no markup rewrite.
- `mobile/components/BrandLogo.jsx` owns all mobile full-logo, emblem, and wordmark imports. Welcome uses dark-surface artwork; fixed light headers/account/receipt surfaces use light-surface artwork; OTP follows registration theme context. Expo native appearance is now automatic.
- Local evidence: client 243/243, TypeScript, 64 mocked console layouts, five customer contrast scans, the dedicated team/theme/Axe/browser flow at 320/390/768/1280, Expo Doctor 18/18, dependency compatibility, and Android/iOS/web export all passed. Temporary light/dark screenshots are under `/tmp/metrodrip-logo-qa/`.
- Physical-device rendering, hosted deployment, and provider behavior were not exercised. Release remains **HOLD**. No database, API, payment, permission, or deployment configuration changed.

## Email OTP checkpoint — 2026-10-25

- Customer registration and every new customer login require an email OTP before a bearer token is issued. Existing rows are backfilled as email-verified so they are not locked out; they still receive a login code.
- Admin and merchant login require an email OTP only when `staff_mfa_policy` is `required`. `optional` keeps password-only staff sign-in.
- Codes are HMAC-SHA256 digests, expire in five minutes, lock after five failures, and resend is limited to once per 60 seconds. Brevo delivery failure does not create a session.
- `EMAIL_OTP_ENFORCED` is on again. OTP tests opt in. Production must keep `EMAIL_OTP_ENFORCED=true`.
- Live Brevo delivery and device OTP screens were not executed.

## Seven-issue implementation checkpoint — 2026-10-25

- **Scope:** Uncommitted local fixes for merchant/customer cancellation, mobile cart Back and quantity limits, checkout preflight, image URL fallback, and fail-closed payment/media gates. No commit, push, deploy, secret change, or production mutation.
- **Cancellation decision:** Customers can cancel their own unfulfilled COD orders (`placed` or `processing`, `pending_collection`) and eligible unpaid online checkouts. Merchants keep the same COD/online gates. Paid and fulfilled orders stay rejected. COD cancellation restores committed stock with one `return` movement.
- **Quantity decision:** The server limit remains `CHECKOUT_MAX_QUANTITY_PER_VARIANT` (default 5, declared in `render.yaml`). Mobile clamps to the server metadata or that fallback and shows the error without leaving the cart. It does not raise the business limit to 20.
- **Payment decision:** Hosted rails stay unavailable until `PAYMONGO_ENABLED_METHODS` names them and the merchant explicitly opts in. COD cannot be removed accidentally through an empty merchant settings write. Do not enable live rails without a verified webhook.
- **Media decision:** Production filesystem uploads are rejected unless `DJANGO_MEDIA_STORAGE_DURABLE` is true. This prevents new broken references. It does not restore the 19 production files that already return 404.
- **Next:** Restore the missing originals to durable storage, then set the durable-storage flag. Separately verify PayMongo test rails and webhook delivery before setting the allowlist. Build and install a preview APK on a device for image, Back, quantity, COD, and cancellation checks.
- **Release status:** HOLD for both academic demo and production.

## Active customer QA checkpoint - 2026-10-22

Previous workers hit usage limits. This documentation-only checkpoint preserves their reported evidence and resume scope; no tests were rerun for this entry.

- **Baseline and scope:** Base `84a6bafa440cd913c7bd91c963364790e56e4502`; local branch `fix/customer-qa-20261022`. Customer QA and local fixes only; no deployment.
- **Pre-fix verified evidence:** Node customer tests passed 6/6; `tsc` reported 0 diagnostics. These results do not verify subsequent fixes.
- **Environment and interrupted checks:** Django environment lacks WhiteNoise/Gunicorn. Installed Django 6.1.2 / DRF 3.18.3 differ from pins 5.2.16 / 3.18.1. Full Django/browser resume was interrupted, not passed.
- **Source-confirmed checkout findings:** Uncertain retries and idempotency-key resets risk duplicate checkout; cancelled/unbound provider results can resurrect state; retry can bypass a disabled payment rail.
- **Source-confirmed customer findings:** Cross-session stale rendering/authentication failures; product-detail-page (PDP) variant async race; warehouse-summed availability conflicts with the single-reservation contract.
- **Source-confirmed UI/test findings:** Hardcoded ratings, swallowed writes, unlabeled inputs, and a warn-only accessibility harness remain findings, not verified repairs.
- **Credential finding:** The existing fixed privileged-account credential in `seed_demo_staff` source, invoked by `render.yaml`, remains source-only evidence. Existing accounts and credential validity are UNVERIFIED. Record paths/types only, never values; no secret reads were performed for this checkpoint.
- **Current implementation ownership:** Workers own only the orders checkout lifecycle and customer session/API boundary. Fixes are not complete until their test results are available and reviewed.
- **Next:** Resume recovery, variant, stock, and regression-test work; resolve environment gaps and complete Django/browser verification; update the canonical [Verification and Evaluation](Verification%20and%20Evaluation.md) ledger with actual results. Release remains **HOLD** for both academic demo and production.

## Active architecture decisions — 2026-09-28

These decisions supersede conflicting production-topology and payment-exclusion statements elsewhere in older repository material. The previous five-service implementation remains historical evidence and a migration source; it is not the approved Render production topology.

| ADR | Context and alternatives | Decision | Consequences and controls | Status |
|---|---|---|---|---|
| **ADR-07: Free-tier modular monolith** | The five-service/gateway/database-per-service design exceeds the approved Render footprint and creates operational dependencies that do not fit a single free web service and database. Alternatives were keeping the distributed topology, adding paid private services/databases, or consolidating. | Deploy the `metrodrip_backend/` Django modular monolith with identity, catalog, orders/payments, fulfillment, content, and staff/audit boundaries to one web service and one database. | The monolith path is implemented locally; SQLite is the default developer engine. Disposable PostgreSQL migration/locking/restore passed on 2026-10-13; the connected Render database/deployment remain UNVERIFIED. **Supersedes ADR-01, ADR-02, and ADR-06 for production.** | Implemented locally; deployment HOLD |
| **ADR-08: Free Render resources only** | Workers, cron, Redis/Key Value, disks, autoscaling, HA, and additional services may require payment. | Configure no paid Render resources. Do not apply any change that prompts for billing. The approved target is one same-origin free Django service plus a no-cost PostgreSQL database. | The repository Blueprint, recorded as review-only/unapplied, has drifted: it declares an additional static console, pins `archim`, and leaves that service's auto-deploy implicit. Existing public services have not been tied to this file/SHA. Render Free PostgreSQL is disposable and not production-durable. No paid workaround is authorized. | Approved target; configuration remediation required |
| **ADR-09: COD plus PayMongo Hosted Checkout** | COD-only conflicts with approved product requirements. Direct card/wallet entry increases PCI/privacy risk; a custom payment UI also adds client/provider complexity. | Retain COD and use PayMongo Hosted Checkout for GCash, Maya, and card. Domain `maya` maps to provider `paymaya`. | MetroDrip rejects PAN, CVV, wallet login/PIN, and OTP fields. The client consumes server capability discovery and fails unavailable online rails closed. Provider activation, sandbox/live payment, and refunds remain UNVERIFIED. **Supersedes the prior online-payment exclusion and expands ADR-04.** | Implemented locally; external flow UNVERIFIED |
| **ADR-10: Provider-authoritative payment state** | Browser redirects/deep links can be forged, lost, repeated, or arrive before provider settlement. | A valid, deduplicated PayMongo paid webhook or an exact verified provider result from an owned status read may confirm payment; a redirect never marks paid. | Raw-body HMAC/timestamp verification, event ID/body-digest dedupe, amount/currency/mode/reference/fingerprint checks, row locking, and pending/recovery UX are implemented. Duplicate-delivery/out-of-order behavior passed on disposable PostgreSQL; real provider delivery remains UNVERIFIED. | Implemented locally; provider acceptance pending |
| **ADR-11: No-worker recovery** | The free-tier constraint prevents a reliable always-on worker or scheduled cron. Alternatives were paid workers/cron, external scheduler, or request-driven recovery. | Keep webhook transitions synchronous. Use webhook inbox/idempotency, owned read reconciliation, one stale-expiry attempt per new checkout, and explicit operational inspection. | There is no monolith reconciliation/expiry management command or lease. Recovery can lag while idle and concurrent GETs can fan out. Add free-compatible maintenance tooling only after review; do not provision paid infrastructure. | Implemented with documented gaps |
| **ADR-12: Exact money boundary** | Django models use two-decimal values; PayMongo expects integer minor units. Binary floats risk rounding errors. | Keep application amounts as `Decimal`, normalize to two decimals, convert to integer centavos only in the provider adapter, and verify paid amount plus `PHP` currency exactly. | Existing `DecimalField(10,2)` remains compatible. Any multi-currency or greater-precision change requires a new migration/ADR. This supersedes integer-only interpretations of ADR-03 for the active monolith. | Implemented locally |
| **ADR-13: Expand/backfill/cutover/contract** | Consolidating multiple service schemas and a legacy monolith in one destructive migration would be hard to validate and roll back. | Use additive schema changes, resumable provenance-backed backfill, compatibility reads/routes, explicit validation, staged cutover, and later contract cleanup. | Temporary schema/code complexity is accepted to preserve rollback and legacy clients. Destructive cleanup needs separate authorization. | Approved |
| **Proposed ADR-14: Academic demo release profile** | The project must demonstrate the integrated system without subscriptions, while Render Free PostgreSQL expires and app-store distribution is not required. Alternatives are a scheduled Render database, a longer-lived free external PostgreSQL provider, or paid production infrastructure. | Recommend one Django origin, a synthetic single-store dataset, Render Free PostgreSQL created inside a scheduled demo window, PayMongo test mode, and a directly installed EAS internal APK. Choose Neon Free only if continuous availability beyond 30 days is required and its external connection passes acceptance. | This is not production architecture. Database expiry, cold start, free quotas, manual recovery, and direct APK distribution must be stated during evaluation. | Proposed; owner must select database profile before implementation |

### ADR-15: Customer website packaging — 2026-10-20

| Field | Record |
|---|---|
| Status | Accepted for local implementation; release remains HOLD |
| Context | The customer shop must share Django APIs and avoid colliding with unprefixed routes such as `/products/` and `/orders/`. Expo's package `main` is `index.js`, so a root `index.web.js` does not replace the native entry. `expo export` also deletes its output directory and is not a safe writer into `web/`. |
| Decision | Serve a browser-native customer UI from `web/customer/` at `/customer/` through the existing Django console file view. Reuse installed fonts/tokens and same-origin fetch. Do not add a router, bundler, or styling framework. Keep the bearer token in memory. Allow a 12-hour sessionStorage cart draft of variant ids and quantities only. |
| Alternatives | Dedicated Expo web project; React DOM entry behind a new bundler; putting customer routes on `/shop` or `/products/{id}`. Rejected because of native-entry collision, new dependencies, or API shadowing. |
| Consequences | Deep links refresh through the SPA shell. Online rails stay off until `PAYMONGO_ENABLED_METHODS` names them. Live Figma frame inspection was not available in this session, so visual fidelity to the Figma file is UNVERIFIED. Deployment, PostgreSQL, and PayMongo sandbox remain separate gates. |

### Payment/provider rationale

Hosted Checkout is the approved integration surface because PayMongo owns the sensitive payment-entry UI and returns a hosted HTTPS action while MetroDrip retains authoritative orders, totals, idempotency, and payment state. The server stores provider references, the hosted action, and minimal event evidence, not payment credentials. The current UI consumes `GET /api/payments/capabilities/`; an unavailable or unknown online method fails closed and is not silently changed to COD.

### Protected actions

- No live Render deployment, plan upgrade, paid resource, real charge/refund, secret change, database deletion, destructive migration, or shared-history rewrite is authorized by these decisions.
- Stop before applying a Render change if it requires payment.
- Secret values must remain in environment configuration and must not be printed, committed, copied into Figma, or placed in handover notes.

## Historical architecture decision records — 2026-09-27

The following records describe the earlier distributed baseline. ADR-01, ADR-02, ADR-04's COD-only/sweeper assumptions, and ADR-06 are superseded for the approved production target by ADR-07 through ADR-13 above. They are retained for provenance and to interpret existing `services/*`, `gateway/`, Compose, tests, and QA evidence.

| ADR / Date | Context and Alternatives Considered | Decision and Rationale | Dissents and Risks | Owner | Revisit Trigger |
|---|---|---|---|---|---|
| **ADR-01**<br>2026-09-27 | **Monolith vs. Microservices**<br>Legacy codebase combined identity, catalog, orders, shipping, and CMS in one Django process. High drop traffic risked crashing order processing. | **Decompose into 5 microservices** (`identity`, `catalog`, `orders`, `fulfillment`, `content`) fronted by an API Gateway. Ensures fault isolation, independent scaling, and distinct database credentials. | Increased operational complexity, distributed transactions. Mitigated with Docker Compose and Saga pattern. | Architecture Lead | Unlikely; microservices architecture meets all business drop scalability requirements. |
| **ADR-02**<br>2026-09-27 | **Shared Database vs. Database-per-Service**<br>Alternative: Keep single PostgreSQL database with separate table schemas (`schema_orders`, etc.). | **Enforce physical database-per-service** (`db_identity`, `db_catalog`, `db_orders`, etc.). Eliminate all cross-service foreign keys. Line items store pure historical snapshots. | Eliminates SQL joins across boundaries. Requires snapshot models and reference IDs (`customer_ref`). | Architecture Lead | Revisit only if operational database overhead exceeds infrastructure budget. |
| **ADR-03**<br>2026-09-27 | **Money Representation (Floats vs. Decimals vs. Integers)**<br>Alternative: Floating-point or fixed-precision `DecimalField(10, 2)`. | **Represent all prices and fees as authoritative Integers in whole Philippine Pesos (`₱`)**. Eliminates binary floating-point drift and fractional centavo rounding issues. | Cannot represent fractional centavos. Streetwear retail in the Philippines operates entirely in whole pesos. | Financial Eng Lead | Revisit only if international expansion requires fractional currencies (e.g., USD cents). |
| **ADR-04**<br>2026-09-27 | **Distributed Checkout Consistency (2PC vs. Saga)**<br>Alternative: Distributed Two-Phase Commit (2PC) or synchronous cross-service locking. | **Implement Orchestrated COD Checkout Saga with Expiring Holds (600s TTL)**. Orders orchestrates quotes, holds, local commit, and stock decrement. Downstream failure triggers compensating release. | Abandoned sessions leave stock temporarily locked. Mitigated by background hold sweeper cron. | Orders Lead | Revisit if payment gateway webhooks require asynchronous multi-day hold states. |
| **ADR-05**<br>2026-09-27 | **Security & Authentication Protocol**<br>Legacy database stored plaintext passwords; unverified demo tokens allowed privilege escalation. | **PBKDF2-SHA256 Password Hashing + Verifiable Bearer Tokens + Internal Mesh Tokens**. Auto-upgrade legacy passwords on login. Opaque `AuthToken` with role checks. | Users with invalid legacy passwords must reset. Seamless on-login upgrade prevents user friction. | Security Lead | Revisit if moving to external OIDC / OAuth2 identity providers. |
| **ADR-06**<br>2026-09-27 | **Edge Routing & Tracing**<br>Alternative: Direct client calls to disparate microservice ports (8001–8005). | **Single Edge Gateway on Port 8000 (Nginx / Python Gateway)**. Inject `X-Correlation-ID` header; route path prefixes to backend services. | Gateway is a single point of entry. In production, Nginx runs with multiple worker processes. | DevOps Lead | Revisit if API Gateway needs to migrate to cloud-native Envoy / Kong gateway. |

---

## Active resume snapshot — 2026-10-19

- **Current objective:** execute the phased remediation and academic-demo gates in the [2026-10-19 comprehensive audit](Comprehensive%20Repository%20Audit%20and%20Academic%20Demo%20Plan%20-%202026-10-19.md) without creating paid resources or mutating hosted systems without authorization.
- **Current code reality:** `metrodrip_backend/` is the active one-process implementation. Core identity, catalog, checkout/payment, fulfillment, content, and console APIs exist. The mobile app has real API integrations. Store-scoped ABAC, MFA, recent-auth, refunds, persistent mobile recovery, and a reconciliation lease/command are not implemented.
- **Figma reality:** customer gaps `708:4544`, merchant gaps `709:5008`, admin gaps `710:4846`, ERD/topology `711:4544` with root `711:4545`, and customer state matrix `720:4544` with root `720:4545` were added. Merchant/admin `2FA ON` badges were changed to role-specific `VERIFIED SESSION`; stale label count was zero after validation.
- **Payment decision:** COD plus PayMongo Hosted Checkout for GCash, Maya, and cards. Browser return is informational; a signed webhook or exact provider reconciliation establishes durable paid state.
- **Data cleanup:** `fulfillment/0004_remove_seeded_demo_notifications.py` removes only the five exact notifications seeded by `0002`; reverse is intentionally a no-op.
- **Infrastructure reality:** the current Blueprint declares a free Python service, a separate static console, and a free PostgreSQL database, all without paid resources. Both services pin stale `archim`; the static console cannot reach the API through its relative paths. The approved target remains one same-origin Django service.
- **Security blocker:** `render.yaml` runs `seed_demo_staff`, which resets hardcoded administrator and merchant passwords on every deployment. Remove it and rotate/disable any affected hosted accounts before public use.
- **Verification reality:** on current `master` `bc8407c`, TypeScript, Expo Doctor 18/18, Expo dependency/config checks, all-platform JS export, and Render JSON-Schema validation pass. Django ran 81 tests on temporary SQLite: 77 passed and 4 PostgreSQL-only tests skipped. The default client suite and browser state suite fail; current PostgreSQL, PayMongo sandbox, EAS build/install, physical-device, real screen-reader, and repaired deployed console flows are **UNVERIFIED**.
- **Release status:** ACADEMIC DEMO HOLD and PRODUCTION HOLD.

### Required handover sequence

1. Inspect the working tree and preserve all unrelated user changes.
2. Read the controlling ADRs above plus [Plan and Goals](Plan%20and%20Goals.md), [Backend Functionalities](Backend%20Functionalities.md), [Database Structure](Database%20Structure.md), and [Architecture and Operations](Architecture%20and%20Operations.md).
3. Complete P0 first: remove privileged seeding, plan authorized account rotation, and select one canonical branch/origin/database profile.
4. Restore the 148 client tests and browser state suite before implementing deployment or mobile recovery changes.
5. Use additive migrations and run `makemigrations --check`, Django/PostgreSQL checks, client/type/browser checks, Expo checks, Blueprint validation, secret scanning, and `git diff --check`.
6. Before a demo, execute connected PostgreSQL backup/migration checks, deployed staff/customer workflows, PayMongo sandbox/webhook delivery when claimed, EAS APK install, native return/recovery, and real screen-reader checks.
7. Mark any provider, native, connected-PostgreSQL, or Render step not actually observed as **UNVERIFIED**. Do not deploy, rotate live secrets, or charge/refund without explicit authority.

### Resolved decisions and remaining gaps

| Conflict | Controlling direction |
|---|---|
| Active checkout route | Exactly `/api/orders/checkout/`; no `/api/v1` alias is currently registered. Unsafe legacy `POST /orders/` returns `410`. |
| Payment methods | COD and hosted GCash/Maya/card are implemented; raw credential keys are rejected; client availability is driven by the server capability endpoint and unknown online rails fail closed. |
| Active backend | `metrodrip_backend/` is the modular-monolith path; `services/*` and `gateway/` are historical comparison assets. |
| Recovery | Synchronous idempotent webhook, owned read repair, and one-per-checkout stale cleanup are implemented; lease/maintenance command remains open. |
| Database | One configured database path and additive migrations exist. Disposable PostgreSQL 16 migration/rollback/concurrency/restore passed on 2026-10-13; the persistent SQLite target awaits approval and connected PostgreSQL remains UNVERIFIED. |
| Console hosting | Current split static/API deployment is broken. The controlling recommendation is same-origin console assets served by Django. |
| Academic database profile | Render Free PostgreSQL is acceptable only for a scheduled disposable demo inside its 30-day lifetime; Neon Free is the proposed longer-lived alternative pending a decision and connectivity test. |
| Mobile distribution | Direct EAS internal APK is the no-paid target. No `eas.json`, build, signing, installation, or device acceptance exists yet. |

## Historical resume snapshot

- **Date & Environment**: 2026-09-27 | Local Development (`Windows 11`, Python 3.11 Virtual Environment, SQLite per service) & Production Docker Compose (`PostgreSQL 16`, Nginx).
- **Status at this historical snapshot**: Release HOLD. Its then-open staff-session and demo-fallback findings were addressed by the newer implementation snapshot above; no such resolution should be backdated into the dated QA reports. Native, PostgreSQL, live-provider, and Render verification remain open.
- **Repository Location**: `A:\Users\Archim Pameroyan\Documents\GitHub\MetroDripJS`

### Completed Deliverables and Exact File Paths

```
MetroDripJS/
├── gateway/                                # Port 8000 API Gateway
│   ├── gateway.py                          # Development reverse proxy with correlation IDs
│   ├── nginx.conf                          # Production Nginx reverse proxy configuration
│   └── test_gateway_routing.py             # 6/6 automated gateway routing tests
├── services/
│   ├── identity/                           # Port 8001: db_identity
│   │   ├── identity/                       # PBKDF2 hashing, AuthTokens, RBAC permissions
│   │   └── identity/tests/test_identity.py # 11/11 tests pass
│   ├── catalog/                            # Port 8002: db_catalog
│   │   ├── catalog/                        # Whole PHP prices, quotes, expiring stock holds
│   │   ├── catalog/management/commands/release_expired_holds.py
│   │   └── catalog/tests/test_catalog.py   # 8/8 tests pass
│   ├── orders/                             # Port 8003: db_orders
│   │   ├── orders/saga.py                  # Orchestrated COD Checkout Saga & compensations
│   │   ├── orders/models.py                # Pure purchase line snapshots, Outbox pattern
│   │   └── orders/tests/test_orders.py     # 11/11 tests pass
│   ├── fulfillment/                        # Port 8004: db_fulfillment
│   │   ├── fulfillment/                    # Shipping zones, quotes, shipments, notifications
│   │   └── fulfillment/tests/test_fulfillment.py # 5/5 tests pass
│   └── content/                            # Port 8005: db_content
│       ├── content/                        # Homepage banners, contact inquiries, CMS
│       └── content/tests/test_content.py   # 5/5 tests pass
├── database/
│   └── init_microservices_postgresql.sql   # PostgreSQL 16 multi-database provisioning
├── docker-compose.microservices.yml        # Multi-container orchestration spec
├── scripts/
│   └── verify_microservices_e2e.py         # 5-phase automated E2E integration test suite
├── web/merchant/
│   ├── orders.html                         # Merchant orders console UI
│   └── orders.js                           # Dynamic API wiring (fake fallbacks removed)
├── src/services/
│   └── apiClient.js                        # Client API adapter with Bearer token injection
├── README.md                               # Microservices Architecture & Engineering Handbook
└── Project Guidelines/                     # Canonical project documentation (AGENTS.md)
    ├── AI Documentation Notes.md            # Compact retrieval index
    ├── Plan and Goals.md
    ├── Design Prototype.md
    ├── Database Structure.md
    ├── Backend Functionalities.md
    ├── Architecture and Operations.md
    ├── Verification and Evaluation.md
    ├── Decisions and Handover.md
    ├── QA Report 2026-09-27.md
    ├── QA Report 2026-09-28.md
    ├── Tech Stack Setup Guide.md            # Infrastructure & environment deployment guide
    └── tech-stack-setup.html                # Interactive setup companion
```

---

## Historical verified checks and results summary

The checks below verify the 2026-09-27 five-service baseline only. They do not verify the current modular-monolith, online-payment, PostgreSQL, or Render target.

1. **Unit & Contract Test Execution**:
   - `services/identity`: 11/11 passed (0.42s)
   - `services/catalog`: 8/8 passed (0.38s)
   - `services/orders`: 11/11 passed (0.51s)
   - `services/fulfillment`: 5/5 passed (0.29s)
   - `services/content`: 5/5 passed (0.24s)
   - `gateway`: 6/6 passed (0.18s)
   - **Total Unit/Contract Tests**: **46/46 Passed (100%)**
2. **End-to-End Integration Suite (`verify_microservices_e2e.py`)**:
   - Phase 1 (Health & Gateway Routing): PASSED
   - Phase 2 (PBKDF2 Password Upgrade): PASSED
   - Phase 3 (Stock Hold & Sweeper Restoration): PASSED
   - Phase 4 (Full COD Checkout Saga & Stock Decrement): PASSED
   - Phase 5 (Merchant Console Live Parity): PASSED
   - **Result**: **5/5 Phases Passed**

---

## Historical five-service runbook

The commands below reproduce the earlier distributed test topology. Use them for regression/migration comparison, not as production-deployment instructions.

To resume development, spin up the environment, or run verification tests from a cold start:

1. **Activate Environment & Run Verification**:
   ```powershell
   cd "A:\Users\Archim Pameroyan\Documents\GitHub\MetroDripJS"
   metrodrip_backend\.venv\Scripts\python.exe scripts\verify_microservices_e2e.py
   ```
2. **Start Services for Active Development**:
   Follow [Architecture and Operations.md](Architecture%20and%20Operations.md#4-operational-runbooks) Runbook 2 to launch services on ports `8000`–`8005`.
3. **Launch the historical containerized comparison stack locally**:
   ```sh
   docker compose -f docker-compose.microservices.yml up --build -d
   curl -i http://localhost:8000/health/
   ```
4. **Maintenance Runbook**:
   - Run hold sweeper every 60 seconds in production: `python manage.py release_expired_holds`.
   - All monetary changes must strictly adhere to the whole Philippine Peso integer standard (ADR-03).
   - No direct ORM imports or database-level foreign keys across microservice boundaries (ADR-02).

---

## 5. Repository Cleanup Record — 2026-09-28

### Scope and decision

The cleanup preserved application logic, active UI files, endpoints, schemas, migrations, databases, configuration mappings, design-source artifacts, and local environments. A path was removed only when direct inspection established that it was generated, unreferenced by the active entry graph, superseded by an authoritative source, or an obsolete archive already recoverable from Git history.

Result: 316 tracked cleanup files (5,848,530 bytes / 5.58 MiB) and 11 ignored cache directories were removed. The two additional tracked deletions shown by Git are the pre-existing documentation relocations described below.

The two root documentation moves were already present as uncommitted user work when this cleanup began. Their destination copies were verified line-for-line before references were updated:

- `AI Documentation Notes.md` → `Project Guidelines/AI Documentation Notes.md`; the destination was then condensed into the required retrieval-only index.
- `Tech Stack Setup Guide.md` → `Project Guidelines/Tech Stack Setup Guide.md`; content was preserved unchanged.
- `Project Guidelines/tech-stack-setup.html` was retained as the setup guide's interactive companion.

### Deletion manifest

| Removed path or exact path class | Count | Evidence and impact |
| --- | ---: | --- |
| `**/__pycache__/*.pyc` from the cache roots listed below | 303 tracked files | Interpreter-specific bytecode for Python 3.12, 3.14, and 3.15; ignored and regenerated from retained `.py` sources. |
| Eleven ignored cache directories listed below | 11 directories | Untracked `.pyc`/pytest state only; regenerated by Python or pytest. |
| `.idea/caches/deviceStreaming.xml` | 1 file | Machine-local IDE device-streaming cache; no build/runtime reference. |
| `App copy.js`, `Appa.js` | 2 files | Superseded root prototypes; `index.js` imports only `App.js`. |
| `mobile/Orders/OrderHistory copy.jsx`, `mobile/Products/ProductDetails copy.jsx`, `mobile/Checkout/src/screens/CheckoutScreen2.jsx` | 3 files | Older alternates absent from `mobile/navigation/AppNavigator.jsx` and all import searches. |
| `metrodrip_backend.zip`, `metrodrip_backend (2).zip` | 2 files | Historical source snapshots duplicating older tracked backend content; unused by scripts/builds and recoverable from Git history. |
| `metrodrip_backend/models_existing.py` | 1 file | Unreferenced, incomplete Django `inspectdb` stub encoded as UTF-16; it contained no model class and could not be parsed as Python source. |
| `web/_expo/static/js/web/index-0fa32d492e34ece9057127791a120421.js`, `index-7d96f73b742d709303dd172293131cb7.js`, `index-8ea306153b74a113cc54dbf4fa5e1c7c.js` | 3 files | Orphaned Expo exports. No HTML references them; `web/index.html` is the current static console portal. |
| `web/metadata.json` | 1 file | Empty metadata for the removed Expo export; no consumer. |

Tracked Python cache roots removed in full:

```text
gateway/__pycache__
metrodrip_backend/{catalog,content,fulfillment,identity,metrodrip_backend,orders}/__pycache__
metrodrip_backend/{catalog,content,fulfillment,identity,orders}/migrations/__pycache__
metrodrip_backend/identity/management/commands/__pycache__
services/catalog/catalog/{__pycache__,management/__pycache__,management/commands/__pycache__,migrations/__pycache__,tests/__pycache__}
services/catalog/catalog_service/__pycache__
services/content/content/{__pycache__,management/commands/__pycache__,migrations/__pycache__,tests/__pycache__}
services/content/content_service/__pycache__
services/fulfillment/fulfillment/{__pycache__,management/__pycache__,management/commands/__pycache__,migrations/__pycache__,tests/__pycache__}
services/fulfillment/fulfillment_service/__pycache__
services/identity/identity/{__pycache__,management/__pycache__,management/commands/__pycache__,migrations/__pycache__,tests/__pycache__}
services/identity/identity_service/__pycache__
services/orders/orders/{__pycache__,management/__pycache__,management/commands/__pycache__,migrations/__pycache__,tests/__pycache__}
services/orders/orders_service/__pycache__
```

Ignored cache directories removed after an exact `git clean -ndX` preview:

```text
gateway/__pycache__
services/catalog/.pytest_cache
services/catalog/catalog/tests/__pycache__
services/content/.pytest_cache
services/content/content/tests/__pycache__
services/fulfillment/.pytest_cache
services/fulfillment/fulfillment/__pycache__
services/fulfillment/fulfillment/tests/__pycache__
services/identity/.pytest_cache
services/identity/identity/tests/__pycache__
web/__pycache__
```

### Preventive rules and retained candidates

- `.gitignore` now covers `*.py[cod]`, common virtual-environment directories, and the removed `web/_expo/` export metadata. `.idea/.gitignore` now covers IDE cache state.
- Root and `Project Guidelines/` documentation references now target the canonical in-folder setup/index files. Machine-specific `file:///A:/...` links were replaced with portable repository-relative paths, and stale references to the nonexistent `scripts/sweep_expired_holds.py` were removed in favor of the retained catalog management command.
- `AI Skills/*.md` links to the root router now use `../AIO.md`; the obsolete `personal-style.md` link now targets AIO's embedded style contract.
- `tests/client/checkoutScreenInvariants.test.mjs` still rejects changes to legacy runtime sources. Its Git-status filter now permits only deleted `__pycache__/*.pyc` files and `metrodrip_backend/models_existing.py`, the verified empty `inspectdb` stub. This repaired the cleanup-specific false positive without broadening the runtime exception.
- `metrodrip_backend/.venv/` remains local because the documented test workflow depends on it; it is ignored and reproducible.
- All SQLite databases, the monolith baseline backup, schemas, and migrations remain because they are protected data/state artifacts under the requested scope.
- `figma_node.json`, `figma_summary.txt`, `parse_figma.js`, and `web/consoles_figma_texts.json` remain because existing design documentation identifies them as source/reference artifacts; no provenance-preserving migration target was established.
- `.idea/runConfigurations/`, `.vscode/`, `.claude/`, `.kilo/skills/`, `CLAUDE.md`, and `GEMINI.md` remain because they provide active developer/agent entry points. The nested ignored `.kilo/worktrees/` state was not modified.

### Recovery

Tracked removals can be restored from the preceding Git revision. Ignored cache directories are recreated by the relevant test/runtime tools. No history rewrite, commit, push, database mutation, migration, or deployment was performed.

Verification evidence, including the initial guard failure and the successful rerun, is recorded in [Verification and Evaluation](Verification%20and%20Evaluation.md#6-repository-cleanup-verification--2026-09-28).
