# Plan and Goals

**Status:** Completed & Verified Baseline  
**Project:** MetroDripJS Urban Streetwear E-Commerce Platform  
**Target Architecture:** Five Independently Deployable Microservices + API Gateway  
**Date:** 2026-09-27  
**Owner:** Core Engineering & Architecture Team  

---

## 1. Outcome and Scope

### Users and Problem
- **Users**:
  - *Mobile Shoppers*: Urban streetwear consumers browsing catalogs, selecting garment sizes/colors, placing Cash-on-Delivery (COD) orders via iOS/Android Expo mobile app.
  - *Merchants & Operations Staff*: Inventory managers and store administrators updating stock, publishing collections, monitoring real-time orders, and dispatching deliveries via web consoles.
- **Problem Statement**:
  - The legacy MetroDrip backend operated as a tightly coupled Django monolith with cross-app ORM imports, plaintext legacy password storage, cross-boundary database foreign keys, and absence of transactional stock hold semantics during high-concurrency drops.
- **Target Outcome**:
  - Fully deconstruct the backend into **five independently deployable Django microservices** (`identity`, `catalog`, `orders`, `fulfillment`, `content`) fronted by an API Gateway (`gateway/`).
  - Enforce data isolation with dedicated databases, zero cross-service ORM coupling, PBKDF2 password security, atomic expiring stock holds (600s TTL), whole-peso integer currency, and a resilient compensating COD checkout saga.

### Measurable Success and Baseline
- **Baseline Monolith**: Single SQLite database (`metrodrip_backend/db.sqlite3`), shared foreign keys between orders and catalog products, non-hashed passwords, no correlation tracking.
- **Target Metrics & Results**:
  - **Service Independence**: 5 microservices running on isolated ports (`8001`–`8005`) with 5 separate database schemas (`db_identity`, `db_catalog`, `db_orders`, `db_fulfillment`, `db_content`).
  - **Test Pass Rate**: 100% automated test coverage across all services (46/46 unit tests passing; 5/5 E2E integration test phases passing).
  - **Zero Data Leakage / Isolation**: Zero cross-app ORM foreign keys; pure historical purchase snapshots in order line items.
  - **Financial Correctness**: 100% whole Philippine Peso (`₱`) integer arithmetic across all quotes, orders, and fulfillment calculations.
  - **Security Baseline**: 100% elimination of plaintext passwords via PBKDF2 hashing, verified Bearer tokens (`AuthToken`), and internal service tokens (`X-Internal-Token`).

### In Scope / Out of Scope
- **In Scope**:
  - Deconstruction into 5 independent Django services:
    - [Identity Service](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/services/identity) (Port `8001`, `db_identity`)
    - [Catalog Service](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/services/catalog) (Port `8002`, `db_catalog`)
    - [Orders Service](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/services/orders) (Port `8003`, `db_orders`)
    - [Fulfillment Service](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/services/fulfillment) (Port `8004`, `db_fulfillment`)
    - [Content Service](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/services/content) (Port `8005`, `db_content`)
  - [API Gateway](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/gateway) (Port `8000`) reverse proxy with correlation ID injection (`X-Correlation-ID`).
  - Expiring stock reservations (600-second TTL) with atomic `select_for_update()` locking and background hold sweeper command.
  - COD Checkout Saga orchestrator with automatic stock release compensation upon downstream failure.
  - Immutable purchase line item snapshots (`sku_snapshot`, `product_name_snapshot`, `variant_desc_snapshot`, `unit_price`).
  - Docker Compose multi-database PostgreSQL 16 containerization specification ([docker-compose.microservices.yml](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/docker-compose.microservices.yml)).
  - End-to-end integration test harness ([scripts/verify_microservices_e2e.py](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/scripts/verify_microservices_e2e.py)).
  - Merchant Web Console integration ([web/merchant/orders.js](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/web/merchant/orders.js)) wired dynamically to `GET /api/merchant/orders/`.
