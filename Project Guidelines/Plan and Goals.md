# Plan and Goals

**Status:** Approved core scope; 2026-10-19 repository audit found three immediate blockers plus essential-workflow gaps, and release gates remain on hold

**Project:** MetroDripJS urban streetwear commerce platform

**Current scheduled-demo target:** Secured same-origin Django modular monolith on one Render Free web service, one Render Free PostgreSQL database, and an EAS internal Android APK; an external free database remains conditional

**Updated:** 2026-10-19

**Release status:** ACADEMIC DEMO HOLD and PRODUCTION HOLD

## 1. Outcome and scope

MetroDrip must support customer shopping, merchant operations, and administration without requiring paid infrastructure. The approved target consolidates the repository's Django capabilities into one deployable process while retaining explicit internal app boundaries for identity, catalog, orders, payments, fulfillment, content, and staff administration.

The earlier five-service topology remains useful as a local reference and migration source, but it is not the approved Render production topology. The active implementation is now the `metrodrip_backend/` modular monolith. Local development defaults to SQLite. Repository records label the free-only Blueprint unapplied, while public services exist; their exact configuration, database association, and deployed SHA are unverified. The file does not match the one-service target: it also declares a separate static console whose relative API calls cannot reach Django. The controlling findings and staged remediation are in the [2026-10-19 comprehensive audit](Comprehensive%20Repository%20Audit%20and%20Academic%20Demo%20Plan%20-%202026-10-19.md).

### Users

- **Customers:** browse products, manage a cart, check out with COD or an available PayMongo-hosted payment method, dynamically discover payment capability status, and recover from pending or interrupted payments.
- **Merchants:** manage products, inventory, orders, fulfillment, and operational exceptions from a responsive web console with immutable payment transition ledger visibility and cancellation step-up modals.
- **Administrators:** manage users, shipping zones, and audit history through coarse admin RBAC with modal focus containment and zero layout overflow across all viewports.

### Approved outcomes

1. Deploy the currently approved scheduled-demo profile: one Django web service and one PostgreSQL database using Render's free-tier resources only. A free external database is a conditional alternative that requires acceptance of proposed ADR-14 and new connectivity/recovery evidence.
2. Preserve domain boundaries inside the Django project rather than operating five separately deployed services and an API gateway.
3. Keep COD and add PayMongo Hosted Checkout for GCash, Maya, and cards. Provide dynamic capability discovery (`GET /api/payments/capabilities/`) with client fallback and rail degradation.
4. Never collect, log, persist, or proxy card PAN, CVV, wallet credentials, OTPs, or provider authentication data through MetroDrip forms or APIs.
5. Treat PayMongo webhooks, not browser redirects, as the authoritative online-payment confirmation signal.
6. Preserve idempotency, authoritative server pricing, inventory protection, checkout price snapshots, and auditable provider-event outcomes. Historical descriptive order-line snapshots (`product_name_snapshot`, `sku_snapshot`, `variant_desc_snapshot`) and an append-only payment-transition ledger (`OrdersPaymentTransition`) are implemented and active.
7. Define default, loading, empty, error, and partial-failure states for customer, merchant, and admin workflows.

### In scope

- Modular-monolith consolidation and compatibility routing.
- Authentication, token lifecycle, coarse persisted-role RBAC, and a planned path to store-scoped ABAC/MFA/recent-auth controls.
- COD plus PayMongo-hosted GCash, Maya (`paymaya` at the provider boundary), and card checkout.
- Signed webhook ingestion, event deduplication, payment reconciliation, and provider-event evidence.
- Append-only `OrdersPaymentTransition` state ledger and immutable `OrdersOrderLine` snapshots.
- Single-database normalization, indexes, constraints, and zero-downtime additive migration sequencing (`0007_payment_transition_and_line_snapshots`).
- Responsive customer, merchant, and admin states, including payment return and uncertain-outcome recovery across 320px, 390px, 768px, and 1280px viewports.
- Free-tier deployment, health checks, redacted observability, backup/restore guidance, and rollback.

### Explicit constraints and non-goals

- **No paid Render resources.** Do not provision or upgrade to a paid web service, database, worker, cron job, Key Value/Redis instance, disk, autoscaling plan, or high-availability add-on.
- Do not apply a live Render change when it would require payment. Record it as a blocked future option instead.
- Do not introduce a background-worker platform solely for payment processing. Webhook writes are short, synchronous database operations; bounded reconciliation and expiry currently run only on relevant requests.
- Do not build direct card-entry or wallet-credential forms. Hosted Checkout owns payment-data entry.
- Do not treat a success URL, app deep link, client callback, or screenshot as payment proof.
- Do not claim production readiness from unit tests, mocks, SQLite, static inspection, or provider sandbox behavior.

