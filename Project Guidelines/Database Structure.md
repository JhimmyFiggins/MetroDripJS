# Database Structure

**Status:** Current additive schema implemented; transition ledger, snapshots, and migration 0007 verified

**Active local engine:** SQLite by default through `DATABASE_URL`

**Approved deployment target:** One Render Free PostgreSQL database, not yet applied

**Updated:** 2026-10-05

**Release status:** HOLD

SQLite test success does not verify PostgreSQL row locks, query plans, uniqueness races, migration rollback, connection limits, retention, or restore.

## 1. Current ownership and schema reality

The active modular-monolith path is `metrodrip_backend/`. Django apps own table groups inside one configured database, but the schema still reflects its legacy origin: several cross-domain references are numeric IDs rather than foreign keys, payment tables live in the `orders` app, and fine-grained staff authorization entities are absent.

| Domain/app | Current tables and ownership | Important limitations |
|---|---|---|
| `identity` | `accounts_customer`, `identity_customeraccesstoken`, wishlist, audit and legacy service-event rows | One `role` string plus `is_staff`; no role/permission/store-membership/MFA/recent-auth tables |
| `catalog` | category, product, variant, color, stock entry, reservation, movement and legacy inventory idempotency/event rows | Products are global, not store-scoped; some reservation/order links are numeric references |
| `orders` | order, order line (with snapshots), shipping-address snapshot, payment, payment transitions ledger, payment webhook inbox, messages, service/review rows | No separate refund model; request-driven reconciliation without distributed lease |
| `fulfillment` | shipping zone, shipment, notification and device-token tables | Shipment/notification ownership uses numeric order/customer references |
| `content` | banners, collections/pages and inquiries from the existing app | Current staff policy is coarse role-based |

## 2. Implemented identity and authorization entities

| Entity | Current fields/constraints | Security behavior |
|---|---|---|
| `AccountsCustomer` | BigAutoField ID; unique email; password hash; `is_active`; `is_staff`; `is_superuser`; indexed role string; last-login/date-joined and contact JSON | New writes use Django password hashing. Staff role is persisted server-side, but authorization is only coarse `admin` vs `merchant|admin`. |
| `CustomerAccessToken` | customer FK; unique 64-character digest; indexed 12-character prefix; created/expiry/last-used/revoked timestamps; `(customer, expires_at)` index | Only the digest is stored. Expired, revoked, inactive-account, numeric, and short bearer credentials are rejected. |
| `AuditLog` | actor text, actor role, action, optional target model/ID, created timestamp | Useful staff action history. Financial state changes are recorded in the dedicated `OrdersPaymentTransition` ledger. |

Missing target entities are explicit: normalized roles/permissions, account-role grants, stores, store memberships, MFA challenges, and recent-authentication evidence. Documentation and UI must not describe those as implemented ABAC.

## 3. Implemented checkout, inventory, and payment entities

### Order and immutable-at-checkout data

| Entity | Current fields/constraints | Notes |
|---|---|---|
| `OrdersOrder` | customer numeric reference; status; decimal subtotal/tax/shipping/discount/total; currency; unique nullable checkout idempotency key; 64-character fingerprint; indexed reservation expiry; cancellation timestamp; created/updated timestamps | The unique key is global in the current table. Application code additionally checks owner and normalized payload fingerprint on replay. |
| `OrdersOrderLine` | order/product FKs; nullable variant FK; quantity; decimal unit/total/discount/tax values; `product_name_snapshot`; `sku_snapshot`; `variant_desc_snapshot`; timestamps; unique `(order, product, variant)` | **Immutable Snapshots Active:** Price values, product title, SKU, and variant descriptions are frozen at checkout commit. Catalog updates or variant deletion cannot alter historical receipts. |
| `OrdersShippingAddress` | one-to-one order; recipient, address, country, phone and timestamps | A checkout snapshot, returned only on owner/staff-authorized paths. |

### Inventory

| Entity | Current fields/constraints | Notes |
|---|---|---|
| `InventoryStockEntry` | product/variant/warehouse unique tuple; nonnegative integer quantity and reserved quantity; timestamps | Application row locks enforce availability. There is no database check that reserved quantity is less than or equal to on-hand quantity. |
| `InventoryReservation` | numeric order reference; product/variant; quantity; warehouse; indexed status/expiry; committed/released timestamps; unique `(order_id, product, variant)`; `(order_id, status)` index | States used by checkout are `active`, `committed`, `released`, and `expired`. |
| `InventoryStockMovement` | variant, optional SKU, signed delta, reason, optional order reference, timestamp | COD/verified-online stock commit records a `sale` movement. |