- **Out of Scope**:
  - Live third-party card/ewallet payment gateways (Stripe/PayMongo live processing - interface is isolated for COD saga with mock tokenization).
  - External Kubernetes or cloud multi-region deployment.
  - Rewriting the React Native mobile app UI components (interface bindings preserved).

### Constraints, Assumptions, and Dependencies
- **Constraint C-01**: Must maintain backwards compatibility with existing Expo mobile endpoints (`/api/v1/auth/`, `/api/v1/catalog/`, `/api/v1/orders/`, `/api/v1/fulfillment/`, `/api/v1/content/`).
- **Constraint C-02**: All monetary values must be stored and computed as integer Philippine Pesos (`PHP`).
- **Assumption A-01**: Cash-on-Delivery (COD) represents the primary checkout transaction flow for MetroDrip urban streetwear drops.
- **Assumption A-02**: Local microservice instances communicate over loopback IPv4 (`127.0.0.1`) in development to prevent Windows dual-stack IPv6 DNS resolution latency.
- **Dependency D-01**: Python 3.11+, Django 5.x, Django REST Framework.
- **Dependency D-02**: PostgreSQL 16 for production containerized deployment; SQLite per-service files for lightweight local development.

---

## 2. Requirements and Milestones

| ID | Functional / Nonfunctional Requirement | Acceptance and Failure Check | Owner | Status | Evidence |
|---|---|---|---|---|---|
| **FR-01** | PBKDF2 Password Hashing & Verifiable Tokens | Passwords hashed using PBKDF2; legacy plaintexts auto-upgraded upon login. Opaque `AuthToken` issued. | Identity Lead | **Completed** | [services/identity/identity/tests/test_identity.py](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/services/identity/identity/tests/test_identity.py) (11/11 tests pass) |
| **FR-02** | Catalog Quote Contracts & Atomic Stock Holds | Authoritative price quotes; atomic stock reservation with 600s TTL using row locks. | Catalog Lead | **Completed** | [services/catalog/catalog/tests/test_catalog.py](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/services/catalog/catalog/tests/test_catalog.py) (8/8 tests pass) |
| **FR-03** | COD Checkout Saga & Pure Purchase Snapshots | Multi-step saga orchestrating quote, stock hold, local order persistence, and commit. Snapshot line items isolate product changes. | Orders Lead | **Completed** | [services/orders/orders/tests/test_orders.py](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/services/orders/orders/tests/test_orders.py) (11/11 tests pass) |
| **FR-04** | Fulfillment Quotes, Shipments & Event Consumption | Shipping calculation by zone; idempotent `OrderPlaced` event consumption generating shipment waybills. | Fulfillment Lead | **Completed** | [services/fulfillment/fulfillment/tests/test_fulfillment.py](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/services/fulfillment/fulfillment/tests/test_fulfillment.py) (5/5 tests pass) |
| **FR-05** | Content CMS & Merchant Banner Management | Public active banner queries and authenticated merchant banner CRUD endpoints. | Content Lead | **Completed** | [services/content/content/tests/test_content.py](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/services/content/content/tests/test_content.py) (5/5 tests pass) |
| **FR-06** | Merchant Console Parity & Dynamic Orders | `web/merchant/orders.html` wired to live `GET /api/merchant/orders/`; fake mock arrays eliminated. | Frontend Lead | **Completed** | [web/merchant/orders.js](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/web/merchant/orders.js) & Phase 5 E2E script verification |
| **NFR-01** | Microservice Database Isolation | 5 independent databases with zero cross-app foreign keys or shared ORM models. | Architecture Lead | **Completed** | [database/init_microservices_postgresql.sql](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/database/init_microservices_postgresql.sql) |
| **NFR-02** | Whole-Peso Money Integrity | All prices, fees, and totals represented as integers; fractional/floating point rejected. | Architecture Lead | **Completed** | Saga verification & catalog price validation |
| **NFR-03** | Edge Routing & Distributed Tracing | Gateway injects `X-Correlation-ID` header; routes path prefixes to backend ports 8001–8005. | DevOps Lead | **Completed** | [gateway/gateway.py](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/gateway/gateway.py) & [gateway/test_gateway_routing.py](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/gateway/test_gateway_routing.py) (6/6 tests pass) |
| **NFR-04** | Containerized Multi-Service Deployment | Docker Compose orchestrating PostgreSQL 16 (5 databases), 5 microservice containers, and Nginx. | DevOps Lead | **Completed** | [docker-compose.microservices.yml](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/docker-compose.microservices.yml) |

