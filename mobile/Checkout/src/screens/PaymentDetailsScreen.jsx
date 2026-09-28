import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '../../../context/CartContext';
import { createOrder, getOrder, normalizeOrderId } from '../../../../src/services/orderService';
import { buildOrderPayload, CheckoutPayloadError } from '../data/buildOrderPayload';
import {
  getHostedCheckoutUrl,
  canClearCartForAttempt,
  cartAttemptFingerprint,
  isOnlinePaymentMethod,
  openHostedCheckout,
  paymentFlowState,
} from '../data/paymentFlow';
import { createServerConfirmation } from '../data/orderConfirmation';
import { CheckoutProgress } from '../components/CheckoutProgress';
import { colors, fonts } from '../theme';

const PAYMENT_METHODS = [
  { id: 'cod', title: 'Cash on Delivery', subtitle: 'Pay when your package arrives', badge: 'COD' },
  { id: 'gcash', title: 'GCash', subtitle: 'Continue in PayMongo secure checkout', badge: 'GC' },
  { id: 'maya', title: 'Maya', subtitle: 'Continue in PayMongo secure checkout', badge: 'MY' },
  { id: 'card', title: 'Credit or Debit Card', subtitle: 'Enter details securely on PayMongo', badge: 'CARD' },
];

export function PaymentDetailsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const { cart, clearCart } = useCart();

  const orderDraft = route.params?.orderDraft || null;
  const requestedMethod = route.params?.paymentMethod;
  const initialMethod = PAYMENT_METHODS.some((method) => method.id === requestedMethod)
    ? requestedMethod
    : 'cod';
  const hasRouteOrderId = Object.prototype.hasOwnProperty.call(route.params || {}, 'orderId');
  const deepLinkedOrderId = normalizeOrderId(route.params?.orderId);
  const hasLiveDraft = !hasRouteOrderId && Array.isArray(orderDraft?.items) && orderDraft.items.length > 0;

  const [selectedMethod, setSelectedMethod] = useState(initialMethod);
  const [methodModalVisible, setMethodModalVisible] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [flowState, setFlowState] = useState(
    deepLinkedOrderId ? 'pending' : hasLiveDraft ? 'idle' : hasRouteOrderId ? 'lookup_error' : 'entry_error',
  );
  const [flowMessage, setFlowMessage] = useState(
    hasLiveDraft || deepLinkedOrderId
      ? ''
      : hasRouteOrderId
        ? 'This payment link does not contain a valid order reference.'
        : 'Open payment from Checkout or choose an existing order from Order history.',
  );
  const [pendingOrder, setPendingOrder] = useState(
    deepLinkedOrderId ? { id: deepLinkedOrderId } : null,
  );
  const [paymentAction, setPaymentAction] = useState(null);
  const [lookupErrorKind, setLookupErrorKind] = useState(null);

  const submitInFlight = useRef(false);
  const refreshInFlight = useRef(false);
  const refreshSequence = useRef(0);
  const completedOrder = useRef(false);
  const pollAttempts = useRef(0);
  const liveAttempt = useRef(null);
  const cartItemsRef = useRef(cart || []);

  const currentMethod =
    PAYMENT_METHODS.find((method) => method.id === selectedMethod) || PAYMENT_METHODS[0];
  const authoritativeTotal = Number(pendingOrder?.total ?? pendingOrder?.total_amount);
  cartItemsRef.current = cart || [];
  const draftTotal = Number(orderDraft?.total);
  const totalAmount = Number.isFinite(authoritativeTotal)
    ? authoritativeTotal
    : Number.isFinite(draftTotal)
      ? draftTotal
      : 0;
  const hasKnownTotal = Number.isFinite(authoritativeTotal) || (hasLiveDraft && Number.isFinite(draftTotal));
  const itemCount = orderDraft?.items?.reduce((sum, item) => sum + (item.quantity || 1), 0) || 0;
  const statusOrderId = hasRouteOrderId ? deepLinkedOrderId : normalizeOrderId(pendingOrder?.id);
  const statusTargetRef = useRef(statusOrderId);
  statusTargetRef.current = statusOrderId;

  const formatPeso = (value) =>
    `₱${Number(value).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const showAlert = (title, message) => {
    if (
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      typeof window.alert === 'function'
    ) {
      window.alert(`${title}\n\n${message}`);
      return;
    }
    Alert.alert(title, message);
  };

  useEffect(() => {
    // A screen instance can be reused by navigation. Reset every order-bound
    // ref/state so a response for order A can never bleed into order B.
    refreshSequence.current += 1;
    refreshInFlight.current = false;
    submitInFlight.current = false;
    completedOrder.current = false;
    pollAttempts.current = 0;
    liveAttempt.current = null;
    setMethodModalVisible(false);
    setIsProcessing(false);
    setPaymentAction(null);
    setLookupErrorKind(null);
    setSelectedMethod(initialMethod);

    if (hasRouteOrderId) {
      setPendingOrder(deepLinkedOrderId ? { id: deepLinkedOrderId } : null);
      setFlowState(deepLinkedOrderId ? 'pending' : 'lookup_error');
      setFlowMessage(
        deepLinkedOrderId ? '' : 'This payment link does not contain a valid order reference.',
      );
      return;
    }

    setPendingOrder(null);
    setFlowState(hasLiveDraft ? 'idle' : 'entry_error');
    setFlowMessage(
      hasLiveDraft ? '' : 'Open payment from Checkout or choose an existing order from Order history.',
    );
  }, [deepLinkedOrderId, hasLiveDraft, hasRouteOrderId, initialMethod, orderDraft]);

  const finishOrder = useCallback(
    (savedOrder) => {
      if (completedOrder.current) return;
      const confirmation = createServerConfirmation(savedOrder);
      if (!confirmation) {
        setFlowState('integrity_error');
        setFlowMessage(
          'The server response could not be verified, so MetroDrip will not show a confirmation.',
        );
        return;
      }
      completedOrder.current = true;
      if (canClearCartForAttempt(liveAttempt.current, savedOrder, cartItemsRef.current)) {
        clearCart();
      }
      navigation.replace('OrderConfirmation', {
        order: confirmation,
      });
    },
    [clearCart, navigation],
  );

  const refreshPaymentStatus = useCallback(
    async ({ silent = false } = {}) => {
      // A route order ID always wins over component state. This prevents a
      // previous order from being queried after navigation reuses the screen.
      const orderId = hasRouteOrderId ? deepLinkedOrderId : normalizeOrderId(pendingOrder?.id);
      if (!orderId || refreshInFlight.current) return;

      const requestId = ++refreshSequence.current;
      refreshInFlight.current = true;
      if (!silent) {
        pollAttempts.current = 0;
        setFlowState('verifying');
      }

      try {
        const latestOrder = await getOrder(orderId);
        if (requestId !== refreshSequence.current || statusTargetRef.current !== orderId) return;
        setLookupErrorKind(null);
        setPendingOrder((current) => ({ ...current, ...latestOrder }));
        if (latestOrder.payment_action) setPaymentAction(latestOrder.payment_action);
        const latestMethod = String(latestOrder.payment_method || '').toLowerCase();
        if (PAYMENT_METHODS.some((method) => method.id === latestMethod)) {
          setSelectedMethod(latestMethod);
        }

        const nextState = paymentFlowState(latestOrder);
        if (nextState === 'paid') {
          finishOrder(latestOrder);
          return;
        }
        if (nextState === 'setup_failed') {
          setFlowState('setup_failed');
          setFlowMessage(
            'Secure payment setup did not complete. Retry from this checkout or return to Order history.',
          );
          return;
        }
        if (nextState === 'failed') {
          setFlowState('failed');
          setFlowMessage('The provider did not complete this payment. Your cart is still intact.');
          return;
        }

        setFlowState('pending');
        if (!silent) {
          setFlowMessage('Payment is still awaiting provider confirmation. You can check again safely.');
        }
      } catch (error) {
        if (requestId !== refreshSequence.current || statusTargetRef.current !== orderId) return;
        const status = Number(error?.status) || 0;
        if (status === 401) {
          setLookupErrorKind('session');
          setFlowState('session_error');
          setFlowMessage('Your session expired. Sign in again, then reopen this order.');
        } else if (status === 403 || status === 404) {
          setLookupErrorKind(status === 403 ? 'permission' : 'not_found');
          setFlowState('lookup_error');
          setFlowMessage('This order is not available in your account.');
        } else if (silent) {
          setLookupErrorKind('degraded');
          setFlowState('degraded');
          setFlowMessage('Automatic verification is unavailable. Your last known status is still shown.');
        } else if (status === 0) {
          setLookupErrorKind('offline');
          setFlowState('offline');
          setFlowMessage('Reconnect to check this payment. No order or cart data was changed.');
        } else {
          setLookupErrorKind('error');
          setFlowState('status_error');
          setFlowMessage('We could not verify this payment. Your cart has not been cleared.');
        }
      } finally {
        if (requestId === refreshSequence.current) refreshInFlight.current = false;
      }
    },
    [deepLinkedOrderId, finishOrder, hasRouteOrderId, pendingOrder?.id],
  );

  useEffect(() => {
    if (!statusOrderId || !isOnlinePaymentMethod(selectedMethod)) return undefined;

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') refreshPaymentStatus({ silent: true });
    });

    return () => subscription.remove();
  }, [refreshPaymentStatus, selectedMethod, statusOrderId]);

  useEffect(() => {
    if (!statusOrderId || !['pending', 'redirecting'].includes(flowState)) return undefined;

    const timer = setInterval(() => {
      if (pollAttempts.current >= 12) {
        clearInterval(timer);
        setFlowState('poll_paused');
        setFlowMessage('Automatic checks paused. Tap “Check payment status” to refresh.');
        return;
      }
      pollAttempts.current += 1;
      refreshPaymentStatus({ silent: true });
    }, 5000);

    return () => clearInterval(timer);
  }, [flowState, refreshPaymentStatus, statusOrderId]);

  useEffect(() => {
    if (hasRouteOrderId && deepLinkedOrderId) refreshPaymentStatus({ silent: false });
  }, [deepLinkedOrderId, hasRouteOrderId, refreshPaymentStatus]);

  const openCheckout = async (action = paymentAction) => {
    setFlowState('redirecting');
    try {
      await openHostedCheckout(action, Linking);
      setFlowState('pending');
      setFlowMessage(
        'Complete payment in PayMongo, then return here. We only confirm payment after the server receives the provider webhook.',
      );
    } catch (error) {
      setFlowState('open_error');
      setFlowMessage(error?.message || 'The secure checkout page could not be opened.');
    }
  };

  const handlePay = async () => {
    // A synchronous ref closes the same-tick window before disabled state renders.
    if (submitInFlight.current) return;
    if (!hasLiveDraft || hasRouteOrderId) {
      setFlowState('entry_error');
      setFlowMessage('Start payment from Checkout. This recovery view cannot create a new order.');
      return;
    }
    submitInFlight.current = true;
    setIsProcessing(true);
    setFlowState('processing');
    setFlowMessage('');

    try {
      const attemptFingerprint = cartAttemptFingerprint(orderDraft.items);
      const orderBody = buildOrderPayload(orderDraft, selectedMethod);
      const savedOrder = await createOrder(orderBody);
      liveAttempt.current = {
        orderId: savedOrder.id,
        cartFingerprint: attemptFingerprint,
      };
      setPendingOrder(savedOrder);

      if (selectedMethod === 'cod') {
        finishOrder(savedOrder);
        return;
      }

      // A paid response is trusted because its status comes from the backend,
      // never because the customer returned from the hosted checkout page.
      const nextState = paymentFlowState(savedOrder);
      if (nextState === 'paid') {
        finishOrder(savedOrder);
        return;
      }
      if (nextState === 'setup_failed') {
        setFlowState('setup_failed');
        setFlowMessage('Secure payment setup failed. Retry safely with the same checkout attempt.');
        return;
      }
      if (nextState === 'failed') {
        setFlowState('failed');
        setFlowMessage('The provider did not complete this payment. Your cart is still intact.');
        return;
      }

      setPaymentAction(savedOrder.payment_action || null);
      await openCheckout(savedOrder.payment_action);
    } catch (error) {
      const message =
        (error instanceof CheckoutPayloadError && error.message) ||
        error?.message ||
        'We could not finish creating the order. Your cart is still intact; retrying is safe.';
      const providerSetupFailure =
        isOnlinePaymentMethod(selectedMethod) &&
        ([422, 503].includes(Number(error?.status)) || /payment setup/i.test(message));
      setFlowState(providerSetupFailure ? 'setup_failed' : 'request_error');
      setFlowMessage(message);
      showAlert('Order not completed', message);
    } finally {
      submitInFlight.current = false;
      setIsProcessing(false);
    }
  };

  const statusCard = flowState !== 'idle' && (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.statusCard,
        [
          'failed',
          'setup_failed',
          'open_error',
          'request_error',
          'status_error',
          'session_error',
          'lookup_error',
          'offline',
          'integrity_error',
          'entry_error',
        ].includes(flowState) &&
          styles.statusCardError,
      ]}
    >
      {['processing', 'redirecting', 'verifying', 'pending'].includes(flowState) && (
        <ActivityIndicator color={colors.ink} size="small" />
      )}
      <View style={styles.statusTextGroup}>
        <Text style={styles.statusTitle}>
          {flowState === 'processing' && 'Creating your order'}
          {flowState === 'redirecting' && 'Opening secure checkout'}
          {flowState === 'verifying' && 'Checking payment status'}
          {flowState === 'pending' && 'Payment confirmation pending'}
          {flowState === 'poll_paused' && 'Automatic checks paused'}
          {flowState === 'degraded' && 'Verification temporarily degraded'}
          {flowState === 'setup_failed' && 'Secure payment setup failed'}
          {flowState === 'failed' && 'Payment was not completed'}
          {flowState === 'open_error' && 'Secure checkout did not open'}
          {flowState === 'request_error' && 'Order request needs attention'}
          {flowState === 'status_error' && 'Status check unavailable'}
          {flowState === 'session_error' && 'Session expired'}
          {flowState === 'lookup_error' && 'Order unavailable'}
          {flowState === 'offline' && 'You appear to be offline'}
          {flowState === 'integrity_error' && 'Confirmation could not be verified'}
          {flowState === 'entry_error' && 'Open payment from a valid order'}
        </Text>
        {!!flowMessage && <Text style={styles.statusMessage}>{flowMessage}</Text>}
      </View>
    </View>
  );

  const hasPaymentContext = hasLiveDraft || Boolean(pendingOrder?.payment_method);
  const hasPendingOnlineOrder = Boolean(statusOrderId && isOnlinePaymentMethod(selectedMethod));
  const canReopenCheckout = (() => {
    try {
      return Boolean(paymentAction && getHostedCheckoutUrl(paymentAction));
    } catch {
      return false;
    }
  })();

  const historyLink = (
    <Pressable
      accessibilityRole="button"
      onPress={() => navigation.navigate('History')}
      style={({ pressed }) => [styles.linkButton, pressed && styles.payButtonPressed]}
    >
      <Text style={styles.linkButtonText}>View Order history</Text>
    </Pressable>
  );

  const actionArea = hasRouteOrderId ? (
    <View style={styles.actionStack}>
      {flowState === 'session_error' ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('Login')}
          style={({ pressed }) => [styles.payButton, pressed && styles.payButtonPressed]}
        >
          <Text style={styles.payButtonText}>Sign in</Text>
        </Pressable>
      ) : (
        <>
          {canReopenCheckout && !['failed', 'setup_failed', 'lookup_error'].includes(flowState) && (
            <Pressable
              accessibilityRole="button"
              onPress={() => openCheckout()}
              style={({ pressed }) => [styles.payButton, pressed && styles.payButtonPressed]}
            >
              <Text style={styles.payButtonText}>Open secure checkout</Text>
            </Pressable>
          )}
          {deepLinkedOrderId && !['permission', 'not_found'].includes(lookupErrorKind) && (
            <Pressable
              accessibilityRole="button"
              disabled={flowState === 'verifying'}
              onPress={() => refreshPaymentStatus({ silent: false })}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.payButtonPressed]}
            >
              <Text style={styles.secondaryButtonText}>Check payment status</Text>
            </Pressable>
          )}
        </>
      )}
      {historyLink}
    </View>
  ) : !hasLiveDraft ? (
    <View style={styles.actionStack}>
      {historyLink}
      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate('Shop')}
        style={({ pressed }) => [styles.secondaryButton, pressed && styles.payButtonPressed]}
      >
        <Text style={styles.secondaryButtonText}>Continue shopping</Text>
      </Pressable>
    </View>
  ) : flowState === 'setup_failed' ? (
    <View style={styles.actionStack}>
      <Pressable
        accessibilityRole="button"
        disabled={isProcessing}
        onPress={handlePay}
        style={({ pressed }) => [styles.payButton, pressed && styles.payButtonPressed]}
      >
        <Text style={styles.payButtonText}>Retry payment setup</Text>
      </Pressable>
      <Text style={styles.securityText}>Retrying reuses the same idempotent checkout attempt.</Text>
    </View>
  ) : hasPendingOnlineOrder ? (
    <View style={styles.actionStack}>
      {canReopenCheckout && !['failed', 'setup_failed'].includes(flowState) && (
        <Pressable
          accessibilityRole="button"
          disabled={isProcessing}
          onPress={() => openCheckout()}
          style={({ pressed }) => [styles.payButton, pressed && styles.payButtonPressed]}
        >
          <Text style={styles.payButtonText}>Open secure checkout</Text>
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        disabled={flowState === 'verifying'}
        onPress={() => refreshPaymentStatus({ silent: false })}
        style={({ pressed }) => [styles.secondaryButton, pressed && styles.payButtonPressed]}
      >
        <Text style={styles.secondaryButtonText}>Check payment status</Text>
      </Pressable>
      {flowState === 'failed' && (
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.linkButton, pressed && styles.payButtonPressed]}
        >
          <Text style={styles.linkButtonText}>Return to checkout with cart intact</Text>
        </Pressable>
      )}
    </View>
  ) : (
    <Pressable
      accessibilityLabel={
        selectedMethod === 'cod'
          ? `Place order for ${formatPeso(totalAmount)} with cash on delivery`
          : `Continue to secure ${currentMethod.title} checkout for ${formatPeso(totalAmount)}`
      }
      accessibilityRole="button"
      disabled={isProcessing}
      onPress={handlePay}
      style={({ pressed }) => [
        styles.payButton,
        pressed && styles.payButtonPressed,
        isProcessing && styles.payButtonDisabled,
      ]}
    >
      {isProcessing ? (
        <ActivityIndicator color={colors.ink} size="small" />
      ) : (
        <Text style={styles.payButtonText}>
          {selectedMethod === 'cod' ? 'Place COD order' : `Continue with ${currentMethod.title}`}
        </Text>
      )}
    </Pressable>
  );

  const paymentContent = (
    <>
      {hasKnownTotal && (
        <View style={styles.amountDueCard}>
          <Text style={styles.amountDueLabel}>AMOUNT DUE</Text>
          <Text style={styles.amountDuePrice}>{formatPeso(totalAmount)}</Text>
          <Text style={styles.amountDueSubtitle}>
            {pendingOrder?.order_no || pendingOrder?.order_number || orderDraft?.orderId || 'Checkout'}
            {hasLiveDraft ? ` · ${itemCount} items` : ''}
          </Text>
        </View>
      )}

      {hasPaymentContext && (
        <View style={styles.selectedMethodCard}>
          <View style={styles.methodBadge}>
            <Text style={styles.methodBadgeText}>{currentMethod.badge}</Text>
          </View>
          <View style={styles.methodInfo}>
            <Text style={styles.methodTitle}>{currentMethod.title}</Text>
            <Text style={styles.methodSubtitle}>{currentMethod.subtitle}</Text>
          </View>
          {hasLiveDraft && !pendingOrder?.id && (
            <Pressable
              accessibilityLabel="Change payment method"
              accessibilityRole="button"
              onPress={() => setMethodModalVisible(true)}
              style={styles.changeButton}
            >
              <Text style={styles.changeButtonText}>Change</Text>
            </Pressable>
          )}
        </View>
      )}

      {statusCard}

      {hasPaymentContext && <View style={styles.explainerCard}>
        <Text style={styles.explainerTitle}>
          {selectedMethod === 'cod' ? 'Pay on delivery' : 'Pay on PayMongo, not in MetroDrip'}
        </Text>
        <Text style={styles.explainerText}>
          {selectedMethod === 'cod'
            ? `Prepare ${formatPeso(totalAmount)} when the courier arrives. No online payment is required.`
            : `After your order is created, MetroDrip opens PayMongo’s hosted checkout. Enter wallet or card credentials only on checkout.paymongo.com.`}
        </Text>
        {isOnlinePaymentMethod(selectedMethod) && (
          <Text style={styles.explainerFootnote}>
            Returning to MetroDrip does not prove payment. This screen waits for server verification and keeps your cart until payment is confirmed.
          </Text>
        )}
      </View>}
    </>
  );

  return (
    <SafeAreaView edges={Platform.OS === 'web' ? [] : ['top']} style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Pressable
            accessibilityLabel="Go back to checkout"
            accessibilityRole="button"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backArrow}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Payment</Text>
        </View>
        <Text accessibilityLabel="Secured checkout" style={styles.lockIcon}>🔒</Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isWide && styles.desktopScrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.contentShell, isWide && styles.desktopShell]}>
          <View style={styles.mainColumn}>
            <CheckoutProgress currentStep={3} />
            <View style={styles.contentStack}>{paymentContent}</View>
          </View>
          <View style={[styles.actionCard, isWide && styles.desktopActionCard]}>
            {actionArea}
            <Text style={styles.securityText}>
              {!hasPaymentContext
                ? 'This recovery view cannot place a new order or clear your cart.'
                : selectedMethod === 'cod'
                ? 'Your order is payable when delivered.'
                : 'Secured by PayMongo · MetroDrip never receives wallet or card credentials'}
            </Text>
          </View>
        </View>
      </ScrollView>

      <Modal
        animationType="fade"
        onRequestClose={() => setMethodModalVisible(false)}
        presentationStyle="overFullScreen"
        transparent
        visible={methodModalVisible}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            accessibilityLabel="Dismiss payment method options"
            accessibilityRole="button"
            onPress={() => setMethodModalVisible(false)}
            style={styles.modalDismissArea}
          />
          <View accessibilityViewIsModal style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select payment method</Text>
              <Pressable
                accessibilityLabel="Close payment method options"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setMethodModalVisible(false)}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>
            {PAYMENT_METHODS.map((method) => {
              const isSelected = selectedMethod === method.id;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected }}
                  key={method.id}
                  onPress={() => {
                    setSelectedMethod(method.id);
                    setFlowState('idle');
                    setFlowMessage('');
                    setMethodModalVisible(false);
                  }}
                  style={[styles.methodOption, isSelected && styles.methodOptionSelected]}
                >
                  <View style={styles.methodBadge}>
                    <Text style={styles.methodBadgeText}>{method.badge}</Text>
                  </View>
                  <View style={styles.methodInfo}>
                    <Text style={styles.methodTitle}>{method.title}</Text>
                    <Text style={styles.methodSubtitle}>{method.subtitle}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.paper },
  header: {
    height: 52,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: colors.paper,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backArrow: { fontSize: 26, color: colors.ink, lineHeight: 28 },
  headerTitle: { fontFamily: fonts.interBold, fontWeight: '700', fontSize: 17, color: colors.ink },
  lockIcon: { fontSize: 18 },
  scrollContent: { flexGrow: 1 },
  desktopScrollContent: { paddingHorizontal: 24, paddingVertical: 20 },
  contentShell: { width: '100%', alignSelf: 'center' },
  desktopShell: {
    maxWidth: 1040,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 32,
  },
  mainColumn: { flex: 7 },
  contentStack: { padding: 16, gap: 14 },
  amountDueCard: { backgroundColor: colors.surface, borderRadius: 12, padding: 16, gap: 3 },
  amountDueLabel: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1.2,
    color: colors.muted,
  },
  amountDuePrice: { fontFamily: fonts.interBold, fontWeight: '900', fontSize: 30, color: colors.ink },
  amountDueSubtitle: { fontFamily: fonts.monoRegular, fontSize: 10, color: colors.muted },
  selectedMethodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 12,
    backgroundColor: colors.paper,
    gap: 12,
  },
  methodBadge: {
    minWidth: 38,
    height: 30,
    paddingHorizontal: 6,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.ink,
  },
  methodBadgeText: { fontFamily: fonts.monoSemiBold, fontSize: 10, color: colors.paper },
  methodInfo: { flex: 1, gap: 2 },
  methodTitle: { fontFamily: fonts.interSemiBold, fontSize: 14, fontWeight: '600', color: colors.ink },
  methodSubtitle: { fontFamily: fonts.interRegular, fontSize: 11, color: colors.muted, lineHeight: 16 },
  changeButton: { padding: 8 },
  changeButtonText: { fontFamily: fonts.interSemiBold, fontSize: 12, fontWeight: '600', color: colors.muted },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    backgroundColor: colors.surface,
  },
  statusCardError: { borderColor: colors.danger },
  statusTextGroup: { flex: 1, gap: 4 },
  statusTitle: { fontFamily: fonts.interBold, fontSize: 14, fontWeight: '700', color: colors.ink },
  statusMessage: { fontFamily: fonts.interRegular, fontSize: 12, lineHeight: 18, color: colors.muted },
  explainerCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    gap: 8,
    backgroundColor: colors.paper,
  },
  explainerTitle: { fontFamily: fonts.interBold, fontSize: 16, fontWeight: '700', color: colors.ink },
  explainerText: { fontFamily: fonts.interRegular, fontSize: 13, lineHeight: 20, color: colors.ink },
  explainerFootnote: { fontFamily: fonts.interRegular, fontSize: 12, lineHeight: 18, color: colors.muted },
  actionCard: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 16,
    gap: 10,
    backgroundColor: colors.paper,
  },
  desktopActionCard: {
    flex: 5,
    marginTop: 58,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
  },
  actionStack: { gap: 10 },
  payButton: {
    minHeight: 52,
    borderRadius: 999,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.volt,
  },
  payButtonPressed: { opacity: 0.86 },
  payButtonDisabled: { opacity: 0.58 },
  payButtonText: { fontFamily: fonts.interBold, fontSize: 15, fontWeight: '700', color: colors.ink },
  secondaryButton: {
    minHeight: 50,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper,
  },
  secondaryButtonText: { fontFamily: fonts.interBold, fontSize: 14, fontWeight: '700', color: colors.ink },
  linkButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkButtonText: { fontFamily: fonts.interSemiBold, fontSize: 12, color: colors.muted, textDecorationLine: 'underline' },
  securityText: { fontFamily: fonts.monoRegular, fontSize: 10, lineHeight: 15, color: colors.muted, textAlign: 'center' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(20, 20, 20, 0.45)', justifyContent: 'flex-end' },
  modalDismissArea: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  modalContent: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    gap: 10,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8 },
  modalTitle: { fontFamily: fonts.interBold, fontSize: 16, fontWeight: '700', color: colors.ink },
  modalCloseButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  modalCloseText: { fontSize: 17, color: colors.muted },
  methodOption: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
  },
  methodOptionSelected: { borderWidth: 2, borderColor: colors.ink },
});
