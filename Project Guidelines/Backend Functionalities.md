# Backend Functionalities

**Status:** Current implementation contract; final local rerun pending

**Active runtime:** One Django/DRF application in `metrodrip_backend/`. Local development defaults to SQLite. The intended but unapplied Render deployment connects the same application to one free PostgreSQL database.

**Payment scope:** COD plus PayMongo Hosted Checkout for GCash, Maya, and cards

**Release status:** HOLD

## 1. Current API conventions

- Protected customer and staff routes require `Authorization: Bearer <opaque token>` issued by `POST /login/`. Only a SHA-256 digest and a short prefix are persisted; the bearer value is returned only when issued.
- Numeric IDs and tokens shorter than 32 characters are rejected as credentials. Tokens expire, can be revoked, and are rejected for inactive accounts.
- The checkout route is exactly `POST /api/orders/checkout/`. There is no `/api/v1/orders/checkout/` alias in the active URL configuration.
- Checkout idempotency is supplied as the JSON field `idempotency_key`, not an HTTP header. It must be 8–128 characters matching `[A-Za-z0-9._:-]+`.
- Typed application failures use the flat shape `{"error": "Human-readable message", "code": "stable_code"}`. Some legacy validation failures contain only `error`; DRF authentication/throttle failures may use `detail`. Nested error objects, field maps, retry flags, and correlation IDs are not implemented consistently and must not be documented as current response fields.
- Django stores application money in two-decimal `DecimalField` values. Checkout responses serialize amounts as decimal strings. The provider adapter converts an exact decimal PHP value to integer centavos and verifies paid amount and `PHP` currency.
- Response fields are not proof of external verification. PayMongo sandbox/live behavior, PostgreSQL locking, native return flows, and Render deployment remain separately **UNVERIFIED**.

## 2. Identity and staff sessions

| Use case | Route | Current behavior |
|---|---|---|
| Sign up customer | `POST /signup/` | Creates an active `customer` account with a hashed password; client role fields are ignored. Throttle: `5/hour`. |
| Sign in | `POST /login/` | Verifies the hashed password, upgrades a matching legacy plaintext value, updates `last_login`, and returns account data, `access_token`/`token`, `token_type: "Bearer"`, `expires_at`, persisted `role`, and `is_staff`. Throttle: `10/min`. |
| Customer sign out | `POST /logout/` | Revokes the current bearer token. |
| Staff sign out | `POST /api/admin/logout/` or `POST /api/merchant/logout/` | Requires the relevant staff role, writes an audit row, and revokes the current token. |
| Current account | `GET/PUT /users/me/` | Returns or updates the authenticated account. `mfa_enabled` and `mfa_available` are both `false`. |
| Password change | `POST /users/me/password/` | Verifies the current password, hashes the replacement, and revokes other active tokens. |
| Session revoke | `POST /users/me/sessions/revoke/` | Revokes one other token by `session_id` or all other tokens with `revoke_all: true`. |

The staff consoles post to `/login/`, require `is_staff: true` and the expected persisted role, store the current session in `sessionStorage` under `metrodrip_active_user`, and attach the bearer token to every console API request. `localStorage` seed identities and client-side account switching are not authorization mechanisms.

Provision staff interactively so the password is validated and never passed on the command line:

```powershell
cd metrodrip_backend
python manage.py provision_staff --email admin@example.com --name "MetroDrip Admin" --role admin
python manage.py provision_staff --email merchant@example.com --name "MetroDrip Merchant" --role merchant
```

### Current authorization boundary

- Administrator APIs require an active account with `is_staff=true` and persisted `role="admin"`.
- Merchant APIs require an active account with `is_staff=true` and persisted `role` equal to `merchant` or `admin`.
- Customer order APIs filter by the authenticated account's numeric ID.
- Store membership, per-resource permissions, and other ABAC rules are not modeled or enforced. Merchant access is therefore global across the current merchant dataset.
- MFA challenges and recent-authentication gates are not implemented. The UI label is `VERIFIED SESSION`, not a claim that 2FA is enabled.

This coarse RBAC boundary is a meaningful improvement over caller-selected identities, but it is not the planned fine-grained authorization model.

## 3. Current checkout and order endpoints

