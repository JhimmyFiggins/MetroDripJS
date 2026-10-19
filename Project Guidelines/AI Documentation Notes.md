# AI Documentation Notes

MetroDripJS is an Expo/React Native customer app plus responsive merchant/admin consoles. The active implementation is the `metrodrip_backend/` Django modular monolith; local development defaults to SQLite. The approved academic target is one same-origin Render Free Django service, one no-cost PostgreSQL database, and an EAS internal APK. The current Blueprint has a broken extra static-console origin, stale branch pins, and unsafe deploy-time staff seeding. Checkout supports COD and PayMongo Hosted Checkout for GCash, Maya, and cards. The five-service/gateway assets are historical migration sources. Academic-demo and production release are **HOLD**.

## Knowledge map

| Task area | Start with | Source and evidence anchors |
| --- | --- | --- |
| Current whole-repository status, blockers, phased plan, free hosting, and demo checklist | [Comprehensive Repository Audit and Academic Demo Plan — 2026-10-19](Comprehensive%20Repository%20Audit%20and%20Academic%20Demo%20Plan%20-%202026-10-19.md) | audited `master` SHA, `render.yaml`, active app/web/backend sources, executed checks, official provider docs |
| Scope, outcomes, requirements, risks | [Plan and Goals](Plan%20and%20Goals.md) | `README.md`, active issue or request |
| Mobile/web journeys, tokens, accessibility | [Design Prototype](Design%20Prototype.md) | `App.js`, `mobile/`, `web/`, `tests/browser/` |
| Data ownership, schemas, migrations, recovery | [Database Structure](Database%20Structure.md) | `metrodrip_backend/`, `services/*/*/models.py`, migrations, `database/` |
| APIs, auth, COD/online checkout, webhooks, recovery | [Backend Functionalities](Backend%20Functionalities.md) | active Django URLs/views/models, `src/services/`, `mobile/Checkout/`, focused tests |
| Free-tier topology, security, operations, rollback | [Architecture and Operations](Architecture%20and%20Operations.md) | deployment config, Django settings, health endpoints; compare historical `gateway/`/Compose only when needed |
| Executed checks, failures, and verification gaps | [Verification and Evaluation](Verification%20and%20Evaluation.md), then dated prior QA reports | `tests/`, service tests, `scripts/test_e2e_safety.py`, `scripts/verify_bounded_load.py` |
| Decisions, cleanup trace, handover, next work | [Decisions and Handover](Decisions%20and%20Handover.md) | Git diff/history and the exact paths linked there |
| Local setup and troubleshooting | [Tech Stack Setup Guide](Tech%20Stack%20Setup%20Guide.md) and [interactive companion](tech-stack-setup.html) | `package.json`, requirements files, `README.md` |
| Repository governance and specialist routing | [`AGENTS.md`](../AGENTS.md), [`AIO.md`](../AIO.md), and [`Project-Operating-Directives.md`](../Project-Operating-Directives.md) | `AI Skills/` |

## Cross-component relationships

- Target client traffic enters one Django origin. Identity, catalog, orders/payments, fulfillment, content, staff/audit, and packaged console assets should live in one deployable process and configured database. The current separate static console does not satisfy this target.
- Orders owns checkout orchestration and server-side catalog/fulfillment calculations. Price/address values are snapshotted; product name/SKU still rely on catalog relations. Provider serialization/signature/reconciliation code and payment tables currently live inside the `orders` app.
- Online payment entry happens only on PayMongo Hosted Checkout. A verified signed webhook or exact owned provider reconciliation may establish paid state; redirects never mark an order paid.
- Staff consoles use `POST /login/`, session-scoped opaque bearer tokens, and server-enforced persisted roles. Current RBAC is coarse; store ABAC, MFA, permissions, and recent-authentication gates are not implemented.
- `src/services/` is the shared mobile API layer; `mobile/navigation/AppNavigator.jsx` is the active screen graph rooted by `index.js` and `App.js`.
- `web/dev_server.py` serves the static staff consoles in local development. Until its default is repaired, set `BACKEND_URL=http://127.0.0.1:8000` explicitly; its current default points to a public backend. Target production assets and APIs share the approved single web service.
- `metrodrip_backend/`, `services/*`, and `gateway/` contain overlapping legacy/baseline behavior. Follow the active ADR migration sequence; do not delete schemas, migrations, databases, or the baseline backup without a separate authorized contract step.
- Correctness must not depend on a paid worker, cron, Redis/Key Value, or persistent disk. Recovery uses idempotent webhooks, owned read repair, and one stale-expiry attempt per new checkout. There is no active monolith reconciliation/expiry management command or lease.
- Completed Figma additions are `708:4544`, `709:5008`, `710:4846`, `711:4544/4545`, and `720:4544/4545`; merchant/admin `2FA ON` text was replaced with truthful `VERIFIED SESSION` labels.

## Retrieval rule

Read this index, one owner page, and only the directly relevant source/tests. Broaden retrieval for cross-cutting changes. Update the owner page rather than adding implementation detail or history here.
