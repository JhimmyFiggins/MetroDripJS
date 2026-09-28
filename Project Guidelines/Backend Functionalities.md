# Backend Functionalities

**Status:** Verified & Implemented Service API Suite  
**Project:** MetroDripJS Urban Streetwear E-Commerce Platform  
**Architecture:** Distributed Event-Driven Microservices + Orchestrated COD Checkout Saga  
**Gateway Prefix:** `http://localhost:8000/api/`  
**Date:** 2026-09-27  

---

## 1. Use Cases and API Contracts

```
                       ┌────────────────────────────┐
                       │    Edge / API Gateway      │
                       │    http://localhost:8000   │
                       └─────────────┬──────────────┘
                                     │
    ┌─────────────────┬──────────────┼──────────────┬─────────────────┐
    │ /api/v1/auth/   │ /api/v1/cata │ /api/v1/order│ /api/v1/fulfill │ /api/v1/content/
    ▼                 ▼              ▼              ▼                 ▼
┌──────────────┐┌──────────────┐┌──────────────┐┌──────────────┐┌──────────────┐
│   Identity   ││   Catalog    ││    Orders    ││ Fulfillment  ││   Content    │
│  (Port 8001) ││  (Port 8002) ││  (Port 8003) ││  (Port 8004) ││  (Port 8005) │
└──────────────┘└──────────────┘└──────────────┘└──────────────┘└──────────────┘
```

| Use Case / Endpoint | Method & Path | Input Payload Contract | Output Response Contract | Authn & Authz | Validation & Error Behavior | Idempotency & Concurrency | Owner |
|---|---|---|---|---|---|---|---|
| **Customer Login** | `POST /api/v1/auth/login/` | `{"email": str, "password": str}` | `{"token": str, "account": {...}}` | Public | Rejects missing/invalid credentials (`400`/`401`). Auto-upgrades legacy plaintext to PBKDF2. | Stateless login | Identity |
| **Customer Register** | `POST /api/v1/auth/register/` | `{"email": str, "password": str, "name": str}` | `{"token": str, "account": {...}}` | Public | Enforces unique email, password complexity. Hashes via PBKDF2 (`400` on duplicate). | Unique email constraint | Identity |
| **Fetch Current Account**| `GET /api/v1/auth/me/` | None | `{"id": int, "email": str, "role": str}` | Bearer Token | `401 Unauthorized` on missing or expired token. | Read-only | Identity |
| **List Catalog Products**| `GET /api/v1/catalog/products/`| Query params: `?category=slug` | `[{"id": int, "name": str, "base_price": int, "variants": [...]}]` | Public | Returns active products only. Whole-peso integer prices. | Read-only | Catalog |
| **Fetch Product Quotes** | `POST /api/v1/catalog/quotes/` | `{"items": [{"variant_id": int, "quantity": int}]}` | `{"items": [{"variant_id": int, "unit_price": int, ...}], "subtotal": int}` | Internal (`X-Internal-Token`) or Public | Validates variant existence and active status. Returns authoritative prices. | Read-only quote | Catalog |
| **Reserve Stock Hold** | `POST /api/v1/catalog/holds/reserve/` | `{"checkout_id": str, "items": [{"variant_id": int, "quantity": int}]}` | `{"status": "reserved", "expires_at": str}` | Internal (`X-Internal-Token`) | Rejects if `available_stock < requested` (`409 Conflict`). Sets 600s TTL. | Atomic `select_for_update()` | Catalog |
| **Commit Stock Hold** | `POST /api/v1/catalog/holds/commit/` | `{"checkout_id": str}` | `{"status": "committed"}` | Internal (`X-Internal-Token`) | Permanently decrements variant inventory; marks hold committed. | Idempotent on `checkout_id` | Catalog |
| **Release Stock Hold** | `POST /api/v1/catalog/holds/release/` | `{"checkout_id": str}` | `{"status": "released"}` | Internal (`X-Internal-Token`) | Marks hold released; returns held units to available pool. | Idempotent on `checkout_id` | Catalog |
| **Place COD Order** | `POST /api/v1/orders/checkout/` | `{"items": [...], "shipping_address": {...}, "zone_code": str}` | `{"order_number": str, "total_amount": int, "status": "pending"}` | Bearer Token optional (guest/auth) | Client prices ignored. Fails if inventory exhausted or zone invalid. | Header: `Idempotency-Key` | Orders |
| **List Orders (Customer)**| `GET /api/v1/orders/` | Header: `Authorization: Bearer` | `[{"order_number": str, "total_amount": int, "status": str, "lines": [...]}]` | Bearer Token | Filters orders by authenticated `customer_ref`. | Read-only | Orders |
| **List Merchant Orders**| `GET /api/merchant/orders/` | Header: `Authorization: Bearer` (Merchant) | `[{"id": int, "order_number": str, "customer": str, "total_amount": int, "status": str}]` | Bearer Token (Merchant / Admin) | Returns live orders across all customers with line snapshots. | Read-only | Orders |
| **Update Order Status** | `PATCH /api/merchant/orders/<id>/status/` | `{"status": "confirmed"|"shipped"|"delivered"|"cancelled"}` | `{"id": int, "status": str}` | Bearer Token (Merchant / Admin) | Validates state transition machine. Rejects invalid skips. | Optimistic concurrency | Orders |
| **Calculate Shipping** | `POST /api/v1/fulfillment/quote/` | `{"zone_code": str, "items_count": int}` | `{"zone_name": str, "base_fee": int, "estimated_days": str}` | Public | Rejects unknown zone code (`400`). Whole-peso fee returned. | Read-only | Fulfillment |
| **Order Placed Event** | `POST /api/v1/fulfillment/events/order-placed/` | `{"event_id": str, "order_number": str, "shipping_address": {...}}` | `{"status": "acknowledged", "shipment_id": int}` | Internal (`X-Internal-Token`) | Generates tracking number; records delivery notification. | Idempotent on `event_id` | Fulfillment |
| **Fetch Active Banners** | `GET /api/v1/content/banners/` | None | `[{"id": int, "title": str, "image_url": str, "link_url": str}]` | Public | Returns only currently active banners in display order. | Read-only | Content |
| **Submit Contact Form** | `POST /api/v1/content/contact/` | `{"name": str, "email": str, "subject": str, "message": str}` | `{"status": "received", "inquiry_id": int}` | Public | Validates email syntax, sanitizes text inputs. | Rate limited (5/min/IP) | Content |

