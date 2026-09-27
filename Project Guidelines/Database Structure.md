# Database Structure

**Status:** Verified Multi-Database Architecture  
**Project:** MetroDripJS Urban Streetwear E-Commerce Platform  
**Databases:** Five Private Schemas (`db_identity`, `db_catalog`, `db_orders`, `db_fulfillment`, `db_content`)  
**Engines:** PostgreSQL 16 (Production / Staging) & SQLite 3 (Isolated Local Development)  
**Date:** 2026-09-27  

---

## 1. Data Ownership and Entity Matrix

The MetroDripJS architecture strictly enforces **Database-per-Service**. Each microservice owns its private database schema, credentials, migrations, and storage lifecycle. Direct cross-database joins or cross-service ORM foreign keys are strictly prohibited.

```
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   db_identity   │ │   db_catalog    │ │    db_orders    │ │ db_fulfillment  │ │   db_content    │
│  (Port 8001)    │ │  (Port 8002)    │ │  (Port 8003)    │ │  (Port 8004)    │ │  (Port 8005)    │
├─────────────────┤ ├─────────────────┤ ├─────────────────┤ ├─────────────────┤ ├─────────────────┤
│• Account        │ │• Category       │ │• Order          │ │• ShippingZone   │ │• Banner         │
│• AuthToken      │ │• Product        │ │• OrderLine (Snap│ │• Shipment       │ │• ContactInquiry │
│                 │ │• ProductVariant │ │• StockHoldRecord│ │• DeliveryNotif  │ │                 │
│                 │ │• StockHold      │ │• OutboxMessage  │ │• ProcessedEvent │ │                 │
│                 │ │                 │ │• OrderReview    │ │                 │ │                 │
└─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
```

| Entity / Table | Service Owner | Primary Key & Internal Relations | Cross-Service References (No DB FK) | Sensitive Fields & Retention | Source of Truth |
|---|---|---|---|---|---|
| `identity_account` | **Identity** | `id` (PK, BigInt) | None | `password_hash` (PBKDF2-SHA256), `email` (PII). Retain active accounts. | Identity Service |
| `identity_authtoken` | **Identity** | `key` (PK, 32-char hex), FK → `account_id` | None | `key` (opaque bearer credential). Expire on logout or TTL. | Identity Service |
| `catalog_category` | **Catalog** | `id` (PK), `slug` (Unique) | None | None | Catalog Service |
| `catalog_product` | **Catalog** | `id` (PK), FK → `category_id`, `slug` (Unique) | None | `base_price` (Whole PHP integer) | Catalog Service |
| `catalog_productvariant` | **Catalog** | `id` (PK), FK → `product_id`, `sku` (Unique) | None | `stock_quantity` (Managed via atomic locks) | Catalog Service |
| `catalog_stockhold` | **Catalog** | `id` (PK), FK → `variant_id` | `checkout_id` (Indexed string from Orders) | `expires_at` (Indexed timestamp for hold sweeper) | Catalog Service |
| `orders_order` | **Orders** | `id` (PK), `order_number` (Unique, string) | `customer_ref` (Indexed BigInt → Identity) | `shipping_address` (PII recipient data), `total_amount` | Orders Service |
| `orders_orderline` | **Orders** | `id` (PK), FK → `order_id` | `product_ref`, `variant_ref` (Indexed BigInts) | `sku_snapshot`, `product_name_snapshot`, `unit_price` | Orders Service (Historical) |
| `orders_stockholdrecord` | **Orders** | `id` (PK), FK → `order_id` | `checkout_id` (String), `variant_ref` (BigInt) | Tracks hold state (`reserved`, `committed`, `released`) | Orders Service |
| `orders_outbox` | **Orders** | `id` (PK), `created_at` (Index) | `event_type` (`OrderPlaced`) | JSON payload. Retained until consumer ack. | Orders Service |
| `orders_orderreview` | **Orders** | `id` (PK), FK → `order_id` | `customer_ref` (Indexed BigInt) | Customer feedback, rating (1–5) | Orders Service |
| `fulfillment_shippingzone`| **Fulfillment** | `id` (PK), `code` (Unique) | None | `base_fee` (Whole PHP integer) | Fulfillment Service |
| `fulfillment_shipment` | **Fulfillment** | `id` (PK), FK → `zone_id`, `tracking_number` (Unique) | `order_ref` (Indexed BigInt), `order_number` (Str) | `recipient_name`, `phone`, `address_text` (PII) | Fulfillment Service |
| `fulfillment_deliverynotif`| **Fulfillment** | `id` (PK), FK → `shipment_id` | None | Recipient contact phone/email | Fulfillment Service |
| `fulfillment_processedevent`|**Fulfillment**| `id` (PK), `event_id` (Unique index) | None | Idempotency key for event consumption | Fulfillment Service |
| `content_banner` | **Content** | `id` (PK) | None | Image URLs, promo landing links | Content Service |
| `content_contactinquiry` | **Content** | `id` (PK) | `customer_ref` (Nullable BigInt) | `email`, `message` (PII customer support inquiry) | Content Service |

---

## 2. Cross-Boundary Reference Integrity & Snapshot Pattern

### Elimination of Database-Level Foreign Keys
In the monolithic codebase, `OrdersOrder` had direct SQL foreign keys referencing `identity_account`, and `OrdersOrderLine` had direct foreign keys referencing `catalog_product` and `catalog_productvariant`. 

