# MetroDripJS

> **Release status: HOLD.** The approved target is one secured modular Django monolith on **one Render Free web service and one Render Free PostgreSQL database**, with no paid worker, cron, Redis/Key Value, disk, autoscaling, or plan upgrade. Checkout retains COD and adds PayMongo Hosted Checkout for available GCash, Maya, and card methods. See the controlling [plan](Project%20Guidelines/Plan%20and%20Goals.md), [architecture](Project%20Guidelines/Architecture%20and%20Operations.md), [backend contract](Project%20Guidelines/Backend%20Functionalities.md), [database plan](Project%20Guidelines/Database%20Structure.md), and [ADRs](Project%20Guidelines/Decisions%20and%20Handover.md#active-architecture-decisions--2026-09-28).

MetroDripJS is an urban streetwear e-commerce platform with an Expo/React Native customer app and responsive merchant/admin web consoles. The active implementation path is `metrodrip_backend/`: one Django/DRF process containing identity, catalog, orders/payments, fulfillment, content, and staff-console APIs. Local development defaults to SQLite; the unapplied Render Blueprint wires that same application to one free PostgreSQL database.

## Current modular-monolith setup

### Backend

```powershell
cd metrodrip_backend
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 127.0.0.1:8000
```

The health endpoint is `GET http://127.0.0.1:8000/health/`. Local SQLite is convenient for development and focused tests, but it does not verify PostgreSQL row locking, query plans, migration rollback, or production concurrency.

### Staff accounts and consoles

Create staff accounts through the interactive command; do not use browser-selected roles or seeded identities as access control:

```powershell
cd metrodrip_backend
python manage.py provision_staff --email admin@example.com --name "MetroDrip Admin" --role admin
python manage.py provision_staff --email merchant@example.com --name "MetroDrip Merchant" --role merchant
```

In another terminal, serve the consoles:

```powershell
npm ci
npm run dev
```

Open the merchant or administrator login under `http://127.0.0.1:3000/Registration/screens/`. Both post credentials to `POST /login/`. Successful staff login returns an opaque bearer token plus the persisted `role` and `is_staff` values. The browser keeps the current account only in `sessionStorage`, sends `Authorization: Bearer <token>` to console APIs, and calls the role-specific logout endpoint to revoke the token. Server permissions currently enforce a coarse persisted-role boundary: `admin` for administrator APIs and `merchant` or `admin` for merchant APIs. Store-scoped ABAC, MFA challenges, and recent-authentication gates are not implemented and remain release work.

### Checkout and online payments

Authenticated customers submit `POST /api/orders/checkout/` with `idempotency_key` in JSON, cart variant IDs/quantities, a Philippine shipping address, a delivery zone, and `payment_method` set to `cod`, `gcash`, `maya`, or `card`. Prices, shipping, currency, and stock are calculated by the server. Online methods create a PayMongo Hosted Checkout action; MetroDrip does not collect PAN, CVV, wallet credentials, PINs, or OTPs. A return page is informational only—payment becomes paid only after a verified provider result is applied by the signed webhook or bounded owned-order reconciliation.

PayMongo secrets are optional for COD-only local work and must stay in environment variables. Live provider capability, native browser/deep-link return, and real charges/refunds are **UNVERIFIED** and are not authorized by this repository setup.

### Current verification commands

```powershell
cd metrodrip_backend
python manage.py test
python manage.py check --deploy
python manage.py makemigrations --check

cd ..
npm run test:client
npx tsc --noEmit
```

For the mocked Chromium console harness, first start `npm run dev`, then run `npm run test:browser` in another terminal. It checks responsive layouts and representative loading, default, empty, partial-failure, failed-write/retry, development-fixture, permission, Escape, focus-return, and Tab-containment behavior. APIs are mocked; this is not browser-to-Django integration evidence. Final rerun results belong in [Verification and Evaluation](Project%20Guidelines/Verification%20and%20Evaluation.md).

### Free-tier deployment boundary

[`render.yaml`](render.yaml) is a review-only, unapplied Blueprint: previews are off, automatic deploys are off, and it declares exactly one free web service plus one free PostgreSQL database. No paid Render change is authorized. Render's free PostgreSQL lifecycle and missing managed backup guarantees make durable production storage a release **HOLD**; do not apply a paid upgrade as a workaround without new approval.

## Historical five-service reference

The repository also retains a separately tested five-service/gateway baseline under `services/`, `gateway/`, and `docker-compose.microservices.yml`. It is migration and regression evidence only. Conflicting production-topology, payment-exclusion, worker/cron, and five-database statements below are superseded by the linked 2026-09-28 ADRs.

---

### Historical architecture overview

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

### Historical service matrix and responsibilities

| Service | Port | Database | Primary Responsibility | Directory |
| --- | --- | --- | --- | --- |
| **API Gateway** | `8000` | N/A (Edge) | Reverse proxy, path routing, `X-Correlation-ID` injection | `gateway/` |
| **Identity** | `8001` | `db_identity` | Accounts, PBKDF2 password hashing, AuthTokens, RBAC | `services/identity/` |
| **Catalog** | `8002` | `db_catalog` | Categories, products, variants, quotes, stock reservations | `services/catalog/` |
| **Orders** | `8003` | `db_orders` | COD saga orchestration, immutable snapshots, outbox, reviews | `services/orders/` |
| **Fulfillment** | `8004` | `db_fulfillment` | Shipping quotes, zones, shipments, notifications | `services/fulfillment/` |
| **Content** | `8005` | `db_content` | Homepage banners, contact inquiries, CMS | `services/content/` |

---

### Historical architectural decisions

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

### Historical environment startup

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

### Historical test evidence and quality assurance

The following dated results cover the historical five-service baseline only and do not verify the active monolith, PostgreSQL, PayMongo, native clients, or Render:

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

### Historical runbook and disaster recovery

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

## Project Guidelines documentation

Authoritative project specifications and evidence statuses based on [AGENTS.md](AGENTS.md) are maintained in the [`Project Guidelines/`](Project%20Guidelines/) directory:

1. [Plan and Goals](Project%20Guidelines/Plan%20and%20Goals.md) — Scope, personas, non-goals, functional/non-functional requirements, milestones, and risk register.
2. [Design Prototype](Project%20Guidelines/Design%20Prototype.md) — User journeys (M01–M08), Figma canvas bindings, design tokens (Volt/Ink/Paper), adaptive responsive layouts, and WCAG standards.
3. [Database Structure](Project%20Guidelines/Database%20Structure.md) — Current additive checkout/payment/inventory migrations, target PostgreSQL validation, indexes, lifecycle, and recovery gaps.
4. [Backend Functionalities](Project%20Guidelines/Backend%20Functionalities.md) — Current endpoint shapes, opaque bearer authentication, staff role boundary, Hosted Checkout, webhook verification, expiry, and reconciliation behavior.
5. [Architecture and Operations](Project%20Guidelines/Architecture%20and%20Operations.md) — Current modular-monolith topology, free-only Blueprint, security limits, operations, and rollback.
6. [Verification and Evaluation](Project%20Guidelines/Verification%20and%20Evaluation.md) — Current rerun matrix separated from historical tests and external/native/live gaps.
7. [Decisions and Handover](Project%20Guidelines/Decisions%20and%20Handover.md) — Active ADRs, implementation snapshot, exact paths, blockers, and cold-start continuation instructions.
8. [AI Documentation Notes](Project%20Guidelines/AI%20Documentation%20Notes.md) — Compact retrieval map for locating authoritative project knowledge.
9. [Tech Stack Setup Guide](Project%20Guidelines/Tech%20Stack%20Setup%20Guide.md) — Local setup, service launch, and troubleshooting guidance, with an [interactive companion](Project%20Guidelines/tech-stack-setup.html).
