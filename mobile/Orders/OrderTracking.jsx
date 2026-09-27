import React, { useState, useCallback } from 'react';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';

import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';

import { SafeAreaProvider } from 'react-native-safe-area-context';

import { StatusBar } from 'expo-status-bar';

import { colors, fonts } from '../Checkout/src/theme';

import { getOrderTracking } from '../../src/services/orderService';

// Dark-surface tokens from the M07 Figma spec that are not in the shared theme.
const darkSurface = '#252524';
const mutedOnDark = '#A8A8A0';
const chipText = '#F2F2EF';

const formatEventTime = iso => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return `${date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })} · ${date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
};

const formatExpected = iso => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return `Expected ${date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })}`;
};

export default function OrderTracking() {
  const navigation = useNavigation();
  const route = useRoute();
  const orderId = route.params?.orderId;

  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const loadTracking = useCallback(async () => {
    try {
      setError(null);
      const data = await getOrderTracking(orderId);
      setTracking(data);
    } catch (err) {
      console.error('Failed to load order tracking:', err);
      if (err && err.status === 404) {
        setError('Order not found');
      } else {
        setError((err && err.message) || 'Failed to load tracking details.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadTracking();
    }, [loadTracking])
  );

  const handleTrackLive = () => {
    setRefreshing(true);
    loadTracking();
  };

  const handleGetHelp = () => {
    Alert.alert(
      'Get help',
      'Need a hand with this order? Email us at support@metrodrip.ph and include your order number.',
      [{ text: 'OK' }]
    );
  };

  const order = tracking?.order;
  const shipment = tracking?.shipment;
  const events = tracking?.events || [];
  const items = order?.items || [];

  const orderNumber =
    order?.number ||
    (order?.id != null
      ? `MD-2026-${String(order.id).padStart(5, '0')}`
      : `MD-2026-${String(orderId ?? '').padStart(5, '0')}`);

  return (
    <SafeAreaProvider>
      <View style={styles.screen}>
        <StatusBar style="dark" />

        {/* Header — AdaptHeader pattern, but back uses goBack so tracking can be
            reached from Notifications or OrderConfirmation */}
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityLabel="Go back"
            accessibilityRole="button"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Text style={styles.backArrow}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Order {orderNumber}</Text>
        </View>

        {loading ? (
          <View style={styles.stateContainer}>
            <ActivityIndicator color={colors.ink} size="large" />
            <Text style={styles.stateText}>Loading tracking details...</Text>
          </View>
        ) : error ? (
          <View style={styles.stateContainer}>
            <Text style={styles.errorTitle}>{error}</Text>
            <Text style={styles.stateText}>
              We could not load tracking for this order.
            </Text>
            <TouchableOpacity style={styles.retryButton} onPress={handleTrackLive}>
              <Text style={styles.retryButtonText}>TRY AGAIN</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.container}
            showsVerticalScrollIndicator={false}
          >
            {/* ETA HERO */}
            <View style={styles.hero}>
              <Text style={styles.heroLabel}>
                {shipment ? 'ARRIVING' : 'STATUS'}
              </Text>
              <Text style={styles.heroEta}>
                {shipment ? shipment.eta_label : 'Preparing your order'}
              </Text>
              {shipment && (
                <View style={styles.heroRow}>
                  <Text style={styles.heroCourier}>{shipment.courier}</Text>
                  <View style={styles.trackingChip}>
                    <Text style={styles.trackingChipText}>
                      {shipment.tracking_number}
                    </Text>
                  </View>
                </View>
              )}
            </View>

            {/* TIMELINE */}
            <View style={styles.timeline}>
              {events.length === 0 ? (
                <Text style={styles.emptyText}>
                  No tracking events yet. Check back soon.
                </Text>
              ) : (
                events.map((event, index) => {
                  const done = event.state === 'done';
                  const isLast = index === events.length - 1;
                  return (
                    <View key={event.key || index} style={styles.timelineRow}>
                      <View style={styles.timelineRail}>
                        {done ? (
                          <View style={styles.dotDone} />
                        ) : (
                          <View style={styles.dotPending} />
                        )}
                        {!isLast && (
                          <View
                            style={[
                              styles.connector,
                              !done && styles.connectorPending,
                            ]}
                          />
                        )}
                      </View>
                      <View style={styles.timelineContent}>
                        <Text
                          style={[
                            styles.eventTitle,
                            !done && styles.eventTitlePending,
                          ]}
                        >
                          {event.title}
                        </Text>
                        <Text style={styles.eventTime}>
                          {done
                            ? formatEventTime(event.timestamp)
                            : formatExpected(event.timestamp)}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>

            {/* ITEMS */}
            <View style={styles.itemsSection}>
              <Text style={styles.itemsHeading}>Items</Text>
              {items.length === 0 ? (
                <Text style={styles.emptyText}>No items on this order.</Text>
              ) : (
                items.map((item, index) => (
                  <View key={item.id || index} style={styles.itemRow}>
                    <View style={styles.itemThumb}>
                      <Text style={styles.itemThumbLetter}>
                        {item.name ? item.name.charAt(0) : 'M'}
                      </Text>
                    </View>
                    <View style={styles.itemInfo}>
                      <Text numberOfLines={1} style={styles.itemName}>
                        {item.name}
                      </Text>
                      <Text style={styles.itemMeta}>
                        {item.variant_label ? `${item.variant_label} ` : ''}×
                        {item.quantity}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        )}

        {/* STICKY BOTTOM BAR */}
        {!loading && !error && (
          <View style={styles.bottomBar}>
            <TouchableOpacity
              accessibilityLabel="Get help with this order"
              accessibilityRole="button"
              style={styles.helpButton}
              onPress={handleGetHelp}
            >
              <Text style={styles.helpButtonText}>Get help</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityLabel="Refresh live tracking"
              accessibilityRole="button"
              style={styles.trackButton}
              onPress={handleTrackLive}
              disabled={refreshing}
            >
              {refreshing ? (
                <ActivityIndicator color={colors.ink} size="small" />
              ) : (
                <Text style={styles.trackButtonText}>Track live</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: 'rgb(255, 255, 255)',
  },

  // Header
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.paper,
  },
  backButton: {
    paddingRight: 10,
  },
  backArrow: {
    fontSize: 26,
    color: colors.ink,
    lineHeight: 28,
  },
  headerTitle: {
    fontFamily: fonts.interBold,
    fontSize: 15,
    color: colors.ink,
  },

  container: {
    paddingBottom: 40,
  },

  // Loading / error / empty states
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 8,
  },
  stateText: {
    fontFamily: fonts.interRegular,
    fontSize: 13,
    color: colors.muted,
    textAlign: 'center',
  },
  errorTitle: {
    fontFamily: fonts.interBold,
    fontSize: 17,
    color: colors.ink,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 9999,
    backgroundColor: colors.volt,
  },
  retryButtonText: {
    fontFamily: fonts.interBold,
    fontSize: 13,
    color: colors.ink,
  },
  emptyText: {
    fontFamily: fonts.monoRegular,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 10,
  },

  // ETA hero
  hero: {
    backgroundColor: colors.ink,
    padding: 16,
    gap: 6,
  },
  heroLabel: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 10,
    letterSpacing: 1.4,
    color: colors.volt,
  },
  heroEta: {
    fontFamily: fonts.anton,
    fontSize: 28,
    color: colors.paper,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroCourier: {
    fontFamily: fonts.interMedium,
    fontSize: 12,
    color: mutedOnDark,
  },
  trackingChip: {
    backgroundColor: darkSurface,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  trackingChipText: {
    fontFamily: fonts.monoRegular,
    fontSize: 10,
    color: chipText,
  },

  // Timeline
  timeline: {
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  timelineRail: {
    width: 24,
    alignItems: 'center',
  },
  dotDone: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.volt,
  },
  dotPending: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.paper,
    borderWidth: 2,
    borderColor: colors.border,
    marginTop: 1,
  },
  connector: {
    width: 2,
    height: 38,
    backgroundColor: colors.volt,
  },
  connectorPending: {
    backgroundColor: colors.border,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: 18,
    gap: 2,
  },
  eventTitle: {
    fontFamily: fonts.interSemiBold,
    fontSize: 14,
    color: colors.ink,
  },
  eventTitlePending: {
    color: colors.muted,
  },
  eventTime: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    color: colors.muted,
  },

  // Items
  itemsSection: {
    paddingHorizontal: 16,
    gap: 10,
  },
  itemsHeading: {
    fontFamily: fonts.interBold,
    fontSize: 15,
    color: colors.ink,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemThumb: {
    width: 52,
    height: 60,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemThumbLetter: {
    fontFamily: fonts.anton,
    fontSize: 26,
    color: colors.border,
  },
  itemInfo: {
    flex: 1,
    gap: 3,
  },
  itemName: {
    fontFamily: fonts.interSemiBold,
    fontSize: 13,
    color: colors.ink,
  },
  itemMeta: {
    fontFamily: fonts.monoRegular,
    fontSize: 10,
    color: colors.muted,
  },

  // Sticky bottom bar
  bottomBar: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.paper,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 30,
  },
  helpButton: {
    flex: 1,
    height: 52,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper,
  },
  helpButtonText: {
    fontFamily: fonts.interBold,
    fontSize: 15,
    color: colors.ink,
  },
  trackButton: {
    flex: 1,
    height: 52,
    borderRadius: 9999,
    backgroundColor: colors.volt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackButtonText: {
    fontFamily: fonts.interBold,
    fontSize: 15,
    color: colors.ink,
  },
});
