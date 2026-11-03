# MetroDripJS — Cross-Platform Feature Parity Matrix

**Date:** 2026-11-03  
**Audited Platforms:**
1. **Customer Web Storefront**: Vanilla HTML5/ES6 Single Page Application (`web/customer/`)
2. **Customer Mobile Application**: Expo 54 / React Native 0.81.5 Application (`mobile/`, `src/`)
3. **Backend Service of Truth**: Django 6.1.2 / DRF 3.18.3 Modular Monolith (`metrodrip_backend/`)

---

## 1. Feature Parity Matrix

| Feature / Capability | Customer Website | Customer Mobile App | Backend API / Source | Parity Status | Notes & Differences |
|---|---|---|---|---|---|
| **Account Registration** | Implemented (`/customer/sign-up`) | Implemented (`Registration/SignupScreen.js`) | `POST /signup/` | **PARITY VERIFIED** | Both validate password strength; both respect platform registration toggle. |
| **Authentication & Login** | Implemented (`/customer/sign-in`) | Implemented (`Registration/LoginScreen.js`) | `POST /login/` | **PARITY VERIFIED** | Both receive opaque `access_token` and store in secure client session. |
| **Email OTP Verification** | Implemented (`/customer/otp`) | Implemented (`Registration/OtpScreen.js`) | `POST /auth/otp/verify/`, `resend/` | **PARITY VERIFIED** | Both support 6-digit numeric OTP challenge and resend cooldowns. |
| **Password Reset** | Implemented (`/customer/forgot-password`) | Implemented (`ForgotPasswordScreen.js`) | `POST /forgot-password/` | **PARITY VERIFIED** | Both trigger Brevo password reset email delivery. |
| **Sign Out & Revocation** | Implemented (`sessionStorage.clear()`) | Implemented (`AuthContext.jsx`) | `POST /logout/` | **PARITY VERIFIED** | Both clear local tokens and trigger server-side token deletion. |
| **Profile Management** | Implemented (`/customer/account`) | Implemented (`ProfileManagement.jsx`) | `GET/PUT /profile/` | **PARITY VERIFIED** | Both validate name, phone, and delivery address structures. |
| **Account Closure** | Implemented (Modal with phrase & pwd) | Implemented (`Account.jsx` Closure modal)| `POST /account/close/` | **PARITY VERIFIED** | Both require password + confirmation phrase; both clear session on success. |
| **Home Hero Banners** | Implemented (`.homepage-hero`) | Implemented (`Home.jsx` Banner carousel) | `GET /banners/?placement=...` | **PARITY VERIFIED** | Web renders single active hero; Mobile provides swipeable banner carousel. |
| **Multi-Placement Banners**| Implemented (5 placement slots) | Implemented (`bannerContent.js` helper) | `GET /banners/` | **PARITY VERIFIED** | Both respect `announcement_bar`, `homepage_hero`, `category_banner`, etc. |
| **Categories Discovery** | Dynamic `GET /categories/` dropdowns | Dynamic category filter bar | `GET /categories/` | **PARITY VERIFIED** | Both filter `is_active=True` categories and support retry states. |
| **Catalog Browsing** | Implemented (`/customer/shop`) | Implemented (`Products/Shop.jsx`) | `GET /products/` | **PARITY VERIFIED** | Both support pagination, search query, and category filters. |
| **Featured Products Filter**| Implemented (`/shop?featured=1`) | Implemented (`Shop.jsx` Featured filter) | `GET /products/?featured=1` | **PARITY VERIFIED** | Verified identical backend filtering parameter. |
| **Product Details (PDP)** | Implemented (`/customer/products/:id`) | Implemented (`ProductDetails.jsx`) | `GET /products/:id/` | **PARITY VERIFIED** | Both display image, description, SKU, base price, and variant selector. |
| **Variant & Stock Selection**| Implemented (Color/Size picker) | Implemented (`productVariantLogic.js`) | `GET /variants/?product=...` | **PARITY VERIFIED** | Both perform dynamic stock checking and disable out-of-stock combos. |
| **Shopping Cart** | Implemented (`/customer/cart`) | Implemented (`CartScreen.jsx`) | Local state + Context | **PARITY VERIFIED** | Both calculate item estimates and state that shipping is finalized at checkout. |
| **Checkout Flow** | Implemented (`/customer/checkout`) | Implemented (`Checkout/App.js`) | `POST /api/orders/checkout/` | **PARITY VERIFIED** | Both send identical JSON payload (`idempotency_key`, lines, zone, address). |
| **COD Payment Method** | Implemented (`payment_method='cod'`) | Implemented (`payment_method='cod'`) | `orders/checkout.py` | **PARITY VERIFIED** | Both receive server-authoritative totals and transition order to `placed`. |
| **Online Payments (PayMongo)**| Hosted checkout redirect | External browser link handoff | PayMongo Hosted Checkout v2 | **PARITY VERIFIED** | Both support GCash, Maya, Card, and QR Ph via PayMongo hosted session URL. |
| **Order History** | Implemented (`/customer/orders`) | Implemented (`Orders/OrderHistory.jsx`) | `GET /orders/` | **PARITY VERIFIED** | Both list historical customer orders with order numbers, dates, totals. |
| **Order Tracking** | Implemented (`/customer/orders/:id`) | Implemented (`Orders/OrderTracking.jsx`) | `GET /orders/:id/` | **PARITY VERIFIED** | Both display line item snapshots, payment status, and shipment waybills. |
| **Customer Reviews** | Implemented on PDP & Account page | Implemented on PDP & Account page | `GET /reviews/mine/`, catalog API | **PARITY VERIFIED** | Both display product-level reviews and authenticated user's review history. |
| **Wishlist Management** | Implemented (`/customer/wishlist`) | Implemented (`Wishlist/Wishlist.jsx`) | `GET/POST/DELETE /wishlist/` | **PARITY VERIFIED** | Both use `product_ref` contracts to manage favorite products. |
| **Notifications** | Implemented (`/customer/notifications`)| Implemented (`NotificationsScreen.jsx`) | `GET/POST /notifications/` | **PARITY VERIFIED** | Both support unread badge counts, mark-as-read, and read-all actions. |
| **Push Token Registration** | Web Notification API / graceful stub | Implemented (`expo-notifications`) | `POST /notifications/devices/` | **PLATFORM-SPECIFIC** | Mobile registers native FCM/APNS device tokens; Web handles gracefully. |
| **Our Team Information** | Implemented (`/customer/team`) | Implemented (`TeamScreen.jsx`) | `teamData.js` (Shared dataset) | **PARITY VERIFIED** | Both display 5 verified members, TIP affiliation, photos, and roles. |
| **Theme Switching (Light/Dark)**| Implemented (`data-theme` toggle) | Implemented (`userInterfaceStyle: auto`)| Client LocalStorage / OS theme | **PARITY VERIFIED** | Both support seamless dark and light modes with paired SVG/PNG logos. |

