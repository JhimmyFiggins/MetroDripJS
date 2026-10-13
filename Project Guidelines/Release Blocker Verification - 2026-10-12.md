# Release Blocker Verification — 2026-10-12 to 2026-10-13

## 1. Release decision

**Not ready for release. Release remains HOLD.**

The safe local investigation materially improved confidence: PostgreSQL 16 migrations, upgrade behavior, rollback boundaries, backup/restore, and critical concurrency invariants are now exercised; PostgreSQL-only defects were fixed; throttling is shared and atomic at the database layer; real browser-to-Django journeys and automated accessibility scans pass; bounded local cold-start/load evidence exists; Expo configuration and all-platform bundling pass; and compatible dependency updates reduced the audit total.

Release is still blocked because the persistent SQLite database has seven unapplied migrations and was intentionally left unchanged; PayMongo sandbox delivery, physical Android/iOS, and real screen-reader checks need credentials or hardware; connected Render service/database/log inspection still needs workspace confirmation; merchant tenancy and MFA/recent-authentication policy are unresolved; and `npm audit` still reports 36 findings. The declared Render Free PostgreSQL target also expires after 30 days and has no provider recovery capability, which Render explicitly says is not suitable for production use: [Render free-instance limitations](https://render.com/docs/free) and [Render backup/restore guidance](https://render.com/articles/how-to-back-up-and-restore-postgresql-databases).

```text
Source + local checks ── PASS
        │
        ├─ Disposable PostgreSQL reliability ── PASS
        ├─ Browser-to-Django + Axe ──────────── PASS
        ├─ Expo bundle/config ───────────────── PASS
        │
        └─ Release gates
             ├─ Persistent DB migration ─────── AWAITING APPROVAL
             ├─ PayMongo sandbox ────────────── BLOCKED BY ACCESS
             ├─ Physical devices/screen reader  BLOCKED BY HARDWARE
             ├─ Connected Render inspection ─── BLOCKED BY CONFIRMATION
             └─ Tenancy/MFA/dependencies ────── OPEN
```

**Authority boundary observed:** only reversible repository edits and disposable local resources were changed. The existing SQLite database, Render configuration, connected database, payment-provider configuration, and live payment state were not changed. No deployment, charge, refund, commit, or push was performed.

## 2. Blocker matrix

| Original blocker | Status | Changes made | Verification performed | Remaining work |
|---|---|---|---|---|
| Persistent local database has pending migrations | **Awaiting approval / failing target gate** | Added `identity.0006_request_rate_limit_bucket`; reviewed the original six pending migrations and the new additive throttle migration. | `makemigrations --check --dry-run` reports no drift. Fresh and legacy-shaped PostgreSQL databases migrated successfully. Existing `metrodrip_backend/db.sqlite3` still reports seven pending migrations and was not modified. | Approve the exact SQLite target, offline backup, hash/integrity check, migration, and rollback procedure in section 5. |
| PostgreSQL migration, rollback, concurrency, backup, and restore | **Fixed and verified locally** | Corrected PostgreSQL-incompatible row locking in checkout and review eligibility; added PostgreSQL concurrency regression tests. | PostgreSQL 16 fresh migration; previous-schema upgrade with representative data; reverse/forward migration rehearsal; custom-format dump and separate restore; restored application checks; 81-test PostgreSQL suite; same-key checkout, stock=1 contention, duplicate-paid-webhook, and shared-throttle concurrency tests. | Repeat backup/migration/smoke evidence against the authorized connected target before release. Local Docker proof does not establish Render database health. |
| PayMongo sandbox/webhook and physical Android/iOS | **Local logic verified; blocked by access/hardware** | Added late/out-of-order event, event-ID collision, supplied-mode mismatch, stale-signature, and concurrent duplicate webhook coverage. No provider integration or live-mode code was invoked. | Local signed-fixture tests and PostgreSQL concurrent duplicate delivery pass. Expo Doctor and Android/iOS/web JavaScript export pass. | Run the test-mode provider checklist and physical-device matrix in section 5 with approved PayMongo test secrets and real Android/iOS devices. |
| Real screen reader, browser-to-Django, load/cold-start, and connected Render | **Partially fixed and verified; external gates remain open** | Added a real Playwright/Django integration harness, Axe scans, and a bounded local load probe; corrected three confirmed light-theme contrast failures. | Seven browser/API/session checks pass; Axe WCAG A/AA scans pass on four critical pages; 64 responsive/state cases and dialog keyboard checks pass; local PostgreSQL load probe has zero errors; public Render `/health/` returned 200. | Execute real NVDA/VoiceOver/TalkBack checks. Confirm the Render workspace so deployment logs, environment presence, connected database, and service settings can be inspected read-only. No connected load was run. |
| Merchant tenancy, MFA/recent auth, shared throttling, and 38 npm advisories | **Partially fixed; policy and dependency blockers remain** | Replaced process-local scoped throttles with atomic database-backed counters, hashed identities, a pruning command, migration, and concurrency test. Applied only compatible npm updates; repaired Expo config through the supported build-properties plugin. | Two parallel PostgreSQL connections share a `1/min` limit: exactly one succeeds. Pruning and migration reverse/forward pass. `npm audit` improved from 38 to 36 findings; Expo Doctor 18/18, SDK dependency check, TypeScript, tests, and all-platform export pass. | Decide single-store versus multi-tenant policy; approve MFA/recent-auth policy and rollout; complete an Expo/React Native dependency-upgrade project; assign dependency owner and review date. No risk has been accepted. |

## 3. Change summary

The worktree was already dirty when this verification began. Existing unrelated changes were preserved. Relevant changes from this release-blocker pass are:

| Files | Change |
|---|---|
| `metrodrip_backend/orders/checkout.py` | Lock only the reservation row with PostgreSQL `FOR UPDATE OF self`, avoiding the nullable outer-join failure caused by `select_related('variant')`. |
| `metrodrip_backend/catalog/views.py` | Replace a `DISTINCT` query under row locking with an `Exists`/`OuterRef` eligibility subquery, avoiding PostgreSQL's `FOR UPDATE ... DISTINCT` rejection. |
| `metrodrip_backend/orders/tests_postgres_concurrency.py` | Add real PostgreSQL business-invariant tests for same-key idempotency, no oversell at stock=1, and duplicate paid-webhook delivery. |
| `metrodrip_backend/orders/tests_payments.py` | Add late-event, collision, mode-mismatch, and stale-timestamp payment regressions. |
| `metrodrip_backend/identity/models.py`, `identity/migrations/0006_request_rate_limit_bucket.py`, `identity/throttling.py` | Add one shared fixed-window row per scope and SHA-256 identity digest, using PostgreSQL row locks for atomic enforcement without storing the raw IP/user cache key. |
| `metrodrip_backend/identity/views.py`, `catalog/views.py`, `orders/views.py`, `metrodrip_backend/settings.py` | Route all configured endpoint scopes through the shared database limiter while retaining the existing rates. |
| `metrodrip_backend/identity/tests_throttling.py` | Prove simultaneous independent PostgreSQL connections cannot both pass a `1/min` limit. |
| `metrodrip_backend/identity/management/commands/prune_rate_limit_buckets.py` | Add bounded cleanup for inactive limiter identities; default is 168 hours and at most 1,000 rows per run. |
| `tests/browser/run-console-integration.mjs`, `package.json` | Add owned-server, real browser-to-Django staff authentication/authorization/error checks and Axe scans. |
| `tests/performance/run-local-api-smoke.mjs`, `package.json` | Add a capped local cold-start and latency probe. It refuses more than 1,000 requests or concurrency above 50. |
| `web/css/console.css` | Darken the success and danger tokens so status/action controls pass Axe contrast checks on the light console theme. |
| `app.json`, `app.config.js`, `package.json`, `package-lock.json` | Remove invalid Expo schema fields, correctly inherit static config in the dynamic config, configure conditional Android cleartext through `expo-build-properties`, add Axe, and apply compatible audit updates. |

## 4. Verification evidence

### 4.1 Database and target runtime

The declared stack was installed in an isolated environment: Python 3.14.5, Django 5.2.16, DRF 3.18.1, psycopg 3.3.6, and PostgreSQL 16. This avoids treating the developer `.venv` (Python 3.15 beta/Django 6.1.1) as deployment proof.

| Executed check | Observed result | Boundary |
|---|---|---|
| Full migration history on a fresh PostgreSQL 16 database | **PASS** | Disposable local container only. |
| Upgrade from `catalog.0011`, `content.0001`, `fulfillment.0002`, `identity.0003`, and current order/framework migrations | **PASS** | Representative synthetic data only. Legacy password became PBKDF2 and still verified; banner text copied; reservation defaulted active/warehouse 1; an existing NCR fee stayed 999; only exact seeded demo notifications were removed. |
| Migration SQL review | **PASS** | `sqlmigrate` reviewed before upgrade. New throttle table is additive. Original password/zone/notification data migrations are intentionally not data-reversible. |
| Original reverse/forward rehearsal | **PASS** | Schema objects reversed and reapplied on a disposable rollback database. Hashed passwords/zones remained and deleted demo rows did not reappear, so exact data rollback requires backup restore. |
| Throttle migration reverse/forward | **PASS** | `identity.0006` reversed to `0005`, table absence confirmed, then reapplied and `manage.py check` passed. Counter loss on reverse is expected and does not affect commerce records. |
| Final custom-format backup/restore | **PASS** | `pg_dump -Fc --no-owner`; SHA-256 `fb30109f4fcf64419177ffc782a9760816d738cd65d42977c241a8ba566d0cd7`; restored into a separate database with `pg_restore --exit-on-error`. |
| Restored key counts | **MATCH** | Both source and restored DBs: 53 migrations, 1 account, 1 reservation, 1 legitimate notification, 3 shipping zones, 0 limiter rows. Restored password and reservation invariants passed. |
| PostgreSQL full suite | **81 passed** in 48.899 s | Includes all PostgreSQL concurrency and payment regressions. |
| SQLite full suite | **77 passed, 4 PostgreSQL-only skips** in 36.208 s | Temporary test database; the persistent SQLite file was not changed. |
| Persistent SQLite migration plan | **Seven pending** | `catalog.0012`, `content.0002`, `fulfillment.0003/0004`, `identity.0004/0005/0006`. |
| Model drift | **No changes detected** | `manage.py makemigrations --check --dry-run`. |

The PostgreSQL baseline initially failed 14 of 75 tests. The two mechanisms were genuine engine differences: `FOR UPDATE` on the nullable side of an outer join and `FOR UPDATE` combined with `DISTINCT`. Both were fixed before the 81-test pass.

### 4.2 Concurrency, payments, and throttling

- Two simultaneous checkouts with one idempotency key produced one order and one inventory movement; one response was the replay.
- Two customers competing for stock quantity 1 produced one success and one `insufficient_stock`; inventory did not oversell.
- Two simultaneous deliveries of the same paid webhook produced one processed result and one duplicate; one webhook row, transition, and stock movement remained.
- A paid order ignored a later expiry event and retained paid/placed/committed state.
- Reused provider event ID with changed content returned `409`; supplied-mode mismatch and stale timestamp returned `401`; none marked the payment paid.
- Two independent PostgreSQL connections hitting one `1/min` throttle produced exactly `[false, true]`; the stored identity was a 64-character digest with no raw test IP.
- A synthetic eight-day-old limiter row was removed by `prune_rate_limit_buckets`; a current row was not used for this proof.

These are local provider-fixture results. No PayMongo network request, sandbox checkout, real webhook delivery, charge, or refund occurred.

### 4.3 Browser and accessibility

| Command/check | Result |
|---|---|
| `npm run test:browser:integration` against owned Django + static servers + disposable PostgreSQL | **PASS:** 7 staff/session/API checks. Admin and merchant login succeeded, wrong-role sessions were rejected/revoked, merchant access to admin data was denied, and invalid credentials failed. |
| Axe WCAG A/AA on admin/merchant login plus admin users/merchant orders | **PASS:** 4 pages, after fixing confirmed contrast failures. |
| `npm run test:browser` | **PASS:** 64 mocked responsive/state cases; Add User Escape, focus return, and Tab containment passed. |
| Browser/network/server error monitoring | **PASS** for exercised flows | Unexpected HTTP 4xx/5xx responses fail the integration harness; only the intentionally invalid login `401` is allowed. |

Automated Axe and keyboard checks are partial evidence. No real screen reader was available, so that gate stays open.

### 4.4 Load and cold start

Environment: local Django development server, loopback only, disposable PostgreSQL; 100 requests per path at concurrency 10. The thresholds below are **provisional and unapproved**, not a production SLO or capacity claim.

| Measurement | Observed | Provisional comparison |
|---|---:|---:|
| Health readiness / cold start | 1,741.2 ms | ≤ 10,000 ms: pass |
| `/health/` | 0/100 errors; p50 12.1 ms; p95 23.3 ms; max 30.6 ms | p95 ≤ 250 ms: pass |
| `/products/` | 0/100 errors; p50 68.0 ms; p95 96.0 ms; max 103.7 ms | p95 ≤ 750 ms: pass |

CPU, memory, database saturation, and production-like Gunicorn capacity were not measured. No connected-service load was generated.

### 4.5 Client, Expo, and dependencies

| Check | Observed result |
|---|---|
| `npm run test:client` | **148 passed** |
| `npx tsc --noEmit` | **PASS** |
| `npx expo install --check` | **Dependencies up to date for Expo SDK 54** |
| `npx expo-doctor` after config repair | **18/18 passed** |
| Resolved config | Remote HTTPS API → Android cleartext `false`; explicit loopback/emulator HTTP → `true`; `expo-font` retained. |
| `npx expo export --platform all` | **PASS:** web, iOS, and Android bundles plus 106 output files; temporary export removed. This is not a native install/device test. |
| `npm ls --depth=0` | **PASS**, no invalid top-level tree. |
| Compatible `npm audit fix` | Updated safe transitives; findings reduced from 38 to **36: 24 high, 12 moderate, 0 critical**. |
| Follow-up `npm audit fix --dry-run` | Reports the tree is up to date; remaining broad fixes require incompatible/breaking changes. |

The 36 findings also appear under `npm audit --omit=dev` because Expo/React Native own the affected Metro/Jest/config dependency paths. Main groups are Metro/Jest glob parsing, `image-size`, Expo CLI/config (`node-forge`, `postcss`, `uuid`), and Istanbul/Jest YAML formatting paths. The audit's forced suggestions would install React Native 0.87.1 or downgrade Expo to 44.0.6, both incompatible with the verified Expo SDK 54 set. No forced change was made and no remaining risk is accepted.

### 4.6 Production settings and Render boundary

- Production-mode `manage.py check --deploy` completed with only `security.W005` and `security.W021`: `SECURE_HSTS_INCLUDE_SUBDOMAINS` and `SECURE_HSTS_PRELOAD` remain false. Those flags need verified control of every subdomain and an explicit preload commitment; they were not enabled by assumption.
- Production-mode `collectstatic --dry-run --noinput` passed.
- One read-only public request to `https://metrodripjs.onrender.com/health/` returned `200 {"status":"ok"}` after 43.5 seconds. A subsequent request returned 200 with `Strict-Transport-Security: max-age=31536000`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Referrer-Policy: same-origin`.
- The long first response is consistent with Render's documented Free service idle spin-down, but it is only one observation—not a latency distribution or deployment proof.
- No current deploy SHA, logs, connected database state, or environment presence was inspected because the Render connector requires explicit confirmation of the only offered workspace, **REUEL's workspace**. No Render setting or deployment was changed.

## 5. Outstanding actions

### 5.1 Approval request: migrate the persistent SQLite database

**Target:** `metrodrip_backend/db.sqlite3` only. **Expected change:** apply the seven pending migrations listed above, including password hashing, new access-token and rate-limit tables, reservation lifecycle fields, banner fields, three default shipping zones, and exact demo-notification cleanup.

After explicit approval, the operator should:

1. Stop every local writer and record the current commit/worktree state.
2. Copy the database to an approved non-repository backup location with a UTC timestamp; do not upload it. Record SHA-256 and file size.
3. Open the backup read-only and run SQLite `PRAGMA integrity_check` plus representative account/order/inventory counts.
4. Run `manage.py migrate --plan`, then `manage.py migrate --noinput` with the declared Django 5.2.16 environment.
5. Verify no migrations remain; run `manage.py check`; verify legacy login/password hash, representative orders, inventory/reservations, shipping fees, banners, and legitimate notifications.
6. On failure, stop writers, preserve the failed copy for diagnosis, restore the hashed backup, and return to the prior code. Do not try to reverse the irreversible data migrations to reconstruct deleted/plaintext data.

Required approval: **“Approve backup and migration of `metrodrip_backend/db.sqlite3` using the procedure above.”**

### 5.2 PayMongo test-mode acceptance

Required access: approved PayMongo test secret/webhook secret and a staging HTTPS endpoint. Keep `PAYMONGO_MODE=test`; never expose values in logs or client variables.

For each case, record provider checkout/session/event IDs in a restricted test record, order reference, timestamps, HTTP result, local payment/order/reservation transitions, and redacted logs:

1. Successful GCash, Maya, and card Hosted Checkout; redirect alone stays pending, then the signed webhook marks paid exactly once.
2. User cancellation and provider-declined/failed flow; order remains truthful and retryable without duplicate stock movement.
3. App/browser return before webhook, delayed webhook after return, and app background/kill before return.
4. Exact duplicate delivery, concurrent duplicate delivery, and same event ID with changed body.
5. Paid event followed by stale expiry/failure event; paid state must not regress.
6. Invalid signature, stale timestamp, wrong test/live mode, wrong amount/currency/reference, unknown session, provider timeout, and lost session-create response recovery.
7. Confirm webhook endpoint `POST /api/payments/paymongo/webhook/` is publicly reachable over HTTPS and that logs contain no signature, secret, hosted URL query data, address, or bearer token.

Live mode, real charges, refunds, or provider configuration changes require separate explicit approval.

### 5.3 Physical Android/iOS matrix

ADB, Android emulator tooling, and iOS tooling were unavailable on this Windows host. Use at least one supported physical Android device and one physical iPhone:

| Record | Required detail |
|---|---|
| Environment | Device model, OS, app build/version, browser/webview version, API base, PayMongo test mode, network type. |
| Core flow | Login → product/variant → cart → address/zone → each payment method → hosted authentication → app return → owned order status. |
| Recovery | Cancel, decline, app switch/background, app kill, repeated deep link, offline during redirect, offline on return, stale session, retry after reconnect. |
| Assertions | No raw credential fields; no cart clearing before verified completion; no paid state from redirect; one order/stock effect; clear pending/error/retry state; final state matches webhook. |
| Evidence | Start/end UTC time, expected result, actual result, redacted screenshot/video/log reference, tester, pass/fail/blocked. |

### 5.4 Real screen-reader walkthrough

Run NVDA + Chrome on Windows and VoiceOver + Safari on iOS/macOS; add TalkBack on Android for the customer app:

1. Staff login: labels, required/error announcements, password visibility, submit state, invalid-credential focus, successful page title/landmark.
2. Admin users: heading/table semantics, status text independent of color, Add User modal name/description, initial focus, Tab containment, Escape/close focus return, mutation success/error announcement.
3. Merchant orders: filters, table/list labels, order-detail timeline, cancellation confirmation, error/retry status, focus after refresh.
4. Customer app: login, product/variant selection, cart quantities, checkout fields/payment choice, hosted handoff warning, return/pending/paid/error state, order history/detail.
5. Record screen reader/version, browser/device, keyboard/gesture steps, spoken output, focus order, expected/actual result, and defect IDs. Automated Axe evidence does not close this gate.

### 5.5 Connected Render read-only inspection

First confirm: **“Use REUEL's workspace for read-only Render inspection.”** Then, without deploying or editing:

1. Confirm service/database names, plan, region, branch, deployed commit, and latest deploy status.
2. Compare build/start/health commands with `render.yaml`; inspect build logs for dependency install, collectstatic, migrations, and Gunicorn start.
3. Check presence—not values—of database, Django, PayMongo test, host/CSRF, and SSL variables.
4. Confirm connected PostgreSQL status/version, migration `identity.0006`, connection errors, storage/expiry date, and backup/recovery availability.
5. Verify static assets, `/health/`, staff login/API CORS, customer API base, and HTTPS webhook reachability with bounded smoke requests only.
6. Review logs for migration failures, 5xx, database lock errors, webhook rejection codes, and secret/PII leakage. Do not run connected load without separate approval.

### 5.6 Product/security decisions

**Merchant tenancy:** the current product has one shared storefront dataset and a coarse `merchant|admin` staff boundary. Choose one option before implementation:

- Single-store operations: explicitly declare store tenancy not applicable, then define finer action permissions for catalog, inventory, fulfillment, content, reviews, exports, and user administration.
- Multi-merchant marketplace: add `Store` and `StoreMembership`, place an authorized store owner/reference on every merchant-owned resource and query, derive tenant context from the authenticated membership rather than a client-supplied ID, and add cross-tenant list/detail/write/export/file/payment negative tests.

**Proposed MFA/recent-auth policy for approval:** require MFA for admin and merchant accounts; use a supported TOTP/WebAuthn or external identity integration; issue one-time recovery codes; require a fresh challenge within 10 minutes for staff creation/role/status/password changes, session revocation, exports, inventory restock, catalog/content mutation, review moderation/replies, shipping-zone/status changes, and cancellations. Define enrollment grace period, recovery owner, lost-factor reset, audit events, support escalation, and rollback before enabling enforcement. The current `/users/me/mfa/` truthfully returns `501 mfa_unconfigured`; no user was silently locked out.

**HSTS:** operations/domain owner must decide whether every current and future subdomain is HTTPS-only and whether to make the long-lived browser preload commitment before enabling `includeSubDomains` or `preload`.

### 5.7 Dependency follow-up

Proposed owner: **Mobile/Release Engineering**. Proposed review date: **2026-10-20**. This is a proposed assignment, not accepted risk.

1. Track Expo SDK and React Native releases that carry fixed Metro, Jest, Expo config, `image-size`, `node-forge`, `postcss`, `uuid`, and YAML dependency trees.
2. Upgrade Expo/React Native together in an isolated branch using `npx expo install`, never the audit's forced Expo downgrade or uncoordinated React Native major.
3. Re-run Expo Doctor, config resolution, Android/iOS/web export, TypeScript, 148 client tests, 81 backend tests, browser/Axe, and physical-device acceptance.
4. Until then, accept only trusted repository/build inputs, do not process attacker-controlled source maps/images/globs through the developer toolchain, and keep CI/build credentials least-privileged. These mitigations do not close the audit blocker.

## 6. Deployment and recovery notes

1. **Do not deploy this worktree as-is.** Review and separate the pre-existing dirty changes from this blocker pass, then run the final checks on the exact candidate commit.
2. **Back up before migration.** For a PostgreSQL target, create a custom-format logical dump, hash it, restore it into a separate database, and run application/invariant checks before touching the target. Render Free PostgreSQL has no provider recovery feature and expires, so it cannot meet a normal production commerce recovery objective without an approved durable replacement/backup design.
3. **Migration order:** deploy application code compatible with the additive schema; apply all migrations once; verify `identity.0006`, health, static assets, login, catalog, checkout, and payment capability state. Do not allow concurrent deploy jobs to race migrations.
4. **Rollback:** leaving the additive throttle table in place is compatible with the prior application and is safer than reversing it during an incident. Reversing `identity.0006` was tested and only loses ephemeral counters. Exact rollback across password hashing, zone seeding, or demo-notification deletion requires restoring the tested backup; reverse migrations do not reconstruct that data.
5. **Monitor after an authorized deploy:** migration/build duration, startup and health readiness, database connections/locks, 429 rate, login/signup/reset failures, checkout idempotency conflicts, insufficient-stock rate, payment transition/webhook outcomes, 5xx, and any sensitive-data leakage. Define alert thresholds before calling the release ready.
6. **Limiter maintenance:** schedule or manually run `python manage.py prune_rate_limit_buckets --older-than-hours 168 --batch-size 1000`. The free Blueprint has no worker/cron/one-off shell, so the operational owner must approve a practical execution path. App-level throttling also does not replace provider/edge protection against volumetric traffic.
7. **Recovery objective remains unapproved.** Record an owner and acceptable RPO/RTO, then prove restore time and post-restore reconciliation on the actual hosting plan before release.

## Cleanup record

The exact disposable PostgreSQL container and isolated Python environment used for this report are removed after final repository hygiene checks. The Expo export directory was verified under the system temporary directory and removed. The existing project SQLite database and every external/connected resource remain untouched.
