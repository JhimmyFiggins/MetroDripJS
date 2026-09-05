import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
} from 'react-native';

import { colors, fonts } from '../Checkout/src/theme';
import AdaptHeader from '../components/AdaptHeader';

export default function Account({navigate}) {
  const screenTitle = 'My Account'
  return (
    
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <AdaptHeader screenTitle={screenTitle}/>


        {/* Header */}
        {/* <TouchableOpacity
          style={styles.header}
          onPress={() => {}}
        >
          <Text style={styles.back}>‹</Text>
          <Text style={styles.headerTitle}>My Account</Text>
        </TouchableOpacity> */}

       

        {/* Profile */}
        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>JD</Text>
          </View>

          <View style={styles.profileInfo}>
            <Text style={styles.name}>Juan Dela Cruz</Text>

            <View style={styles.memberInfo}>
              <Text style={styles.memberText}>
                MEMBER SINCE 07.2026
              </Text>

              <Text style={styles.dot}>•</Text>

              <Text style={styles.memberText}>
                3 ORDERS
              </Text>
            </View>
          </View>
        </View>

        {/* Order History */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>ORDER HISTORY</Text>

          <TouchableOpacity onPress={() => {}}>
            <Text style={styles.viewAll}>View all</Text>
          </TouchableOpacity>
        </View>

        {/* Order 1 */}
        <TouchableOpacity
          style={styles.orderCard}
          onPress={() => {}}
        >
          <View>
            <Text style={styles.orderNumber}>MD-2026-00318</Text>

            <Text style={styles.orderDetails}>
              2 items · ₱2,632 · Jul 18
            </Text>
          </View>

          <View style={styles.shippedBadge}>
            <View style={styles.badgeDot} />
            <Text style={styles.shippedText}>Shipped</Text>
          </View>
        </TouchableOpacity>

        {/* Order 2 */}
        <TouchableOpacity
          style={styles.orderCard}
          onPress={() => {}}
        >
          <View>
            <Text style={styles.orderNumber}>MD-2026-00291</Text>

            <Text style={styles.orderDetails}>
              1 item · ₱1,099 · Jul 04
            </Text>
          </View>

          <View style={styles.deliveredBadge}>
            <View style={styles.badgeDot} />
            <Text style={styles.deliveredText}>Delivered</Text>
          </View>
        </TouchableOpacity>

        {/* Wishlist */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>WISHLIST</Text>

          <TouchableOpacity onPress={() => {}}>
            <Text style={styles.viewAll}>View all · 4</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.wishlistRow}>

          <TouchableOpacity
            style={styles.wishlistItem}
            onPress={() => {}}
          >
            <Text style={styles.placeholderText}>H</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.wishlistItem}
            onPress={() => {}}
          >
            <Text style={styles.placeholderText}>B</Text>
          </TouchableOpacity>

        </View>

        {/* Account Options */}
        <TouchableOpacity
          style={styles.option}
          onPress={() => {}}
        >
          <Text style={styles.optionTitle}>
            Profile & saved addresses
          </Text>

          <Text style={styles.optionValue}>
            Unit 4B, Maginghawa St.
          </Text>

          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.option}
          onPress={() => {}}
        >
          <Text style={styles.optionTitle}>
            Help & FAQ
          </Text>

          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.option}
          onPress={() => {}}
        >
          <Text style={styles.optionTitle}>
            Contact us
          </Text>

          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.option}
          onPress={() => {}}
        >
          <Text style={styles.signOut}>
            Sign out
          </Text>

          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    height: '100%',
    weight: '100%',
    backgroundColor: 'rgb(255, 255, 255)',
  },

  container: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 40,
  },

  // Header
  header: {
    height: 43,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },

  // back: {
  //   fontSize: 24,
  //   color: colors.ink,
  //   marginRight: 7,
  //   marginTop: -3,
  // },

  // headerTitle: {
  //   fontFamily: fonts.interBold,
  //   fontSize: 14,
  //   color: colors.ink,
  // },

  // Profile
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: 13,
    paddingBottom: 12,
  },

  avatar: {
    width: 39,
    height: 39,
    borderRadius: 20,
    backgroundColor: colors.volt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  avatarText: {
    fontFamily: fonts.interBold,
    fontSize: 15,
    color: colors.ink,
  },

  profileInfo: {
    flex: 1,
  },

  name: {
    fontFamily: fonts.interBold,
    fontSize: 17,
    color: colors.ink,
  },

  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },

  memberText: {
    fontFamily: fonts.monoRegular,
    fontSize: 8,
    color: colors.muted,
  },

  dot: {
    fontSize: 9,
    color: colors.muted,
    marginHorizontal: 6,
  },

  // Section
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    marginBottom: 8,
  },

  sectionTitle: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 15,
    color: colors.ink,
  },

  viewAll: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    color: colors.muted,
  },

  // Orders
  orderCard: {
    minHeight: 58,
    marginHorizontal: 10,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  orderNumber: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 12,
    color: colors.ink,
  },

  orderDetails: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    color: colors.muted,
    marginTop: 3,
  },

  shippedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },

  deliveredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.volt,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },

  badgeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgb(163, 197, 41)',
    marginRight: 4,
  },

  shippedText: {
    fontFamily: fonts.interMedium,
    fontSize: 10,
    color: colors.paper,
  },

  deliveredText: {
    fontFamily: fonts.interMedium,
    fontSize: 10,
    color: colors.ink,
  },

  // Wishlist
  wishlistRow: {
    flexDirection: 'row',
    gap: 9,
    paddingHorizontal: 10,
    marginBottom: 12,
  },

  wishlistItem: {
    flex: 1,
    height: 79,
    backgroundColor: colors.surface,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  placeholderText: {
    fontFamily: fonts.interBold,
    fontSize: 44,
    color: colors.border,
  },

  // Options
  option: {
    minHeight: 40,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },

  optionTitle: {
    flex: 1,
    fontFamily: fonts.interSemiBold,
    fontSize: 13,
    color: colors.ink,
  },

  optionValue: {
    fontFamily: fonts.monoRegular,
    fontSize: 10,
    color: colors.muted,
    marginRight: 6,
  },

  arrow: {
    fontFamily: fonts.interRegular,
    fontSize: 20,
    color: colors.muted,
  },

  signOut: {
    flex: 1,
    fontFamily: fonts.interRegular,
    fontSize: 13,
    color: colors.danger,
  },
});