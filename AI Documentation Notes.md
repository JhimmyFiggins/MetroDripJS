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