---

## 2. Cash on Delivery (COD) Checkout Saga Workflow

The checkout process spans multiple services and is orchestrated by the Orders service (`services/orders/orders/saga.py`):

```
Client App                   Orders Service                 Catalog Service              Fulfillment Service
    │                              │                              │                              │
    │ 1. POST /orders/checkout/    │                              │                              │
    ├─────────────────────────────►│                              │                              │
    │                              │ 2. POST /catalog/quotes/     │                              │
    │                              ├─────────────────────────────►│                              │
    │                              │◄─────────────────────────────┤ (Authoritative prices)       │
    │                              │                              │                              │
    │                              │ 3. POST /fulfillment/quote/  │                              │
    │                              ├──────────────────────────────┼─────────────────────────────►│
    │                              │◄─────────────────────────────┼──────────────────────────────┤ (Shipping fee)
    │                              │                              │                              │
    │                              │ 4. POST /holds/reserve/      │                              │
    │                              ├─────────────────────────────►│ (Select for update 600s TTL) │
    │                              │◄─────────────────────────────┤ (Hold confirmed)             │
    │                              │                              │                              │
    │                              │ 5. Local DB Transaction:     │                              │
    │                              │    - Create OrdersOrder      │                              │
    │                              │    - Create Line Snapshots   │                              │
    │                              │    - Create StockHoldRecord  │                              │
    │                              │    - Create OutboxMessage    │                              │
    │                              │                              │                              │
    │                              │ 6. POST /holds/commit/       │                              │
    │                              ├─────────────────────────────►│ (Inventory decremented)      │
    │                              │◄─────────────────────────────┤                              │
    │                              │                              │                              │
    │                              │ 7. Async Outbox Dispatch     │                              │
    │                              ├──────────────────────────────┼─────────────────────────────►│ (OrderPlaced)
    │                              │                              │                              │
    │ 8. Order Placed (201 Created)│                              │                              │
    │◄─────────────────────────────┤                              │                              │
```

