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
  - Success Hero: Dark `#141414` card with neon lime `#C8F031` circular checkmark, `PAYMENT SUCCESSFUL` badge, order headline, and `MD-2026-00318` chip.
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
  - Review cards with reviewer name, `#C8F031` `VERIFIED` pill badge, star rating, comment text, and date.
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
  - Selected Method Banner: 2px `#141414` border, radio indicator with volt dot (`#C8F031`), method title, subtitle, and `Change` action button (opens payment method modal switcher).
  - Method-Specific Credential Forms:
    - **GCash (`452:2`)**: Headline `GCash account`, `GCASH MOBILE NUMBER`, `ACCOUNT NAME`, redirect warning notice `ⓘ`, and `Save GCash for faster checkout` checkbox.
    - **Maya (`452:99`)**: Headline `Maya account`, `Maya Wallet` vs `Maya Card` toggle pill, `MAYA MOBILE NUMBER`, `ACCOUNT NAME`, 6-digit OTP notice `ⓘ`, and `Save Maya for faster checkout` checkbox.
    - **Card (`453:2`)**: Headline `Card details`, `CARD NUMBER` with spaced formatting and `VISA` / `MC` brand badge, 2-column `EXPIRY` (`MM / YY`) and `CVV` (`•••`), `NAME ON CARD`, `Billing address same as delivery` checkbox, PayMongo tokenization security notice, and `Save card for faster checkout` checkbox.
    - **Cash on Delivery**: Cash preparation and delivery notice.
  - Sticky Action Footer (and Desktop Sidebar Action Panel):
    - Volt pill button (`#C8F031`): `Pay ₱[total]` with loading indicator and press feedback.
    - Subtitle: `Secured by PayMongo · card details never stored` (IBM Plex Mono 10px `#63635C`).
- **Behavior & Flow**:
  1. Validates required method credentials upon tapping Pay.
  2. Displays loading spinner on the button during simulated PayMongo authorization.
  3. Clears the cart via `useCart().clearCart()`.
  4. Assembles completed order payload and navigates to `OrderConfirmation` route with `{ order: orderPayload }`.
- **Dependencies**: React Navigation, `CartContext`, `CheckoutProgress`, `colors`, `fonts`.
- **Accessibility & UX**: Follows WCAG 44×44px minimum touch targets, dynamic checkbox states, high-contrast typography, and responsive 2-column desktop / 1-column mobile layouts.
- **Verification Status**: Validated via `@babel/parser` (0 syntax errors) and compiled cleanly in Expo web export (689 modules bundled with 0 errors).
