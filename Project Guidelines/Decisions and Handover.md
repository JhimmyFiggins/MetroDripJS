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
- **Current Status**: Release HOLD. [Current QA report](QA%20Report%202026-09-27.md) supersedes historical test counts and zero-blocker claims in this document. Staff sessions and event/reconciliation automation remain incomplete; native and PostgreSQL verification are blocked.
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
│   ├── verify_microservices_e2e.py         # 5-phase automated E2E integration test suite
│   └── sweep_expired_holds.py              # Standalone stock hold sweeper runner
├── web/merchant/
│   ├── orders.html                         # Merchant orders console UI
│   └── orders.js                           # Dynamic API wiring (fake fallbacks removed)
├── src/services/
│   └── apiClient.js                        # Client API adapter with Bearer token injection
├── README.md                               # Microservices Architecture & Engineering Handbook
├── Tech Stack Setup Guide.md               # Infrastructure & environment deployment guide
└── Project Guidelines/                     # Canonical project documentation (AGENTS.md)
    ├── Plan and Goals.md
    ├── Design Prototype.md
    ├── Database Structure.md
    ├── Backend Functionalities.md
    ├── Architecture and Operations.md
    ├── Verification and Evaluation.md
    └── Decisions and Handover.md
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
   Follow [Architecture and Operations.md](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/Project%20Guidelines/Architecture%20and%20Operations.md#4-operational-runbooks) Runbook 2 to launch services on ports `8000`–`8005`.
3. **Launch Production Containerized Stack**:
   ```sh
   docker compose -f docker-compose.microservices.yml up --build -d
   curl -i http://localhost:8000/health/
   ```
4. **Maintenance Runbook**:
   - Run hold sweeper every 60 seconds in production: `python manage.py release_expired_holds`.
   - All monetary changes must strictly adhere to the whole Philippine Peso integer standard (ADR-03).
   - No direct ORM imports or database-level foreign keys across microservice boundaries (ADR-02).