---

## 2. Inconsistencies Identified & Corrected

1. **Shared Team Dataset**:
   - *Previous Gap*: Team member biographies previously listed technologies outside the current monolith stack.
   - *Remediation*: Centralized and synchronized `teamData.js` in both `web/customer/` and `src/data/`, accurately describing the modular monolith, Expo client, and QA infrastructure.
2. **Featured Products Filtering**:
   - *Previous Gap*: Web had a `Featured Products` link, but mobile lacked a clean filter parameter.
   - *Remediation*: Shared `featured=1` query parameter implemented on both platforms and verified against `catalog/views.py`.
3. **Cart Shipping Disclosure**:
   - *Previous Gap*: The web cart previously displayed a fixed shipping fee assumption, causing discrepancies with non-NCR delivery zones.
   - *Remediation*: Both web and mobile now label shipping as "Calculated at checkout", preventing customer price confusion prior to zone selection.
4. **Account Closure Confirmation**:
   - *Previous Gap*: Web had no self-service account deletion UI.
   - *Remediation*: Implemented identical two-step password and confirmation phrase modals on both Web and Mobile with strict backend rate-limiting.

---

## 3. Residual Platform-Specific Differences

- **Push Notifications**: Mobile interacts with native push notification APNS/FCM channels via `expo-notifications`, while Web relies on in-app notifications and polling.
- **PayMongo Return Flow**: Web renders an in-app confirmation page at `/customer/payment/return`, while Mobile opens the PayMongo hosted session in the external device browser and deep-links back via `metrodrip://`.
