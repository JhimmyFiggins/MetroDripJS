# Design Prototype

**Status:** Verified & Implemented Design Specification  
**Project:** MetroDripJS Urban Streetwear E-Commerce Platform  
**Target Clients:** React Native / Expo Mobile App (iOS & Android) + Web Merchant Console  
**Figma Prototype:** [MetroDrip Figma Workspace](https://www.figma.com/design/SmJIlTZ9ZVRxQ5eKucmrd0/MetroDrip?node-id=31-2)  
**Date:** 2026-09-27  

---

## 1. User Journeys and Screens

| Journey / Screen | User Goal | Entry & Exit | Loading, Empty, Error, Success States | Prototype Link / File | Verified Behavior |
|---|---|---|---|---|---|
| **M01: Splash & Initial Screen** | Onboard shopper, establish brand vibe, route to registration or catalog. | Entry: App launch.<br>Exit: Tap "Shop Now" → Home, or "Sign In" → Auth. | Loading: Skeleton logo pulse.<br>Empty: N/A.<br>Error: Network retry toast.<br>Success: Smooth fade transition to catalog. | `mobile/screens/InitialScreen.jsx` | Verified on Expo Web & Android emulator. Minimalist urban aesthetic with high-contrast typography. |
| **M02: Catalog & Drops Feed** | Browse drops, filter by streetwear categories (Hoodies, Tees, Headwear, Accessories). | Entry: Initial Screen or Bottom Tab.<br>Exit: Tap product card → Product Detail. | Loading: Shimmer product cards.<br>Empty: "No drops available for this category".<br>Error: Retry banner.<br>Success: Grid view with badges and prices. | `mobile/screens/HomeScreen.jsx` | Verified. Dynamic category filter tabs; prices displayed in whole PHP (`₱`). |
| **M03: Product Detail Screen (PDP)** | Inspect garment details, view lookbook photos, select size and color variants. | Entry: Product card tap.<br>Exit: Tap "Add to Cart" or "Back". | Loading: Spinner on image carousel.<br>Empty: Out of stock badge if inventory is 0.<br>Error: Notification on missing size selection.<br>Success: Variant selected, button active. | `mobile/screens/ProductDetailScreen.jsx` | Verified. Dynamic variant selector disables out-of-stock sizes. |
| **M04: Shopping Cart** | Review chosen items, adjust quantities, verify whole-peso subtotal. | Entry: Cart icon.<br>Exit: Tap "Proceed to Checkout" → M05. | Loading: Skeleton row.<br>Empty: "Your bag is empty" with "Browse Drops" CTA.<br>Error: Quantity exceeds stock toast.<br>Success: Subtotal recalculated instantly. | `mobile/screens/CartScreen.jsx` | Verified. Subtotal calculation enforces integer whole-peso arithmetic. |
| **M05: Adaptive Checkout** | Fill delivery address, pick shipping zone, select Cash on Delivery, place order. | Entry: Cart "Checkout".<br>Exit: Tap "Place Order" → Confirmation. | Loading: Spinner on "Place Order".<br>Empty: Form fields blank initially.<br>Error: Red border, `aria-invalid`, inline error label.<br>Success: Confirmation alert and redirect. | [mobile/Checkout/src/screens/CheckoutScreen.jsx](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/mobile/Checkout/src/screens/CheckoutScreen.jsx) | Verified across 4 viewports (320px, 390px, 768px, 1280px). 2-column desktop grid & 1-column mobile sticky footer. |
| **M06: Order Confirmation** | Review placed order reference (`MD-2026-XXXXX`), delivery estimate, and COD total. | Entry: Saga completion.<br>Exit: Tap "Continue Shopping" → Home. | Loading: Receipt rendering animation.<br>Empty: N/A.<br>Error: "Order lookup failed".<br>Success: Green checkmark badge, order ID, items list. | `mobile/screens/OrderConfirmationScreen.jsx` | Verified. Displays immutable snapshot items and confirmed COD total. |
| **M07: Customer Order History** | Track status of placed orders (Pending, Shipped, Delivered, Cancelled). | Entry: Account profile tab.<br>Exit: Tap order row → Order Details. | Loading: Skeleton orders list.<br>Empty: "No previous orders found".<br>Error: Offline banner.<br>Success: Sorted chronological order history. | `mobile/screens/OrdersScreen.jsx` | Verified. Displays historical orders with current status and item summaries. |
| **M08: Merchant Orders Console** | Merchant staff review real-time orders, search by ID, filter by status, update state. | Entry: Web browser login.<br>Exit: Log out or switch console view. | Loading: Table spinner.<br>Empty: "No merchant orders match filter".<br>Error: Server error alert box.<br>Success: Live data populated table. | [web/merchant/orders.html](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/web/merchant/orders.html) & [web/merchant/orders.js](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/web/merchant/orders.js) | Verified. Fully dynamic; connects to `GET /api/merchant/orders/`; legacy mock fallback removed. |

---

## 2. Interface Specification & Design Tokens

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

## 3. Responsive & Adaptive Layout Architecture

The checkout experience in [mobile/Checkout/src/screens/CheckoutScreen.jsx](file:///a:/Users/Archim%20Pameroyan/Documents/GitHub/MetroDripJS/mobile/Checkout/src/screens/CheckoutScreen.jsx) dynamically adapts between mobile viewports and widescreen displays using React Native `useWindowDimensions()`:

```
Mobile Layout (< 768px):               Desktop / Tablet Layout (>= 768px):
┌───────────────────────────┐          ┌─────────────────────────────────────────────────┐
│ ‹ Checkout                │          │ ‹ Checkout                                      │
├───────────────────────────┤          ├────────────────────────┬────────────────────────┤
│ [1. Delivery Address]     │          │ [1. Delivery Address]  │ [Order Summary Panel]  │
│ - Full Name               │          │ - Full Name            │ - Items Subtotal: ₱1399│
│ - Street / Barangay       │          │ - Street / Barangay    │ - Shipping Fee:   ₱150 │
│ - City / Province         │          │ - City / Province      │ - Total COD:      ₱1549│
│ - Phone Number            │          │ - Phone Number         ├────────────────────────┤
├───────────────────────────┤          ├────────────────────────┤ [Payment Method (COD)] │
│ [2. Shipping Zone]        │          │ [2. Shipping Zone]     │ (o) Cash on Delivery   │
│ Selected: Metro Manila    │          │ Selected: Metro Manila │ ( ) GCash (Disabled)   │
├───────────────────────────┤          └────────────────────────┴────────────────────────┤
│ [3. Payment Method (COD)] │          │                   [ PLACE ORDER ]               │
│ (o) Cash on Delivery      │          └─────────────────────────────────────────────────┘
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

---

## 4. Accessibility & Quality Standards (WCAG 2.1 AA)

- **Color Contrast**: Text and interactive icons maintain minimum 4.5:1 contrast against backgrounds (Ink `#111111` on Paper `#F9F9FB` achieves 15.8:1 contrast).
- **Form Semantics & Errors**:
  - Every input field includes an associated `<Text>` label.
  - Required fields in invalid states dynamically render `aria-invalid="true"` in web DOM and display visible inline error copy in Danger red (`#FF3B30`).
- **Touch Target Integrity**: Back navigation button, zone picker items, payment radios, and submit buttons all strictly respect the 44×44px minimum touch target size.
- **Keyboard & Screen Reader Support**:
  - Interactive cards and buttons declare `accessible={true}` and `accessibilityRole="button"`.
  - Radio buttons declare `accessibilityRole="radio"` and `accessibilityState={{ checked: isSelected }}`.
- **Web Status Bar Hygiene**: Simulated mobile status bar overlay elements ("9:41 ... ◗ ▰") are purged on web viewports to prevent layout interference and visual clutter.
