# Design Prototype

**Status:** Approved design additions completed in Figma; code implemented locally; final/browser/native verification separated below
**Project:** MetroDripJS Urban Streetwear E-Commerce Platform  
**Target Clients:** React Native / Expo Mobile App (iOS & Android) + Web Merchant and Administrator Consoles
**Figma Prototype:** [MetroDrip Figma Workspace](https://www.figma.com/design/SmJIlTZ9ZVRxQ5eKucmrd0/MetroDrip?node-id=31-2)  
**Updated:** 2026-09-28

---

## 1. User Journeys and Screens

| Journey / Screen | User Goal | Entry & Exit | Loading, Empty, Error, Success States | Prototype Link / File | Verified Behavior |
|---|---|---|---|---|---|
| **M01: Splash & Initial Screen** | Onboard shopper, establish brand vibe, route to registration or catalog. | Entry: App launch.<br>Exit: Tap "Shop Now" → Home, or "Sign In" → Auth. | Loading: Skeleton logo pulse.<br>Empty: N/A.<br>Error: Network retry toast.<br>Success: Smooth fade transition to catalog. | `mobile/screens/InitialScreen.jsx` | Historical design/runtime claim; not rerun on a native device in this enhancement. |
| **M02: Catalog & Drops Feed** | Browse drops, filter by streetwear categories (Hoodies, Tees, Headwear, Accessories). | Entry: Initial Screen or Bottom Tab.<br>Exit: Tap product card → Product Detail. | Loading: Shimmer product cards.<br>Empty: "No drops available for this category".<br>Error: Retry banner.<br>Success: Grid view with badges and prices. | `mobile/screens/HomeScreen.jsx` | Historical behavior; current native-device verification is UNVERIFIED. |
| **M03: Product Detail Screen (PDP)** | Inspect garment details, view lookbook photos, select size and color variants. | Entry: Product card tap.<br>Exit: Tap "Add to Cart" or "Back". | Loading: Spinner on image carousel.<br>Empty: Out of stock badge if inventory is 0.<br>Error: Notification on missing size selection.<br>Success: Variant selected, button active. | `mobile/screens/ProductDetailScreen.jsx` | Historical behavior; current native-device verification is UNVERIFIED. |
| **M04: Shopping Cart** | Review chosen items, adjust quantities, verify subtotal. | Entry: Cart icon.<br>Exit: Tap "Proceed to Checkout" → M05. | Loading: Skeleton row.<br>Empty: "Your bag is empty" with "Browse Drops" CTA.<br>Error: Quantity exceeds stock toast.<br>Success: Subtotal recalculated instantly. | `mobile/screens/CartScreen.jsx` | Historical behavior; current native-device verification is UNVERIFIED. |
| **M05: Adaptive Checkout** | Fill delivery address, pick shipping zone, select COD or hosted GCash/Maya/card, and create an idempotent order attempt. | Entry: Cart "Checkout".<br>Exit: COD → confirmation; online → external Hosted Checkout then owned status. | Loading: submission lock/skeleton.<br>Empty: no cart/address.<br>Error: field errors, stock/catalog conflict, offline, provider unavailable, uncertain submission.<br>Success: COD confirmation or online redirect action. | [mobile/Checkout/src/screens/CheckoutScreen.jsx](../mobile/Checkout/src/screens/CheckoutScreen.jsx) | Implemented in source and contract tests; live provider/native flow remains UNVERIFIED. |
| **M06: Payment Verification / Order Confirmation** | See truthful order and payment state without treating a redirect as proof. | Entry: COD completion, foreground/deep-link return, order history.<br>Exit: paid → details; pending → refresh; failed/expired → recover/change path. | Loading: owned status skeleton.<br>Empty: order not found without ownership leakage.<br>Error: offline/session expired/provider deferred.<br>Partial: order saved but payment still verifying.<br>Success: server-reported paid receipt or COD due-on-delivery summary. | [mobile/Checkout/src/screens/OrderConfirmationScreen.jsx](../mobile/Checkout/src/screens/OrderConfirmationScreen.jsx) | Implemented in source and contract tests; native return/provider delivery remains UNVERIFIED. |
| **M07: Customer Order History & Detail** | Track orders and recover pending/failed online payments. | Entry: Account profile tab.<br>Exit: order row → owned detail/tracking/payment status. | Loading: skeleton list/detail.<br>Empty: "No orders yet".<br>Error: offline/session expired with retry/sign-in.<br>Partial: unavailable courier/ETA/timestamps remain unknown, not fabricated.<br>Success: chronological history with separate order/payment states. | `mobile/Orders/OrderHistory.jsx`, `OrderTracking.jsx` | Truthful presentation helpers implemented and source-tested; native rendering UNVERIFIED. |
| **M08: Merchant/Admin Consoles** | Staff operate authenticated dashboards without demo fallbacks. | Entry: role-specific login.<br>Exit: token-revoking sign out. | Loading: skeleton/banner.<br>Empty: no results with recovery action.<br>Error: permission/API/write failure.<br>Partial: retain last confirmed rows and label refresh failure.<br>Success: server-confirmed data/mutation. | `web/merchant/`, `web/admin/`, `web/js/user-session.js` | Authenticated session/API states implemented. Chromium harness is mocked; live browser-to-Django integration is UNVERIFIED. |

---

## 2. Figma completion record

The connected MetroDrip Figma file was rechecked after the user reconnected access. The following design additions are present:

| Area | Completed node(s) | Contents/status |
|---|---|---|
| Customer missing flows | `708:4544` | 20 customer screens covering checkout/payment and recovery gaps |
| Merchant missing flows | `709:5008` | 12 merchant-console frames |
| Administrator missing flows | `710:4846` | 12 administrator-console frames |
| ERD and topology | `711:4544`; root `711:4545` | Database/system architecture additions |
| Customer state matrix | `720:4544`; root `720:4545` | Default/active, loading, empty, error, and partial-failure coverage |

The merchant page's 24 `2FA ON` labels and administrator page's 16 `2FA ON` labels were replaced with `MERCHANT · VERIFIED SESSION` and `ADMINISTRATOR · VERIFIED SESSION`. Recheck found zero stale `2FA ON` labels and zero text-overflow findings in those updated pages. This wording reflects an authenticated session; it does not imply MFA is implemented.

The source Figma file remains: [MetroDrip](https://www.figma.com/design/SmJIlTZ9ZVRxQ5eKucmrd0/MetroDrip).

---

## 3. Interface Specification & Design Tokens

### Color Palette (Urban Streetwear Aesthetic)

```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Volt (Accent)    │  │ Ink (Primary)    │  │ Paper (Surface)  │  │ Pure White (Card)│
│ #CEFF00          │  │ #111111          │  │ #F9F9FB          │  │ #FFFFFF          │
└──────────────────┘  └──────────────────┘  └──────────────────┘  └──────────────────┘
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ Slate (Muted)    │  │ Danger (Error)   │  │ Success (Status) │
│ #666666          │  │ #FF3B30          │  │ #34C759          │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

- **Volt (`#CEFF00`)**: High-visibility neon yellow-green accent used for primary CTAs, active selection rings, and brand highlights.
- **Ink (`#111111`)**: Deep charcoal/black used for primary text, solid headers, dark cards, and buttons.
- **Paper (`#F9F9FB`)**: Clean, light gray-white canvas background providing breathing room and high contrast.
- **Slate (`#666666`)**: Neutral secondary color for subtitles, labels, borders, and inactive tab icons.
- **Pure White (`#FFFFFF`)**: Card surfaces, modal sheets, and high-emphasis backgrounds.
- **Danger (`#FF3B30`)**: Error alerts, invalid input borders, and cancellation badges.
- **Success (`#34C759`)**: Order confirmed indicators, fulfilled statuses, and stock availability tags.

### Typography Hierarchy
- **Brand Display Title**: `Bebas Neue` / Heavy Display, uppercase, tight tracking (`letterSpacing: 1.2px`), used for drop names and header banners.
- **Heading 1**: 24px / 28px line-height, bold (weight 700), Ink `#111111`.
- **Heading 2**: 18px / 22px line-height, semi-bold (weight 600), Ink `#111111`.
- **Body Regular**: 15px / 20px line-height, regular (weight 400), Ink `#111111`.
- **Caption / Label**: 12px / 16px line-height, medium (weight 500), Slate `#666666`.
- **Monospace Reference**: `Menlo`, `Courier New`, or monospace for Order IDs (`MD-2026-00319`) and SKU codes.

### Layout & Spacing Tokens
- **Grid Unit**: 4px baseline rhythm. Standard increments: `4px`, `8px`, `12px`, `16px`, `24px`, `32px`.
- **Corner Radii**:
  - Small elements / badges: `4px`
  - Input fields / buttons: `8px`
  - Cards / modals: `12px` to `16px`
  - Pills / round chips: `9999px`
- **Minimum Touch Target**: 44×44px minimum bounding box across all interactive buttons, radios, back navigation chevrons, and inputs.

---

## 4. Responsive & Adaptive Layout Architecture

The checkout experience in [mobile/Checkout/src/screens/CheckoutScreen.jsx](../mobile/Checkout/src/screens/CheckoutScreen.jsx) dynamically adapts between mobile viewports and widescreen displays using React Native `useWindowDimensions()`:

```
Mobile Layout (< 768px):               Desktop / Tablet Layout (>= 768px):
┌───────────────────────────┐          ┌─────────────────────────────────────────────────┐
│ ‹ Checkout                │          │ ‹ Checkout                                      │
├───────────────────────────┤          ├────────────────────────┬────────────────────────┤
│ [1. Delivery Address]     │          │ [1. Delivery Address]  │ [Order Summary Panel]  │
│ - Full Name               │          │ - Full Name            │ - Items Subtotal: ₱1399│
│ - Street / Barangay       │          │ - Street / Barangay    │ - Shipping Fee:   ₱150 │
│ - City / Province         │          │ - City / Province      │ - Total:          ₱1549│
│ - Phone Number            │          │ - Phone Number         ├────────────────────────┤
├───────────────────────────┤          ├────────────────────────┤ [Payment Method]       │
│ [2. Shipping Zone]        │          │ [2. Shipping Zone]     │ (o) Cash on Delivery   │
│ Selected: Metro Manila    │          │ Selected: Metro Manila │ ( ) GCash / Maya / Card│
├───────────────────────────┤          └────────────────────────┴────────────────────────┤
│ [3. Payment Method]       │          │          [ PLACE ORDER / CONTINUE SECURELY ]    │
│ COD / GCash / Maya / Card │          └─────────────────────────────────────────────────┘
├───────────────────────────┤
│ [STICKY BOTTOM FOOTER]    │
│ Total: ₱1,549  [PLACE ORD]│
└───────────────────────────┘
```

1. **Mobile Viewport (< 768px)**:
   - Single-column scrollable stream.
   - Delivery zone selection opens as an ergonomic bottom sheet modal.
   - Sticky bottom action bar anchoring whole-peso total price and prominent `[ PLACE ORDER ]` CTA with safe-area insets.
2. **Desktop / Tablet Viewport (≥ 768px)**:
   - Centered container constrained to `maxWidth: 960px`.
   - Side-by-side 2-column layout: Form inputs on the left; sticky order summary, payment selection, and action button on the right.
   - Delivery zone selection transforms into a centered, focus-trapped dialog card.

Online methods never reveal PAN, expiry, CVV, wallet login, PIN, or OTP fields inside MetroDrip. The selected method opens PayMongo Hosted Checkout in an external browser. Returning to the app opens a payment-verification state; it does not show a paid success state until the owned order endpoint reports the webhook-backed transition. Pending, failed, expired, cancelled, stock/price conflict, offline, session-expired, and uncertain-submission states keep a clear recovery action and do not clear the cart prematurely.

---

### Required resilience and console states

Every data surface must provide a stable layout for default/active, loading/skeleton, empty, error, and partial/stale states. The implemented contract is:

| Surface | Missing/required states | Primary recovery action |
|---|---|---|
| Customer session | Session expired, permission denied | Sign in again; back to safe account/home route |
| Customer network/data | Offline, cached/stale partial data, retry failure | Retry; continue browsing cached content when safe |
| Checkout | Price changed, stock changed, shipping quote unavailable, duplicate/uncertain submit | Review updated order; retry same idempotent attempt; return to cart |
| Online payment | Hosted redirect, verifying, pending, failed, expired, cancelled, provider unavailable | Refresh owned status; reopen eligible session; change method; contact support with order reference |
| Order history/detail | Loading, no orders, stale partial list, forbidden/not found, per-order payment action | Retry; sign in; resume eligible payment |
| Merchant dashboard/orders | Responsive narrow layout, loading, no results, API error, partial metrics/table | Retry panel; clear filters; keep unaffected operational data visible |
| Admin users/roles | Responsive narrow layout, loading, no results, permission denied, partial failure | Retry; return to authorized area; never expose disabled actions as successful |

Skeletons reserve final geometry and use reduced-motion behavior. Empty states explain why the surface is empty and present one relevant next action. Error copy distinguishes a local validation issue, authorization/session issue, offline state, provider delay, and server failure. Partial states label stale/unknown values instead of substituting fake data.

## 5. Accessibility & Quality Standards (WCAG 2.1 AA)

- **Color Contrast**: Text and interactive icons maintain minimum 4.5:1 contrast against backgrounds (Ink `#111111` on Paper `#F9F9FB` achieves 15.8:1 contrast).
- **Form Semantics & Errors**:
  - Every input field includes an associated `<Text>` label.
  - Required fields in invalid states dynamically render `aria-invalid="true"` in web DOM and display visible inline error copy in Danger red (`#FF3B30`).
- **Touch Target Integrity**: Back navigation button, zone picker items, payment radios, and submit buttons all strictly respect the 44×44px minimum touch target size.
- **Keyboard & Screen Reader Support**:
  - Interactive cards and buttons declare `accessible={true}` and `accessibilityRole="button"`.
  - Radio buttons declare `accessibilityRole="radio"` and `accessibilityState={{ checked: isSelected }}`.
- **Web Status Bar Hygiene**: Simulated mobile status bar overlay elements ("9:41 ... ◗ ▰") are purged on web viewports to prevent layout interference and visual clutter.
