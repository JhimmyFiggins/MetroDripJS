# MetroDripJS: Microservices Architecture & Engineering Handbook

> **Release status: HOLD.** The [current QA report](Project%20Guidelines/QA%20Report%202026-09-27.md), finalized 2026-09-28, supersedes historical completion claims and test counts below. Staff authentication and event/recovery automation remain incomplete; native and PostgreSQL verification are blocked.

MetroDripJS is an urban streetwear e-commerce platform built with React Native/Expo (mobile client), vanilla HTML/JS merchant/admin consoles, and a distributed backend consisting of **five independently deployable Django microservices** routed through an **API Gateway**.

---

## 1. Architecture Overview

MetroDripJS decomposes its monolithic backend into five bounded contexts with private databases, dedicated migrations, zero cross-app ORM imports, and snapshot-based contracts:

```
                          ┌──────────────────────────┐
                          │   Client Applications    │
                          │ Expo Mobile / Web Console│
                          └─────────────┬────────────┘
                                        │ (Port 8000)
                                        ▼
                          ┌──────────────────────────┐
                          │    Edge / API Gateway    │
                          │ Nginx / Python Gateway   │
                          └─────────────┬────────────┘
                                        │
        ┌──────────────┬────────────────┼──────────────┬──────────────┐
        │ :8001        │ :8002          │ :8003        │ :8004        │ :8005
        ▼              ▼                ▼              ▼              ▼
┌──────────────┐┌──────────────┐ ┌──────────────┐┌──────────────┐┌──────────────┐
│   Identity   ││   Catalog    │ │    Orders    ││ Fulfillment  ││   Content    │
│   Service    ││   Service    │ │   Service    ││   Service    ││   Service    │
└──────┬───────┘└──────┬───────┘ └──────┬───────┘└──────┬───────┘└──────┬───────┘
       ▼               ▼                ▼               ▼               ▼
┌──────────────┐┌──────────────┐ ┌──────────────┐┌──────────────┐┌──────────────┐
│ db_identity  ││  db_catalog  │ │  db_orders   ││db_fulfillment││  db_content  │
└──────────────┘└──────────────┘ └──────────────┘└──────────────┘└──────────────┘
```

---

## 2. Service Matrix & Responsibilities

| Service | Port | Database | Primary Responsibility | Directory |
| --- | --- | --- | --- | --- |
| **API Gateway** | `8000` | N/A (Edge) | Reverse proxy, path routing, `X-Correlation-ID` injection | `gateway/` |
| **Identity** | `8001` | `db_identity` | Accounts, PBKDF2 password hashing, AuthTokens, RBAC | `services/identity/` |
| **Catalog** | `8002` | `db_catalog` | Categories, products, variants, quotes, stock reservations | `services/catalog/` |
| **Orders** | `8003` | `db_orders` | COD saga orchestration, immutable snapshots, outbox, reviews | `services/orders/` |
| **Fulfillment** | `8004` | `db_fulfillment` | Shipping quotes, zones, shipments, notifications | `services/fulfillment/` |
| **Content** | `8005` | `db_content` | Homepage banners, contact inquiries, CMS | `services/content/` |

---

## 3. Core Architectural Decisions

### Data Isolation & Snapshots
- **No Shared ORM Models**: No service imports models from another service.
- **Reference IDs**: Cross-boundary references (`customer_ref`, `product_ref`, `variant_ref`) are indexed integers without database-level foreign keys.
- **Immutable Purchase Snapshots**: `OrdersOrderLine` preserves historical `sku_snapshot`, `product_name_snapshot`, `variant_desc_snapshot`, and `unit_price` at purchase time.

### Money Contract
- **Whole PHP Pesos**: All prices, subtotal, shipping, discounts, and totals are authoritative integers representing whole Philippine Pesos (`₱`). Fractional centavos and floating-point inaccuracies are strictly prevented.

### COD Checkout Saga & Recovery
1. **Client Request**: Client submits variant IDs, quantities, address, and an idempotency key to Orders through Gateway. Client-calculated prices and status are rejected.
2. **Authoritative Quotes**: Orders queries Catalog for versioned product quotes and Fulfillment for shipping zone fees.
3. **Expiring Stock Holds**: Orders commands Catalog to reserve stock under a unique `checkout_id` (600s TTL). Catalog performs atomic `select_for_update()` locking.
4. **Local Order Persistence**: Orders commits order, line snapshots, pending-collection COD payment, stock hold record, and an outbox message in one local atomic transaction.
5. **Stock Commit**: Orders issues an idempotent commit to Catalog. Only a confirmed commit publishes `OrderPlaced`. If persistence fails, a compensation release restores held stock.
6. **Event Consumption**: Fulfillment consumes `OrderPlaced` idempotently, generating shipment waybills and customer notifications without duplicates.

### Security & Authentication
- **PBKDF2 Password Hashing**: Plaintext password storage and logging are removed. Legacy passwords auto-upgrade to PBKDF2 hashes upon successful authentication.
- **Verifiable Tokens**: Identity issues opaque `AuthToken` credentials (`Authorization: Bearer <token>`).
- **Internal Service Mesh**: Intra-service HTTP calls use private tokens (`X-Internal-Token`) with mutual authorization.

---

## 4. Getting Started

### Prerequisites
- Python 3.11+
- Node.js 20+ & npm (for mobile/web clients)
- Docker & Docker Compose (optional for containerized deployment)

