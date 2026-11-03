# MetroDripJS — API Connectivity & Integration Audit

**Date:** 2026-11-03  
**Auditor:** Autonomous Senior QA & API Integration Specialist  
**Backend:** Django 6.1.2 / DRF 3.18.3 Modular Monolith (`metrodrip_backend/`)

---

## 1. Internal API Inventory & Communication Matrix

### A. Authentication & Identity APIs

| Endpoint | Method | Caller | Auth Type | Permission | Purpose / Database Side-Effect | Verification Status |
|---|---|---|---|---|---|---|
| `/login/` | `POST` | All Clients | None | Public | Authenticates credentials; returns opaque `access_token` and user profile. Upgrades PBKDF2 hashes if legacy. | **VERIFIED** (Automated & E2E) |
| `/signup/` | `POST` | Customer Web/Mobile | None | Public | Creates customer record; checks platform registration toggle; initiates email OTP challenge if enforced. | **VERIFIED** (Automated & E2E) |
| `/logout/` | `POST` | All Clients | Bearer Token | Authenticated | Deletes active `CustomerAccessToken` or `AuthToken` record from database. | **VERIFIED** (Automated & E2E) |
| `/forgot-password/` | `POST` | Customer Web/Mobile | None | Public | Issues `PasswordResetToken` (TTL: 15m); sends password reset link via Brevo transactional API. | **VERIFIED** (Mocked Provider & Tests) |
| `/password-reset/confirm/` | `POST` | Customer Web/Mobile | None | Public | Consumes reset token; verifies new password; hashes with PBKDF2/Argon2; revokes token. | **VERIFIED** (Automated Tests) |
| `/auth/otp/verify/` | `POST` | Customer Web/Mobile | None | Public | Verifies 6-digit numeric OTP challenge; activates customer account (`email_verified_at`). | **VERIFIED** (Automated Tests) |
| `/profile/` | `GET/PUT` | Customer Web/Mobile | Bearer Token | Owner | Reads or updates customer personal info (name, phone, delivery addresses JSON). | **VERIFIED** (Automated & E2E) |
| `/account/close/` | `POST` | Customer Web/Mobile | Bearer Token | Owner | Confirms password + phrase; anonymizes profile; revokes tokens; cleans up wishlist/reviews. | **VERIFIED** (Automated & E2E) |
| `/users/me/` | `GET` | Staff Consoles | Bearer Token | Staff (`is_staff=True`)| Returns authenticated staff identity, assigned role, and MFA state. | **VERIFIED** (Automated & E2E) |

---

### B. Catalog & Media APIs

| Endpoint | Method | Caller | Auth Type | Permission | Purpose / Database Side-Effect | Verification Status |
|---|---|---|---|---|---|---|
| `/categories/` | `GET` | All Clients | None | Public | Returns active category list with IDs, names, and slugs (`CatalogCategory`). | **VERIFIED** (Automated & E2E) |
| `/products/` | `GET` | All Clients | None | Public | Returns filtered, paginated products list. Supports `category`, `search`, `featured=1`, `sort`. | **VERIFIED** (Automated & E2E) |
| `/products/:id/` | `GET` | All Clients | None | Public | Returns single product details, base price, image URLs, and description. | **VERIFIED** (Automated & E2E) |
| `/variants/` | `GET` | All Clients | None | Public | Returns product variants, color hex codes, size attributes, and stock quantities. | **VERIFIED** (Automated & E2E) |
| `/media/products/...` | `GET` | Browsers / Apps | None | Public | Serves product imagery with MIME detection and path traversal safeguards. Fallbacks for missing files. | **VERIFIED** (Automated Tests) |

---

### C. Orders, Checkout & Payment APIs

| Endpoint | Method | Caller | Auth Type | Permission | Purpose / Database Side-Effect | Verification Status |
|---|---|---|---|---|---|---|
| `/api/orders/checkout/` | `POST` | Customer Web/Mobile | Bearer Token | Customer | Server-authoritative checkout saga: validates stock holds, calculates shipping & total, records order. | **VERIFIED** (Automated & E2E) |
| `/orders/` | `GET` | Customer Web/Mobile | Bearer Token | Customer (Owner) | Returns authenticated customer's order history list. | **VERIFIED** (Automated & E2E) |
| `/orders/:id/` | `GET` | Customer Web/Mobile | Bearer Token | Customer (Owner) | Returns order details, line snapshots, payment status, and tracking information. | **VERIFIED** (Automated & E2E) |
| `/orders/:id/cancel/` | `POST` | Customer Web/Mobile | Bearer Token | Customer (Owner) | Requests order cancellation; releases inventory stock holds if order is unpaid. | **VERIFIED** (Automated Tests) |
| `/api/payments/capabilities/`| `GET` | All Clients | None | Public | Exposes enabled payment methods (`cod`, `gcash`, `maya`, `card`, `qrph`) and provider readiness. | **VERIFIED** (Automated Tests) |
| `/api/payments/webhook/` | `POST` | PayMongo Server | HMAC Signature | Public / Signature | Validates `Paymongo-Signature` header; transitions order to `paid`; triggers fulfillment outbox. | **VERIFIED** (Mocked HMAC Tests) |

---

### D. Fulfillment, Wishlist & Content APIs

