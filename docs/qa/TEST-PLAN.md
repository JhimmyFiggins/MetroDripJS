# MetroDripJS — Quality Assurance & Test Plan

**Version:** 2.0.0  
**Effective Date:** 2026-11-03  
**Target Architecture:** Django 6 / DRF Modular Monolith + Vanilla HTML/CSS/JS Consoles + Expo/React Native Mobile App

---

## 1. Scope & Objectives

The primary objective of this Test Plan is to validate the integrity, security, usability, and cross-platform parity of MetroDripJS across its four primary interfaces:
- **Admin Console (`web/admin/`)**: User management, custom roles, platform settings, audit trails.
- **Merchant Console (`web/merchant/`)**: Product catalog, variants matrix, inventory movements, order management, fulfillment, shipping zones, banner content.
- **Customer Web Storefront (`web/customer/`)**: Storefront discovery, catalog navigation, PDP, cart, checkout, order tracking, reviews, account management.
- **Customer Mobile Application (`mobile/`, `src/`)**: Expo React Native mobile experience targeting parity with the web storefront.
- **Backend Services (`metrodrip_backend/`)**: Django modular monolith covering identity, catalog, orders, fulfillment, and content bounded contexts.

---

## 2. Test Environments & Tooling

| Environment | Purpose | Configuration / Command |
|---|---|---|
| **Local Disposable SQLite** | Fast unit and integration tests | `DATABASE_URL=sqlite:////tmp/disposable-qa.sqlite3` |
| **Local PostgreSQL 16 (Optional)** | Concurrency and transaction isolation tests | `DATABASE_URL=postgres://...:5432/...` |
| **Local Web Dev Server** | Web storefront and console static hosting + API reverse proxy | `python3 web/dev_server.py 3000` |
| **Playwright / Chromium** | End-to-end browser automation & Axe WCAG 2.1 AA audits | `@playwright/test`, `@axe-core/playwright` |
| **Node.js Native Test Runner** | Client service contracts, invariant testing, and stub evaluation | `node --test "tests/client/*.test.mjs"` |
| **Expo CLI & Metro Bundler** | Cross-platform bundle validation & mobile diagnostic checks | `npx expo-doctor`, `npx expo export --platform all` |

---

## 3. Test Suites & Categorization

### A. Static Analysis & Type Checking
- **TypeScript**: Validates all typed source files and declarations without emitting JavaScript (`npx tsc --noEmit`).
- **Django Schema Drift**: Verifies that models match applied migrations (`python manage.py makemigrations --check`).
- **Django Production Readiness Check**: Verifies security flags, cookie settings, and email backends (`python manage.py check --deploy`).
- **Expo Doctor**: Verifies npm packages match Expo SDK 54 compatibility (`npx expo-doctor`).

### B. Unit & Invariant Testing
- **Client Invariants (`tests/client/`)**:
  - API Client state, bearer token attachment, zero cross-origin token leakage (`apiClient.test.mjs`, `services.test.mjs`).
  - Cart calculation, item mutations, and server-side pricing invariants (`cartLogic.test.mjs`).
  - Product variants attribute generation and price adjustment resolution (`productVariantLogic.test.mjs`).
  - Checkout payload construction, zero customer_id exposure (`buildOrderPayload.test.mjs`).
  - Favicon MIME types and asset availability (`faviconAudit.test.mjs`).
  - EAS Preview build profile configuration (`easConfig.test.mjs`).
  - Our Team dataset synchronization across web and mobile (`teamContent.test.mjs`).

### C. Backend API & Database Testing (`metrodrip_backend/`)
- **Identity Context**: Customer creation, PBKDF2 password hashing, email OTP challenges, rate limiting, RBAC permissions, account closure.
- **Catalog Context**: Categories, products, variation combinations, image MIME sniffing, media upload validation, multi-warehouse stock entries.
- **Orders Context**: COD checkout saga, stock reservation holds (TTL), idempotency key enforcement, PayMongo Hosted Checkout session creation, payment state transitions.
- **Fulfillment Context**: Shipping zones, delivery fees, order shipments, tracking numbers, customer push notifications.
- **Content Context**: Homepage banners, multi-placement engine (5 placement slots), graphic design vs image mode.

### D. End-to-End Browser Automation & Accessibility
- **Console Layout Suite (`run-console-layout.mjs`)**: 64 layout variations, modal focus trapping, Escape key handlers, Tab containment.
- **Roles & Permissions (`run-admin-roles-qa.mjs`)**: Dynamic base role switching, capability matrix toggle, custom role creation.
- **Admin Users (`run-admin-users-qa.mjs`)**: Directory listing, 2FA status badges, last active timestamps.
- **Merchant Catalog & Variations (`run-merchant-catalog.mjs`, `run-merchant-modernization-qa.mjs`)**: Product CRUD, variant generation, stock adjustment, gallery uploads.
- **Content & Banners (`run-merchant-banners.mjs`, `run-banner-sync-and-theme-qa.mjs`)**: 5 placement locations, real-time preview, graphic mode customization.
- **Shipping Zones (`run-shipping-zones-qa.mjs`)**: Responsive fee management, address test checker.
- **Customer Storefront (`run-customer-integration.mjs`, `run-customer-auth-qa.mjs`)**: Responsive viewports (320px–1920px), Axe WCAG 2.1 AA audits.
- **Live Disposable Workflows (`run-customer-live-account.mjs`, `run-customer-live-checkout.mjs`)**: Real browser signup, signin, profile update, account closure, catalog navigation, cart estimate, and COD checkout.

---

## 4. Entry and Exit Criteria

### Entry Criteria
1. Clean git working tree or clearly demarcated feature branch.
2. Dependencies installed: Node.js packages (`node_modules`) and Python virtualenv (`metrodrip_backend/.venv`).
3. Local loopback ports 3000, 3011, 8000, 8011 available.

### Exit Criteria
1. 100% passing tests in `npm run test:client`.
2. 100% passing tests in `python manage.py test` (with permitted skips for engine-specific tests).
3. 0 TypeScript compiler errors in `npx tsc --noEmit`.
4. 0 WCAG 2.1 AA violations detected by AxeBuilder in any browser test suite.
5. 0 schema drift in `python manage.py makemigrations --check`.
6. Successful all-platform Expo export (`npx expo export --platform all`).
7. Complete documentation updates reflecting actual test results and system state.
