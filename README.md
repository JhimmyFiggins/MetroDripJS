# MetroDripJS

> **Academic-demo and production status: HOLD.** All local unit, invariant, integration, Playwright browser, accessibility (WCAG 2.1 AA), and multiplatform bundle compilation checks are **VERIFIED and PASSING** (as of 2026-11-03). Production release and live demo remain on **HOLD** pending physical Android/iOS device execution, live PayMongo payment charges, and stakeholder data retention sign-off. See the [QA Report](docs/qa/QA-REPORT.md), [Test Results](docs/qa/TEST-RESULTS.md), and [Current Verification & Evaluation](Project%20Guidelines/Verification%20and%20Evaluation.md).

MetroDripJS is an urban streetwear e-commerce platform featuring an Expo/React Native customer mobile app, responsive web consoles for merchants and administrators, and a modular monolithic Django REST Framework backend.

---

## 1. System Architecture & Tech Stack

```
                                  ┌─────────────────────────────┐
                                  │     Client Applications     │
                                  ├──────────────┬──────────────┤
                                  │ Web Consoles │ Expo Mobile  │
                                  │ (Admin/Merch/│ (Android/iOS/│
                                  │  Storefront) │  Web Bundle) │
                                  └──────┬───────┴──────┬───────┘
                                         │              │
                                         ▼              ▼
                              ┌──────────────────────────────────┐
                              │  Development Reverse Proxy       │
                              │  web/dev_server.py (:3000)       │
                              └──────────────────┬───────────────┘
                                                 │
                                                 ▼
                              ┌──────────────────────────────────┐
                              │  Modular Monolith API Backend    │
                              │  Django 6.1.2 / DRF 3.18.3       │
                              │  metrodrip_backend/ (:8000)      │
                              ├──────────────────────────────────┤
                              │ • identity   • catalog           │
                              │ • orders     • fulfillment       │
                              │ • content                        │
                              └──────────────────┬───────────────┘
                                                 │
                                                 ▼
                              ┌──────────────────────────────────┐
                              │  Database                        │
                              │  SQLite (dev) / PostgreSQL (prod)│
                              └──────────────────────────────────┘
```

- **Backend**: Python 3.12, Django 6.1.2, Django REST Framework 3.18.3, WhiteNoise, Psycopg 3.
- **Frontend Consoles & Storefront**: HTML5, Vanilla ES6 JavaScript, CSS Custom Properties (Light/Dark themes), Axe Core accessibility tooling.
- **Mobile Application**: React Native 0.81.5, Expo SDK 54, React 19.1.0, React Navigation 7, EAS Build (Android standalone APK).
- **Payment Gateway**: PayMongo Hosted Checkout v2 (GCash, Maya, Card, QR Ph) with HMAC-SHA256 signature-verified webhooks.
- **Transactional Communication**: Brevo (formerly Sendinblue) transactional email API for OTP and password recovery.

---

## 2. Applications in Scope

### A. Admin Console (`web/admin/`)
- **Dashboard & Platform Metrics**: Global GMV, user volume, merchant accounts, and active orders (`/api/admin/dashboard/`).
- **User Directory**: Search, filter, inspect status, view 2FA enablement, and provision staff (`/api/admin/users/`).
- **Roles & Permissions**: Granular capability toggles, base role inheritance, and custom role creation (`/api/admin/roles/`).
- **Platform Configuration**: Self-service registration toggles, OTP enforcement settings, maintenance alerts (`/api/admin/settings/`).
- **Audit Trails**: Security event logs, IP logging, and CSV exports (`/api/admin/audit-logs/`).
- **Account Management**: Password updates, multi-factor authentication setup, and session revocation.

### B. Merchant Console (`web/merchant/`)
- **Dashboard & Performance**: Daily store revenue, pending orders, and inventory restock alerts (`/api/merchant/dashboard/`).
- **Product & Variation Catalog**: SKU generation, multi-attribute matrices (Size/Color), base pricing, and status management (`/api/merchant/products/`).
- **Gallery & Media Manager**: Drag-and-drop sort orders, primary image badges, and automatic MIME validation.
- **Bulk Actions**: Batch product activation, deactivation, stock adjustment, category reassignment, and deletion (`/api/merchant/products/bulk/`).
- **Inventory Control**: Warehouse stock levels, reservations holds, and movements log (`/api/merchant/inventory/`).
- **Orders & Fulfillment**: Order status transitions (`placed`, `packed`, `shipped`, `delivered`), cancellation workflows, and shipment waybills (`/api/merchant/orders/`).
- **Shipping Zones & Rates**: Zone fee configuration and address validation test checker (`/api/merchant/shipping-zones/`).
- **Customer Reviews Moderation**: Storefront review monitoring and merchant replies (`/api/merchant/reviews/`).
- **Content & Banners CMS**: 5 placement locations (`announcement_bar`, `homepage_hero`, `homepage_secondary`, `category_banner`, `checkout_footer`), graphic typography vs image mode, and live preview simulator (`/api/merchant/banners/`).