### Automated Verification Run
Execute the complete end-to-end test verifying all 5 services, the gateway, security, stock holds, COD checkout saga, and merchant console parity:

```powershell
metrodrip_backend\.venv\Scripts\python.exe scripts\verify_microservices_e2e.py
```

### Running Microservices Individually

```powershell
# 1. Identity Service (Port 8001)
cd services\identity
..\..\metrodrip_backend\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8001 --noreload

# 2. Catalog Service (Port 8002)
cd services\catalog
..\..\metrodrip_backend\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8002 --noreload

# 3. Orders Service (Port 8003)
cd services\orders
..\..\metrodrip_backend\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8003 --noreload

# 4. Fulfillment Service (Port 8004)
cd services\fulfillment
..\..\metrodrip_backend\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8004 --noreload

# 5. Content Service (Port 8005)
cd services\content
..\..\metrodrip_backend\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8005 --noreload

# 6. API Gateway (Port 8000)
python gateway\gateway.py
```

### Running with Docker Compose (PostgreSQL 16 Multi-Database)

```sh
# Start PostgreSQL, all 5 microservices, and Nginx edge gateway
docker compose -f docker-compose.microservices.yml up --build -d

# Verify aggregated health status
curl -i http://localhost:8000/health/
```

---

## 5. Test Evidence & Quality Assurance

All microservices and gateway route specifications are verified with 100% pass rates:

| Test Suite | Location | Tests | Status |
| --- | --- | --- | --- |
| **Identity Service** | `services/identity/identity/tests/` | 11 | **11/11 PASSED** |
| **Catalog Service** | `services/catalog/catalog/tests/` | 8 | **8/8 PASSED** |
| **Orders Service** | `services/orders/orders/tests/` | 11 | **11/11 PASSED** |
| **Fulfillment Service** | `services/fulfillment/fulfillment/tests/` | 5 | **5/5 PASSED** |
| **Content Service** | `services/content/content/tests/` | 5 | **5/5 PASSED** |
| **Gateway Routing** | `gateway/test_gateway_routing.py` | 6 | **6/6 PASSED** |
| **End-to-End Saga & UI** | `scripts/verify_microservices_e2e.py` | 5 Phases | **5/5 PHASES PASSED** |
| **Total Automated Tests** | | **46** | **46/46 (0 failures)** |

---

## 6. Runbook & Disaster Recovery

### Expired Holds Sweeper
If reservations are abandoned before checkout completion, run the catalog hold sweeper:
```powershell
cd services\catalog
..\..\metrodrip_backend\.venv\Scripts\python.exe manage.py release_expired_holds
```

### Database Backup & Restore
- Baseline monolithic database backup: `metrodrip_backend/db.sqlite3.baseline.bak`
- PostgreSQL role initialization & schema creation script: `database/init_microservices_postgresql.sql`
- Each service manages its independent SQLite database for development (`db_identity.sqlite3`, `db_catalog.sqlite3`, `db_orders.sqlite3`, `db_fulfillment.sqlite3`, `db_content.sqlite3`) and independent PostgreSQL database credentials for production.

### Merchant Console Parity
- The merchant console at `web/merchant/orders.html` is dynamically wired to `GET /api/merchant/orders/`.
- All hardcoded operational fallback orders have been purged; the UI reflects authoritative server state.

---

## 7. Project Guidelines Documentation

Detailed, verified technical specifications based on [AGENTS.md](AGENTS.md) are maintained in the [`Project Guidelines/`](Project%20Guidelines/) directory:

1. [Plan and Goals](Project%20Guidelines/Plan%20and%20Goals.md) — Scope, personas, non-goals, functional/non-functional requirements, milestones, and risk register.
2. [Design Prototype](Project%20Guidelines/Design%20Prototype.md) — User journeys (M01–M08), Figma canvas bindings, design tokens (Volt/Ink/Paper), adaptive responsive layouts, and WCAG standards.
3. [Database Structure](Project%20Guidelines/Database%20Structure.md) — 5 isolated database schemas (`db_identity`, `db_catalog`, `db_orders`, `db_fulfillment`, `db_content`), elimination of cross-boundary foreign keys, immutable purchase snapshots, and PostgreSQL 16 configs.
4. [Backend Functionalities](Project%20Guidelines/Backend%20Functionalities.md) — Full API contract matrix, PBKDF2 authentication, orchestrated COD Checkout Saga, expiring stock holds (600s TTL), and outbox event streaming.
5. [Architecture and Operations](Project%20Guidelines/Architecture%20and%20Operations.md) — Container topology, port allocations (8000–8005), Docker Compose deployment, Nginx edge routing, and operational runbooks.
6. [Verification and Evaluation](Project%20Guidelines/Verification%20and%20Evaluation.md) — Test execution commands, 46/46 unit tests passing matrix, 5-phase E2E saga verification, and negative test evidence.
7. [Decisions and Handover](Project%20Guidelines/Decisions%20and%20Handover.md) — Architecture Decision Records (ADR-01 to ADR-06), resume snapshot, exact file paths, and cold-start continuation instructions.
8. [AI Documentation Notes](Project%20Guidelines/AI%20Documentation%20Notes.md) — Compact retrieval map for locating authoritative project knowledge.
9. [Tech Stack Setup Guide](Project%20Guidelines/Tech%20Stack%20Setup%20Guide.md) — Local setup, service launch, and troubleshooting guidance, with an [interactive companion](Project%20Guidelines/tech-stack-setup.html).
