# Decisions and Handover

**Status:** Release HOLD; active modular-monolith/payment implementation handover

**Project:** MetroDripJS urban streetwear commerce platform

**Current target:** One secured modular Django monolith + one Render Free PostgreSQL database

**Decision updated:** 2026-09-28

**Owner:** Core Engineering & Architecture Team  

---

## Active architecture decisions — 2026-09-28

These decisions supersede conflicting production-topology and payment-exclusion statements elsewhere in older repository material. The previous five-service implementation remains historical evidence and a migration source; it is not the approved Render production topology.

| ADR | Context and alternatives | Decision | Consequences and controls | Status |
|---|---|---|---|---|
| **ADR-07: Free-tier modular monolith** | The five-service/gateway/database-per-service design exceeds the approved Render footprint and creates operational dependencies that do not fit a single free web service and database. Alternatives were keeping the distributed topology, adding paid private services/databases, or consolidating. | Deploy the `metrodrip_backend/` Django modular monolith with identity, catalog, orders/payments, fulfillment, content, and staff/audit boundaries to one web service and one database. | The monolith path is implemented locally; SQLite is the default developer engine. PostgreSQL migration/locking/restore and the Render deployment remain UNVERIFIED. **Supersedes ADR-01, ADR-02, and ADR-06 for production.** | Implemented locally; deployment HOLD |
| **ADR-08: Free Render resources only** | Workers, cron, Redis/Key Value, disks, autoscaling, HA, and additional services may require payment. | Configure no paid Render resources. Do not apply any change that prompts for billing. `render.yaml` keeps previews and auto-deploy off and declares one free web service plus one free PostgreSQL database. | The Blueprint is unapplied. Render's current free PostgreSQL lifecycle and missing managed backups/pooling do not satisfy durable production storage, so production is HOLD. No paid workaround is authorized. | Approved; live configuration UNVERIFIED |
| **ADR-09: COD plus PayMongo Hosted Checkout** | COD-only conflicts with approved product requirements. Direct card/wallet entry increases PCI/privacy risk; a custom payment UI also adds client/provider complexity. | Retain COD and use PayMongo Hosted Checkout for GCash, Maya, and card. Domain `maya` maps to provider `paymaya`. | MetroDrip rejects PAN, CVV, wallet login/PIN, and OTP fields. The current client lists all methods; provider capability discovery is not implemented. Provider activation, sandbox/live payment, and refunds remain UNVERIFIED. **Supersedes the prior online-payment exclusion and expands ADR-04.** | Implemented locally; external flow UNVERIFIED |
| **ADR-10: Provider-authoritative payment state** | Browser redirects/deep links can be forged, lost, repeated, or arrive before provider settlement. | A valid, deduplicated PayMongo paid webhook or an exact verified provider result from an owned status read may confirm payment; a redirect never marks paid. | Raw-body HMAC/timestamp verification, event ID/body-digest dedupe, amount/currency/mode/reference/fingerprint checks, row locking, and pending/recovery UX are implemented. PostgreSQL concurrency and real provider delivery remain UNVERIFIED. | Implemented locally; external concurrency UNVERIFIED |
| **ADR-11: No-worker recovery** | The free-tier constraint prevents a reliable always-on worker or scheduled cron. Alternatives were paid workers/cron, external scheduler, or request-driven recovery. | Keep webhook transitions synchronous. Use webhook inbox/idempotency, owned read reconciliation, one stale-expiry attempt per new checkout, and explicit operational inspection. | There is no monolith reconciliation/expiry management command or lease. Recovery can lag while idle and concurrent GETs can fan out. Add free-compatible maintenance tooling only after review; do not provision paid infrastructure. | Implemented with documented gaps |
| **ADR-12: Exact money boundary** | Django models use two-decimal values; PayMongo expects integer minor units. Binary floats risk rounding errors. | Keep application amounts as `Decimal`, normalize to two decimals, convert to integer centavos only in the provider adapter, and verify paid amount plus `PHP` currency exactly. | Existing `DecimalField(10,2)` remains compatible. Any multi-currency or greater-precision change requires a new migration/ADR. This supersedes integer-only interpretations of ADR-03 for the active monolith. | Implemented locally |
| **ADR-13: Expand/backfill/cutover/contract** | Consolidating multiple service schemas and a legacy monolith in one destructive migration would be hard to validate and roll back. | Use additive schema changes, resumable provenance-backed backfill, compatibility reads/routes, explicit validation, staged cutover, and later contract cleanup. | Temporary schema/code complexity is accepted to preserve rollback and legacy clients. Destructive cleanup needs separate authorization. | Approved |

