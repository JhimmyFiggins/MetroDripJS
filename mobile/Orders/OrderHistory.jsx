import React, { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { colors, fonts } from '../Checkout/src/theme';
import Footer from '../components/Footer';
import { getOrders } from '../../src/services/orderService';
import {
  classifyOrderError,
  extractOrders,
  formatKnownDate,
  formatOrderMoney,
  formatOrderNumber,
  fulfillmentBadge,
  orderItemCount,
  paymentBadge,
} from './orderPresentation';

const SKELETON_ROWS = [0, 1, 2];

function StatusBadge({ badge }) {
  return (
    <View
      accessibilityLabel={badge.label}
      style={[
        styles.badge,
        badge.tone === 'success' && styles.badgeSuccess,
        badge.tone === 'active' && styles.badgeActive,
        badge.tone === 'attention' && styles.badgeAttention,
        badge.tone === 'danger' && styles.badgeDanger,
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          badge.tone === 'active' && styles.badgeTextOnDark,
          badge.tone === 'danger' && styles.badgeTextDanger,
        ]}
      >
        {badge.label}
      </Text>
    </View>
  );
}

function LoadingState() {
  return (
    <View accessibilityLabel="Loading orders" accessibilityRole="progressbar" style={styles.stateSection}>
      <View style={styles.skeletonHeading} />
      {SKELETON_ROWS.map((row) => (
        <View key={row} style={styles.skeletonCard}>
          <View style={styles.skeletonTextWide} />
          <View style={styles.skeletonTextNarrow} />
          <View style={styles.skeletonBadges}>
            <View style={styles.skeletonBadge} />
            <View style={styles.skeletonBadge} />
          </View>
        </View>
      ))}
    </View>
  );
}

function StateCard({ actionLabel, message, onAction, title }) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.stateCard}>
      <View style={styles.stateIcon}>
        <Text style={styles.stateIconText}>!</Text>
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateMessage}>{message}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onAction}
        style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
      >
        <Text style={styles.primaryButtonText}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

