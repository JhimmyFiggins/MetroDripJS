import React, { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { colors, fonts } from '../Checkout/src/theme';
import { getOrderTracking } from '../../src/services/orderService';
import {
  classifyOrderError,
  trackingEvents,
  trackingHeadline,
  trackingItems,
  trackingOrderNumber,
} from './orderPresentation';

const darkSurface = '#252524';
const mutedOnDark = '#A8A8A0';
const chipText = '#F2F2EF';

function TrackingSkeleton() {
  return (
    <View accessibilityLabel="Loading tracking details" accessibilityRole="progressbar" style={styles.skeletonPage}>
      <View style={styles.skeletonHero}>
        <View style={styles.skeletonHeroLabel} />
        <View style={styles.skeletonHeroTitle} />
        <View style={styles.skeletonHeroMeta} />
      </View>
      <View style={styles.skeletonBody}>
        {[0, 1, 2, 3].map((row) => (
          <View key={row} style={styles.skeletonTimelineRow}>
            <View style={styles.skeletonDot} />
            <View style={styles.skeletonTextGroup}>
              <View style={styles.skeletonTextWide} />
              <View style={styles.skeletonTextNarrow} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function FatalState({ error, onAction }) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.stateContainer}>
      <View style={styles.stateIcon}>
        <Text style={styles.stateIconText}>!</Text>
      </View>
      <Text style={styles.errorTitle}>{error.title}</Text>
      <Text style={styles.stateText}>{error.message}</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onAction}
        style={({ pressed }) => [styles.retryButton, pressed && styles.buttonPressed]}
      >
        <Text style={styles.retryButtonText}>{error.actionLabel}</Text>
      </Pressable>
    </View>
  );
}

export default function OrderTracking() {
  const navigation = useNavigation();
  const route = useRoute();
  const orderId = route.params?.orderId;

  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [refreshError, setRefreshError] = useState(null);
  const trackingRef = useRef(null);
  const requestSequence = useRef(0);

  const loadTracking = useCallback(async ({ preserveData = false } = {}) => {
    const requestId = ++requestSequence.current;
    if (preserveData && trackingRef.current) setRefreshing(true);
    else setLoading(true);
    setError(null);
    setRefreshError(null);

    if (orderId == null || String(orderId).trim() === '') {
      setError(classifyOrderError({ status: 404 }, 'tracking'));
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      const data = await getOrderTracking(orderId);
      if (requestId !== requestSequence.current) return;
      if (!data || typeof data !== 'object' || !data.order) {
        throw new Error('Tracking response was incomplete.');
      }
      trackingRef.current = data;
      setTracking(data);
    } catch (caught) {
      if (requestId !== requestSequence.current) return;
      const safeError = classifyOrderError(caught, 'tracking');
      if (preserveData && trackingRef.current) setRefreshError(safeError);
      else setError(safeError);
    } finally {
      if (requestId === requestSequence.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [orderId]);

  useFocusEffect(
    useCallback(() => {
      loadTracking({ preserveData: Boolean(trackingRef.current) });
      return () => {
        requestSequence.current += 1;
      };
    }, [loadTracking]),
  );

  const handleErrorAction = () => {
    if (error?.kind === 'session') {
      navigation.navigate('Login');
      return;
    }
    if (error?.kind === 'permission' || error?.kind === 'not_found') {
      navigation.goBack();
      return;
    }
    loadTracking();
  };

  const handleGetHelp = () => {
    Alert.alert(
      'Get help',
      'Email support@metrodrip.ph and include the order reference shown on this screen.',
      [{ text: 'OK' }],
    );
  };

  const order = tracking?.order;
  const shipment = tracking?.shipment;
  const events = trackingEvents(tracking);
  const items = trackingItems(tracking);
  const orderNumber = trackingOrderNumber(tracking, orderId);
  const headline = trackingHeadline(tracking);
  const courier = String(shipment?.courier || '').trim();
  const trackingNumber = String(shipment?.tracking_number || '').trim();

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressed]}
        >
          <Text style={styles.backArrow}>‹</Text>
        </Pressable>
        <Text numberOfLines={1} style={styles.headerTitle}>{orderNumber}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <TrackingSkeleton />
      ) : error ? (
        <FatalState error={error} onAction={handleErrorAction} />
      ) : (
        <>
          <ScrollView
            contentContainerStyle={styles.container}
            showsVerticalScrollIndicator={false}
          >
            {refreshError && (
              <View accessibilityLiveRegion="polite" style={styles.partialBanner}>
                <View style={styles.partialTextGroup}>
                  <Text style={styles.partialTitle}>{refreshError.title}</Text>
                  <Text style={styles.partialMessage}>
                    Showing the last loaded tracking details. {refreshError.message}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="Retry refreshing tracking"
                  accessibilityRole="button"
                  onPress={() => loadTracking({ preserveData: true })}
                  style={styles.partialRetry}
                >
                  <Text style={styles.partialRetryText}>Retry</Text>
                </Pressable>
              </View>
            )}

            <View style={styles.hero}>
              <Text style={styles.heroLabel}>
                {shipment?.eta_label ? 'DELIVERY UPDATE' : 'ORDER STATUS'}
              </Text>
              <Text style={styles.heroHeadline}>{headline}</Text>
              {courier || trackingNumber ? (
                <View style={styles.heroMetaRow}>
                  {!!courier && <Text style={styles.heroCourier}>{courier}</Text>}
                  {!!trackingNumber && (
                    <View style={styles.trackingChip}>
                      <Text style={styles.trackingChipText}>{trackingNumber}</Text>
                    </View>
                  )}
                </View>
              ) : (
                <Text style={styles.heroSupportingText}>
                  Courier and tracking details will appear after dispatch.
                </Text>
              )}
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Progress</Text>
                {refreshing && (
                  <View accessibilityLiveRegion="polite" style={styles.refreshingLabel}>
                    <ActivityIndicator color={colors.ink} size="small" />
                    <Text style={styles.refreshingText}>Refreshing</Text>
                  </View>
                )}
              </View>
              {events.length === 0 ? (
                <View style={styles.emptyPanel}>
                  <Text style={styles.emptyTitle}>No tracking updates yet</Text>
                  <Text style={styles.emptyText}>Updates will appear here as fulfillment progresses.</Text>
                </View>
              ) : (
                <View style={styles.timeline}>
                  {events.map((event, index) => {
                    const done = event.state === 'done';
                    const isLast = index === events.length - 1;
                    return (
                      <View key={event.key} style={styles.timelineRow}>
                        <View style={styles.timelineRail}>
                          <View style={done ? styles.dotDone : styles.dotPending} />
                          {!isLast && (
                            <View style={[styles.connector, !done && styles.connectorPending]} />
                          )}
                        </View>
                        <View style={styles.timelineContent}>
                          <Text style={[styles.eventTitle, !done && styles.eventTitlePending]}>
                            {event.title}
                          </Text>
                          <Text style={styles.eventTime}>
                            {event.timestamp || (done ? 'Completed' : 'Awaiting update')}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Items</Text>
              {items.length === 0 ? (
                <View style={styles.emptyPanel}>
                  <Text style={styles.emptyTitle}>Item details unavailable</Text>
                  <Text style={styles.emptyText}>The order is still valid. Refresh to request its item details again.</Text>
                </View>
              ) : (
                <View style={styles.itemList}>
                  {items.map((item, index) => {
                    const name = String(item.name || item.product_name || 'Item');
                    return (
                      <View key={item.id || `${name}-${index}`} style={styles.itemRow}>
                        <View style={styles.itemThumb}>
                          <Text style={styles.itemThumbLetter}>{name.charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={styles.itemInfo}>
                          <Text numberOfLines={2} style={styles.itemName}>{name}</Text>
                          <Text style={styles.itemMeta}>
                            {item.variant_label ? `${item.variant_label} · ` : ''}Quantity {item.quantity}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </ScrollView>

          <View style={styles.bottomBar}>
            <Pressable
              accessibilityLabel="Get help with this order"
              accessibilityRole="button"
              onPress={handleGetHelp}
              style={({ pressed }) => [styles.helpButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.helpButtonText}>Get help</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Refresh tracking details"
              accessibilityRole="button"
              disabled={refreshing}
              onPress={() => loadTracking({ preserveData: true })}
              style={({ pressed }) => [
                styles.trackButton,
                pressed && styles.buttonPressed,
                refreshing && styles.buttonDisabled,
              ]}
            >
              {refreshing ? (
                <ActivityIndicator color={colors.ink} size="small" />
              ) : (
                <Text style={styles.trackButtonText}>Refresh</Text>
              )}
            </Pressable>
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  backButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 28, lineHeight: 30, color: colors.ink },
  headerTitle: { flex: 1, fontFamily: fonts.interBold, fontSize: 15, color: colors.ink, textAlign: 'center' },
  headerSpacer: { width: 44 },
  container: { paddingBottom: 28 },
  buttonPressed: { opacity: 0.72 },
  buttonDisabled: { opacity: 0.58 },
  skeletonPage: { flex: 1 },
  skeletonHero: { height: 160, padding: 18, gap: 13, backgroundColor: colors.ink },
  skeletonHeroLabel: { width: 92, height: 9, borderRadius: 5, backgroundColor: darkSurface },
  skeletonHeroTitle: { width: '64%', height: 28, borderRadius: 7, backgroundColor: darkSurface },
  skeletonHeroMeta: { width: '46%', height: 14, borderRadius: 7, backgroundColor: darkSurface },
  skeletonBody: { padding: 18, gap: 16 },
  skeletonTimelineRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  skeletonDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.border },
  skeletonTextGroup: { flex: 1, gap: 7 },
  skeletonTextWide: { width: '60%', height: 12, borderRadius: 6, backgroundColor: colors.surface },
  skeletonTextNarrow: { width: '38%', height: 9, borderRadius: 5, backgroundColor: colors.surface },
  stateContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10 },
  stateIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  stateIconText: { fontFamily: fonts.interBold, fontSize: 20, color: colors.danger },
  stateText: { maxWidth: 320, fontFamily: fonts.interRegular, fontSize: 13, lineHeight: 20, color: colors.muted, textAlign: 'center' },
  errorTitle: { fontFamily: fonts.interBold, fontSize: 19, color: colors.ink, textAlign: 'center' },
  retryButton: { minHeight: 48, minWidth: 140, marginTop: 8, paddingHorizontal: 22, borderRadius: 999, backgroundColor: colors.volt, alignItems: 'center', justifyContent: 'center' },
  retryButtonText: { fontFamily: fonts.interBold, fontSize: 14, color: colors.ink },
  partialBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 14, marginBottom: 0, padding: 13, borderWidth: 1, borderColor: '#E8D47C', borderRadius: 10, backgroundColor: '#FFF9E6' },
  partialTextGroup: { flex: 1, gap: 2 },
  partialTitle: { fontFamily: fonts.interBold, fontSize: 12, color: colors.ink },
  partialMessage: { fontFamily: fonts.interRegular, fontSize: 11, lineHeight: 16, color: colors.muted },
  partialRetry: { minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  partialRetryText: { fontFamily: fonts.interBold, fontSize: 12, color: colors.ink, textDecorationLine: 'underline' },
  hero: { marginTop: 14, backgroundColor: colors.ink, padding: 18, gap: 7 },
  heroLabel: { fontFamily: fonts.monoSemiBold, fontSize: 10, letterSpacing: 1.4, color: colors.volt },
  heroHeadline: { fontFamily: fonts.anton, fontSize: 30, lineHeight: 38, color: colors.paper },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  heroCourier: { fontFamily: fonts.interMedium, fontSize: 12, color: mutedOnDark },
  heroSupportingText: { fontFamily: fonts.interRegular, fontSize: 12, lineHeight: 18, color: mutedOnDark },
  trackingChip: { backgroundColor: darkSurface, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 4 },
  trackingChipText: { fontFamily: fonts.monoRegular, fontSize: 10, color: chipText },
  section: { paddingHorizontal: 16, paddingTop: 20, gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontFamily: fonts.interBold, fontSize: 16, color: colors.ink },
  refreshingLabel: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  refreshingText: { fontFamily: fonts.interRegular, fontSize: 11, color: colors.muted },
  emptyPanel: { padding: 18, gap: 4, borderRadius: 12, backgroundColor: colors.surface },
  emptyTitle: { fontFamily: fonts.interSemiBold, fontSize: 13, color: colors.ink },
  emptyText: { fontFamily: fonts.interRegular, fontSize: 12, lineHeight: 18, color: colors.muted },
  timeline: { paddingTop: 2 },
  timelineRow: { flexDirection: 'row', alignItems: 'flex-start' },
  timelineRail: { width: 28, alignItems: 'center' },
  dotDone: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.volt },
  dotPending: { width: 14, height: 14, marginTop: 1, borderRadius: 7, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.paper },
  connector: { width: 2, height: 42, backgroundColor: colors.volt },
  connectorPending: { backgroundColor: colors.border },
  timelineContent: { flex: 1, minHeight: 58, paddingBottom: 14, gap: 3 },
  eventTitle: { fontFamily: fonts.interSemiBold, fontSize: 14, color: colors.ink },
  eventTitlePending: { color: colors.muted },
  eventTime: { fontFamily: fonts.monoRegular, fontSize: 10, color: colors.muted },
  itemList: { gap: 12 },
  itemRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemThumb: { width: 52, height: 60, borderRadius: 10, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  itemThumbLetter: { fontFamily: fonts.anton, fontSize: 26, color: colors.border },
  itemInfo: { flex: 1, gap: 4 },
  itemName: { fontFamily: fonts.interSemiBold, fontSize: 13, lineHeight: 18, color: colors.ink },
  itemMeta: { fontFamily: fonts.monoRegular, fontSize: 10, color: colors.muted },
  bottomBar: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.paper },
  helpButton: { flex: 1, minHeight: 52, borderRadius: 999, borderWidth: 1, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  helpButtonText: { fontFamily: fonts.interBold, fontSize: 15, color: colors.ink },
  trackButton: { flex: 1, minHeight: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.volt },
  trackButtonText: { fontFamily: fonts.interBold, fontSize: 15, color: colors.ink },
});