### Payment/provider rationale

Hosted Checkout is the approved integration surface because PayMongo owns the sensitive payment-entry UI and returns a hosted HTTPS action while MetroDrip retains authoritative orders, totals, idempotency, and payment state. The server stores provider references, the hosted action, and minimal event evidence, not payment credentials. The current UI exposes all approved methods; an unavailable provider method fails closed and is not silently changed to COD. Capability-driven display remains open work.

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

## Active resume snapshot

- **Current objective:** finish the final local rerun and hand over the implemented monolith/payment/design slice without creating paid Render resources.
- **Current code reality:** `metrodrip_backend/` is the active one-process implementation. Opaque token auth, persisted-role staff guards, Hosted Checkout, signed webhook processing, request-driven expiry/reconciliation, strict lost-create-response recovery, additive migrations, and truthful console/API states are present. Store-scoped ABAC, MFA, recent-auth, refunds/transition ledger, provider capability discovery, and reconciliation lease/command are not.
- **Figma reality:** customer gaps `708:4544`, merchant gaps `709:5008`, admin gaps `710:4846`, ERD/topology `711:4544` with root `711:4545`, and customer state matrix `720:4544` with root `720:4545` were added. Merchant/admin `2FA ON` badges were changed to role-specific `VERIFIED SESSION`; stale label count was zero after validation.
- **Payment decision:** COD plus PayMongo Hosted Checkout for GCash, Maya, and cards. Browser return is informational; a signed webhook or exact provider reconciliation establishes durable paid state.
- **Data cleanup:** `fulfillment/0004_remove_seeded_demo_notifications.py` removes only the five exact notifications seeded by `0002`; reverse is intentionally a no-op.
- **Infrastructure boundary:** the unapplied Blueprint declares one free web service and one free PostgreSQL database, with previews/auto-deploy off and no worker, cron, Redis/Key Value, disk, autoscaling, or paid plan. Free PostgreSQL durability/lifecycle is an explicit production release blocker.
- **Release status:** HOLD. Final local test counts are rerun-pending in [Verification and Evaluation](Verification%20and%20Evaluation.md). PostgreSQL, PayMongo sandbox/live, native-device, and connected Render checks remain **UNVERIFIED**.

### Required handover sequence

1. Inspect the working tree and preserve unrelated changes, especially `.kilo/kilo.jsonc`.
2. Read the controlling ADRs above plus [Plan and Goals](Plan%20and%20Goals.md), [Backend Functionalities](Backend%20Functionalities.md), [Database Structure](Database%20Structure.md), and [Architecture and Operations](Architecture%20and%20Operations.md).
3. Inspect the implemented slice before changing it: payment contract/models → provider adapter/webhook → client hosted handoff/recovery → staff auth/RBAC → console states → Blueprint.
4. Use additive migrations and run `makemigrations --check`, Django checks/tests, client/type checks, mocked browser checks, Blueprint validation, and `git diff --check`.
5. Before release, execute disposable PostgreSQL migration/rollback and concurrency tests, PayMongo sandbox/webhook delivery tests, native external-browser/deep-link checks, and connected free-tier Render validation. The free database durability blocker must remain visible.
6. Mark any provider, native, PostgreSQL, or Render step not actually observed as **UNVERIFIED**. Do not deploy or charge/refund without explicit authority.

### Resolved decisions and remaining gaps

| Conflict | Controlling direction |
|---|---|
| Active checkout route | Exactly `/api/orders/checkout/`; no `/api/v1` alias is currently registered. Unsafe legacy `POST /orders/` returns `410`. |
| Payment methods | COD and hosted GCash/Maya/card are implemented; raw credential keys are rejected. Provider capability discovery remains open. |
| Active backend | `metrodrip_backend/` is the modular-monolith path; `services/*` and `gateway/` are historical comparison assets. |
| Recovery | Synchronous idempotent webhook, owned read repair, and one-per-checkout stale cleanup are implemented; lease/maintenance command remains open. |
| Database | One configured database path and additive migrations exist; PostgreSQL migration/rollback/concurrency/restore remain UNVERIFIED. |

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
