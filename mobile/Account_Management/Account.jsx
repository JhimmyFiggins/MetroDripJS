import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { colors, fonts } from '../Checkout/src/theme';

import AdaptHeader from '../components/AdaptHeader';
import Footer from '../components/Footer';

import { useAuth } from '../context/AuthContext';
import { getProfile } from '../../src/services/authService';
import { getOrders } from '../../src/services/orderService';
import { getWishlist } from '../../src/services/wishlistService';
import { getUnreadCount } from '../../src/services/notificationService';

const INACTIVE_ORDER_STATUSES = ['delivered', 'completed', 'cancelled'];

const FAQ_ITEMS = [
  {
    q: 'Where do you ship and how long does it take?',
    a: 'We ship nationwide. Metro Manila (NCR) orders arrive in 1–3 business days; provincial orders take 3–7 business days via our courier partners.',
  },
  {
    q: 'What is your return and exchange policy?',
    a: 'You may return or exchange unworn items with tags attached within 7 days of delivery. Sale items are final unless defective.',
  },
  {
    q: 'How do I pick the right size?',
    a: 'Each product page has a size chart with measurements in centimeters. Our tees run true to size; if you are between sizes, we recommend sizing up.',
  },
  {
    q: 'What payment methods do you accept?',
    a: 'We accept GCash, Maya, credit/debit cards, and cash on delivery (COD) in selected areas.',
  },
  {
    q: 'How can I track my order?',
    a: 'Open Orders from the menu below, tap your order, and check the tracking timeline for the latest status.',
  },
];

function getInitials(name) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function formatMemberSince(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
}

// The backend stores `addresses` as a free-form JSON field; the mobile app
// writes it as { address: "..." } via Profile Management.
function normalizeAddresses(addresses) {
  if (!addresses) return [];
  if (typeof addresses === 'string') {
    return addresses.trim() ? [{ label: 'Primary', line: addresses }] : [];
  }
  if (Array.isArray(addresses)) {
    return addresses
      .map((entry, index) => {
        if (typeof entry === 'string') {
          return { label: `Address ${index + 1}`, line: entry };
        }
        if (entry && typeof entry === 'object') {
          const parts = [
            entry.address || entry.address_line1 || entry.street,
            [entry.city, entry.state].filter(Boolean).join(', '),
          ].filter(Boolean);
          return {
            label: entry.label || `Address ${index + 1}`,
            line: parts.join('\n'),
          };
        }
        return null;
      })
      .filter((entry) => entry && entry.line);
  }
  if (typeof addresses === 'object') {
    if (Array.isArray(addresses.list)) return normalizeAddresses(addresses.list);
    if (Array.isArray(addresses.saved)) return normalizeAddresses(addresses.saved);
    if (typeof addresses.address === 'string' && addresses.address.trim()) {
      return [{ label: 'Primary', line: addresses.address }];
    }
  }
  return [];
}

function MenuRow({ icon, label, meta, onPress }) {
  return (
    <TouchableOpacity style={styles.menuRow} onPress={onPress}>
      <Text style={styles.menuIcon}>{icon}</Text>
      <Text style={styles.menuLabel}>{label}</Text>
      {meta ? <Text style={styles.menuMeta}>{meta}</Text> : null}
      <Text style={styles.menuChevron}>›</Text>
    </TouchableOpacity>
  );
}

function PanelHeader({ title, onBack }) {
  return (
    <View style={styles.panelHeader}>
      <TouchableOpacity onPress={onBack} hitSlop={8}>
        <Text style={styles.panelBack}>‹</Text>
      </TouchableOpacity>
      <Text style={styles.panelTitle}>{title}</Text>
    </View>
  );
}

