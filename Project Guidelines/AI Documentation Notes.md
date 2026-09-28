# AI Documentation Notes

MetroDripJS is an Expo/React Native customer app plus static merchant/admin consoles backed by five Django services through one gateway. Use this page only as a retrieval map: open the owner document below, then inspect the referenced source, tests, and runtime evidence. The current release state is **HOLD**; the latest dated QA report is the verification authority.

## Knowledge map

| Task area | Start with | Source and evidence anchors |
| --- | --- | --- |
| Scope, outcomes, requirements, risks | [Plan and Goals](Plan%20and%20Goals.md) | `README.md`, active issue or request |
| Mobile/web journeys, tokens, accessibility | [Design Prototype](Design%20Prototype.md) | `App.js`, `mobile/`, `web/`, `tests/browser/` |
| Data ownership, schemas, migrations, recovery | [Database Structure](Database%20Structure.md) | `services/*/*/models.py`, `services/*/*/migrations/`, `database/` |
| APIs, authentication, checkout saga, background work | [Backend Functionalities](Backend%20Functionalities.md) | `services/`, `gateway/`, `scripts/verify_microservices_e2e.py` |
| Topology, ports, deployment, observability, rollback | [Architecture and Operations](Architecture%20and%20Operations.md) | `docker-compose.microservices.yml`, `gateway/`, service `Dockerfile`s |
| Executed checks, failures, and verification gaps | [QA Report 2026-09-28](QA%20Report%202026-09-28.md), [previous QA report](QA%20Report%202026-09-27.md), and [Verification and Evaluation](Verification%20and%20Evaluation.md) | `tests/`, service tests, `scripts/test_e2e_safety.py`, `scripts/verify_bounded_load.py` |
| Decisions, cleanup trace, handover, next work | [Decisions and Handover](Decisions%20and%20Handover.md) | Git diff/history and the exact paths linked there |
| Local setup and troubleshooting | [Tech Stack Setup Guide](Tech%20Stack%20Setup%20Guide.md) and [interactive companion](tech-stack-setup.html) | `package.json`, requirements files, `README.md` |
| Repository governance and specialist routing | [`AGENTS.md`](../AGENTS.md), [`AIO.md`](../AIO.md), and [`Project-Operating-Directives.md`](../Project-Operating-Directives.md) | `AI Skills/` |

## Cross-component relationships

- Client traffic enters `gateway/`; the gateway routes to `services/identity`, `catalog`, `orders`, `fulfillment`, and `content`.
- Orders owns checkout orchestration. It requests authoritative catalog quotes/holds and fulfillment shipping quotes, then stores immutable snapshots and an outbox record.
- `src/services/` is the shared mobile API layer; `mobile/navigation/AppNavigator.jsx` is the active screen graph rooted by `index.js` and `App.js`.
- `web/dev_server.py` serves the static staff consoles in `web/`; those consoles call gateway-backed APIs rather than bundled Expo output.
- `metrodrip_backend/` is the retained legacy monolith and local virtual-environment host. Do not treat it as the current service topology or remove its schemas, migrations, databases, or baseline backup without a separate migration decision.

## Retrieval rule

Read this index, one owner page, and only the directly relevant source/tests. Broaden retrieval for cross-cutting changes. Update the owner page rather than adding implementation detail or history here.