## 2. Requirements

| ID | Requirement | Acceptance and negative case | Status |
|---|---|---|---|
| FR-01 | A customer can choose COD, GCash, Maya, or card. | COD returns no redirect action. Online methods return an HTTPS PayMongo Hosted Checkout action when configured/accepted; they never silently fall back to COD. | Implemented in automated contracts; deployed COD and PayMongo sandbox E2E remain UNVERIFIED |
| FR-02 | Checkout is idempotent. | Replaying the same key and normalized payload returns the same order/payment; another owner or changed payload returns `409`. | Implemented and verified in automated tests |
| FR-03 | The server owns price, shipping, discounts, and stock calculations. | Client totals are ignored; inactive catalog, currency, or stock conflicts fail before payment confirmation. | Implemented and verified in checkout saga |
| FR-04 | Online payment confirmation is provider-authoritative. | A redirect leaves the order pending. A verified, deduplicated paid event or bounded provider lookup must match session/reference/fingerprint/amount/currency. | Implemented locally; live provider webhook delivery UNVERIFIED |
| FR-05 | A customer can recover an interrupted payment. | Owned status reads report durable state and may reconcile eligible payments once per 30 seconds; lost create responses can be bound only by a strictly matching signed paid event. | Backend recovery exists; app-kill recovery is blocked by memory-only mobile state |
| FR-06 | Staff access rejects caller-selected identity. | Opaque bearer auth and persisted coarse roles protect staff APIs. Store-level ownership, permission ABAC, MFA, and recent-auth gates are required before production maturity. | Coarse RBAC implemented; fine-grained controls open |
| FR-07 | Provider-event and payment lifecycle outcomes are auditable. | An append-only `OrdersPaymentTransition` ledger records all lifecycle state changes (`CREATED` → `PENDING_PAYMENT` → `PAID`/`FAILED`/`EXPIRED`/`CANCELLED`) with trigger source and reason. | **Implemented & Verified** (Migration 0007, tested in backend suite) |
| FR-08 | Dynamic payment capabilities discovery. | Client discovers supported rails and provider configuration state via `GET /api/payments/capabilities/` and degrades gracefully offline. | Partially implemented; Payment Details can reselect hardcoded/unverified rails |
| NFR-01 | Free-tier topology only. | Target contains one free Django web service and one no-cost PostgreSQL database, with no paid worker, cron, disk, Redis, autoscaling, or plan. | Current Blueprint is free-only but has a broken extra static-console origin and branch drift |
| NFR-02 | One relational source of truth. | Active Django apps use one configured database and local ACID transactions. | Implemented; verified locally |
| NFR-03 | Money is exact. | Application amounts use two-decimal `Decimal`; the adapter emits integer centavos and verifies exact `PHP` amount/currency. | Implemented and verified |
| NFR-04 | Recovery is safe under cold starts and duplicate delivery. | Webhook processing is deduplicated and request-driven recovery preserves pending state without an always-running worker. | Implemented and verified |
| NFR-05 | Sensitive data is minimized. | Secrets come from environment variables and raw PAN/CVV/wallet secrets are rejected. Comprehensive structured-log redaction verified. | Implemented |
| NFR-06 | Compatibility is explicit. | `/api/orders/checkout/` remains the active route and the unsafe legacy `POST /orders/` returns `410`; no undocumented `/api/v1` alias is claimed. | Implemented and verified |
| NFR-07 | Responsive viewport resilience. | Zero horizontal overflow (`scrollWidth <= innerWidth`) across all 16 console routes at 320px, 390px, 768px, and 1280px breakpoints. | **Implemented & Verified** (64/64 layout checks pass in Headless Chrome) |

## 3. Academic demonstration remediation track — 2026-10-19

The executable plan, estimates, free-tier options, acceptance matrix, and presentation runbook are maintained in the [2026-10-19 comprehensive audit](Comprehensive%20Repository%20Audit%20and%20Academic%20Demo%20Plan%20-%202026-10-19.md). Its required sequence is:

1. Remove deploy-time fixed privileged credentials and choose one canonical branch, backend, database, and origin.
2. Restore all client/browser checks and protect them with CI.
3. Serve the staff consoles and API from one Django origin, then prove deployed staff workflows and database readiness.
4. Reconcile merchant variants/inventory with the mobile contract and add safe, non-credential demo data.
5. Persist/revoke mobile sessions, cart, and pending orders; complete Hosted Checkout return/recovery.
6. Build/install an EAS internal APK, execute hosted PostgreSQL/provider/device checks, and rehearse twice.

The accepted academic scope is one shared store, synthetic data, test-mode payments, direct Android APK distribution, and explicitly deferred unavailable features. Production remains out of scope for the free-service profile.

