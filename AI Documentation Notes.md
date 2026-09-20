# Project Architectural Scope: Mobile App Only (iOS & Android)

> [!IMPORTANT]
> **Platform Target**: This codebase is exclusively for the **MetroDrip Mobile App (iOS / Android)** built on React Native & Expo.
> - **Canvas Reference**: Figma canvas `MetroDrip Mobile App (iOS/Android)` (390×844 base dimensions for iPhone 14/15, safe-area aware, bottom tab navigation).
> - All UI patterns, gestures, status bars, action buttons, headers, and screens are designed, prioritized, and formatted purely for mobile handheld devices.

---

# Module / File: mobile/navigation/AppNavigator.jsx

## Purpose
Own the application's navigation stack and map the browser path `/checkout` to the existing Checkout screen.

## Public Interfaces
### Function / Method: AppNavigator()
- **Purpose**: Render the registration, shopping, account, and checkout navigation stack.
- **Inputs**: No props; React Navigation reads the browser URL.
- **Outputs**: NavigationContainer and native stack elements.
- **Errors**: Bundling or rendering failures appear in Expo logs and the browser console.
- **Dependencies**: React Navigation, registered screen components, React DOM and React Native Web for browser previews.
- **Behavior**: `/checkout` selects Checkout; `/` retains the Initial screen.
- **Side Effects**: Navigation updates browser history.
- **Security & Privacy Notes**: URL routing supplies no authentication or payment authorization. Existing checkout uses demonstration data and a simulated payment alert.
- **Performance / DSA Notes**: Static route mapping for a small, fixed screen set.
- **Accessibility / UX Notes**: Checkout retains its existing mobile layout and navigation context.
- **Observability Notes**: Expo Metro output and browser console.
- **Verification Status**: Executed 2026-09-13: Chrome preview at 390x844 and 1440x900 rendered delivery and payment sections without page errors; desktop reload retained checkout. Screenshots inspected at both sizes.

## Data Flow
Browser `/checkout` → React Navigation linking configuration → Checkout app → local fonts, delivery form and payment options.

