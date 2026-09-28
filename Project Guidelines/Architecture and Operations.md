# Architecture and Operations

**Status:** Local modular-monolith/payment implementation present; external and deployment verification pending

**Production target:** One Render Free Django web service + one Render Free PostgreSQL database

**Release status:** HOLD

**Controlling decisions:** [Decisions and Handover](Decisions%20and%20Handover.md#active-architecture-decisions--2026-09-28)

## 1. System context

MetroDrip uses an Expo/React Native customer application and responsive merchant/admin web consoles. The active implementation path is the Django project in `metrodrip_backend/`: identity, catalog, orders/payments, fulfillment, content, and staff APIs deploy in one process. Local development defaults to SQLite. One PostgreSQL database is the approved Render target, but PostgreSQL migration, locking, restore, and live connectivity are still **UNVERIFIED**.

```text
Customer app ─────────────┐
Merchant console ─────────┼── HTTPS ──> Render Free web service
Admin console ────────────┘               Django + DRF
                                              │
                                   one transaction boundary
                                              │
                                   Render Free PostgreSQL

PayMongo Hosted Checkout <── HTTPS ── Payments adapter
PayMongo signed webhook  ── HTTPS ──> /api/payments/paymongo/webhook/
```

The historical `gateway/`, `services/*`, and `docker-compose.microservices.yml` assets remain migration references and local verification fixtures. They do not define the approved production deployment. The active monolith removes those network hops, five-database overhead, internal mesh tokens, and gateway process from the intended Render path.

## 2. Implemented and planned internal boundaries

The current implementation has Django app boundaries, but not every logical target entity below exists. In particular, payment code and tables currently live in the `orders` app; there are no store-membership, permission, refund, payment-transition, MFA-challenge, or reconciliation-lease models.

| Module | Owns | May call | Must not do |
|---|---|---|---|
| Identity | accounts, hashed credentials, opaque token digests, coarse persisted roles, audit rows | authenticates customer/admin/merchant API views | grant access from a client-supplied role or numeric ID |
| Catalog | products, variants, categories, inventory, reservations and movements | is queried/locked directly by checkout and staff views | trust a client price or fabricate stock/category defaults |
| Orders/payments | checkouts, orders, line/address snapshots, idempotency fields, payments, provider references, webhook inbox, bounded reconciliation | catalog/fulfillment models and the PayMongo adapter | persist PAN, CVV, wallet login, OTP, or infer paid state from a redirect |
| Fulfillment | shipping zones, shipments, notifications and device tokens | is queried by checkout/tracking/staff views using stable references | expose another customer's address or fabricate courier/ETA data |
| Content | banners, collections/pages and contact inquiries | is exposed through public/staff views | accept unpublished content from public clients |
| Staff/Audit | identity permission classes, admin/merchant views, and audit rows | coordinates existing domain models | represent current role checks as store-scoped ABAC, permissions, or MFA |

Checkout currently coordinates the monolith's existing models directly. Multi-table state changes use `transaction.atomic()` and row locks around local inventory/order/payment transitions. Hosted Checkout creation occurs after the local order transaction commits. Further service-interface cleanup is a maintainability target, not a completed abstraction.

## 3. Free-tier deployment contract

The repository contains an **unapplied** [`render.yaml`](../render.yaml) with:

1. **One web service** with `plan: free`, binding the platform-provided `PORT`, a `/health/` health check, preview generation off, and `autoDeployTrigger: off`.
2. **One PostgreSQL database** with `plan: free`, exposed to the web service through `DATABASE_URL` and no public IP allowlist.

It must not add a background worker, cron job, Key Value/Redis instance, persistent disk, private service, autoscaling, high-availability database, read replica, or paid instance type. If Render no longer offers a required free resource or a configuration change prompts for billing, stop before applying it and record the deployment as blocked. Plan availability and limits must be checked against [Render's current free-tier documentation](https://render.com/docs/free) at deployment time.

### Free-tier consequences

- The web service may sleep and cold-start. Clients must use bounded timeouts and show retry-safe pending states rather than claim a payment failed solely because a request timed out.
- There is no always-on worker or scheduler. Correctness cannot depend on a polling daemon, Celery, BullMQ, cron, Redis, or in-memory queues.
- In-memory cache and process-local locks are optimizations only and cannot be sources of truth because the process can restart.
- Render's current free PostgreSQL documentation describes a 1 GB limit, expiry after 30 days, a 14-day grace period, and no managed backups or connection pooling. Those constraints do not satisfy durable production storage/recovery requirements, so production release is **HOLD**. The Blueprint must remain unapplied unless an authorized reviewer accepts a non-production use; no paid upgrade may be applied without new approval.

## 4. Payment data flow

### Hosted online checkout

1. An authenticated customer submits checkout with `payment_method` equal to `gcash`, `maya`, or `card` and `idempotency_key` in the JSON body.
2. Django validates ownership, calculates authoritative item/shipping totals, reserves inventory, persists the order and a pending payment attempt, and commits.
3. The PayMongo adapter maps `maya` to the provider identifier `paymaya`, converts exact decimal PHP to integer centavos, and creates a Hosted Checkout session with server-controlled line items and return URLs.
4. Django stores the provider checkout-session/payment references, hosted checkout URL, amount, currency, failure/status timestamps, and reconciliation timestamp. Reservation expiry is stored on the order. It returns an HTTPS redirect action to the client.
5. The app opens the allowlisted `checkout.paymongo.com` URL. MetroDrip never renders a field for PAN, expiry, CVV, wallet password, wallet PIN, or OTP.
6. A return/deep link prompts the app to retrieve the owned order. The redirect itself does not change payment or order state.
7. PayMongo posts a signed webhook. Django verifies the raw body signature and timestamp, records/deduplicates the event, checks session/order/amount/currency and supplied mode, and applies the paid transition under row locks. If session creation succeeded remotely but its response was lost, a webhook may bind the unbound local payment only after exact reference, fingerprint, amount, currency, and status checks.
8. The next owned status read shows paid, pending, setup-failed, cancelled, or expired. Reads for `awaiting_payment`/`setup_failed` may perform a provider lookup when a reference exists and the last successful lookup is at least 30 seconds old. Failures do not start the cooldown. The current code has no reconciliation lease or explicit GET throttle, so concurrent provider fan-out is still a release risk.

### COD checkout

COD follows the same authoritative pricing, stock, idempotency, address, and order persistence rules but creates no hosted session and returns `payment_action: null`. Its payment remains `pending_collection`; a collection-settlement transition is not implemented in this checkout slice.

### No-worker recovery

- **Webhook path:** short synchronous verify → inbox insert/dedupe → invariant check → locked paid transition → inbox outcome. Duplicate delivery returns success for the stored event. There is no separate payment-transition audit table yet.
- **Read repair:** an authenticated owned-order request may reconcile an eligible referenced payment when the last successful lookup is at least 30 seconds old. Provider timeouts leave local state unchanged, do not start the cooldown, and return `reconciliation_status: deferred`.
- **Request-triggered expiry:** each new checkout attempts to expire at most one stale pending checkout; an owned status read also expires its viewed checkout when due. There is no active monolith reconciliation/expiry management command, worker, lease, or cron.
- **Observability:** queryable database payment/inbox/reservation states provide the current durable evidence. Comprehensive structured logs and alerts are not yet implemented; any paid observability option remains outside the approved deployment.

## 5. Security architecture

### Trust boundaries

- Treat every mobile/web value, deep link, redirect query, header, and provider payload as untrusted.
- Authenticate customer and staff principals with opaque server-verified bearer tokens. Customer order reads/writes filter by owner; staff endpoints require active `is_staff` plus a persisted coarse role.
- Current RBAC is `admin` for administrator APIs and `merchant|admin` for merchant APIs. Store membership/ABAC, explicit permissions, MFA, and recent-authentication gates are **not implemented** and remain release gaps.
- Provider secret and webhook secret stay in environment variables. Never expose them through Expo public variables, source maps, API responses, logs, fixtures, or Figma.
- Enforce HTTPS in production, secure cookies where sessions are used, CSRF protection for cookie-authenticated browser mutations, a strict CORS origin allowlist, host validation, HSTS after domain verification, and secure proxy headers.
- Enforce the configured webhook byte limit before parsing. Current scoped throttles are login `10/min`, signup `5/hour`, reset `5/hour`, checkout `30/min`, cancellation under `payment_status` `120/min`, and webhook `300/min`. The owned reconciliation GET and most staff mutations do not yet have dedicated throttles.

### Webhook verification

Use the exact raw request bytes. Parse the PayMongo signature fields, validate the timestamp against a bounded tolerance, calculate HMAC-SHA256 over the provider-specified signed payload, and use constant-time comparison against the correct test or live signature. Reject malformed, stale, unknown-mode, mismatched-currency, mismatched-amount, and unknown-session events. A unique provider event ID prevents duplicate application. Store only the minimal redacted payload needed for audit and replay diagnosis.

### Log and telemetry policy

Correlation-ID middleware and comprehensive structured/redacted logging are not implemented in the active monolith. They remain targets. Existing code must still avoid logging authorization headers, cookies, webhook signatures/secrets, hosted URLs, contact details, addresses, and raw authentication/checkout/webhook bodies.

## 6. Performance and resilience budgets

These are target budgets to validate, not measured claims:

| Path | Target | Failure behavior |
|---|---|---|
| Cached/public catalog read | p95 ≤ 500 ms after warm start | Return bounded error/empty state; use conditional requests and client cache |
| Authenticated order status | p95 ≤ 750 ms without provider reconciliation | Return last durable state with `reconciliation_status: deferred` when provider lookup fails |
| Checkout excluding provider call | p95 ≤ 1,000 ms after warm start | Idempotent retry; never double-create order/hold |
| Hosted Checkout creation | provider timeout ≤ 8 s | Preserve the order/reservation, mark setup failure truthfully, and allow same-key retry |
| Webhook handler | acknowledge within 2 s after warm start | Provider retries; duplicate processing remains harmless |

Use PostgreSQL indexes and bounded querysets first. Cache public immutable assets through normal HTTP cache headers and the clients' caches. Do not introduce Redis. Process-local caching may be used only for non-sensitive, reconstructible reads with a short TTL and explicit invalidation trade-off.

## 7. Database migration and rollback

Use expand → deploy → backfill → validate → cut over → contract:

1. Add nullable/new tables, constraints that can be introduced safely, and indexes without removing old columns.
2. Deploy code that can read legacy and target records while writing the target representation.
3. Backfill in bounded, resumable batches; record counts and rejected rows without logging personal/payment data.
4. Validate row counts, totals, ownership links, uniqueness, and state-machine invariants against a disposable PostgreSQL copy.
5. Switch reads only after metrics and contract tests pass. Keep compatibility aliases for the agreed window.
6. Remove old structures in a later release only after rollback and legacy-consumer evidence shows they are unused.

Rollback before the contract step is a code rollback plus continued use of expanded schema. A payment migration must never downgrade a terminal paid/refunded state or delete provider references/event evidence. Destructive rollback requires a reviewed data-recovery plan and explicit authorization.

## 8. Operations and incident handling

### Required environment variables

- Django secret key and production security flags.
- Internal `DATABASE_URL` supplied by Render.
- PayMongo secret key, webhook secret, and explicit test/live mode for online methods/webhooks. Missing secrets fail the affected operation closed; they do not prevent COD-only local startup.
- Public app/web return URLs and strict allowed hosts/origins.
- Optional operational thresholds such as webhook timestamp tolerance and reconciliation minimum age.

Do not commit values. Production startup requires the Django secret. Online checkout returns a typed unavailable response when its provider secret is absent; the webhook returns `503 webhook_not_configured` when its signing secret is absent.

### Health checks

- **Implemented liveness:** `GET /health/` returns `{"status":"ok"}` without querying the database or external providers.
- **Not implemented:** a distinct readiness/database probe and provider-capability health surface.
- Payment provider degradation does not block liveness or COD; an online attempt fails closed through its typed checkout error.

### Payment incident sequence

1. Stop exposing the affected online method through a reviewed client/server configuration or code change; dynamic provider capability configuration is not implemented. Do not alter already-paid orders.
2. Preserve webhook inbox rows, provider references, payment/order state, and available audit data.
3. Query pending/ambiguous attempts using redacted database/operator tooling and compare them with PayMongo under an explicitly authorized procedure. No reconciliation command exists yet.
4. Apply fixes through idempotent transitions; never mark paid from a customer receipt alone.
5. Record impact, timeline, and reconciliation evidence. Refund handling is not implemented; any future refund or secret rotation requires explicit authority and provider coordination.

## 9. Unverified external checks

The following are **UNVERIFIED** until executed against the intended environment: current Render free-plan availability/limits, Blueprint application, production server boot, PostgreSQL migration and rollback, database retention/restore, custom-domain TLS, cold-start timings, PayMongo account activation for GCash/Maya/card, signed sandbox/live webhook delivery, real refunds, native deep-link behavior, and end-to-end payment on physical Android/iOS devices. No payment or infrastructure spend is authorized by this document.