export default function Account() {
  const { user, isGuest, logout } = useAuth();
  const navigation = useNavigation();

  const signedOut = isGuest || !user;

  const [profile, setProfile] = useState(null);
  const [orders, setOrders] = useState([]);
  const [wishlistCount, setWishlistCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [panel, setPanel] = useState(null);
  const [openFaq, setOpenFaq] = useState(null);

  useFocusEffect(
    useCallback(() => {
      if (signedOut) return undefined;

      let active = true;

      const load = async () => {
        const [profileRes, ordersRes, wishlistRes, unreadRes] =
          await Promise.allSettled([
            getProfile(),
            getOrders(),
            getWishlist(),
            getUnreadCount(),
          ]);

        if (!active) return;

        if (profileRes.status === 'fulfilled') setProfile(profileRes.value);
        if (ordersRes.status === 'fulfilled' && Array.isArray(ordersRes.value)) {
          setOrders(ordersRes.value);
        }
        if (wishlistRes.status === 'fulfilled' && Array.isArray(wishlistRes.value)) {
          setWishlistCount(wishlistRes.value.length);
        }
        if (unreadRes.status === 'fulfilled') {
          setUnreadCount(unreadRes.value || 0);
        }
      };

      load();
      return () => {
        active = false;
      };
    }, [signedOut])
  );

  const handleSignOut = () => {
    logout();
    navigation.reset({ index: 0, routes: [{ name: 'Initial' }] });
  };

  const name = profile?.name || user?.name || '';
  const memberSince = formatMemberSince(
    profile?.date_joined || user?.date_joined || user?.created_at
  );
  const ordersCount = orders.length;
  const activeOrders = orders.filter(
    (order) =>
      !INACTIVE_ORDER_STATUSES.includes(String(order.status || '').toLowerCase())
  ).length;
  const addresses = normalizeAddresses(profile?.addresses ?? user?.addresses);

  const renderSignedOut = () => (
    <View style={styles.guestWrap}>
      <Text style={styles.guestBrand}>METRODRIP</Text>
      <Text style={styles.guestMessage}>
        Sign in to track orders, save your fits, and check out faster.
      </Text>

      <TouchableOpacity
        style={styles.guestPrimary}
        onPress={() => navigation.navigate('Login')}
      >
        <Text style={styles.guestPrimaryText}>Sign in</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.guestSecondary}
        onPress={() => navigation.navigate('Signup')}
      >
        <Text style={styles.guestSecondaryText}>Create account</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Home')}>
        <Text style={styles.guestLink}>Continue browsing</Text>
      </TouchableOpacity>
    </View>
  );

  const renderAddressesPanel = () => (
    <View>
      <PanelHeader title="Addresses" onBack={() => setPanel(null)} />
      {addresses.length === 0 ? (
        <Text style={styles.emptyText}>
          No saved addresses yet. Add one from your profile to check out faster.
        </Text>
      ) : (
        addresses.map((entry, index) => (
          <View key={`${entry.label}-${index}`} style={styles.addressCard}>
            <Text style={styles.addressLabel}>{entry.label.toUpperCase()}</Text>
            <Text style={styles.addressLine}>{entry.line}</Text>
          </View>
        ))
      )}
      <TouchableOpacity
        style={styles.panelAction}
        onPress={() => {
          setPanel(null);
          navigation.navigate('Profile');
        }}
      >
        <Text style={styles.panelActionText}>Edit in Profile</Text>
      </TouchableOpacity>
    </View>
  );

  const renderReviewsPanel = () => (
    <View>
      <PanelHeader title="My Reviews" onBack={() => setPanel(null)} />
      <Text style={styles.emptyText}>
        You haven't reviewed anything yet. Reviews appear after your order is
        delivered.
      </Text>
    </View>
  );

  const renderFaqPanel = () => (
    <View>
      <PanelHeader title="Help & FAQ" onBack={() => setPanel(null)} />
      {FAQ_ITEMS.map((item, index) => {
        const open = openFaq === index;
        return (
          <View key={item.q} style={styles.faqItem}>
            <TouchableOpacity
              style={styles.faqQuestion}
              onPress={() => setOpenFaq(open ? null : index)}
            >
              <Text style={styles.faqQuestionText}>{item.q}</Text>
              <Text style={styles.menuChevron}>{open ? '−' : '+'}</Text>
            </TouchableOpacity>
            {open && <Text style={styles.faqAnswer}>{item.a}</Text>}
          </View>
        );
      })}
    </View>
  );

  const renderContactPanel = () => (
    <View>
      <PanelHeader title="Contact us" onBack={() => setPanel(null)} />
      <TouchableOpacity
        style={styles.contactRow}
        onPress={() => Linking.openURL('mailto:support@metrodrip.ph')}
      >
        <Text style={styles.contactLabel}>EMAIL</Text>
        <Text style={styles.contactValue}>support@metrodrip.ph</Text>
      </TouchableOpacity>
      <View style={styles.contactRow}>
        <Text style={styles.contactLabel}>HOURS</Text>
        <Text style={styles.contactValue}>Mon–Sat, 9:00 AM–6:00 PM PHT</Text>
      </View>
      <View style={styles.contactRow}>
        <Text style={styles.contactLabel}>STORE</Text>
        <Text style={styles.contactValue}>Metro Manila, Philippines</Text>
      </View>
    </View>
  );

  const renderPanel = () => {
    switch (panel) {
      case 'addresses':
        return renderAddressesPanel();
      case 'reviews':
        return renderReviewsPanel();
      case 'faq':
        return renderFaqPanel();
      case 'contact':
        return renderContactPanel();
      default:
        return null;
    }
  };

  return (
    <SafeAreaProvider>
      <View style={styles.screen}>
        <StatusBar style="dark" />
        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerWrap}>
            <AdaptHeader screenTitle="Account" />
            <TouchableOpacity
              style={styles.gearButton}
              onPress={() => navigation.navigate('Profile')}
              accessibilityLabel="Settings"
            >
              <Text style={styles.gearText}>⚙</Text>
            </TouchableOpacity>
          </View>

          {signedOut ? (
            renderSignedOut()
          ) : panel ? (
            renderPanel()
          ) : (
            <>
              {/* Profile */}
              <View style={styles.profile}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{getInitials(name)}</Text>
                </View>

                <View style={styles.profileInfo}>
                  <Text style={styles.name}>{name || '—'}</Text>
                  <Text style={styles.memberText}>
                    MEMBER SINCE {memberSince || '—'} · {ordersCount} ORDERS
                  </Text>
                </View>
              </View>

              {/* Stats */}
              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Text style={styles.statNumber}>{ordersCount}</Text>
                  <Text style={styles.statLabel}>ORDERS</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statNumber}>{wishlistCount}</Text>
                  <Text style={styles.statLabel}>WISHLIST</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statNumber}>0</Text>
                  <Text style={styles.statLabel}>REVIEWS</Text>
                </View>
              </View>

              {/* Menu */}
              <View style={styles.menu}>
                <MenuRow
                  icon="▤"
                  label="My Orders"
                  meta={`${activeOrders} active`}
                  onPress={() => navigation.navigate('History')}
                />
                <MenuRow
                  icon="♡"
                  label="Wishlist"
                  meta={`${wishlistCount} items`}
                  onPress={() => navigation.navigate('Saved')}
                />
                <MenuRow
                  icon="◈"
                  label="Addresses"
                  meta={`${addresses.length} saved`}
                  onPress={() => setPanel('addresses')}
                />
                <MenuRow
                  icon="★"
                  label="My Reviews"
                  onPress={() => setPanel('reviews')}
                />
                <MenuRow
                  icon="◔"
                  label="Notifications"
                  meta={unreadCount > 0 ? `${unreadCount} new` : ''}
                  onPress={() => navigation.navigate('Notifications')}
                />
                <MenuRow
                  icon="?"
                  label="Help & FAQ"
                  onPress={() => setPanel('faq')}
                />
                <MenuRow
                  icon="✉"
                  label="Contact us"
                  onPress={() => setPanel('contact')}
                />
              </View>

              <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
                <Text style={styles.signOutText}>Sign out</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
        <Footer active="Account" />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: {
    height: '100%',
    backgroundColor: colors.paper,
  },

  container: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 40,
  },

  // Header
  headerWrap: {
    position: 'relative',
    justifyContent: 'center',
  },

  gearButton: {
    position: 'absolute',
    right: 10,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },

  gearText: {
    fontSize: 20,
    color: colors.ink,
  },

  // Guest
  guestWrap: {
    paddingTop: 40,
    paddingHorizontal: 10,
  },

  guestBrand: {
    fontFamily: fonts.anton,
    fontSize: 28,
    color: colors.ink,
    marginBottom: 12,
  },

  guestMessage: {
    fontFamily: fonts.interRegular,
    fontSize: 14,
    color: colors.muted,
    lineHeight: 21,
    marginBottom: 24,
  },

  guestPrimary: {
    height: 50,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    marginBottom: 12,
  },

  guestPrimaryText: {
    fontFamily: fonts.interSemiBold,
    fontSize: 15,
    color: colors.paper,
  },

  guestSecondary: {
    height: 50,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    marginBottom: 20,
  },

  guestSecondaryText: {
    fontFamily: fonts.interSemiBold,
    fontSize: 15,
    color: colors.ink,
  },

  guestLink: {
    fontFamily: fonts.interSemiBold,
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },

  // Profile
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: 13,
    paddingBottom: 16,
  },

  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.volt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  avatarText: {
    fontFamily: fonts.interBold,
    fontSize: 18,
    color: colors.ink,
  },

  profileInfo: {
    flex: 1,
  },

  name: {
    fontFamily: fonts.interBold,
    fontSize: 18,
    color: colors.ink,
  },

  memberText: {
    fontFamily: fonts.monoRegular,
    fontSize: 10,
    color: colors.muted,
    marginTop: 3,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 10,
    marginBottom: 20,
  },

  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },

  statNumber: {
    fontFamily: fonts.anton,
    fontSize: 22,
    color: colors.ink,
  },

  statLabel: {
    fontFamily: fonts.monoRegular,
    fontSize: 10,
    color: colors.muted,
    marginTop: 4,
  },

  // Menu
  menu: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 24,
  },

  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 15,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },

  menuIcon: {
    fontFamily: fonts.interRegular,
    fontSize: 17,
    color: colors.ink,
    width: 22,
    textAlign: 'center',
  },

  menuLabel: {
    flex: 1,
    fontFamily: fonts.interSemiBold,
    fontSize: 15,
    color: colors.ink,
  },

  menuMeta: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    color: colors.muted,
    marginRight: 6,
  },

  menuChevron: {
    fontFamily: fonts.interRegular,
    fontSize: 20,
    color: colors.muted,
  },

  // Panels
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 16,
  },

  panelBack: {
    fontFamily: fonts.interRegular,
    fontSize: 26,
    color: colors.ink,
    marginRight: 10,
    marginTop: -2,
  },

  panelTitle: {
    fontFamily: fonts.interBold,
    fontSize: 16,
    color: colors.ink,
  },

  emptyText: {
    fontFamily: fonts.interRegular,
    fontSize: 14,
    color: colors.muted,
    lineHeight: 21,
    paddingHorizontal: 4,
  },

  addressCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },

  addressLabel: {
    fontFamily: fonts.monoRegular,
    fontSize: 10,
    color: colors.muted,
    letterSpacing: 0.8,
    marginBottom: 6,
  },

  addressLine: {
    fontFamily: fonts.interRegular,
    fontSize: 14,
    color: colors.ink,
    lineHeight: 20,
  },

  panelAction: {
    marginTop: 8,
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  panelActionText: {
    fontFamily: fonts.interSemiBold,
    fontSize: 14,
    color: colors.ink,
  },

  faqItem: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 12,
  },

  faqQuestion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  faqQuestionText: {
    flex: 1,
    fontFamily: fonts.interSemiBold,
    fontSize: 14,
    color: colors.ink,
    marginRight: 10,
  },

  faqAnswer: {
    fontFamily: fonts.interRegular,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 20,
    marginTop: 8,
  },

  contactRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },

  contactLabel: {
    fontFamily: fonts.monoRegular,
    fontSize: 10,
    color: colors.muted,
    letterSpacing: 0.8,
    marginBottom: 4,
  },

  contactValue: {
    fontFamily: fonts.interSemiBold,
    fontSize: 15,
    color: colors.ink,
  },

  // Sign out
  signOutButton: {
    alignItems: 'center',
    paddingVertical: 14,
  },

  signOutText: {
    fontFamily: fonts.interSemiBold,
    fontSize: 15,
    color: '#C2282D',
  },
});
