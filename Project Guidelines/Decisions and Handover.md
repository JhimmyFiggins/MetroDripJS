# Decisions and Handover

**Status:** Release HOLD; QA remediation and outstanding verification documented below
**Project:** MetroDripJS Urban Streetwear E-Commerce Platform  
**Architecture:** Five Microservices + API Gateway + Isolated Multi-Database  
**Date:** 2026-09-27  
**Owner:** Core Engineering & Architecture Team  

---

## 1. Architecture Decision Records (ADRs)

| ADR / Date | Context and Alternatives Considered | Decision and Rationale | Dissents and Risks | Owner | Revisit Trigger |
|---|---|---|---|---|---|
| **ADR-01**<br>2026-09-27 | **Monolith vs. Microservices**<br>Legacy codebase combined identity, catalog, orders, shipping, and CMS in one Django process. High drop traffic risked crashing order processing. | **Decompose into 5 microservices** (`identity`, `catalog`, `orders`, `fulfillment`, `content`) fronted by an API Gateway. Ensures fault isolation, independent scaling, and distinct database credentials. | Increased operational complexity, distributed transactions. Mitigated with Docker Compose and Saga pattern. | Architecture Lead | Unlikely; microservices architecture meets all business drop scalability requirements. |
| **ADR-02**<br>2026-09-27 | **Shared Database vs. Database-per-Service**<br>Alternative: Keep single PostgreSQL database with separate table schemas (`schema_orders`, etc.). | **Enforce physical database-per-service** (`db_identity`, `db_catalog`, `db_orders`, etc.). Eliminate all cross-service foreign keys. Line items store pure historical snapshots. | Eliminates SQL joins across boundaries. Requires snapshot models and reference IDs (`customer_ref`). | Architecture Lead | Revisit only if operational database overhead exceeds infrastructure budget. |
| **ADR-03**<br>2026-09-27 | **Money Representation (Floats vs. Decimals vs. Integers)**<br>Alternative: Floating-point or fixed-precision `DecimalField(10, 2)`. | **Represent all prices and fees as authoritative Integers in whole Philippine Pesos (`₱`)**. Eliminates binary floating-point drift and fractional centavo rounding issues. | Cannot represent fractional centavos. Streetwear retail in the Philippines operates entirely in whole pesos. | Financial Eng Lead | Revisit only if international expansion requires fractional currencies (e.g., USD cents). |
| **ADR-04**<br>2026-09-27 | **Distributed Checkout Consistency (2PC vs. Saga)**<br>Alternative: Distributed Two-Phase Commit (2PC) or synchronous cross-service locking. | **Implement Orchestrated COD Checkout Saga with Expiring Holds (600s TTL)**. Orders orchestrates quotes, holds, local commit, and stock decrement. Downstream failure triggers compensating release. | Abandoned sessions leave stock temporarily locked. Mitigated by background hold sweeper cron. | Orders Lead | Revisit if payment gateway webhooks require asynchronous multi-day hold states. |
| **ADR-05**<br>2026-09-27 | **Security & Authentication Protocol**<br>Legacy database stored plaintext passwords; unverified demo tokens allowed privilege escalation. | **PBKDF2-SHA256 Password Hashing + Verifiable Bearer Tokens + Internal Mesh Tokens**. Auto-upgrade legacy passwords on login. Opaque `AuthToken` with role checks. | Users with invalid legacy passwords must reset. Seamless on-login upgrade prevents user friction. | Security Lead | Revisit if moving to external OIDC / OAuth2 identity providers. |
| **ADR-06**<br>2026-09-27 | **Edge Routing & Tracing**<br>Alternative: Direct client calls to disparate microservice ports (8001–8005). | **Single Edge Gateway on Port 8000 (Nginx / Python Gateway)**. Inject `X-Correlation-ID` header; route path prefixes to backend services. | Gateway is a single point of entry. In production, Nginx runs with multiple worker processes. | DevOps Lead | Revisit if API Gateway needs to migrate to cloud-native Envoy / Kong gateway. |

---

## 2. Resume Snapshot

- **Date & Environment**: 2026-09-27 | Local Development (`Windows 11`, Python 3.11 Virtual Environment, SQLite per service) & Production Docker Compose (`PostgreSQL 16`, Nginx).
- **Current Status**: Release HOLD. [Current QA report](QA%20Report%202026-09-28.md) and its [predecessor](QA%20Report%202026-09-27.md) supersede historical test counts and zero-blocker claims in this document. Add User keyboard dismissal is fixed, but staff sessions, demo-on-error state, and event/reconciliation automation remain incomplete; native and PostgreSQL verification are blocked.
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

## 3. Verified Checks and Results Summary

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

## 4. Cold-Start Resume Instructions for Future Engineers

To resume development, spin up the environment, or run verification tests from a cold start:

1. **Activate Environment & Run Verification**:
   ```powershell
   cd "A:\Users\Archim Pameroyan\Documents\GitHub\MetroDripJS"
   metrodrip_backend\.venv\Scripts\python.exe scripts\verify_microservices_e2e.py
   ```
2. **Start Services for Active Development**:
   Follow [Architecture and Operations.md](Architecture%20and%20Operations.md#4-operational-runbooks) Runbook 2 to launch services on ports `8000`–`8005`.
3. **Launch Production Containerized Stack**:
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