In the microservices architecture, cross-boundary constraints are eliminated:
- `orders_order.customer_ref`: Stores the `id` of the account as a scalar integer. The Orders service does not execute joins against the Identity database.
- `orders_orderline.product_ref` & `variant_ref`: Stores product and variant IDs as scalar integers.

### Immutable Purchase Line Item Snapshots
E-commerce products evolve over time: merchant staff change prices, update product descriptions, or delete discontinued SKUs. An order line item must record the **exact state at the moment of purchase**.

The `OrdersOrderLine` schema enforces pure historical snapshots:
```python
class OrdersOrderLine(models.Model):
    order = models.ForeignKey(OrdersOrder, on_delete=models.CASCADE, related_name="lines")
    product_ref = models.BigIntegerField(db_index=True)
    variant_ref = models.BigIntegerField(db_index=True)
    sku_snapshot = models.CharField(max_length=64)             # e.g., "METRO-HOOD-BLK-L"
    product_name_snapshot = models.CharField(max_length=255)   # e.g., "Metro Heavyweight Hoodie"
    variant_desc_snapshot = models.CharField(max_length=128)   # e.g., "Size: L | Color: Black"
    unit_price = models.IntegerField()                         # Whole PHP (e.g., 2499)
    quantity = models.IntegerField(default=1)
    subtotal = models.IntegerField()                           # Whole PHP (e.g., 2499)
```
- Even if the catalog product price increases to ₱2,899 the next day, the customer's receipt, order history, and merchant fulfillment record remain locked at ₱2,499.

---

## 3. Financial Integrity & Currency Standard

All monetary fields across all schemas (`base_price`, `additional_price`, `unit_price`, `subtotal`, `shipping_fee`, `total_amount`) use **authoritative Integer fields representing whole Philippine Pesos (`₱`)**:
1. Floating-point numbers (`FLOAT`, `DOUBLE`) are strictly forbidden to eliminate binary IEEE 754 precision drift (e.g., `0.1 + 0.2 = 0.30000000000000004`).
2. Fractional centavos are not used in MetroDrip streetwear retail; every transaction, quote, and discount rounds to whole integer Pesos.
3. Client applications never compute prices. All arithmetic (`subtotal = sum(unit_price * qty)`, `total = subtotal + shipping_fee`) is computed server-side in `orders/saga.py` from verified Catalog and Fulfillment quotes.

---

## 4. Concurrency, Locking, and Transactions

### Atomic Stock Holds (`select_for_update`)
During high-heat streetwear drop events, multiple customers may simultaneously attempt to purchase the final unit of a limited-edition garment. The Catalog service handles stock reservation inside a strict atomic database transaction:
```python
with transaction.atomic():
    variant = ProductVariant.objects.select_for_update().get(id=variant_id)
    # Calculate available stock excluding active unexpired holds
    active_holds = StockHold.objects.filter(
        variant=variant, 
        status="held", 
        expires_at__gt=timezone.now()
    ).aggregate(total=Sum("quantity"))["total"] or 0
    
    available_stock = variant.stock_quantity - active_holds
    if available_stock < requested_quantity:
        raise InsufficientStockError()
        
    StockHold.objects.create(
        checkout_id=checkout_id,
        variant=variant,
        quantity=requested_quantity,
        expires_at=timezone.now() + timedelta(seconds=600),
        status="held"
    )
```
- `select_for_update()` places an exclusive row-level lock on the `catalog_productvariant` row in PostgreSQL, preventing race conditions or double-reservation.

---

## 5. PostgreSQL 16 Deployment & Credentials

The production deployment manages 5 separate PostgreSQL databases on a shared cluster or dedicated instances:

```sql
-- Script: database/init_microservices_postgresql.sql
CREATE USER identity_user WITH PASSWORD 'identity_secure_pass_2026';
CREATE DATABASE db_identity OWNER identity_user;

CREATE USER catalog_user WITH PASSWORD 'catalog_secure_pass_2026';
CREATE DATABASE db_catalog OWNER catalog_user;

CREATE USER orders_user WITH PASSWORD 'orders_secure_pass_2026';
CREATE DATABASE db_orders OWNER orders_user;

CREATE USER fulfillment_user WITH PASSWORD 'fulfillment_secure_pass_2026';
CREATE DATABASE db_fulfillment OWNER fulfillment_user;

CREATE USER content_user WITH PASSWORD 'content_secure_pass_2026';
CREATE DATABASE db_content OWNER content_user;
```

Each service container receives only its dedicated database connection string via environment variables (`DATABASE_URL=postgres://orders_user:orders_secure_pass_2026@postgres:5432/db_orders`). The Orders service has zero credential access or network grants to query `db_identity` or `db_catalog`.

---

## 6. Migration and Rollback Lifecycle

1. **Independent Migrations**: Each service manages its own `migrations/` directory. Deployments run `python manage.py migrate` per service container without cross-dependency.
2. **Backward Compatibility**: Schema migrations follow the Expand-Contract pattern:
   - *Phase 1 (Expand)*: Add new nullable columns or tables.
   - *Phase 2 (Code Deploy)*: Deploy service code that writes to both or reads from new.
   - *Phase 3 (Contract)*: Remove deprecated columns in a subsequent release.
3. **Backup Baseline**:
   - Monolithic database preserved at `metrodrip_backend/db.sqlite3.baseline.bak`.
   - Per-service dev databases stored locally at `services/{service}/db_{service}.sqlite3`.