### Detailed Saga Phases & Failure Compensation

1. **Client Submission & Security Validation**:
   - Client sends items (`variant_id`, `quantity`), shipping details, and optional `Idempotency-Key`.
   - Any client-submitted prices or totals are completely discarded.
2. **Authoritative Quotes**:
   - Orders calls Catalog (`POST /api/v1/catalog/quotes/`) to obtain canonical unit prices.
   - Orders calls Fulfillment (`POST /api/v1/fulfillment/quote/`) to obtain shipping fees by zone.
3. **Atomic Expiring Stock Reservation**:
   - Orders generates a unique `checkout_id = "chk_" + uuid.uuid4().hex[:16]`.
   - Orders calls Catalog (`POST /api/v1/catalog/holds/reserve/`).
   - Catalog locks variant rows (`select_for_update()`), checks available stock, and registers holds with a 600-second (10 minute) expiration timestamp.
4. **Local Atomic Persistence**:
   - Inside a local `transaction.atomic()` block, Orders commits:
     - `OrdersOrder` record (`order_number = MD-2026-XXXXX`, `status = pending`, whole-peso totals).
     - `OrdersOrderLine` records containing immutable historical purchase snapshots.
     - `OrdersStockHoldRecord` mapping `checkout_id` to the order.
     - `OrdersOutbox` entry with event type `OrderPlaced`.
5. **Stock Commit Phase**:
   - Orders sends `POST /api/v1/catalog/holds/commit/`.
   - Catalog decrements physical inventory (`stock_quantity -= held_quantity`) and marks the hold `committed`.
6. **Compensating Rollback (The Safety Net)**:
   - If local database persistence fails OR the stock commit call fails, the saga catches the exception and immediately invokes:
     `POST /api/v1/catalog/holds/release/` with `checkout_id`.
   - Catalog releases the reservation, immediately returning the items to the available pool. No orphaned reservations or ghost stock decrements can occur.

---

## 3. Security, Authentication, and Tokens

### PBKDF2 Password Hashing
- Plaintext password storage is completely eliminated across all databases.
- The Identity service uses Django's secure `PBKDF2PasswordHasher` (SHA-256 algorithm with 720,000 hashing iterations and cryptographic salt).
- **Seamless Legacy Migration**: When users registered with previous demo plaintext passwords log in, the authentication backend validates the hash, upgrades it to PBKDF2 on the fly, and persists the hash to `identity_account`.

### Verifiable Bearer Tokens
- Sessions are authenticated via 32-character opaque hex `AuthToken` credentials.
- Client applications pass the token in standard HTTP headers:
  ```http
  Authorization: Bearer a1b2c3d4e5f6789012345678abcdef01
  ```
- Identity verifies token validity, extracts `account_id` and `role`, and enforces Role-Based Access Control (`customer`, `merchant`, `admin`).

### Intra-Service Mutual Authorization
- Private inter-service endpoints (`/quotes/`, `/holds/reserve/`, `/holds/commit/`, `/events/order-placed/`) require an internal service token:
  ```http
  X-Internal-Token: metrodrip_internal_mesh_secret_2026
  ```
- Public internet traffic routed through the API Gateway cannot access internal service endpoints directly.

---

## 4. Background Management Commands & Sweepers

### Expiring Stock Holds Sweeper
If a customer reserves stock but closes their browser without completing checkout, reservations naturally expire after 10 minutes (600s TTL).

- **Command**: `services/catalog/manage.py release_expired_holds`
- **Behavior**: Queries `catalog_stockhold` for `status="held"` and `expires_at <= NOW()`, transitions them to `released`, and logs audit metrics.
- **Production Schedule**: Configured as a cron task executing every 60 seconds.

### Event Outbox Consumer
- **Command**: `services/fulfillment/manage.py consume_order_placed`
- **Behavior**: Reads unpublished events from `orders_outbox`, invokes Fulfillment event receiver, and marks the outbox record `published`.
- **Idempotency Guarantee**: Fulfillment checks `fulfillment_processedevent` table before creating shipments. Re-delivered events receive `200 OK` without creating duplicate waybills.