export default function OrderHistory() {
  const navigation = useNavigation();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [refreshError, setRefreshError] = useState(null);
  const ordersRef = useRef([]);
  const requestSequence = useRef(0);

  const loadOrders = useCallback(async ({ preserveData = false } = {}) => {
    const requestId = ++requestSequence.current;
    if (preserveData && ordersRef.current.length > 0) setRefreshing(true);
    else setLoading(true);
    setError(null);
    setRefreshError(null);

    try {
      const response = await getOrders();
      if (requestId !== requestSequence.current) return;
      const nextOrders = extractOrders(response);
      ordersRef.current = nextOrders;
      setOrders(nextOrders);
    } catch (caught) {
      if (requestId !== requestSequence.current) return;
      const safeError = classifyOrderError(caught, 'orders');
      if (preserveData && ordersRef.current.length > 0) setRefreshError(safeError);
      else setError(safeError);
    } finally {
      if (requestId === requestSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadOrders({ preserveData: ordersRef.current.length > 0 });
      return () => {
        // Ignore a response that finishes after the user leaves this screen.
        requestSequence.current += 1;
      };
    }, [loadOrders]),
  );

  const handleErrorAction = () => {
    if (error?.kind === 'session') {
      navigation.navigate('Login');
      return;
    }
    if (error?.kind === 'permission') {
      navigation.navigate('Shop');
      return;
    }
    loadOrders();
  };

  const renderOrder = (order) => {
    const count = orderItemCount(order);
    const fulfillment = fulfillmentBadge(order);
    const payment = paymentBadge(order);
    const number = formatOrderNumber(order);
    const total = formatOrderMoney(order?.total, order?.currency);

    return (
      <Pressable
        accessibilityHint="Opens order tracking"
        accessibilityLabel={`${number}, ${count} ${count === 1 ? 'item' : 'items'}, ${total}, ${payment.label}, ${fulfillment.label}`}
        accessibilityRole="button"
        key={order.id ?? number}
        onPress={() => navigation.navigate('OrderTracking', { orderId: order.id })}
        style={({ pressed }) => [styles.orderCard, pressed && styles.orderCardPressed]}
      >
        <View style={styles.orderTopRow}>
          <Text numberOfLines={1} style={styles.orderNumber}>{number}</Text>
          <Text accessibilityElementsHidden importantForAccessibility="no" style={styles.chevron}>›</Text>
        </View>
        <Text style={styles.orderDetails}>
          {count} {count === 1 ? 'item' : 'items'} · {total} · {formatKnownDate(order?.created_at)}
        </Text>
        <View style={styles.badgeRow}>
          <StatusBadge badge={payment} />
          <StatusBadge badge={fulfillment} />
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Shop'))}
          style={({ pressed }) => [styles.headerButton, pressed && styles.buttonPressed]}
        >
          <Text style={styles.backArrow}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Order history</Text>
        <Pressable
          accessibilityLabel="Refresh orders"
          accessibilityRole="button"
          disabled={loading || refreshing}
          hitSlop={8}
          onPress={() => loadOrders({ preserveData: ordersRef.current.length > 0 })}
          style={({ pressed }) => [
            styles.headerButton,
            pressed && styles.buttonPressed,
            (loading || refreshing) && styles.buttonDisabled,
          ]}
        >
          {refreshing ? (
            <ActivityIndicator color={colors.ink} size="small" />
          ) : (
            <Text style={styles.refreshIcon}>↻</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.titleRow}>
          <View>
            <Text style={styles.eyebrow}>YOUR PURCHASES</Text>
            <Text style={styles.pageTitle}>Orders</Text>
          </View>
          {refreshing && (
            <View accessibilityLiveRegion="polite" style={styles.refreshingLabel}>
              <ActivityIndicator color={colors.ink} size="small" />
              <Text style={styles.refreshingText}>Refreshing</Text>
            </View>
          )}
        </View>

        {loading ? (
          <LoadingState />
        ) : error ? (
          <StateCard
            actionLabel={error.actionLabel}
            message={error.message}
            onAction={handleErrorAction}
            title={error.title}
          />
        ) : orders.length === 0 ? (
          <View accessibilityLiveRegion="polite" style={styles.stateCard}>
            <View style={styles.emptyIcon}>
              <Text style={styles.emptyIconText}>0</Text>
            </View>
            <Text style={styles.stateTitle}>No orders yet</Text>
            <Text style={styles.stateMessage}>
              Completed checkouts will appear here with their payment and delivery status.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.navigate('Shop')}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.primaryButtonText}>Browse products</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.orderList}>
            {refreshError && (
              <View accessibilityLiveRegion="polite" style={styles.inlineWarning}>
                <View style={styles.inlineWarningText}>
                  <Text style={styles.inlineWarningTitle}>{refreshError.title}</Text>
                  <Text style={styles.inlineWarningMessage}>
                    Showing your last loaded orders. {refreshError.message}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="Retry refreshing orders"
                  accessibilityRole="button"
                  onPress={() => loadOrders({ preserveData: true })}
                  style={styles.inlineRetry}
                >
                  <Text style={styles.inlineRetryText}>Retry</Text>
                </Pressable>
              </View>
            )}
            {orders.map(renderOrder)}
          </View>
        )}
      </ScrollView>
      <Footer active="Orders" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 28, lineHeight: 30, color: colors.ink },
  headerTitle: { fontFamily: fonts.interBold, fontSize: 16, color: colors.ink },
  refreshIcon: { fontFamily: fonts.interRegular, fontSize: 22, lineHeight: 24, color: colors.ink },
  container: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 32 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  eyebrow: { fontFamily: fonts.monoSemiBold, fontSize: 9, letterSpacing: 1.3, color: colors.muted },
  pageTitle: { fontFamily: fonts.anton, fontSize: 34, lineHeight: 40, color: colors.ink },
  refreshingLabel: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  refreshingText: { fontFamily: fonts.interRegular, fontSize: 12, color: colors.muted },
  stateSection: { gap: 12 },
  skeletonHeading: { width: 120, height: 14, borderRadius: 7, backgroundColor: colors.surface },
  skeletonCard: { minHeight: 112, padding: 16, gap: 10, borderRadius: 12, backgroundColor: colors.surface },
  skeletonTextWide: { width: '58%', height: 13, borderRadius: 7, backgroundColor: colors.border },
  skeletonTextNarrow: { width: '76%', height: 10, borderRadius: 5, backgroundColor: colors.border },
  skeletonBadges: { flexDirection: 'row', gap: 8, marginTop: 4 },
  skeletonBadge: { width: 90, height: 25, borderRadius: 13, backgroundColor: colors.border },
  stateCard: {
    minHeight: 300,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  stateIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  stateIconText: { fontFamily: fonts.interBold, fontSize: 20, color: colors.danger },
  emptyIcon: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.volt },
  emptyIconText: { fontFamily: fonts.anton, fontSize: 26, color: colors.ink },
  stateTitle: { fontFamily: fonts.interBold, fontSize: 19, color: colors.ink, textAlign: 'center' },
  stateMessage: { maxWidth: 310, fontFamily: fonts.interRegular, fontSize: 13, lineHeight: 20, color: colors.muted, textAlign: 'center' },
  primaryButton: { minHeight: 48, minWidth: 150, marginTop: 8, paddingHorizontal: 20, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.volt },
  primaryButtonText: { fontFamily: fonts.interBold, fontSize: 14, color: colors.ink },
  buttonPressed: { opacity: 0.72 },
  buttonDisabled: { opacity: 0.5 },
  orderList: { gap: 12 },
  orderCard: { minHeight: 116, padding: 16, gap: 9, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.paper },
  orderCardPressed: { backgroundColor: colors.surface, borderColor: colors.ink },
  orderTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  orderNumber: { flex: 1, fontFamily: fonts.monoSemiBold, fontSize: 13, color: colors.ink },
  chevron: { fontFamily: fonts.interRegular, fontSize: 24, color: colors.muted },
  orderDetails: { fontFamily: fonts.monoRegular, fontSize: 10, lineHeight: 16, color: colors.muted },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  badge: { minHeight: 25, justifyContent: 'center', paddingHorizontal: 9, borderRadius: 13, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  badgeSuccess: { backgroundColor: colors.volt, borderColor: colors.volt },
  badgeActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  badgeAttention: { backgroundColor: '#FFF5CC', borderColor: '#E8D47C' },
  badgeDanger: { backgroundColor: '#FFF0EE', borderColor: '#F2B8B2' },
  badgeText: { fontFamily: fonts.interSemiBold, fontSize: 10, color: colors.ink },
  badgeTextOnDark: { color: colors.paper },
  badgeTextDanger: { color: colors.danger },
  inlineWarning: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderWidth: 1, borderColor: '#E8D47C', borderRadius: 10, backgroundColor: '#FFF9E6' },
  inlineWarningText: { flex: 1, gap: 2 },
  inlineWarningTitle: { fontFamily: fonts.interBold, fontSize: 12, color: colors.ink },
  inlineWarningMessage: { fontFamily: fonts.interRegular, fontSize: 11, lineHeight: 16, color: colors.muted },
  inlineRetry: { minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  inlineRetryText: { fontFamily: fonts.interBold, fontSize: 12, color: colors.ink, textDecorationLine: 'underline' },
});
