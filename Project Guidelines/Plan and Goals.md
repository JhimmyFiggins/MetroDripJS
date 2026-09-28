# Plan and Goals

**Status:** Approved scope; local code/Figma slice implemented; final and external verification pending

**Project:** MetroDripJS urban streetwear commerce platform

**Target architecture:** Secured modular Django monolith on one Render Free web service and one Render Free PostgreSQL database

**Decision date:** 2026-09-28

**Release status:** HOLD until the verification gates in [Verification and Evaluation](Verification%20and%20Evaluation.md) pass

## 1. Outcome and scope

MetroDrip must support customer shopping, merchant operations, and administration without requiring paid infrastructure. The approved target consolidates the repository's Django capabilities into one deployable process while retaining explicit internal app boundaries for identity, catalog, orders, payments, fulfillment, content, and staff administration.

The earlier five-service topology remains useful as a local reference and migration source, but it is not the approved Render production topology. The active implementation is now the `metrodrip_backend/` modular monolith. Local development defaults to SQLite; PostgreSQL and the unapplied free-only Render Blueprint remain verification targets. The controlling decisions are recorded in [Decisions and Handover](Decisions%20and%20Handover.md#active-architecture-decisions--2026-09-28).

### Users

- **Customers:** browse products, manage a cart, check out with COD or an available PayMongo-hosted payment method, and recover from pending or interrupted payments.
- **Merchants:** manage products, inventory, orders, fulfillment, and operational exceptions from a responsive web console.
- **Administrators:** currently manage users, shipping zones, and audit history through coarse admin RBAC. Custom role/settings persistence, permissions, and stores are target capabilities and presently fail closed or remain unmodeled.

### Approved outcomes

1. Deploy one Django web service and one PostgreSQL database using Render's free-tier resources only.
2. Preserve domain boundaries inside the Django project rather than operating five separately deployed services and an API gateway.
3. Keep COD and add PayMongo Hosted Checkout for GCash, Maya, and cards. The current client lists all four methods; server/provider rejection fails closed. Provider-account capability discovery and conditional method display remain open work.
4. Never collect, log, persist, or proxy card PAN, CVV, wallet credentials, OTPs, or provider authentication data through MetroDrip forms or APIs.
5. Treat PayMongo webhooks, not browser redirects, as the authoritative online-payment confirmation signal.
6. Preserve idempotency, authoritative server pricing, inventory protection, checkout price snapshots, and auditable provider-event outcomes. Full descriptive order-line snapshots, a payment-transition ledger, and versioned API aliases remain future work.
7. Define default, loading, empty, error, and partial-failure states for customer, merchant, and admin workflows.

### In scope

- Modular-monolith consolidation and compatibility routing.
- Authentication, token lifecycle, coarse persisted-role RBAC, and a planned path to store-scoped ABAC/MFA/recent-auth controls.
- COD plus PayMongo-hosted GCash, Maya (`paymaya` at the provider boundary), and card checkout.
- Signed webhook ingestion, event deduplication, payment reconciliation, and provider-event evidence. Refund and payment-transition models are not yet implemented.
- Single-database normalization, indexes, constraints, and zero-downtime migration sequencing.
- Responsive customer, merchant, and admin states, including payment return and uncertain-outcome recovery.
- Free-tier deployment, health checks, redacted observability, backup/restore guidance, and rollback.

### Explicit constraints and non-goals

- **No paid Render resources.** Do not provision or upgrade to a paid web service, database, worker, cron job, Key Value/Redis instance, disk, autoscaling plan, or high-availability add-on.
- Do not apply a live Render change when it would require payment. Record it as a blocked future option instead.
- Do not introduce a background-worker platform solely for payment processing. Webhook writes are short, synchronous database operations; bounded reconciliation and expiry currently run only on relevant requests. No monolith reconciliation/expiry management command exists yet.
- Do not build direct card-entry or wallet-credential forms. Hosted Checkout owns payment-data entry.
- Do not treat a success URL, app deep link, client callback, or screenshot as payment proof.
- Do not claim production readiness from unit tests, mocks, SQLite, static inspection, or provider sandbox behavior.

## 2. Requirements

| ID | Requirement | Acceptance and negative case | Status |
|---|---|---|---|
| FR-01 | A customer can choose COD, GCash, Maya, or card. | COD returns no redirect action. Online methods return an HTTPS PayMongo Hosted Checkout action when configured/accepted; they never silently fall back to COD. | Implemented locally; provider capability/live flow UNVERIFIED |
| FR-02 | Checkout is idempotent. | Replaying the same key and normalized payload returns the same order/payment; another owner or changed payload returns `409`. | Implemented; final rerun pending |
| FR-03 | The server owns price, shipping, discounts, and stock calculations. | Client totals are ignored; inactive catalog, currency, or stock conflicts fail before payment confirmation. | Implemented; PostgreSQL concurrency UNVERIFIED |
| FR-04 | Online payment confirmation is provider-authoritative. | A redirect leaves the order pending. A verified, deduplicated paid event or bounded provider lookup must match session/reference/fingerprint/amount/currency. | Implemented locally; sandbox/live delivery UNVERIFIED |
| FR-05 | A customer can recover an interrupted payment. | Owned status reads report durable state and may reconcile eligible payments once per 30 seconds; lost create responses can be bound only by a strictly matching signed paid event. | Implemented without reconciliation lease; final rerun pending |
| FR-06 | Staff access rejects caller-selected identity. | Opaque bearer auth and persisted coarse roles protect staff APIs. Store-level ownership, permission ABAC, MFA, and recent-auth gates are required before production maturity. | Coarse RBAC implemented; fine-grained controls open |
| FR-07 | Provider-event outcomes are auditable. | Webhook ID/type/reference/digest/result timestamps persist without credentials. A full actor/source/prior/new-state transition ledger is still required. | Partially implemented |
| NFR-01 | Free-tier topology only. | Unapplied Blueprint contains one free web service and one free PostgreSQL database, previews/auto-deploy off, and no paid resource. | Configured, not applied; free database causes production HOLD |
| NFR-02 | One relational source of truth. | Active Django apps use one configured database and local ACID transactions. | Implemented locally; PostgreSQL migration/restore UNVERIFIED |
| NFR-03 | Money is exact. | Application amounts use two-decimal `Decimal`; the adapter emits integer centavos and verifies exact `PHP` amount/currency. | Implemented; provider verification pending |
| NFR-04 | Recovery is safe under cold starts and duplicate delivery. | Webhook processing is deduplicated and request-driven recovery preserves pending state without an always-running worker. | Implemented with request-driven backlog limitations |
| NFR-05 | Sensitive data is minimized. | Secrets come from environment variables and raw PAN/CVV/wallet secrets are rejected. Comprehensive structured-log redaction still needs verification. | Partially implemented |
| NFR-06 | Compatibility is explicit. | `/api/orders/checkout/` remains the active route and the unsafe legacy `POST /orders/` returns `410`; no undocumented `/api/v1` alias is claimed. | Implemented; client-version telemetry absent |

## 3. Delivery roadmap

1. **Discovery and contracts**
   - Baseline active endpoints, models, migrations, auth behavior, and the unapplied Render Blueprint.
   - Freeze the checkout/payment state machine and compatibility response fields.
   - Record provider, free-tier, security, and data-migration decisions.

2. **Design additions — completed in Figma/source**
   - Removed raw credential entry from payment views and specified the hosted-checkout handoff.
   - Added pending verification, failed/expired, retry, uncertain submission, stock/catalog conflict, offline, permission-denied, session-expired, and partial-failure states.
   - Added customer `708:4544`, merchant `709:5008`, admin `710:4846`, ERD/topology `711:4544/4545`, and state matrix `720:4544/4545`; replaced misleading `2FA ON` labels with `VERIFIED SESSION`.

3. **Implementation**
   - Payment persistence, Hosted Checkout adapter, webhook verification, idempotency, owned status, token auth, coarse staff RBAC, fail-closed stubs, and additive migrations are implemented locally.
   - Merchant/admin consoles now require an authenticated session and explicit API states; runtime demo fallbacks are removed from targeted operational flows.
   - Remaining implementation includes ABAC/MFA/recent-auth, capability discovery, reconciliation lease/maintenance tooling, comprehensive logging/redaction, refund/transition modeling, and immutable descriptive line snapshots.

4. **Verification and controlled release**
   - Run migrations and rollback rehearsal against disposable PostgreSQL.
   - Run unit, contract, integration, concurrency, security, accessibility, and load checks.
   - Verify PayMongo sandbox flows and signed webhook retries; then separately verify approved live capabilities without charging real customers.
   - Validate the Render Blueprint/configuration without applying paid changes. Deploy only after explicit production authorization.

## 4. Risks

| ID | Risk | Likelihood | Impact | Early signal | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|
| R-01 | Render Free cold start delays checkout or webhook delivery. | High | Medium | Long first-request latency, provider webhook retries | Fast health path, bounded provider timeouts, idempotent webhook handling, clear pending UI, retry-safe status reads | Platform | Open |
| R-02 | Provider activation differs between test and live accounts. | Medium | High | Method absent or rejected in live mode | Current server fails closed; implement capability discovery/conditional display and verify each live method before exposure | Payments | UNVERIFIED |
| R-03 | Duplicate or out-of-order webhooks regress payment state. | Medium | High | Repeated event IDs or terminal-to-nonterminal transition attempts | Event-ID/body-digest dedupe, row locking, invariant checks, and persisted webhook outcome; add a full transition ledger later | Backend | Open |
| R-04 | Inventory is held while an online payment remains pending. | Medium | High | Growing stale-pending/hold count | Thirty-minute expiry, one stale cleanup per new checkout, owned read repair, and an operational query; add lease/maintenance tooling before scale | Orders | Open |
| R-05 | Consolidation changes legacy API behavior. | Medium | High | Mobile contract or merchant console regressions | Preserve the active `/api/orders/checkout/` contract, retire unsafe `/orders/` with explicit `410`, and use contract fixtures plus staged schema migration | Architecture | Open |
| R-06 | Render Free PostgreSQL expires and lacks managed backup/pooling needed for durable commerce storage. | High | High | Thirty-day lifecycle or restore requirement cannot be met | Keep production release on HOLD; rehearse logical export/restore for non-production; do not buy an upgrade without new approval | Platform | Open release blocker |
| R-07 | A requested improvement requires a paid resource. | Medium | Medium | Blueprint validation or dashboard prompts for billing | Stop the change, retain free configuration, and record the paid option separately for explicit future approval | Platform | Controlled |

## 5. Definition of done

This enhancement is complete only when code, Figma, database migrations, and documentation agree; all required automated checks pass; PostgreSQL migration/rollback and concurrent checkout behavior are exercised; sandbox online-payment paths and webhook retries are observed; no raw payment credentials appear in the client or server; Render configuration remains free-tier-only; and every unavailable external/native/live check is explicitly labeled **UNVERIFIED**. Release remains **HOLD** until those conditions are met.