### C. Customer Web Storefront (`web/customer/`)
- **Discovery & Navigation**: Dynamic Shop and Discover dropdowns powered by `GET /categories/` and `featured=1` filters.
- **Product Browsing & Details**: Search, category filters, variant selectors, stock availability, and image fallbacks.
- **Shopping Cart**: Real-time quantity updates, cart item removal, price estimate, and "Calculated at checkout" shipping disclosure.
- **Checkout & Payments**: Server-authoritative totals, delivery zone fee calculation, COD placement, and PayMongo Hosted Checkout v2 linking.
- **Customer Account & Security**: Personal information management, order history, tracking snapshots, and password-confirmed self-service account closure (`POST /account/close/`).
- **Our Team Page**: Verified 5-member development team showcase with academic TIP affiliation, accurate technology responsibilities, and light/dark theme-aware branding.

### D. Customer Mobile Application (`mobile/`, `src/`)
- **Cross-Platform Expo Native**: Feature parity with web storefront across browsing, cart, checkout, orders, notifications, and profile management.
- **Centralized Data & Services**: Shared `teamData.js`, centralized `apiClient.js` with cross-origin credential protection, and reactive `CartContext` / `AuthContext`.
- **Stand-alone Android APK**: Build configuration via EAS CLI (`eas.json` preview profile) with zero cleartext traffic.

---

## 3. Local Development Setup

### Prerequisites
- Python 3.12+
- Node.js 20+ & npm 10+
- Google Chrome or Chromium (for Playwright browser test suites)

### A. Backend Setup

```bash
cd metrodrip_backend
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 127.0.0.1:8000
```

The health check endpoint is accessible at `GET http://127.0.0.1:8000/health/`.

### B. Staff Account Provisioning
Provision administrative or merchant accounts using the secure command-line tool (never seed credentials in migrations or source code):

```bash
cd metrodrip_backend
python manage.py provision_staff --email admin@example.com --name "MetroDrip Admin" --role admin
python manage.py provision_staff --email merchant@example.com --name "MetroDrip Merchant" --role merchant
```

### C. Web Consoles & Customer Storefront

```bash
# In the project root directory
npm install
BACKEND_URL=http://127.0.0.1:8000 npm run dev
```

- Staff Login: `http://127.0.0.1:3000/Registration/screens/`
- Customer Storefront: `http://127.0.0.1:3000/customer/`
- Our Team Page: `http://127.0.0.1:3000/customer/team`

### D. Mobile App Development

```bash
# Start Expo development server
npm start

# Run in Web browser
npm run web

# Export multiplatform bundle
npx expo export --platform all
```

---

## 4. Automated Testing & Quality Assurance

All suites run against disposable databases or mocked endpoints to ensure safety.

```bash
# 1. Run all Node.js client service & invariant unit tests (250 tests)
npm run test:client

# 2. Run Django modular monolith backend tests (246 tests)
cd metrodrip_backend
python manage.py test --pattern="tests*.py"
cd ..

# 3. TypeScript static type validation
npx tsc --noEmit

# 4. Django migration schema consistency check
python metrodrip_backend/manage.py makemigrations --check

# 5. Expo SDK health and dependency check
npx expo-doctor

# 6. Playwright browser E2E suites (dev server running on :3000)
npm run test:browser              # Console layout, dialog focus & keyboard containment (64 checks)
npm run test:customer             # Customer public-page Axe scans and responsive navigation
npm run test:merchant:catalog     # Merchant catalog, variation modals & media manager
npm run test:merchant:banners     # Banner CMS, 5 placements & artwork customization
npm run test:qa:banners-theme     # Banner synchronization & theme switching across 6 screens
node tests/browser/run-admin-roles-qa.mjs       # Granular RBAC permissions & custom role creation
node tests/browser/run-admin-users-qa.mjs       # Admin users directory & 2FA indicators
node tests/browser/run-shipping-zones-qa.mjs    # Responsive shipping zones & address checker
node tests/browser/run-team-page.mjs            # Our Team page & theme logo visibility
node tests/browser/verify-live-svg.mjs          # Favicon SVG pixel rendering test

# 7. Disposable live browser end-to-end integration workflows
QA_MANAGE_SERVERS=1 QA_DATABASE_URL=sqlite:////tmp/disposable-qa.sqlite3 QA_STAFF_PASSWORD='TestPassword123!' node tests/browser/run-console-integration.mjs
QA_DISPOSABLE_DB=1 EMAIL_OTP_ENFORCED=false QA_WEB_BASE=http://127.0.0.1:3011 node tests/browser/run-customer-live-account.mjs
QA_DISPOSABLE_DB=1 QA_WEB_BASE=http://127.0.0.1:3011 node tests/browser/run-customer-live-checkout.mjs

# 8. Performance and local concurrency probe
QA_PYTHON=./metrodrip_backend/.venv/bin/python QA_DATABASE_URL=sqlite:////tmp/disposable-qa.sqlite3 npm run test:load:local
```