| Use case | Route | Authorization | Current success contract | Important failures |
|---|---|---|---|---|
| Checkout | `POST /api/orders/checkout/` | Authenticated customer; throttle `30/min` | `201` for a new order, `200` for an idempotent replay; serialized order/payment and nullable `payment_action` | Flat `{error, code}`; validation `400`, stock/catalog/idempotency/expiry `409`, non-retryable or unconfigured provider `422`, retryable provider failure `503`, auth `401`, throttle `429` |
| Order history | `GET /orders/` | Authenticated owner | Up to 50 owned orders with their latest payment | `401` |
| Owned order/status | `GET /orders/{integer_order_id}/` | Authenticated owner | Serialized order plus `reconciliation_status` | `404` owner-safe not found; `409` missing payment; provider failure leaves durable state and returns `reconciliation_status: "deferred"` |
| Cancel online checkout | `POST /orders/{integer_order_id}/cancel/` | Authenticated owner; throttle `120/min` | Idempotent serialized cancellation for eligible unpaid online checkout | `404`; `409` paid, COD, or missing payment; `503 provider_unavailable` when provider expiry cannot be confirmed |
| Tracking | `GET /orders/{integer_order_id}/tracking/` | Authenticated owner | Truthful order/items/shipment/timeline; unavailable timestamps/courier/ETA are `null` with an unavailable source | `404`, `401` |
| Legacy order creation | `POST /orders/` | Authenticated customer | None | `410 legacy_checkout_retired` because it accepted client prices |
| Payment return page | `GET /payment/return?result=success|cancelled&order_id=…` | Public informational page | No-store HTML instructing the user to return to MetroDrip | Never marks an order paid |
| PayMongo webhook | `POST /api/payments/paymongo/webhook/` | Valid PayMongo signature; throttle `300/min` | `200 {"received": true, "result": "processed|duplicate|ignored|rejected"}` | `400` malformed shape/JSON, `401` signature/timestamp/mode, `409 event_collision`, `413 payload_too_large`, `503 webhook_not_configured`, `429` throttle |

There is no payment-method discovery endpoint and no separate payment-retry endpoint. The current mobile UI lists COD, GCash, Maya, and card. Retrying the same checkout request with the same JSON idempotency key reuses the existing order and can recreate a missing Hosted Checkout action when the local payment remains eligible. Provider/account capability discovery remains a gap.

### Exact checkout request

```json
{
  "idempotency_key": "checkout-0f5d3a42",
  "items": [
    {"variant_id": 123, "quantity": 2}
  ],
  "shipping_address": {
    "name": "Customer Name",
    "address_line1": "Street and barangay",
    "address_line2": "Optional unit",
    "city": "Taguig",
    "state": "Metro Manila",
    "postal_code": "1634",
    "country": "PH",
    "phone": "+639171234567"
  },
  "delivery_zone": "NCR (Metro Manila)",
  "payment_method": "gcash"
}
```

`items` may also be sent as `lines`; variant keys may be `variant_id`, `variant`, or `variantId`. Duplicate variant lines are aggregated. `payment_method` accepts `cod`, `cash_on_delivery`, `gcash`, `maya`/`paymaya`, and `card`/`cards`, normalized to `cod`, `gcash`, `maya`, or `card`; omission currently defaults to COD for legacy compatibility. The provider adapter alone maps `maya` to `paymaya`. `address_line2` and `postal_code` are optional, `country` defaults to `PH`, and the delivery zone must resolve to an active database row.

Any nested key named `account_number`, `card_number`, `pan`, `cvc`, `cvv`, `expiration`, `expiry`, or `otp` is rejected with `raw_payment_credentials_rejected`.

### Exact serialized checkout shape

