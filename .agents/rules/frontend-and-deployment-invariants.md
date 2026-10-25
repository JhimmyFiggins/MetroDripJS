# Frontend and Deployment Verification Invariants

## 1. 320px Mobile Viewport Layout Rule
- All web interfaces (Customer Website, Admin Console, Merchant Console) must support viewport widths down to 320px with zero horizontal scrollbar (`scrollWidth <= clientWidth`).
- Do not use inline `grid-template-columns` or fixed multi-column styles directly on HTML elements.
- Always define grid and layout structures in external stylesheets (e.g., `web/css/console.css`) with responsive media queries (`@media (max-width: 640px)`) that collapse multi-column form grids into a single column and allow action button groups to wrap naturally.

## 2. Cloud Environment & Provider Capability Parity
- When auditing cloud deployment configurations (e.g., Render, Docker Compose), cross-reference code references against active environment variables.
- Ensure all provider integrations (e.g., PayMongo, Brevo) have both authentication keys/secrets AND functional configuration allowlists (such as `PAYMONGO_ENABLED_METHODS`) verified.
- Confirm fail-closed behavior: missing optional or provider flags must degrade gracefully with descriptive diagnostic codes rather than unhandled 500 server crashes.

## 3. Ephemeral Database Concurrency Testing
- Never run concurrency or migration tests against live production databases.
- When validating database engine-specific row-level lock semantics (`select_for_update`), execute tests against an isolated, disposable local container (e.g., `postgres:16-alpine` on dedicated port 5433) and guarantee container cleanup immediately after test completion.
