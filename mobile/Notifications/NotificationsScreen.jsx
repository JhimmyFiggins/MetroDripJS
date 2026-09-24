import React, { useState, useCallback } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';

import { SafeAreaProvider } from 'react-native-safe-area-context';

import { StatusBar } from 'expo-status-bar';

import { colors, fonts } from '../Checkout/src/theme';

import Footer from '../components/Footer';

import {
  getNotifications,
  markRead,
  markAllRead,
  timeAgo,
} from '../../src/services/notificationService';

const TYPE_ICONS = {
  order: '🚚',
  drop: '🔥',
  payment: '✓',
  review: '★',
  stock: '♡',
};

const isToday = iso => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
};

export default function NotificationsScreen() {
  const navigation = useNavigation();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await getNotifications();
      setNotifications((data && data.results) || []);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadNotifications();
    }, [loadNotifications])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadNotifications();
  };

  const handleMarkAllRead = async () => {
    const previous = notifications;
    setNotifications(current => current.map(n => ({ ...n, is_read: true })));
    try {
      await markAllRead();
    } catch (error) {
      console.error('Failed to mark all notifications read:', error);
      setNotifications(previous);
    }
  };

  const handleSettingsPress = () => {
    Alert.alert('Notifications', null, [
      { text: 'Mark all as read', onPress: handleMarkAllRead },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handlePress = item => {
    if (!item.is_read) {
      setNotifications(current =>
        current.map(n => (n.id === item.id ? { ...n, is_read: true } : n))
      );
      markRead(item.id).catch(error => {
        console.error('Failed to mark notification read:', error);
        setNotifications(current =>
          current.map(n => (n.id === item.id ? { ...n, is_read: false } : n))
        );
      });
    }
    if (item.order_id) {
      navigation.navigate('OrderTracking', { orderId: item.order_id });
    }
  };

  const todayItems = notifications.filter(n => isToday(n.created_at));
  const earlierItems = notifications.filter(n => !isToday(n.created_at));

  const renderCard = item => {
    const unread = !item.is_read;
    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.card, !unread && styles.cardRead]}
        onPress={() => handlePress(item)}
        activeOpacity={0.85}
      >
        <View style={[styles.iconCircle, unread && styles.iconCircleUnread]}>
          <Text style={styles.iconText}>{TYPE_ICONS[item.type] || '•'}</Text>
        </View>
        <View style={styles.cardBody}>
          <View style={styles.cardHeaderRow}>
            <Text numberOfLines={1} style={styles.cardTitle}>
              {item.title}
            </Text>
            <Text style={styles.cardTime}>{timeAgo(item.created_at)}</Text>
          </View>
          <Text style={styles.cardText}>{item.body}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const renderSection = (label, items) =>
    items.length > 0 && (
      <View key={label} style={styles.section}>
        <Text style={styles.sectionLabel}>{label}</Text>
        {items.map(renderCard)}
      </View>
    );

  return (
    <SafeAreaProvider>
      <View style={styles.screen}>
        <StatusBar style="dark" />

        {/* Header per Figma M08 — custom build since AdaptHeader centers the
            title around a back button, while M08 needs a left title + gear */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Notifications</Text>
          <TouchableOpacity
            accessibilityLabel="Notification settings"
            accessibilityRole="button"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            onPress={handleSettingsPress}
          >
            <Text style={styles.headerGear}>⚙</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.ink}
            />
          }
        >
          {loading ? (
            <Text style={styles.emptyText}>Loading notifications...</Text>
          ) : notifications.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.emptyText}>
                Order updates, drops, and restocks will show up here.
              </Text>
            </View>
          ) : (
            <>
              {renderSection('TODAY', todayItems)}
              {renderSection('EARLIER', earlierItems)}
            </>
          )}
        </ScrollView>

        {/* Figma M08 quirk: the footer lights Orders while on Notifications */}
        <Footer active="Orders" />
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.paper,
  },
  headerTitle: {
    fontFamily: fonts.interBold,
    fontSize: 17,
    color: colors.ink,
  },
  headerGear: {
    fontFamily: fonts.interRegular,
    fontSize: 18,
    color: colors.ink,
  },

  container: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
    flexGrow: 1,
  },

  // Sections
  section: {
    gap: 10,
  },
  sectionLabel: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 9,
    letterSpacing: 1.2,
    color: colors.muted,
  },

  // Cards
  card: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  cardRead: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleUnread: {
    backgroundColor: colors.volt,
  },
  iconText: {
    fontSize: 15,
    color: colors.ink,
  },
  cardBody: {
    flex: 1,
    gap: 3,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  cardTitle: {
    flex: 1,
    fontFamily: fonts.interSemiBold,
    fontSize: 14,
    color: colors.ink,
  },
  cardTime: {
    fontFamily: fonts.monoRegular,
    fontSize: 10,
    color: colors.muted,
  },
  cardText: {
    fontFamily: fonts.interRegular,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    gap: 6,
  },
  emptyTitle: {
    fontFamily: fonts.interBold,
    fontSize: 17,
    color: colors.ink,
  },
  emptyText: {
    fontFamily: fonts.monoRegular,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
  },
});