```json
{
  "id": 42,
  "order_no": "MD-2026-00042",
  "status": "pending_payment",
  "subtotal": "1400.00",
  "shipping": "149.00",
  "tax": "0.00",
  "discount": "0.00",
  "total": "1549.00",
  "currency": "PHP",
  "payment_method": "gcash",
  "payment_status": "awaiting_payment",
  "payment_action": {
    "type": "redirect",
    "url": "https://checkout.paymongo.com/...",
    "provider": "paymongo",
    "expires_at": "2026-09-28T12:30:00+00:00"
  },
  "is_replay": false,
  "created_at": "2026-09-28T12:00:00+00:00",
  "shipping_address": {
    "name": "Customer Name",
    "address_line1": "Street and barangay",
    "address_line2": "Optional unit",
    "city": "Taguig",
    "state": "Metro Manila",
    "postal_code": "1634",
    "country": "PH",
    "phone": "+639171234567"
  },
  "items": [
    {
      "product_ref": 9,
      "variant_ref": 123,
      "product_name": "Product name",
      "sku": "SKU-123",
      "quantity": 2,
      "unit_price": "700.00",
      "total_price": "1400.00"
    }
  ]
}
```

For COD, `status` is currently `placed`, `payment_status` is `pending_collection`, and `payment_action` is `null`. Online checkout begins as `pending_payment`/`awaiting_payment`. The mobile client accepts only the exact HTTPS origin `https://checkout.paymongo.com` before opening the action and does not clear the cart merely because an online session was created.

### Current flat error examples

```json
{"error": "A valid idempotency key is required.", "code": "invalid_idempotency_key"}
```

```json
{"error": "Idempotency key was already used for another checkout.", "code": "idempotency_conflict"}
```

```json
{"error": "Online payment setup is temporarily unavailable. Retry with the same checkout.", "code": "provider_not_configured"}
```

Known checkout codes include `checkout_invalid`, `raw_payment_credentials_rejected`, `payment_method_unavailable`, `invalid_idempotency_key`, `empty_cart`, `invalid_item`, `invalid_address`, `unsupported_country`, `invalid_delivery_zone`, `delivery_zone_unavailable`, `catalog_conflict`, `currency_conflict`, `insufficient_stock`, `inventory_commit_conflict`, `checkout_expired`, `idempotency_conflict`, provider-supplied safe codes, `payment_missing`, `already_paid`, and `cod_cancellation_requires_support`.

## 4. Current payment lifecycle

### COD

Checkout locks stock rows, creates the order/address/line/payment/reservation records, immediately commits reserved stock into a sale movement, and returns `payment_action: null`. The payment remains `pending_collection`; collection settlement is not implemented in this checkout slice.

### Hosted online checkout

1. Checkout validates the request, loads active variants and an active delivery zone, calculates `Decimal` totals, and reserves stock inside a database transaction.
2. The committed local order has a 30-minute `reservation_expires_at`; its payment is `awaiting_payment` with provider `paymongo`.
3. Outside that transaction, the adapter posts server-controlled line items to PayMongo `/v2/checkout_sessions` with a hashed provider idempotency key. `maya` is serialized as `paymaya`.
4. Only a trusted `https://checkout.paymongo.com` URL is stored/returned. Definite or uncertain creation errors currently mark the local payment `setup_failed` and the order `payment_setup_failed`, then return `422` or `503` according to the adapter's retryable flag.
5. A valid paid webhook or an owned-order reconciliation verifies paid status, exact amount, and currency, commits inventory once, sets the payment to `paid`, and sets the order to `placed`. If reserved stock cannot be committed, the order becomes `payment_review` for manual resolution.

### Webhook authenticity, deduplication, and lost-response recovery

- The handler enforces a 262,144-byte default body limit, verifies `Paymongo-Signature` over the exact raw bytes with HMAC-SHA256, applies a 300-second default timestamp tolerance, and selects the test/live digest based on configured mode.
- Both the older event-resource envelope and PayMongo's current developer-tools envelope are parsed. Only `checkout_session.payment.paid` mutates payment state.
- `PaymentWebhookEvent.event_id` is the deduplication key; a repeated ID with a different body digest returns `409 event_collision`.
- Amount, `PHP` currency, reference number, order metadata, checkout fingerprint, provider session, and environment mode when supplied are checked before paid state is applied.
- If PayMongo created a checkout session but the create response was lost, a signed paid webhook can bind that previously unbound `cs_…` session only when the exact order ID, MetroDrip reference, checkout fingerprint, amount, currency, and paid status all match. A wrong amount or identity cannot claim the payment.
- Invariant mismatches are persisted as a rejected inbox result and acknowledged with HTTP 200. Operations must inspect the result/status; a `2xx` alone does not mean payment was accepted.

## 5. Current expiry and reconciliation behavior