### Payments, transitions ledger, and webhook inbox

| Entity | Current fields/constraints | Notes |
|---|---|---|
| `OrdersPayment` | order FK; method/status; two-decimal amount; currency; unique nullable provider session reference; provider; checkout URL; provider payment reference; failure code; paid/reconciled timestamps; JSON metadata; `(order,status)` and `(provider,status)` indexes | Methods are `cod`, `gcash`, `maya`, `card`; provider is `cod` or `paymongo`. Raw card/wallet credentials are never fields. |
| `OrdersPaymentTransition` | BigAutoField ID; payment FK; order numeric reference; `from_status` (char 32); `to_status` (char 32); `actor_type` (char 32); `actor_id` (char 64); `provider_event_id` (char 128); `reason` (text); `metadata` (JSON); `created_at` (indexed timestamp) | **Append-Only Transition Ledger:** Persists immutable timeline of state changes (`CREATED` → `PENDING_PAYMENT` → `PAID`/`FAILED`/`EXPIRED`/`CANCELLED`) for auditability and non-repudiation. |
| `PaymentWebhookEvent` | provider event ID primary key; event type; indexed provider reference; payload SHA-256 digest; processing status/error; received/processed timestamps; `(status, received_at)` index | Stores minimal dedupe/evidence fields, not the raw payload or signature. A repeated ID with a changed digest is rejected as a collision. |

## 4. Current data invariants

- Checkout accepts only Philippine delivery addresses and persists `currency='PHP'` for new orders/payments.
- Application money is a two-decimal `Decimal`, not binary floating point. The PayMongo adapter rounds to two decimals and sends integer centavos; a paid result must match the expected integer amount and `PHP` currency.
- Product/variant prices, the active shipping-zone fee, and stock are loaded by the server. Client totals are not persisted as authority.
- The same checkout idempotency key and normalized payload returns the existing order; another owner or fingerprint returns `409 idempotency_conflict`.
- Inventory is locked before reservation/commit. A reservation is committed once for COD or after verified online payment; cancellation/expiry decrements `reserved_quantity` and records a terminal reservation state.
- COD creates `provider='cod'`, `status='pending_collection'`, and no hosted URL/session.
- Online methods create `provider='paymongo'`, begin `awaiting_payment`, and reserve inventory for 30 minutes. Domain `maya` maps to provider `paymaya` only inside the adapter.
- A verified paid transition locks the payment, is a no-op if already paid, verifies exact amount/currency, and then commits inventory. A paid order whose stock cannot be committed becomes `payment_review` rather than silently claiming normal fulfillment.
- The webhook can recover a PayMongo checkout-session create response lost after remote success. It binds an unbound `cs_…` reference only when order ID, MetroDrip reference, checkout fingerprint, paid amount, currency, and status all match.
- Every payment state change emits an append-only `OrdersPaymentTransition` record auditing the prior status, new status, actor, and trigger reason.

## 5. Additive migration inventory

| Migration | Implemented change | Rollback/data note |
|---|---|---|
| `identity/0004_customer_access_token.py` | Adds opaque-token digest/prefix, expiry/use/revocation fields and indexes | Schema migration is reversible; live token material is never stored. |
| `identity/0005_hash_legacy_passwords.py` | Iterates accounts in batches and hashes values Django does not recognize as encoded hashes | Reverse is intentionally a no-op; plaintext is not restored. |
| `catalog/0012_inventory_reservation_lifecycle.py` | Adds reservation status, warehouse, commit/release timestamps, order/status index, and unique order/product/variant constraint | Additive lifecycle support; PostgreSQL race behavior remains unverified. |
| `orders/0005_checkout_payments.py` | Adds order idempotency/fingerprint/expiry/cancel fields; payment provider/session/failure/paid/reconciliation fields and indexes; creates webhook inbox | Additive. No destructive removal of historical order/payment evidence. |
| `orders/0007_payment_transition_and_line_snapshots.py` | Adds `product_name_snapshot`, `sku_snapshot`, and `variant_desc_snapshot` to `OrdersOrderLine`; creates `OrdersPaymentTransition` table with composite indexes | Additive; non-breaking; fully reversible. Protects historical order lines from catalog mutations. |
| `fulfillment/0003_seed_shipping_zones.py` | Idempotently creates NCR, Luzon, and VisMin zones with integer fees | Reverse is a no-op so existing business zones are not deleted automatically. |
| `fulfillment/0004_remove_seeded_demo_notifications.py` | Deletes only the five exact customer-1 demo notification tuples introduced by `0002`, matching category/title/body and null order reference | Reverse is a no-op so fabricated operational notifications are never reintroduced. Legitimate notifications with different fields are preserved. |