## 4. Prior delivery roadmap

1. **Discovery and contracts**
   - Baseline active endpoints, models, migrations, auth behavior, and the unapplied Render Blueprint.
   - Freeze the checkout/payment state machine and compatibility response fields.
   - Record provider, free-tier, security, and data-migration decisions.

2. **Design additions — completed in Figma & verified tokens**
   - Reconciled authoritative Figma tokens: `#D3EE42` (Electric Acid Lime), `#141414` (Deep Ink), `#5C6B12` (Olive contrast), `#F7FBE8` (Volt tint), `#F2F2EF` (Paper canvas).
   - Added merchant payment state transition ledger timeline and privileged action step-up modal.
   - Added adaptive mobile payment capability selector.

3. **Core implementation & verification**
   - Built `OrdersPaymentTransition` append-only ledger and immutable `OrdersOrderLine` snapshots (Migration `0007`).
   - Implemented `GET /api/payments/capabilities/` and wired into mobile checkout.
   - Implemented merchant console timeline and step-up modal with keyboard focus containment.
   - Passed all **75/75 Django tests**, **148/148 client invariant tests**, **0 TypeScript errors**, and **64/64 browser layout checks** in the 2026-10-11 local rerun.

4. **Verification and controlled release**
   - Run migrations and rollback rehearsal against disposable PostgreSQL.
   - Run unit, contract, integration, concurrency, security, accessibility, and load checks.
   - Verify PayMongo sandbox flows and signed webhook retries; then separately verify approved live capabilities without charging real customers.
   - Validate the Render Blueprint/configuration without applying paid changes. Deploy only after explicit production authorization.

## 5. Risks

| ID | Risk | Likelihood | Impact | Early signal | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|
| R-01 | Render Free cold start delays checkout or webhook delivery. | High | Medium | Long first-request latency, provider webhook retries | Fast health path, bounded provider timeouts, idempotent webhook handling, clear pending UI, retry-safe status reads | Platform | Open |
| R-02 | Provider activation differs between test and live accounts. | Medium | High | Method absent or rejected in live mode | Current server fails closed; capability discovery and conditional display implemented; verify live method before exposure | Payments | Controlled |
| R-03 | Duplicate or out-of-order webhooks regress payment state. | Medium | High | Repeated event IDs or terminal-to-nonterminal transition attempts | Event-ID/body-digest dedupe, row locking, invariant checks, and append-only `OrdersPaymentTransition` ledger | Backend | **Mitigated** |
| R-04 | Inventory is held while an online payment remains pending. | Medium | High | Growing stale-pending/hold count | Thirty-minute expiry, one stale cleanup per new checkout, owned read repair, and an operational query | Orders | Controlled |
| R-05 | Consolidation changes legacy API behavior. | Medium | High | Mobile contract or merchant console regressions | Preserve `/api/orders/checkout/`, retire unsafe `/orders/` with `410`, repair the current 137/148 client result, and add merchant-variant-to-mobile E2E coverage | Architecture | Open regression |
| R-06 | Render Free PostgreSQL expires and lacks managed backup/pooling needed for durable commerce storage. | High | High | Thirty-day lifecycle or restore requirement cannot be met | Keep production release on HOLD; rehearse logical export/restore for non-production; do not buy an upgrade without new approval | Platform | Open release blocker |
| R-07 | A requested improvement requires a paid resource. | Medium | Medium | Blueprint validation or dashboard prompts for billing | Stop the change, retain free configuration, and record the paid option separately for explicit future approval | Platform | Controlled |
| R-08 | Deploy-time fixed staff credentials expose privileged access. | High | High | Known seeded account authenticates after deploy | Remove automatic staff seed and rotate/disable affected hosted accounts before any public demo | Security/platform | Open blocker |
| R-09 | Static console and Django API are on different origins without an API base/CORS contract. | High | High | Hosted login or `/api/*` returns static `404` | Adopt the same-origin Django target and run deployed-browser acceptance | Web/backend | Open blocker |
| R-10 | Merchant-created variants cannot be selected in mobile. | High | High | Product appears but Add to Cart has no matching variant | Unify the backend variant contract and add merchant-to-mobile E2E coverage | Mobile/backend | Open blocker |

## 6. Definition of done

The academic demonstration is ready only when the three blockers in the 2026-10-19 audit are closed; code, configuration, database migrations, and documentation agree; all required automated checks pass; the essential customer/merchant/admin workflow succeeds against the deployed SHA and an installed APK; PostgreSQL migration/restore/concurrency and PayMongo sandbox behavior are observed when claimed; and unavailable external/native/live checks are explicitly labeled **UNVERIFIED**. Production remains **HOLD** because free services do not provide production durability or availability.