- Each new checkout request calls `expire_one_stale_checkout()`, which attempts to expire at most one old `pending_payment` or `payment_setup_failed` order before processing the new request.
- An owned `GET /orders/{id}/` invokes reconciliation only when its latest payment is `awaiting_payment` or `setup_failed`. A provider lookup requires a stored provider reference and is skipped for 30 seconds after a successful lookup updates `last_reconciled_at`; failures do not start that cooldown.
- If the viewed order's reservation is already expired, reconciliation first asks PayMongo to expire the session, then releases stock and marks the payment/order expired.
- Provider lookup failures leave the durable local status unchanged and return `reconciliation_status: "deferred"` with HTTP 200.
- Cancellation expires a provider session before releasing the local reservation; if provider confirmation fails, local checkout remains pending and the API returns `503`.
- There is no reconciliation/expiry management command, database lease, or background scheduler in the active monolith. Concurrent eligible status reads can still race into provider lookups. These are documented release gaps, not hidden behind a claimed worker.

## 6. Rate limits currently configured

These are Django cache-backed scoped throttles for the approved single-process free deployment. They are a first line of abuse control, not a global distributed limit.

| Scope | Exact setting | Attached routes |
|---|---:|---|
| `login` | `10/min` | `POST /login/` |
| `signup` | `5/hour` | `POST /signup/` |
| `password_reset` | `5/hour` | `POST /forgot-password/`, `POST /password-reset/` |
| `checkout` | `30/min` | `POST /api/orders/checkout/` |
| `payment_status` | `120/min` | `POST /orders/{id}/cancel/` only; the owned detail/reconciliation GET does not yet use this scope |
| `payment_webhook` | `300/min` | `POST /api/payments/paymongo/webhook/` |

General authenticated reads and most staff mutations do not yet have dedicated scopes. A future multi-instance deployment would need shared throttle state before these limits could be treated as globally enforced.

## 7. Fail-closed capabilities

The following surfaces intentionally return an explicit unavailable/retired result instead of fabricated success or demo operational data:

| Capability | Route | Status and code |
|---|---|---|
| Public password-reset delivery | `POST /forgot-password/` and `/password-reset/` | `503 reset_delivery_unconfigured`; no token generated or sent |
| Admin-requested password reset | `POST /api/admin/users/{id}/reset-password/` | `501 reset_delivery_unconfigured`; no token generated or exposed |
| MFA setup/verification | `POST /users/me/mfa/` | `501 mfa_unconfigured`; no code accepted |
| Merchant analytics | `GET /api/merchant/analytics/` | `501 analytics_unconfigured`; no sample metrics returned |
| Courier booking | `POST /api/merchant/shipments/` | `501 carrier_integration_unconfigured`; no waybill/tracking number generated |
| Address-to-zone eligibility | `POST /api/merchant/shipping-zones/eligibility/` | `501 shipping_eligibility_unconfigured`; no fake quote returned |
| Custom role creation | `POST /api/admin/roles/` | `501 role_persistence_unconfigured`; no role created |
| Platform settings | `GET/PATCH /api/admin/settings/` | `501 settings_persistence_unconfigured`; no settings returned/changed |
| Client-side account switching | `GET/POST /api/admin/switch-user/` | `410 account_switching_retired`; sign out and authenticate explicitly |
| Account discovery | `GET /check-customer/` | `410 account_discovery_retired` |

## 8. Current gaps and verification boundary

- Coarse role checks are implemented; store-scoped ABAC, a permission model, MFA, and recent-authentication gates are not.
- Payment-method capability discovery, refunds, payment-transition history, reconciliation leases/commands, and an operator recovery UI are not implemented.
- The console code now requires an authenticated session and explicit API states; its automated browser harness uses mocked APIs and does not establish live browser-to-Django behavior.
- Focused local tests can verify validation, state transitions, signing logic, lost-response recovery, and UI source contracts. They do not verify PayMongo sandbox/live delivery, a native app return, PostgreSQL concurrency, Render cold starts, or production recovery.
- No real charge/refund, secret change, Render application, paid infrastructure change, or live deployment is authorized by this document.

See [Verification and Evaluation](Verification%20and%20Evaluation.md) for executed evidence and remaining release gates.