| Endpoint | Method | Caller | Auth Type | Permission | Purpose / Database Side-Effect | Verification Status |
|---|---|---|---|---|---|---|
| `/banners/` | `GET` | All Clients | None | Public | Returns published banners filtered by placement slot (`homepage_hero`, etc.). | **VERIFIED** (Automated & E2E) |
| `/wishlist/` | `GET/POST/DELETE` | Customer Web/Mobile | Bearer Token | Customer (Owner) | Reads, adds (`product_ref`), or removes items from customer wishlist. | **VERIFIED** (Automated Tests) |
| `/notifications/` | `GET` | Customer Web/Mobile | Bearer Token | Customer (Owner) | Returns in-app customer notifications with unread counter. | **VERIFIED** (Automated Tests) |
| `/notifications/:id/read/` | `POST` | Customer Web/Mobile | Bearer Token | Customer (Owner) | Marks specific notification as read. | **VERIFIED** (Automated Tests) |
| `/notifications/devices/` | `POST/DELETE` | Customer Mobile App | Bearer Token | Customer (Owner) | Registers or unregisters native APNS/FCM device push tokens. | **VERIFIED** (Automated Tests) |

---

### E. Staff Console APIs (Admin & Merchant)

| Endpoint | Method | Caller | Auth Type | Permission | Purpose / Database Side-Effect | Verification Status |
|---|---|---|---|---|---|---|
| `/api/admin/dashboard/` | `GET` | Admin Console | Bearer Token | Admin (`role='admin'`) | Returns platform KPIs: active users, merchant counts, GMV, order volume. | **VERIFIED** (Automated & E2E) |
| `/api/admin/users/` | `GET/POST` | Admin Console | Bearer Token | Admin (`role='admin'`) | Lists user directory; creates new staff accounts with assigned roles. | **VERIFIED** (Automated & E2E) |
| `/api/admin/roles/` | `GET/POST` | Admin Console | Bearer Token | Admin (`role='admin'`) | Reads standard roles; creates custom roles with granular capability toggles. | **VERIFIED** (Automated & E2E) |
| `/api/admin/settings/` | `GET/PATCH` | Admin Console | Bearer Token | Admin (`role='admin'`) | Updates global platform flags (registration, maintenance mode, OTP). | **VERIFIED** (Automated & E2E) |
| `/api/admin/audit-logs/` | `GET` | Admin Console | Bearer Token | Admin (`role='admin'`) | Returns chronological administrative audit records with filtering and export. | **VERIFIED** (Automated & E2E) |
| `/api/merchant/dashboard/` | `GET` | Merchant Console | Bearer Token | Merchant or Admin | Returns store metrics: sales revenue, open orders, low-stock warnings. | **VERIFIED** (Automated & E2E) |
| `/api/merchant/products/` | `GET/POST` | Merchant Console | Bearer Token | Merchant or Admin | Lists store catalog; creates new products and multi-variant attributes. | **VERIFIED** (Automated & E2E) |
| `/api/merchant/products/:id/` | `GET/PATCH/DELETE` | Merchant Console | Bearer Token | Merchant or Admin | Updates product attributes, pricing, stock, or soft-deactivates product. | **VERIFIED** (Automated & E2E) |
| `/api/merchant/products/bulk/`| `POST` | Merchant Console | Bearer Token | Merchant or Admin | Performs batch actions: bulk activate, deactivate, stock update, delete. | **VERIFIED** (Automated & E2E) |
| `/api/merchant/orders/` | `GET` | Merchant Console | Bearer Token | Merchant or Admin | Lists store orders with status filters (`placed`, `packed`, `shipped`, `delivered`). | **VERIFIED** (Automated & E2E) |
| `/api/merchant/orders/:id/` | `GET/PATCH` | Merchant Console | Bearer Token | Merchant or Admin | Updates fulfillment state; records payment transitions. | **VERIFIED** (Automated & E2E) |
| `/api/merchant/shipping-zones/`| `GET/POST/PATCH`| Merchant Console | Bearer Token | Merchant or Admin | Manages delivery zones and flat delivery fees (`ShippingShippingZone`). | **VERIFIED** (Automated & E2E) |
| `/api/merchant/banners/` | `GET/POST/PATCH` | Merchant Console | Bearer Token | Merchant or Admin | Publishes CMS banners; configures graphic typography or image uploads. | **VERIFIED** (Automated & E2E) |

---

## 2. External Service Integrations

### A. PayMongo Hosted Checkout v2
- **Integration Endpoint**: `POST https://api.paymongo.com/v2/checkout_sessions`
- **Supported Payment Methods**:
  - `gcash` (GCash e-wallet)
  - `maya` (Maya e-wallet; mapped from `paymaya` in adapter)
  - `card` (Visa / Mastercard debit/credit cards)
  - `qrph` (QR Ph standardized Philippine dynamic QR payments)
- **Security & Data Minimization**:
  - Zero raw payment credentials (PAN, CVV, OTP, PIN) touch MetroDrip servers.
  - MetroDrip transmits only server-calculated totals, whole PHP integer currency (`PHP`), description, and success/cancel URLs.
- **Webhook Verification**:
  - Payload signature verified using HMAC-SHA256 with timestamp verification.
  - Replay attack protection enforced by tracking unique webhook event IDs.
- **Verification Status**:
  - Mocked adapter, signature parsing, and status transitions: **VERIFIED (Automated Tests)**.
  - Live PayMongo sandbox and production banking rails: **UNVERIFIED (Requires external provider credentials)**.

### B. Brevo Transactional Email API
- **Integration Purpose**: Dispatching email OTP verification codes and password recovery tokens.
- **Endpoint**: `POST https://api.brevo.com/v3/smtp/email`
- **Security & Error Handling**:
  - Masks recipient emails in logs (`j***@example.com`).
  - Fails closed when Brevo API keys or verified senders are unconfigured (`reset_delivery_unconfigured`).
- **Verification Status**:
  - Error-handling, rate-limiting, and template rendering: **VERIFIED (Automated Tests)**.
  - Live external email inbox dispatch: **UNVERIFIED (Requires live Brevo API key)**.