## 6. Implemented indexes and observed query paths

| Query path | Current support |
|---|---|
| Authenticate bearer token | Unique `token_digest`; indexed prefix; indexed expiry/revocation; `(customer, expires_at)` |
| Customer order list | `OrdersOrder.customer_id` index plus ordering by `created_at`; no compound `(customer_id, created_at)` index yet |
| Checkout replay | Unique `checkout_idempotency_key` |
| Stale checkout scan | Indexed `reservation_expires_at`; status is separately indexed, not a PostgreSQL partial composite index |
| Reservation for an order | `(order_id, status)` plus unique `(order_id, product, variant)` |
| Stock row selection | Unique `(product, variant, warehouse_id)` |
| Payment status/provider work | `(order,status)` and `(provider,status)` |
| Payment transitions history | Indexed `(payment_id, created_at)` and `(order_id, created_at)` on `OrdersPaymentTransition` |
| Provider session resolution | Unique nullable `provider_ref` |
| Webhook dedupe/diagnostics | Event ID primary key; indexed provider reference; `(status, received_at)` |

## 7. Transaction and concurrency behavior

- Checkout creates the local order/payment/reservations in `transaction.atomic()` while locking active variants, the shipping zone, and selected stock entries.
- The PayMongo network create call occurs after the local order transaction commits, avoiding a long-held transaction around that request.
- Reservation commit/release uses row locks. Webhook processing deduplicates its inbox row and locks the payment before applying paid state.
- Provider session creation uses a deterministic hashed PayMongo idempotency key. The webhook's strict lost-response recovery reduces the risk of an unbound remotely paid session.
- Owned reconciliation enforces a 30-second timestamp interval in application code but does not acquire a lease before the provider call. Concurrent eligible GETs can therefore fan out, particularly on PostgreSQL; this remains a release risk.
- `expire_one_stale_checkout()` is bounded to one stale order per new checkout request.

## 8. Target schema extensions before production maturity

1. Normalize role, permission, store, and membership grants so merchant policy can enforce store-scoped ABAC.
2. Add MFA challenge and recent-auth evidence only with a complete issuance, attempt-limit, expiry, recovery, and audit design.
3. Add a dedicated refund table before supporting refunds or financial operations beyond capture confirmation.
4. Add a short reconciliation lease/compare-and-set field and an operator-safe bounded maintenance command if request-triggered recovery proves insufficient.
5. Add database check constraints for nonnegative totals/stock and the chosen reserved-vs-on-hand invariant after cleaning legacy rows.
6. Consider non-enumerable public order references for customer-facing URLs; current owner-scoped integer IDs do not leak data but remain guessable identifiers.

## 9. Data lifecycle, backup, and free-database HOLD

- Token rows retain only digests and are valid until expiry/revocation; a retention cleanup policy is not yet implemented.
- Webhook inbox rows retain event identifiers, digests, and outcomes; a business/legal retention period is not yet approved.
- Addresses and contact details must stay out of ordinary logs and analytics. No field-level encryption is implemented; the deployment depends on platform/database encryption and access control.
- Account deletion/anonymization, refund/dispute retention, and formal order/audit retention are governance gaps.

Render's current free PostgreSQL documentation describes a 1 GB limit, expiry after 30 days, a 14-day grace period, and no managed backups or connection pooling. An expiring database without managed backup does not meet durable production commerce requirements. The repository's free-only Blueprint is therefore suitable for review/non-production experimentation only unless the user explicitly accepts that data-loss/lifecycle risk; production release remains **HOLD**, and no paid plan may be applied without new approval.