## Assumptions
- **Assumption A-01**: A browser preview satisfies the request to run checkout.
  - **Reason**: No Android devices were connected; this project includes an Expo web script.
  - **Impact if wrong**: Launch on a connected device or emulator instead.
  - **Status**: verified (Expo web preview running at http://localhost:8081/checkout)

## Known Risks / Follow-ups
- Resolved: `Alert.alert()` no-op on web fixed using `showAlert()` cross-platform helper with `window.alert` fallback.
- Resolved: `LabeledField` error copy is now rendered visibly inline and binds `aria-invalid` dynamically.
- Resolved: Hardcoded 390px mobile canvas constraint replaced with adaptive responsive layout:
  - Screens < 768px: Mobile layout with sticky bottom footer.
  - Screens >= 768px: Centered 2-column desktop/tablet layout (`maxWidth: 960`) with dedicated payment summary panel.
- Resolved: Fake status bar strip removed from all web views.

---

# Module / File: mobile/Checkout/src/screens/CheckoutScreen.jsx

## Purpose
Render the adaptive front-end checkout and payment screen, dynamically adjusting its layout to mobile, tablet, and desktop viewports, managing delivery address inputs, delivery zone selection, payment method selection, validation, and simulated payment dispatch.

## Public Interfaces
### Function / Method: CheckoutScreen()
- **Purpose**: Main functional component rendering the adaptive checkout interface.
- **Inputs**: None (consumes internal state, `useWindowDimensions`, and React Navigation hooks).
- **Outputs**: React Native element tree:
  - On mobile (`width < 768`): Single-column ScrollView with sticky safe payment footer.
  - On desktop/tablet (`width >= 768`): Centered 2-column layout (`maxWidth: 960`) with delivery address on the left and sticky payment & action panel on the right.
- **Errors**: Handled via internal state `invalidFields` array and cross-platform `showAlert` helper.
- **Dependencies**: React Navigation, `react-native`, `react-native-safe-area-context`, `CheckoutProgress`, `LabeledField`, `PaymentOption`, `PayMongoFooter`.
- **Behavior**:
  1. Detects viewport width via `useWindowDimensions()` and calculates `isWide = width >= 768`.
  2. Renders navigation header (`‹ Checkout`) with accessible 44px touch target.
  3. Adapts layout: 1-column mobile flow vs. 2-column desktop grid.
  4. Manages Delivery Zone modal (bottom sheet on mobile, centered card dialog on desktop).
  5. Toggles payment methods (GCash, Maya, Card) with mutual exclusivity.
  6. Validates required fields with visual inline error text, red border, `aria-invalid="true"`, and alert popup.
- **Side Effects**: Modifies local React state and navigation history.
- **Security & Privacy Notes**: Pure demonstration frontend; sensitive payment card data is not collected or transmitted.
- **Accessibility / UX Notes**:
  - `role="button"` and `role="radio"` mapped to web DOM.
  - Touch targets meet WCAG 44×44px minimum.
  - Dynamic `aria-invalid` on inputs with visible inline error descriptions.
  - Eliminates unnecessary scrolling on widescreen displays by arranging address and payment side-by-side.
- **Verification Status**:
  - **Executed 2026-09-13**:
    - Confirmed removal of fake WebStatusBar ("9:41 ... ◗ ▰").
    - Automated testing executed via headless Google Chrome & Chrome DevTools Protocol across 4 viewports (320x640, 390x844, 768x1024, 1280x800).
    - Verified 2-column desktop layout on 768px and 1280px viewports.
    - Verified desktop centered modal dialog for Delivery Zone selection (tested selecting Mindanao).
    - Verified payment radio selection (Maya) and Pay button dispatch in desktop layout with confirmation alert.
    - Verified mobile single-column layout with sticky payment footer on 390px and 320px viewports.

---

# Module / Configuration: Android Emulator Configuration (app.json & package.json & .env)

## Purpose
Configure project settings and build scripts to enable seamless execution and deployment onto Android Virtual Devices (emulators).

## Public Interfaces / Configuration Keys
### File: app.json
- **`expo.android.package`**: `"com.metrodrip.js"` (Android application package identifier required for native builds, Expo CLI device targeting, and AVD package management).
- **`expo.scheme`**: `"metrodripjs"` (Deep linking URL scheme for Expo and native navigation).
- **`expo.android.usesCleartextTraffic`**: `true` (Allows local HTTP connections to dev servers or local backends on host machine `10.0.2.2`).
- **`expo.android.edgeToEdgeEnabled`**: `true` (Enables modern Android edge-to-edge layout).

### File: package.json
- **`scripts.android`**: `"expo start --android"` (Launches Expo Metro bundler and opens app in Expo Go on running Android emulator).
- **`scripts["android:run"]`**: `"expo run:android"` (Executes Expo prebuild and compiles native Android APK onto emulator via Gradle).

### File: .env
- **`EXPO_PUBLIC_API_URL`**: Configured for production (`https://metrodripjs.onrender.com`) with documented override for Android emulator local host access (`http://10.0.2.2:5000`).

### Folder: .idea/runConfigurations
- Added IDE shared Run Configurations (`android.xml`, `android_run.xml`, `start.xml`, `web.xml`) using `ShConfigurationType` (Shell Script execution native to Android Studio) so Android Studio natively displays `android (npm run android)`, `android:run (npm run android:run)`, `start (npm start)`, and `web (npm run web)` in the top bar Run dropdown menu without requiring external JavaScript plugins.

## Verification Status
- Analyzed and validated JSON formatting using `analyze_file` (0 errors reported).
- Verified `app.json` package identifier `com.metrodrip.js` and scheme `metrodripjs`.
- Cleaned corrupted trailing syntax in `.env`.
- Created `.idea/runConfigurations/*.xml` files configured with `ShConfigurationType` and validated XML syntax with `analyze_file`.
- Executed native Android Gradle build (`./gradlew app:assembleDebug`): **BUILD SUCCESSFUL in 6m 45s**.

---

# Module / File: mobile/context/CartContext.js & ProductDetails.jsx

## Purpose
Provide global shopping cart state management (`CartContext`) and update `ProductDetails` so that clicking "Add to Cart" automatically appends the selected product variant (size, color, fit) to the cart and navigates directly to the Cart page without requiring manual user redirection.

## Public Interfaces
### Hook: useCart()
- **`cart`**: Array of items currently in cart (`id`, `productId`, `name`, `size`, `color`, `fit`, `price`, `quantity`, `image`).
- **`addToCart(item)`**: Function to add or increment item in cart based on variant key.
- **`changeQuantity(id, amount)`**: Adjusts item quantity.
- **`removeItem(id)`**: Removes item from cart.
- **`clearCart()`**: Clears all items.

### Component: ProductDetails.jsx
- **`handleAddToCart()`**: Constructs product variant payload from state (`selectedColor`, `selectedSize`, `selectedFit`), calls `addToCart()`, and executes `navigation.navigate('Cart')`.
- **Button Label**: Updated to `"Add To Cart (${product.product_name || product.name})"`.
- **System Notification/Status Bar**: Integrated `<StatusBar style="dark" />` across `App.js`, `AppNavigator.jsx`, `Home.jsx`, `Shop.jsx`, `ProductDetails.jsx`, `CartScreen.jsx`, `Account.jsx`, and registration screens (`InitialScreen.js`, `LoginScreen.js`, `SignupScreen.js`, `ForgotPasswordScreen.js`) to match the Checkout page behavior.

### Components: LoginScreen.js & SignupScreen.js
- **Text Truncation Fix**: Removed accidental leading spaces and linebreaks inside `<Text>` JSX elements (`"Sign In"` and `"Register"`). Replaced fixed percentage widths with flexbox `flex: 1` and `textAlign: 'center'` on `signInBtn` and `registerBtn` tabs so button text never crops or truncates.
- **Syntax Error Fix**: Removed duplicate key declaration (`navigationContainer:{`) in `LoginScreen.js`.

### Component: CartScreen.jsx
- **Empty Cart Handling**: Wrapped `<View style={styles.checkoutContainer}>` in `{cart.length > 0 && (...)}` so the **Proceed to Checkout** button is hidden when the cart is empty.
- **Theme Contrast**: Updated `emptyTitle` color from `#FFFFFF` to `#111111` for clean readability on light mode backgrounds.

### Component: Home.jsx
- **Hero CTA Design**: Updated `HeroBanner`, `HeroBannerTitle`, `HeroLowerButton`, and `HeroBannerLower` matching Figma node `63:2`:
  - Title: `"Urban Style Redefined"` (white 38px Inter Bold, line-height 42px).
  - CTA Button: Neon Volt `#D3EE42` pill button with `alignSelf: 'flex-start'` and black text `"Shop the drop →"`.
  - Press Action: Navigates directly to `'Shop'`.

## Verification Status
- Validated all JavaScript/JSX files with `analyze_file` (0 errors reported across `CartContext.js`, `App.js`, `ProductDetails.jsx`, `CartScreen.jsx`, `Header.jsx`, `HomeHeader.jsx`, `Home.jsx`, `Shop.jsx`, `Account.jsx`, `InitialScreen.js`, `LoginScreen.js`, `SignupScreen.js`, `ForgotPasswordScreen.js`).



---

# Module / Configuration: Figma MCP Server & Design Context

## Purpose
Integrate the Model Context Protocol (MCP) Figma server and associate the authoritative MetroDrip Figma file (`SmJIlTZ9ZVRxQ5eKucmrd0`) and root canvas node (`63:2`) across Antigravity, VS Code, and Claude Code environments.

## Public Interfaces & Configurations
### Configuration: `~/.gemini/config/mcp_config.json` (Global Antigravity Default)
- **Purpose**: Expose Figma MCP server endpoints globally for Antigravity sessions.
- **Server Identifiers**:
  - `figma-developer-mcp`: Stdio server running `npx -y figma-developer-mcp --figma-api-key=<TOKEN> --stdio` with `FIGMA_API_KEY`.
  - `figma-dev-mode-mcp-server`: Dev Mode MCP server (`http://127.0.0.1:3845/mcp`).

### Configuration: `~/.config/Code/User/mcp.json` (Global VS Code Default)
- **Purpose**: Expose Figma MCP server endpoints for VS Code and Antigravity IDE global user settings.
- **Server Identifiers**:
  - `figma`: Official remote endpoint (`https://mcp.figma.com/mcp`).
  - `figma-developer-mcp`: Stdio server configured with `--figma-api-key`.

### Target Figma Design Identifiers
- **Target Design URL**: `https://www.figma.com/design/SmJIlTZ9ZVRxQ5eKucmrd0/MetroDrip?node-id=63-2&p=f&t=6pNICdGql82KTD7c-0`
- **Target File Key**: `SmJIlTZ9ZVRxQ5eKucmrd0`
- **Target Node ID**: `63:2` (node-id `63-2`)
- **Target Root Canvas**: `MetroDrip Mobile App (iOS/Android)`
- **Offline / Local Cache Fallback**: `figma_node.json`, `figma_summary.txt`, `parse_figma.js`.

## Data Flow
Figma MCP client / AI Agent → requests node `63:2` of file `SmJIlTZ9ZVRxQ5eKucmrd0` via `get_figma_data` → Figma API / local cache → Layout, styles, tokens, and React components rendered in workspace.

## Assumptions
- **Assumption A-01**: The user prefers maintaining MCP configurations in existing global/default user config paths (`~/.gemini/config/mcp_config.json` and `~/.config/Code/User/mcp.json`) rather than creating separate repo-level `.agents` or `.vscode` config files.
  - **Reason**: Explicitly requested to delete newly created configs and use existing defaults.
  - **Impact if wrong**: Recreate workspace configs.
  - **Status**: verified

## Verification Status
- Executed HTTP probe to `https://api.figma.com/v1/me` using user token: Verified account **ARCHIM PAUL PAMEROYAN** (`qappameroyan@tip.edu.ph`).
- Executed node query to `https://api.figma.com/v1/files/SmJIlTZ9ZVRxQ5eKucmrd0/nodes?ids=63:2`: Confirmed full read access to MetroDrip design data.
- Executed live stdio test with `figma-developer-mcp`: Successfully called `get_figma_data` on file `SmJIlTZ9ZVRxQ5eKucmrd0` at node `63:2`, receiving layout parameters and design tokens.
- Deleted repo-level separate configs (`.agents/` and `.vscode/mcp.json`).
- Updated existing default global configs `~/.gemini/config/mcp_config.json` and `~/.config/Code/User/mcp.json`.

---

# Module / File: mobile/Checkout/src/screens/OrderConfirmationScreen.jsx

## Purpose
Render the Order Confirmation and Payment Success screen based on Figma frame `M07 · Order Confirmation` (node `445:2`), sequentially receiving the order summary from the checkout payment step, displaying the receipt details, delivery address with ETA, items purchased, and navigation triggers.

## Public Interfaces
### Component: OrderConfirmationScreen()
- **Purpose**: Render the post-checkout confirmation view.
- **Inputs**: Route params `route.params.order` (optional, falls back gracefully to default Figma mock data).
- **Outputs**: React Native component tree:
  - Header: Back to shop and brand title.
  - Success Hero: Dark `#141414` card with neon lime `#D3EE42` circular checkmark, `PAYMENT SUCCESSFUL` badge, order headline, and `MD-2026-00318` chip.
  - Payment Details: Total amount paid, payment method with mobile handle, PayMongo reference number, and receipt email confirmation.
  - Delivery Details: Customer name, destination address, neon dot ETA indicator, and `J&T Express` badge.
  - Items Summary: Line items with thumbnails/initials, product titles, variant specs, and line totals.
  - Action Buttons: `View receipt` modal trigger and `Track order` primary button.
- **Errors**: Missing fields fallback gracefully to default values.
- **Dependencies**: `@react-navigation/native`, `react-native-safe-area-context`, `../theme`.
- **Side Effects**: None.
- **Accessibility & UX**: Meets 44×44px touch targets; uses high-contrast typography; supports mobile single-column and desktop wide viewports.
- **Verification Status**: Validated via `@babel/parser` (0 errors) and compiled cleanly in Expo web production export (688 modules bundled).

---

# Module / File: mobile/Products/components/CustomerReviews.jsx & data/reviewsData.js

## Purpose
Render the product customer reviews section on `ProductDetails.jsx` matching Figma frame `M04a · Product Detail — Reviews` (node `449:21`), providing rating overview, verified review cards, and interactive review submission.

## Public Interfaces
### Component: CustomerReviews({ productId })
- **Purpose**: Renders the complete reviews section on product pages.
- **Inputs**: `productId` (string/number).
- **Outputs**:
  - Reviews header with average score, star rating, and review count.
  - "See all" / "Show less" toggle.
  - Review cards with reviewer name, `#D3EE42` `VERIFIED` pill badge, star rating, comment text, and date.
  - "+ Write a Review" interactive modal with star selection and comment submission.
- **Helper Methods**: `getReviewsForProduct(productId)`, `getReviewStats(reviews)`, `addReviewForProduct(productId, newReview)`.
- **Dependencies**: React Native primitives, `mobile/Checkout/src/theme`.
- **Verification Status**: Validated via `@babel/parser` (0 errors) and compiled cleanly in Expo web export.

---

# Module / File: mobile/Checkout/src/screens/PaymentDetailsScreen.jsx

## Purpose
Render the intermediate Payment Details screen based directly on Figma frames `M07 · Payment Details — GCash` (node `452:2`), `M07a · Payment Details — Maya` (node `452:99`), and `M07b · Payment Details — Card` (node `453:2`), sequentially receiving the delivery order draft from `CheckoutScreen`, collecting and validating payment credentials, and transitioning to `OrderConfirmationScreen` upon simulated authorization.

## Public Interfaces
### Component: PaymentDetailsScreen()
- **Purpose**: Render the payment account/card credentials entry interface matching the customer's selected payment method.
- **Inputs**: Route params:
  - `route.params.orderDraft`: Order details from Checkout (orderId, total, items, recipient address, customer name, mobile).
  - `route.params.paymentMethod`: Selected payment method (`'gcash'`, `'maya'`, `'card'`, or `'cod'`).
- **Outputs**: Responsive React Native component tree:
  - Header: 52px height with back navigation `‹`, title `Payment`, and security lock icon `🔒`.
  - Progress Stepper: `CheckoutProgress` with step 3 highlighted (`currentStep={3}`).
  - Amount Due Card: `#F4F4F2` card showing `AMOUNT DUE`, Anton display price `₱2,632.00`, and order item summary.
  - Selected Method Banner: 2px `#141414` border, radio indicator with volt dot (`#D3EE42`), method title, subtitle, and `Change` action button (opens payment method modal switcher).
  - Method-Specific Credential Forms:
    - **GCash (`452:2`)**: Headline `GCash account`, `GCASH MOBILE NUMBER`, `ACCOUNT NAME`, redirect warning notice `ⓘ`, and `Save GCash for faster checkout` checkbox.
    - **Maya (`452:99`)**: Headline `Maya account`, `Maya Wallet` vs `Maya Card` toggle pill, `MAYA MOBILE NUMBER`, `ACCOUNT NAME`, 6-digit OTP notice `ⓘ`, and `Save Maya for faster checkout` checkbox.
    - **Card (`453:2`)**: Headline `Card details`, `CARD NUMBER` with spaced formatting and `VISA` / `MC` brand badge, 2-column `EXPIRY` (`MM / YY`) and `CVV` (`•••`), `NAME ON CARD`, `Billing address same as delivery` checkbox, PayMongo tokenization security notice, and `Save card for faster checkout` checkbox.
    - **Cash on Delivery**: Cash preparation and delivery notice.
  - Sticky Action Footer (and Desktop Sidebar Action Panel):
    - Volt pill button (`#D3EE42`): `Pay ₱[total]` with loading indicator and press feedback.
    - Subtitle: `Secured by PayMongo · card details never stored` (IBM Plex Mono 10px `#63635C`).
- **Behavior & Flow**:
  1. Validates required method credentials upon tapping Pay.
  2. Displays loading spinner on the button during simulated PayMongo authorization.
  3. Clears the cart via `useCart().clearCart()`.
  4. Assembles completed order payload and navigates to `OrderConfirmation` route with `{ order: orderPayload }`.
- **Dependencies**: React Navigation, `CartContext`, `CheckoutProgress`, `colors`, `fonts`.
- **Accessibility & UX**: Follows WCAG 44×44px minimum touch targets, dynamic checkbox states, high-contrast typography, and responsive 2-column desktop / 1-column mobile layouts.
- **Verification Status**: Validated via `@babel/parser` (0 syntax errors) and compiled cleanly in Expo web export (689 modules bundled with 0 errors).

---

# Module / File: web/Registration/ (staff login — Merchant & Administrator)

## Purpose
Static (no build step) browser login screens for merchant and administrator staff. They implement Figma file `SmJIlTZ9ZVRxQ5eKucmrd0`, page `MetroDrip Web UI` (0:1), frames `14 · Administrator Login (Desktop)` 461:2, `15 · Merchant Login (Desktop)` 464:2, and their dark variants D14 464:104 / D15 464:206. The folder layout mirrors `mobile/Registration/` and `mobile/assets/`. Dashboards, sign-up, and password reset are out of scope.

## Files
| Path | Responsibility |
| --- | --- |
| `web/Registration/screens/MerchantLoginScreen.html` | Merchant page markup (`data-login-role="merchant"`) |
| `web/Registration/screens/AdminLoginScreen.html` | Administrator page markup (`data-login-role="admin"`) |
| `web/Registration/screens/LoginScreen.css` | Shared layout; Figma measurements; breakpoints 980 / 860 / 500 px |
| `web/Registration/theme.css` | Colour/font tokens named after Figma variables (`color/paper`, `color/ink`, `color/volt`, …); `:root[data-theme='dark']` overrides |
| `web/Registration/theme.js` | Theme resolution and persistence; wires `[data-theme-option]` buttons |
| `web/Registration/AppLogin.js` | Form validation, loading/success states, simulated sign-in |
| `web/assets/deco-ring.svg` | Exact bytes of the Figma "Deco ring" export (all four frames share one identical asset) |
| `web/assets/favicon.png` | Copied from `mobile/assets/favicon.png` |

## Public Interfaces
### Script: web/Registration/theme.js (IIFE, no globals)
- **Purpose**: Set `document.documentElement.dataset.theme` before first paint and keep the Light/Dark switch in sync.
- **Inputs**: `localStorage['metrodripTheme']` (`'light' | 'dark'`, same key as the ASP.NET console `common.js`); `prefers-color-scheme` media query; clicks on `[data-theme-option]` buttons.
- **Outputs**: `data-theme` on `<html>`; `.is-active` and `aria-pressed` on the switch buttons.
- **Errors**: Storage exceptions are caught; the theme then applies for the current page only.
- **Behavior**: Saved choice → else OS preference; follows OS changes only while no explicit choice is saved. It must load synchronously in `<head>`.
- **Side Effects**: Writes `localStorage['metrodripTheme']` on click.
- **Verification Status**: Executed. See Verification below.

### Script: web/Registration/AppLogin.js (IIFE, `defer`)
- **Purpose**: Drive every `form[data-login-role]` on the page.
- **Inputs**: Form fields `email` (required, `^[^\s@]+@[^\s@]+\.[^\s@]+$`), `password` (required, ≥ 6 chars — same rules as `mobile/Registration/screens/LoginScreen.js`), `code` (optional; if present exactly 6 digits).
- **Outputs**: Per-field `aria-invalid` + visible `#<field>-error` text; `role="status"` message on success.
- **Errors**: Validation errors are shown inline and focus moves to the first invalid field. Typing in a field clears its error.
- **Behavior**: submit → validate → `aria-disabled="true"` + "SIGNING IN…" → `simulateSignIn()` (900 ms timer) → clear password/code → "✓ Signed in as …" status. Re-submits while busy are ignored.
- **Side Effects**: None beyond DOM updates. No credentials are stored or transmitted.
- **Security & Privacy Notes**: **Demo only.** `metrodrip_backend` exposes only `admin/` and catalog routes, with no staff-login API. Replace `simulateSignIn()` with a real POST and enforce role, 2FA, rate limiting, and lockout server-side. Pages carry `<meta name="robots" content="noindex">`.
- **Accessibility / UX Notes**: Semantic labels; `aria-describedby` links each input to its error (and the code hint); `autocomplete` username / current-password / one-time-code; visible `:focus-visible` rings; theme buttons expose `aria-pressed`; `prefers-reduced-motion` disables transitions. Tab order: theme switch → return link → email → password → code → LOG IN.
- **Verification Status**: Executed. See Verification below.

## Data Flow
Screen HTML → `theme.js` (sync, sets `data-theme`) → `theme.css` tokens → `LoginScreen.css` → `AppLogin.js` (deferred) → validate → simulated sign-in → status message.

## Decisions
- **Vanilla HTML/CSS/JS** instead of React Native Web: matches the provided ASP.NET static reference pages and needs no bundler. Alternative rejected: a new Expo route, because it couples staff consoles to the customer app bundle.
- **Card border as an `::after` overlay**: Figma draws strokes inside frames. A real CSS border shrank the form column to 384 px, wrapped the 2FA hint, and made the card 728.8 px tall. The overlay keeps the 432/508 split exact.
- **Markup duplicated across the two screens** (brand panel, form) instead of a JS-injected component: pages render fully without JavaScript, at the cost of editing two files for shared changes.
- **Figma pill "Check out" node 52:402** (the originally shared link) belongs to the D05 Checkout frame, not to login. The login frames use a square LOG IN button, which was followed.

## Verification
- **Executed 2026-09-14**: headless Google Chrome via CDP (`python3 -m http.server` serving `web/`).
  - Geometry at 1280×880 matches Figma within ≈1 px for both screens and both themes: card 170,81 940×718; panels 432/508; deco ring 272,358 280×280; barcode y 604 210×28; form inner 386×583.8 (Figma 583); email input y 215.1 (Figma 215.5); LOG IN y 509.1 (Figma 509.5); notice 68.8 (Figma 68).
  - Computed dark tokens: paper `rgb(15,15,15)`, ink `rgb(242,242,239)`, surface `rgb(26,26,26)`, accent text `rgb(211,238,66)`.
  - Fonts Anton / IBM Plex Mono / Inter reported loaded (`document.fonts.check`).
  - Empty submit → email & password errors, focus on email; invalid input → 3 specific errors; typing clears an error; valid submit → loading state, a double submit is ignored, then success status and the password is cleared.
  - Theme toggle persists across both screens; `aria-pressed` updates.
  - No horizontal overflow at 320, 390, 768, or 1280 px. No console errors or failed requests.
  - `node --check` passes for both scripts.
- **Not verified**: Safari/Firefox rendering; screen-reader announcement order (reasoned from semantics only); offline font fallbacks.

## Known Risks / Follow-ups
- Replace simulated sign-in with a real backend endpoint (owner: backend team). Until then these pages grant nothing.
- "← Return to storefront" points to `/`. Update it when the storefront deployment URL is known.
- The theme-switch glyphs ☼/☾ fall back to a system font (Inter lacks them), so they render slightly smaller than in Figma.

---

# Design System Standard: Project-Wide CTA Button Color

## Specification
- **Primary CTA Fill**: `#D3EE42` (`colors.volt`, Figma variable `fill_c0421ffe`)
- **Primary CTA Text**: `#141414` (`colors.ink` / `colors.onVolt`, Figma variable `fill_81eb06fd`, `fontFamily: fonts.interBold`)
- **Corner Radius**: Pill shape (`borderRadius: 25` or `9999`)
- **Secondary / Ghost Buttons**: Transparent with 1.5px stroke (`#141414` on light, `#63635C` on dark)

## Surface Coverage
1. **Welcome / Onboarding (`mobile/Registration/screens/InitialScreen.js`)**:
   - `createAccountBtn`: Primary CTA styled with `#D3EE42` background and `#141414` bold text.
   - `signInBtn`: Secondary outlined button with `#141414` border and text.
2. **Authentication (`mobile/Registration/theme.js`, `LoginScreen.js`, `SignupScreen.js`, `ForgotPasswordScreen.js`)**:
   - `theme.accent`: `#D3EE42`
   - `theme.accentText`: `#111111` / `#141414`
   - Covers `loginButton`, `signupButton`, and `resetButton`.
3. **Cart (`mobile/Cart/CartScreen.jsx`)**:
   - `checkout`: Proceed to Checkout CTA styled with `#D3EE42` and `#141414` text.
   - `shopButton`: Empty cart CTA ("Start Shopping") styled with `#D3EE42` and `#141414` text.
   - Accent highlights (`logoAccent`, `pageLabel`): `#D3EE42`.
4. **Product Details (`mobile/Products/ProductDetails.jsx`)**:
   - `addToCartButton`: Add to Cart CTA styled with `#D3EE42` and `#141414` text.
5. **Customer Reviews (`mobile/Products/components/CustomerReviews.jsx`)**:
   - `submitButton`: Review submission modal CTA styled with `colors.volt` (`#D3EE42`) and `colors.ink` (`#141414`) text with pill radius.
6. **Checkout (`mobile/Checkout/src/screens/CheckoutScreen.jsx`)**:
   - `payButton`: Payment CTA styled with `colors.volt` (`#D3EE42`) and `colors.onVolt` (`#141414`).
7. **Payment Details (`mobile/Checkout/src/screens/PaymentDetailsScreen.jsx`)**:
   - `payButton`: Authorize & Pay CTA styled with `colors.volt` (`#D3EE42`) and `colors.ink` (`#141414`).
8. **Order Confirmation (`mobile/Checkout/src/screens/OrderConfirmationScreen.jsx`)**:
   - `primaryButton`: "Track order" CTA styled with `colors.volt` (`#D3EE42`) and `colors.ink` (`#141414`).
   - `modalDoneButton`: Receipt modal "Done" CTA styled with `colors.volt` (`#D3EE42`) and `colors.ink` (`#141414`).
9. **Home (`mobile/Home/Home.jsx`)**:
   - `HeroLowerButton`: "Shop the Drop" Hero CTA styled with `#D3EE42` and `#141414` text.
10. **Global Indicators (`mobile/components/Footer.jsx`, `mobile/Checkout/src/components/CheckoutProgress.jsx`)**:
    - Tab active dot and checkout progress step indicators styled with `#D3EE42`.

---

# Brand Identity: Top Header Brand Logo

## Specification (Figma Node `63:75`)
- **Typeface**: Anton Regular (`Anton_400Regular` from `@expo-google-fonts/anton`)
- **"Metro" Text**:
  - Value: `"Metro"`
  - Fill: `#141414` (`colors.ink`, Figma `fill_81eb06fd`)
  - Size: 26px, LineHeight: 28px
- **"Drip" Text**:
  - Value: `"Drip"`
  - Fill: `#5C6B12` (`colors.olive`, Figma `fills=["#5C6B12"]`)
  - Size: 26px, LineHeight: 28px
- **Layout & Actions ([HomeHeader.jsx](file:///home/kakashi70-0/Documents/GitHub/MetroDripJS/mobile/components/HomeHeader.jsx))**:
  - Row layout with `justifyContent: 'space-between'` and safe-area top inset support.
  - Left: Interactive brand logo navigating to `Home`.
  - Right: Notification bell with unread red badge (`#C2282D`) and shopping bag with dynamic cart badge indicator.

---

# Module / File: web/merchant/analytics.html & web/merchant/analytics.js & metrodrip_backend/catalog/merchant_views.py (MerchantAnalyticsAPIView)

## Purpose
Deliver the Merchant Analytics dashboard console view, presenting sales velocity, conversion KPIs, dual-line SVG net sales time-series, best-seller volume rankings, detailed product sales reports with category filtering, trending product deltas, user interaction funnels, and CSV report exports, adhering to Figma node 511:2 (Light) and 514:14 (Dark).

## Public Interfaces
### Endpoint: GET /api/merchant/analytics/?category={all|tops|bottoms|accessories}
- Purpose: Retrieve executive KPIs, 7-day sales time-series, best-sellers, filtered product sales report, trending items, and user interaction funnel metrics.
- Inputs: `category` query param (`string`, defaults to `'all'`).
- Outputs: JSON response object containing `period`, `comparison_period`, `currency`, `timezone`, `kpis`, `sales_over_time`, `best_sellers`, `product_sales_report`, `totals`, `trending_products`, `user_interactions`.
- Errors: Returns 200 with fallback data; logs exceptions.
- Dependencies: Django REST Framework APIView (`metrodrip_backend/catalog/merchant_views.py`).
- Behavior: Filters catalog sales data by category if specified, calculates sum totals, returns structured JSON payload.
- Side Effects: None (read-only query).
- Security & Privacy Notes: Demonstration / internal console view; excludes sensitive customer PII.
- Observability Notes: Django request logging and console server output.
- Verification Status: Executed via curl / Invoke-WebRequest (HTTP 200) and verified via browser subagent on 2026-09-20.

### Script: web/merchant/analytics.js (IIFE)
- Purpose: Client-side controller for rendering charts, tooltips, best sellers, table filtering, and CSV download.
- Inputs: User interaction with category selector (`#select-category`), date range (`#select-date-range`), comparison (`#select-comparison`), hover on `.chart-point`, and click on `#btn-export-report`.
- Outputs: DOM updates across KPI cards, SVG chart paths/tooltips, data table tbody and tfoot, and browser file download for CSV export.
- Side Effects: Triggers CSV file download in browser and toast notifications.
- Accessibility / UX Notes: High contrast text (4.5:1+), accessible SVG axis labels, interactive hover tooltips, role-safe table structure with `scope="col"`, theme sync via `theme.js`.
- Verification Status: Executed in Chrome via browser subagent on 2026-09-20. Verified Light/Dark mode, SVG tooltip hover, category filtering to 'Tops', totals recalculation, CSV export with toast notification.

---

# Module / File: web/merchant/catalog.html & web/merchant/merchant.js & metrodrip_backend/catalog/merchant_views.py (Customer Reviews View & Reply)

## Purpose
Deliver the Customer Reviews section in the Merchant Console (Catalog view), removing the approve/reject moderation capability and introducing a View & Reply workflow matching Figma Node 58:2 (Light) and Node 58:467 (Dark). Merchants can inspect customer review details and submit public merchant responses.

## Public Interfaces
### Endpoint: GET /api/merchant/reviews/
- Purpose: Retrieve customer reviews for the merchant console.
- Outputs: Array of review objects containing `id`, `customer_name`, `product_name`, `body`, `rating`, `rating_stars`, `merchant_reply`, `replied_at`, `created_at`, `status`.
- Errors: Returns 200 with seed fallback if database is unseeded.

### Endpoint: GET /api/merchant/reviews/<int:pk>/
- Purpose: Retrieve full review details for the View modal.
- Outputs: JSON review object with full body, star rating, and merchant reply if present.
- Errors: 404 if review does not exist.

### Endpoint: POST /api/merchant/reviews/<int:pk>/reply/
- Purpose: Submit or update a public merchant response to a customer review.
- Inputs: `{"reply": "..."}` (string, non-empty).
- Outputs: HTTP 200 JSON with updated review record, `merchant_reply`, `replied_at`, and success message.
- Errors: 400 Bad Request if reply text is empty; 404 if review not found.

### Scripts & Modals: web/merchant/merchant.js & catalog.html
- Purpose: Drive `#modal-view-review` and `#modal-reply-review`.
- Actions:
  - "View" button (`.btn-outline-pill.btn-view-review`): Opens View modal displaying customer, rating, product, full review quote, and merchant response.
  - "Reply" button (`.btn-volt-pill.btn-reply-review`): Opens Reply modal with context banner and textarea.
  - Form submission sends reply via POST, updates review state in cache and UI button to "Edit reply", closes modal, and shows confirmation toast.
  - Keyboard accessibility: `Escape` key and backdrop click close open modals. Focus returns appropriately.
- Verification Status: Executed via Django automated test suite (8/8 tests pass) and browser subagent verification on 2026-09-20.

---

# Module / File: metrodrip_backend/catalog/merchant_views.py & web/merchant/catalog.html (Merchant Product Detail & Categories)

## Purpose
Enable store merchants to inspect and edit existing catalog products (name, base price, inventory stock, category, SKU, active status) and manage product categories dynamically through dedicated modals and REST APIs.

## Public Interfaces
### Endpoint: GET /api/merchant/products/<int:pk>/
- Purpose: Retrieve single product attributes, variant count, and consolidated stock across warehouse entries.
- Outputs: `id`, `name`, `sku`, `category`, `price`, `stock`, `is_active`, `status`, `description`.
- Errors: 404 if product not found.

### Endpoint: PATCH /api/merchant/products/<int:pk>/
- Purpose: Modify product details including base price, category, name, active status, and inventory stock.
- Inputs: JSON payload with any combination of `name`, `price`, `stock`, `category`, `sku`, `is_active`, `description`.
- Outputs: Updated product object.
- Side Effects: When `stock` is modified, updates/creates `InventoryStockEntry` and records an `InventoryStockMovement` with `reason='manual_adjustment'`.
- Verification Status: Executed via unit tests (`identity.tests_consoles`) and end-to-end browser subagent verification on 2026-09-20.

### Endpoint: GET & POST /api/merchant/categories/
- Purpose: List active catalog categories with item counts and create new categories.
- Inputs for POST: `{"name": "...", "description": "..."}`.
- Outputs: Category list or created category object (`id`, `name`, `slug`, `product_count`, `is_active`).
- Verification Status: Executed via unit tests and browser subagent verification on 2026-09-20.

---

# Module / File: metrodrip_backend/catalog/merchant_views.py & web/merchant/index.html (Merchant Orders & Fulfillment)

## Purpose
Provide the merchant console with comprehensive order inspection and status lifecycle progression (`paid` → `packed` → `shipped`), including delivery address, line item breakdown, and CSV report exports.

## Public Interfaces
### Endpoint: GET /api/merchant/orders/<int:pk>/
- Purpose: Retrieve detailed order breakdown including line items, shipping address, and payment method.
- Outputs: `id`, `order_no`, `status`, `raw_status`, `subtotal`, `shipping`, `total`, `payment_method`, `created_at`, `shipping_address`, `lines`.
- Errors: Returns 200 with demo order data if order ID matches seeded sample dataset.

### Endpoint: PATCH /api/merchant/orders/<int:pk>/status/
- Purpose: Progress order fulfillment status (`paid` → `packed` → `shipped`).
- Inputs: `{"status": "packed"|"shipped"}`.
- Outputs: `id`, `order_no`, `status`, `raw_status`, `message`.
- Side Effects: Updates `OrdersOrder.status` and `OrdersOrder.updated_at` in the database.
- Verification Status: Executed via Django test runner and browser subagent verification on 2026-09-20.

### Endpoint: GET /api/merchant/orders/export/
- Purpose: Download timestamped CSV export of recent orders with status and payment breakdown.
- Verification Status: Executed via DRF test case on 2026-09-20.

---

# Module / File: metrodrip_backend/identity/admin_views.py & web/admin/index.html (Admin Shipping Zones & Roles)

## Purpose
Provide the Administrator Console with full regional courier rate management (NCR, Luzon, VisMin) backed by `ShippingShippingZone` and immutable administrative audit logs, and provide staff roles directories.

## Public Interfaces
### Endpoint: GET /api/admin/shipping-zones/
- Purpose: List active shipping zones and delivery rates (seeds defaults if table is empty).
- Outputs: Array of zone records (`id`, `name`, `fee`, `formatted_fee`, `is_active`).

### Endpoint: PATCH /api/admin/shipping-zones/<int:pk>/
- Purpose: Update regional courier rate and/or active status.
- Inputs: `{"fee": 95, "is_active": true}`.
- Side Effects: Automatically creates an `AuditLog` entry tracking the actor, old rate, and new rate.
- Verification Status: Executed via automated Django test suite and browser subagent on 2026-09-20.

### Endpoint: GET /api/admin/roles/
- Purpose: Return platform role hierarchy and permission capabilities summary.
- Outputs: Array of role definitions (`admin`, `merchant`, `customer`) with permission scopes and active account counts.
- Verification Status: Executed via test suite on 2026-09-20.

---

# Module / File: web/dev_server.py & web/merchant/index.html & web/merchant/catalog.html (Merchant Analytics Navigation & Dev Server)

## Purpose
Prevent browser disk caching collisions and guarantee reliable navigation to `analytics.html` from the Merchant Console Dashboard (`index.html`) and Catalog (`catalog.html`).

## Problem and Root Cause
When accessing `http://localhost:3000/merchant/index.html` and clicking "Analytics", browsers previously served a corrupt 1x1 image placeholder titled `analytics.html (1×1)` from disk cache because the standard `python -m http.server` sends no `Cache-Control` headers and allows stale browser caching of previous resource types.

## Resolution
1. **Custom Dev Server (`web/dev_server.py`)**: Subclasses `SimpleHTTPRequestHandler` to inject explicit `Cache-Control: no-store, no-cache, must-revalidate, max-age=0`, `Pragma: no-cache`, `Expires: 0`, and explicit UTF-8 MIME types (`text/html; charset=utf-8`, `application/javascript; charset=utf-8`).
2. **Cache-Busted Navigation Links**: Updated `<a class="nav-item" href="analytics.html?v=1.1">` across `web/merchant/index.html`, `web/merchant/catalog.html`, and `web/merchant/analytics.html` to ensure any browser cache is bypassed immediately on click.
3. **Local Dev & File Protocol Support**: Enhanced `web/merchant/analytics.js` to support `file:` protocol and seamless fallback.

## Verification Status
- Executed end-to-end automated navigation test via `browser_subagent` on 2026-09-20.
- Verified clicking "Analytics" on Merchant Dashboard smoothly loads `http://localhost:3000/merchant/analytics.html?v=1.1`.
- Verified 4 KPI stat cards, SVG sales trendline, Best Sellers volume bars, Product Sales report table, category filters (`Tops`, `All`), CSV export toast, and bidirectional sidebar navigation between Catalog and Analytics.

---

# Module / Suite: web/admin/ (User Accounts, Roles, Platform Settings, Audit Trail)

## Purpose
Provide the Administrator Console with dedicated, standalone management pages for complete oversight of user accounts, granular RBAC permission matrix, platform configuration preferences, and immutable audit logs.

## Public Interfaces
### View / Page: web/admin/users.html & users.js
- Purpose: Manage customer and staff accounts directory.
- Features: Real-time search query filter, role pill selector, user detail inspector card (Save role, Reset password, Suspend/Activate), and Add User modal.
- Verification Status: Executed via browser subagent on 2026-09-20; confirmed search for "Bea S." and role updating.

### View / Page: web/admin/roles.html & roles.js
- Purpose: Inspect capability matrix across roles (`admin`, `merchant`, `customer`) and define new custom roles.
- Features: 8-capability permission matrix table, role inspector with permission badges, and interactive custom role builder.
- Verification Status: Executed via browser subagent on 2026-09-20; confirmed matrix rendering and role selection.

### View / Page: web/admin/settings.html & settings.js
- Purpose: Configure store identity, security & access controls, and checkout shipping thresholds.
- Features: Interactive checkboxes (2FA requirement, email receipts), threshold inputs, and instant toast confirmation.
- Verification Status: Executed via browser subagent on 2026-09-20; verified preference toggle and toast alert.

### View / Page: web/admin/audit.html & audit.js
- Purpose: Comprehensive timeline of administrative security actions with deep JSON diff inspection.
- Features: Live filter by search/actor/module, inspect event details with formatted before/after diffs, and export CSV button.
- Verification Status: Executed via browser subagent on 2026-09-20; verified event row selection and diff viewer.

---

# Module / Suite: web/merchant/ (Inventory, Orders, Shipments, Shipping Zones, Reviews, Content & Banners)

## Purpose
Deliver the complete seller/store operations workflow across six dedicated standalone pages matching Figma canvas `SmJIlTZ9ZVRxQ5eKucmrd0` (node `550-143` and related frames).

## Public Interfaces
### View / Page: web/merchant/inventory.html & inventory.js (Figma 550:26)
- Purpose: SKU inventory management, stock level alerts, and stock adjustments.
- Features: Low-stock warning table, interactive stock calculator (delta addition/subtraction), and live movements activity log.

### View / Page: web/merchant/orders.html & orders.js (Figma 550:65)
- Purpose: Order fulfillment processing and itemized inspection.
- Features: Fulfillment status tabs, itemized line items list, customer delivery address display, and "Mark as packed" action.

### View / Page: web/merchant/shipments.html & shipments.js (Figma 550:104)
- Purpose: Logistics queue, parcel booking, and courier tracking timeline.
- Features: Shipments queue with carrier badges (NinjaVan, J&T, Lalamove), parcel booking card, tracking timeline checkpoints, and address exception resolution.

### View / Page: web/merchant/shipping-zones.html & shipping-zones.js (Figma 550:221)
- Purpose: Delivery zone configuration and real-time shipping eligibility calculation.
- Features: Courier rate editor (NCR ₱85, Luzon ₱120, VisMin ₱150) and interactive address eligibility calculator.

### View / Page: web/merchant/reviews.html & reviews.js (Figma 550:143 & 515:27 & 515:212)
- Purpose: Customer feedback moderation and merchant replies.
- Features: 3 stat cards ("NEEDS A REPLY: 2", "AVERAGE RATING: 4.7 / 5", "REPLIED: 84"), customer review modal (`515:212`), and inline reply composer with live character counter (`106 / 1,000`) decrementing the "Needs a reply" count upon posting.

### View / Page: web/merchant/content.html & content.js (Figma 550:182 & 554:793)
- Purpose: Storefront hero banners and campaign scheduling.
- Features: Storefront placements table, banner editor form (Headline, Supporting text, Button label, Destination URL, Schedule), and live real-time Desktop preview card styled with MetroDrip typography (`Anton`, Volt `#d3ee42`).

---

# Module / File: metrodrip_backend/identity/admin_views.py & admin_urls.py (Phase 2 Backend Endpoints)

## Purpose
Expose RESTful APIs supporting Admin Console features: platform settings, custom roles, password reset, and audit trail export.

## Public Interfaces
### Endpoint: GET & PATCH /api/admin/settings/
- Purpose: Read and persist platform-wide configuration settings.
- Inputs (PATCH): JSON dictionary with updated settings keys (`free_shipping_threshold`, `standard_shipping_rate`, etc.).
- Outputs: Updated settings payload and success message.
- Side Effects: Records an immutable `AuditLog` entry.
- Verification Status: Executed via `ConsolesAPITestCase.test_admin_settings_get_and_patch`.

### Endpoint: POST /api/admin/roles/
- Purpose: Define and register a custom administrative or operational role.
- Inputs: `{"role": "dispatcher", "title": "Warehouse Dispatcher", "permissions": ["manage_inventory"]}`.
- Outputs: 201 Created with role definition.
- Verification Status: Executed via `ConsolesAPITestCase.test_admin_roles_create_custom`.

### Endpoint: POST /api/admin/users/<int:pk>/reset-password/
- Purpose: Dispatch a password reset token/link for an account.
- Outputs: Reset token and expiration metadata.
- Verification Status: Executed via `ConsolesAPITestCase.test_admin_user_reset_password`.

### Endpoint: GET /api/admin/audit-logs/export/
- Purpose: Stream CSV export of security audit trail.
- Verification Status: Executed via `ConsolesAPITestCase.test_admin_audit_logs_filter_and_export`.

---

# Module / File: metrodrip_backend/catalog/merchant_views.py & merchant_urls.py (Phase 2 Backend Endpoints)

## Purpose
Expose RESTful APIs supporting Merchant Console operations: shipment booking, regional rate eligibility, and storefront banner management.

## Public Interfaces
### Endpoint: GET & POST /api/merchant/shipments/
- Purpose: List shipments and book new courier parcels for customer orders.
- Inputs (POST): `{"order_ref": 318, "carrier": "NinjaVan Express"}`.
- Outputs: 201 Created with generated waybill (`NV-PH-XXXXXXX`) and tracking number.
- Side Effects: Updates order status to `shipped` and creates a `ShippingShipment` record.
- Verification Status: Executed via `ConsolesAPITestCase.test_merchant_shipments_get_and_post`.

### Endpoint: POST /api/merchant/shipping-zones/eligibility/
- Purpose: Determine courier serviceability and calculate final shipping fee with free-shipping qualification logic.
- Inputs: `{"address": "Makati City, Metro Manila", "subtotal": 2999}`.
- Outputs: `{"eligible": true, "zone": "NCR", "base_fee": 85, "final_fee": 0, "free_shipping_applied": true}`.
- Verification Status: Executed via `ConsolesAPITestCase.test_merchant_shipping_eligibility`.

### Endpoint: GET & POST & PATCH /api/merchant/banners/ & /banners/<int:pk>/
- Purpose: Manage storefront promotional placements (`Homepage hero`, `Announcement bar`, etc.).
- Backed by: `content.models.CmsHomepageBanner`.
- Verification Status: Executed via `ConsolesAPITestCase.test_merchant_banners_get_and_patch`.

---

# Quality Assurance (QA) Execution & Defect Verification Report

## Scope
Comprehensive functional and interaction Quality Assurance testing across all components of the **Merchant Console** and **Admin Console**, covering backend API boundary and negative scenarios, complete UI element clickability/interaction, and link/static asset integrity.

## Test Results Summary
- **Backend API & Logic Tests**: 29 / 29 tests passed (`Ran 29 tests in 0.189s — OK`).
- **Static Link & Asset Audit**: 213 of 213 references verified across 17 HTML files (0 disk missing, 0 HTTP failures).
- **UI & Interaction Coverage**: 100% of tested user journeys passed with zero broken buttons or fatal errors.

## Defect Log

| Defect ID | Component | Severity | Symptom | Root Cause | Remediation | Verification Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `DEF-01` | `web/index.html` | Minor | 404 error when requesting `/_expo/static/js/web/index-8ea306153b74a113cc54dbf4fa5e1c7c.js`. | Legacy static bundle script left in `web/index.html`. | Converted `web/index.html` into a portal directory connecting Merchant Console, Admin Console, and Staff Logins. | **VERIFIED RESOLVED** via `scratch/audit_links.py` (213/213 refs OK). |
| `DEF-02` | `package.json` | Minor | `npm run dev` threw `npm error Missing script: "dev"`. | Missing `"dev"` script alias in `package.json`. | Configured `"dev": "python web/dev_server.py 3000"` in `package.json`. | **VERIFIED RESOLVED** via local execution. |

---

# Module / File: mobile/Registration/screens/InitialScreen.js (Figma M01 · Splash & Onboarding)

## Purpose
Render the initial splash and onboarding entry screen for the MetroDrip Mobile App, mirroring Figma frame `M01 · Splash & Onboarding` (node `63:3`).

## Public Interfaces
### Function / Component: InitialScreen({ navigation })
- **Purpose**: Present branding, streetwear identity badge, barcode graphic, value proposition, and user entry actions.
- **Inputs**: `navigation` object from React Navigation stack.
- **Outputs**: JSX tree rendering status bar, central hero container, and bottom action buttons.
- **Errors**: Safe navigation fallback if navigation prop is undefined.
- **Dependencies**: `react-native`, `expo-status-bar`, `react-native-safe-area-context`, `src/theme/font`.
- **Behavior**:
  - Sets light status bar style over `#141414` background.
  - Displays `"Metro"` (`#FFFFFF`, `Anton_400Regular`, 44px) and `"Drip"` (`#D3EE42`, `Anton_400Regular`, 44px).
  - Displays `"METRO MANILA STREETWEAR"` (`IBMPlexMono_600SemiBold`, 11px, letter-spacing 2.0).
  - Renders exact 44-stripe streetwear barcode (`334x34` bounds, 108px barcode width, `#FFFFFF` & `#63635C`).
  - Displays value proposition: `"Shop the drop from your phone.\nTrack every order to your door."` (`Inter_400Regular`, 15px, line-height 24px, `#A8A8A0`).
  - Provides three bottom actions:
    - `"Create account"` (Primary CTA, 54px pill, background `#D3EE42`, text `#141414`, navigates to `Signup`).
    - `"Sign in"` (Secondary CTA, 54px pill, 1px border `#63635C`, text `#FFFFFF`, navigates to `Login`).
    - `"Continue as guest"` (Tertiary text link, `Inter_500Medium`, 14px, `#A8A8A0`, navigates to `Home` with `guest: true`).
- **Side Effects**: Navigation state transitions.
- **Security & Privacy Notes**: No credentials or personal data collected at this onboarding screen.
- **Performance / DSA Notes**: Precomputed 44-element static barcode array rendered with constant time.
- **Accessibility / UX Notes**:
  - `accessibilityRole="button"` and explicit `accessibilityLabel` on all interactive targets.
  - Barcode frame marked with `accessible={false}` to prevent screen reader clutter.
  - Safe-area aware bottom inset (`Math.max(insets.bottom, 44)`).
---

# Module / Component: web/js/user-session.js & web/css/console.css (Account Controls & Sign-Out Modal)

## Purpose
Provide a collapsible account switcher in the Admin and Merchant Console sidebars with vertically stacked actions ("Switch Account" and "Sign Out"), and a theme-aware sign-out confirmation modal.

## Public Interfaces
### Component: `.user-profile` Collapsible Switcher
- **Purpose**: Consolidate active identity presentation and account switching/sign-out actions in the sidebar footer.
- **Inputs**: Click on `.user-profile-trigger`, keyboard `Enter` / `Space`, or outside click.
- **Outputs**: Toggles `.is-expanded` class and `aria-expanded` state; reveals vertically stacked actions.
- **Interactive States**:
  - Chevron smoothly rotates 180°.
  - Border and subtle shadow transitions on hover and expansion.
  - "Switch Account": Monospace font with `⇄` icon, volt/dark mode hover state.
  - "Sign Out": Monospace font with `↪` icon, crimson/danger hover state.

### Component: `#sign-out-modal-overlay` Confirmation Modal
- **Purpose**: Intercept sign-out actions to prevent accidental session loss and notify of audit trail logging.
- **Inputs**: Triggered from `.user-menu-item.btn-signout`.
- **Outputs**: Alertdialog with theme-aware typography and interactive actions.
- **Behavior**:
  - Modal title: `"SIGN OUT"` in display font (`var(--font-display)` / `Anton`).
  - Lead message: `"Are you sure you want to sign out of [User] on the [Console]?"`
  - Subtext: `"Your active session will be ended and logged in the platform audit trail."`
  - `Cancel` button: Reversible dismiss action with surface background and contrast hover.
  - `Confirm Sign Out` button: Reversible POST request to backend `/logout/` endpoint, localStorage clearance, and redirection to console login page.
- **Security & Privacy Notes**: Audits user logout event on backend, purges client session tokens and active user records from `localStorage`.
- **Accessibility / UX Notes**: Full focus trap with `Escape` key dismiss, `role="alertdialog"`, and `aria-labelledby`.
- **Verification Status**:
  - Executed via Chrome DevTools in browser subagent across Merchant and Admin consoles in both Light and Dark themes. All button hover, active, and dismiss transitions verified cleanly.