---

## 3. Milestone Delivery Breakdown

```
[M1: Architecture & Isolation] ──► [M2: Service Extraction] ──► [M3: Saga & Event Flow] ──► [M4: Edge & Deployment] ──► [M5: E2E Verification]
        (Complete)                       (Complete)                     (Complete)                    (Complete)                  (Complete)
```

1. **Milestone 1: Architecture & Isolation (Completed)**
   - Created standalone Django projects and app configurations in `services/identity`, `services/catalog`, `services/orders`, `services/fulfillment`, `services/content`.
   - Scripted multi-database PostgreSQL 16 schema initialization ([database/init_microservices_postgresql.sql](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/database/init_microservices_postgresql.sql)).
   - Backed up monolithic database to `metrodrip_backend/db.sqlite3.baseline.bak`.

2. **Milestone 2: Service Logic & Security Extraction (Completed)**
   - Migrated identity authentication to PBKDF2 password hashing with legacy upgrade on login.
   - Built catalog quotes, variant inventory management, and atomic stock hold logic.
   - Built fulfillment shipping zones and quotes calculation.
   - Built content banner and contact inquiry endpoints.

3. **Milestone 3: COD Checkout Saga & Event Outbox (Completed)**
   - Implemented `orders/saga.py` orchestrating quote retrieval, 600s expiring stock holds, local order/line snapshot persistence, and atomic commit.
   - Implemented compensation rollback logic releasing holds if persistence fails.
   - Added Outbox event dispatching and fulfillment consumer command (`consume_order_placed`).

4. **Milestone 4: Gateway & Containerization (Completed)**
   - Implemented dev API Gateway in Python ([gateway/gateway.py](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/gateway/gateway.py)) and production Nginx configuration ([gateway/nginx.conf](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/gateway/nginx.conf)).
   - Formulated Docker Compose multi-service deployment ([docker-compose.microservices.yml](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/docker-compose.microservices.yml)).

5. **Milestone 5: End-to-End Verification & Parity (Completed)**
   - Wrote automated 46-test unit and contract test suites across all 5 services and gateway.
   - Created automated 5-phase E2E integration test script ([scripts/verify_microservices_e2e.py](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/scripts/verify_microservices_e2e.py)) verifying full live checkout, inventory decrement, merchant console parity, and stock release sweeper.

---

## 4. Risk Register

| ID | Risk | Likelihood | Impact | Early Signal | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|
| **R-01** | Inventory overselling during concurrent drop events | Medium | High | Hold failures, race conditions on stock decrements | Implement atomic `select_for_update()` row-level locks on stock holds; enforce strict 600s TTL holds | Catalog Lead | **Mitigated / Closed** |
| **R-02** | Partial failure during distributed checkout leaving orphaned holds | Medium | Medium | Abandoned checkouts keeping inventory unavailable | Built compensating release in saga exception handlers; created automated hold sweeper command | Orders Lead | **Mitigated / Closed** |
| **R-03** | Windows local dev IPv6 connection latency (2000ms delay) | High | Medium | Slow test execution or inter-service HTTP timeouts | Explicitly bind all dev servers and inter-service HTTP requests to IPv4 loopback `127.0.0.1` | DevOps Lead | **Mitigated / Closed** |
| **R-04** | Client-side price tampering during order placement | Low | High | Orders submitted with modified unit prices or totals | Orders service unconditionally ignores client prices; fetches authoritative versioned quotes from Catalog and Fulfillment | Orders Lead | **Mitigated / Closed** |
