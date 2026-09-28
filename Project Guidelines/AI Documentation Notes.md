# AI Documentation Notes

MetroDripJS is an Expo/React Native customer app plus responsive merchant/admin consoles. The active implementation is the `metrodrip_backend/` Django modular monolith; local development defaults to SQLite and the approved but unapplied Blueprint targets one Render Free web service plus one free PostgreSQL database. Checkout supports COD and PayMongo Hosted Checkout for GCash, Maya, and cards. The five-service/gateway assets are historical migration sources. Release is **HOLD**, including because the current free PostgreSQL lifecycle is not durable production storage.

## Knowledge map

| Task area | Start with | Source and evidence anchors |
| --- | --- | --- |
| Scope, outcomes, requirements, risks | [Plan and Goals](Plan%20and%20Goals.md) | `README.md`, active issue or request |
| Mobile/web journeys, tokens, accessibility | [Design Prototype](Design%20Prototype.md) | `App.js`, `mobile/`, `web/`, `tests/browser/` |
| Data ownership, schemas, migrations, recovery | [Database Structure](Database%20Structure.md) | `metrodrip_backend/`, `services/*/*/models.py`, migrations, `database/` |
| APIs, auth, COD/online checkout, webhooks, recovery | [Backend Functionalities](Backend%20Functionalities.md) | active Django URLs/views/models, `src/services/`, `mobile/Checkout/`, focused tests |
| Free-tier topology, security, operations, rollback | [Architecture and Operations](Architecture%20and%20Operations.md) | deployment config, Django settings, health endpoints; compare historical `gateway/`/Compose only when needed |
| Executed checks, failures, and verification gaps | [QA Report 2026-09-28](QA%20Report%202026-09-28.md), [previous QA report](QA%20Report%202026-09-27.md), and [Verification and Evaluation](Verification%20and%20Evaluation.md) | `tests/`, service tests, `scripts/test_e2e_safety.py`, `scripts/verify_bounded_load.py` |
| Decisions, cleanup trace, handover, next work | [Decisions and Handover](Decisions%20and%20Handover.md) | Git diff/history and the exact paths linked there |
| Local setup and troubleshooting | [Tech Stack Setup Guide](Tech%20Stack%20Setup%20Guide.md) and [interactive companion](tech-stack-setup.html) | `package.json`, requirements files, `README.md` |
| Repository governance and specialist routing | [`AGENTS.md`](../AGENTS.md), [`AIO.md`](../AIO.md), and [`Project-Operating-Directives.md`](../Project-Operating-Directives.md) | `AI Skills/` |

## Cross-component relationships

- Target client traffic enters one Django origin. Identity, catalog, orders/payments, fulfillment, content, and staff/audit live in one deployable process and configured database.
- Orders owns checkout orchestration and server-side catalog/fulfillment calculations. Price/address values are snapshotted; product name/SKU still rely on catalog relations. Provider serialization/signature/reconciliation code and payment tables currently live inside the `orders` app.
- Online payment entry happens only on PayMongo Hosted Checkout. A verified signed webhook or exact owned provider reconciliation may establish paid state; redirects never mark an order paid.
- Staff consoles use `POST /login/`, session-scoped opaque bearer tokens, and server-enforced persisted roles. Current RBAC is coarse; store ABAC, MFA, permissions, and recent-authentication gates are not implemented.
- `src/services/` is the shared mobile API layer; `mobile/navigation/AppNavigator.jsx` is the active screen graph rooted by `index.js` and `App.js`.
- `web/dev_server.py` serves the static staff consoles in local development; target production assets and APIs share the approved single web service.
- `metrodrip_backend/`, `services/*`, and `gateway/` contain overlapping legacy/baseline behavior. Follow the active ADR migration sequence; do not delete schemas, migrations, databases, or the baseline backup without a separate authorized contract step.
- Correctness must not depend on a paid worker, cron, Redis/Key Value, or persistent disk. Recovery uses idempotent webhooks, owned read repair, and one stale-expiry attempt per new checkout. There is no active monolith reconciliation/expiry management command or lease.
- Completed Figma additions are `708:4544`, `709:5008`, `710:4846`, `711:4544/4545`, and `720:4544/4545`; merchant/admin `2FA ON` text was replaced with truthful `VERIFIED SESSION` labels.

## Retrieval rule

Read this index, one owner page, and only the directly relevant source/tests. Broaden retrieval for cross-cutting changes. Update the owner page rather than adding implementation detail or history here.