---

## 5. Comprehensive QA Documentation

Authoritative QA logs, test evidence, and integration reports are maintained in the [`docs/qa/`](docs/qa/) directory:
- [QA Execution Report](docs/qa/QA-REPORT.md) — Executive summary, subsystem audit outcomes, and security analysis.
- [Test Plan](docs/qa/TEST-PLAN.md) — Multi-tier test strategy, environments, and entry/exit criteria.
- [Test Results Log](docs/qa/TEST-RESULTS.md) — Comprehensive execution logs across all 24 suites.
- [Bug Fix & Remediation Log](docs/qa/BUG-FIX-LOG.md) — Root causes, code diffs, and verification steps for remediated defects.
- [Cross-Platform Feature Parity](docs/qa/FEATURE-PARITY.md) — Feature-by-feature parity matrix between Customer Website and Mobile App.
- [API Integration Audit](docs/qa/API-INTEGRATION-AUDIT.md) — Internal and external API inventory, auth scopes, and PayMongo/Brevo boundaries.

---

## 6. Security, Payment & Privacy Governance

- **Zero PAN/CVV Collection**: MetroDrip never handles, stores, or logs raw credit card numbers, CVVs, bank PINs, or wallet credentials.
- **PayMongo Hosted Checkout v2**: Customers transact directly on PayMongo's secure domain (`checkout.paymongo.com`). Orders transition to `paid` strictly upon cryptographically verified HMAC-SHA256 webhooks or server reconciliation.
- **Idempotency Keys**: Order checkouts require unique client-provided idempotency keys to eliminate duplicate orders or multiple charges on flaky connections.
- **Throttling & Rate Limiting**: Sensitive operations (login, registration, password recovery, account closure) enforce strict database-backed sliding-window rate limiters.
- **Account Closure & Data Retention**: Account deletion requests (`POST /account/close/`) require password confirmation and explicit phrase typing. The service immediately invalidates tokens, anonymizes personal profiles, and deletes wishlists/reviews, while retaining historical orders, payment references, and audit logs to comply with Philippine accounting regulations (BIR RR 5-2014) and Data Privacy Act requirements.

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

1. [Comprehensive Repository Audit and Academic Demo Plan — 2026-10-19](Project%20Guidelines/Comprehensive%20Repository%20Audit%20and%20Academic%20Demo%20Plan%20-%202026-10-19.md) — Current whole-repository findings, remediation phases, free-tier strategy, verification checklist, and demo runbook.
2. [Plan and Goals](Project%20Guidelines/Plan%20and%20Goals.md) — Scope, personas, non-goals, functional/non-functional requirements, milestones, and risk register.
3. [Design Prototype](Project%20Guidelines/Design%20Prototype.md) — User journeys (M01–M08), Figma canvas bindings, design tokens (Volt/Ink/Paper), adaptive responsive layouts, and WCAG standards.
4. [Database Structure](Project%20Guidelines/Database%20Structure.md) — Current additive checkout/payment/inventory migrations, target PostgreSQL validation, indexes, lifecycle, and recovery gaps.
5. [Backend Functionalities](Project%20Guidelines/Backend%20Functionalities.md) — Current endpoint shapes, opaque bearer authentication, staff role boundary, Hosted Checkout, webhook verification, expiry, and reconciliation behavior.
6. [Architecture and Operations](Project%20Guidelines/Architecture%20and%20Operations.md) — Current modular-monolith topology, free-only Blueprint, security limits, operations, and rollback.
7. [Verification and Evaluation](Project%20Guidelines/Verification%20and%20Evaluation.md) — Current rerun matrix separated from historical tests and external/native/live gaps.
8. [Decisions and Handover](Project%20Guidelines/Decisions%20and%20Handover.md) — Active ADRs, implementation snapshot, exact paths, blockers, and cold-start continuation instructions.
9. [AI Documentation Notes](Project%20Guidelines/AI%20Documentation%20Notes.md) — Compact retrieval map for locating authoritative project knowledge.
10. [Tech Stack Setup Guide](Project%20Guidelines/Tech%20Stack%20Setup%20Guide.md) — Local setup, service launch, and troubleshooting guidance, with an [interactive companion](Project%20Guidelines/tech-stack-setup.html).
11. [QA Audit and Implementation Report — 2026-10-11](Project%20Guidelines/QA%20Audit%20and%20Implementation%20Report%20-%202026-10-11.md) — Prior dated audit, implemented fixes, measured evidence, residual risks, and release blockers.
