import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  useWindowDimensions,
  Modal,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { colors, fonts } from '../theme';
import { formatConfirmationDate, validateConfirmationRoute } from '../data/orderConfirmation';

export function OrderConfirmationScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const [receiptModalVisible, setReceiptModalVisible] = useState(false);

  // Confirmation is intentionally unavailable without a validated, server-built
  // order object. This route never substitutes preview or client-priced data.
  const order = validateConfirmationRoute(route.params?.order);

  if (!order) {
    return (
      <SafeAreaView edges={Platform.OS === 'web' ? [] : ['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.invalidState}>
          <Text style={styles.invalidEyebrow}>CONFIRMATION UNAVAILABLE</Text>
          <Text style={styles.invalidTitle}>We could not verify this order</Text>
          <Text style={styles.invalidMessage}>
            Open the order from Order history. MetroDrip will only show a confirmation after the server verifies its payment state.
          </Text>
          <Pressable
            accessibilityLabel="Open order history"
            accessibilityRole="button"
            onPress={() => navigation.replace('History')}
            style={({ pressed }) => [styles.primaryButton, styles.invalidAction, pressed && styles.primaryButtonPressed]}
          >
            <Text style={styles.primaryButtonText}>Open Order history</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const formatPeso = (val) =>
    `₱${Number(val).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const isCashOnDelivery = order.paymentMethod === 'cod';
  const requiresReview = order.orderStatus === 'payment_review';
  const paymentMethodLabel = {
    cod: 'Cash on Delivery · pay on arrival',
    gcash: 'GCash · confirmed by PayMongo',
    maya: 'Maya · confirmed by PayMongo',
    card: 'Card · confirmed by PayMongo',
  }[order.paymentMethod];
  const paymentSummary = isCashOnDelivery
    ? 'ORDER PLACED · CASH ON DELIVERY'
    : requiresReview
      ? 'PAYMENT CONFIRMED · ORDER UNDER REVIEW'
      : 'ORDER PLACED · ONLINE PAYMENT CONFIRMED';
  const amountLabel = isCashOnDelivery ? 'Amount due on delivery' : 'Amount paid';
  const confirmationTitle = requiresReview ? 'Payment confirmed' : 'Order confirmed';
  const confirmationDate = formatConfirmationDate(order.createdAt);
  const deliveryAddress = [
    order.shippingAddress.addressLine1,
    order.shippingAddress.addressLine2,
    order.shippingAddress.city,
    order.shippingAddress.state,
    order.shippingAddress.postalCode,
    order.shippingAddress.country,
  ].filter(Boolean).join(', ');

  const itemCount = order.items
    ? order.items.reduce((sum, it) => sum + (it.quantity || 1), 0)
    : 3;

  return (
    <SafeAreaView edges={Platform.OS === 'web' ? [] : ['top', 'bottom']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isWide && styles.desktopScrollContent,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.container, isWide && styles.desktopContainer]}>
          {/* Top minimal back/home bar */}
          <View style={styles.navBar}>
            <Pressable
              accessibilityLabel="Continue shopping"
              accessibilityRole="button"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              onPress={() => navigation.navigate('Shop')}
              style={({ pressed }) => [styles.navButton, pressed && styles.pressed]}
            >
              <Text style={styles.navButtonText}>‹ Back to Shop</Text>
            </Pressable>
            <Text style={styles.brandTitle}>METRODRIP</Text>
          </View>

          {/* 1. Success Hero (Figma Dark Card #141414) */}
          <View style={styles.successHero}>
            <View style={styles.checkBadge}>
              <Text style={styles.checkIcon}>✓</Text>
            </View>

            <Text style={styles.successSub}>{paymentSummary}</Text>
            <Text style={styles.orderConfirmedTitle}>{confirmationTitle}</Text>

            <View style={styles.metaRow}>
              <View style={styles.orderChip}>
                <Text style={styles.orderChipText}>{order.refNo}</Text>
              </View>
              <Text style={styles.dateText}>{confirmationDate}</Text>
            </View>
          </View>

          {/* 2. Payment Receipt Card */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Payment</Text>
            <View style={styles.cardBox}>
              <View style={styles.cardRow}>
                <Text style={styles.rowLabel}>{amountLabel}</Text>
                <Text style={styles.rowValueBold}>{formatPeso(order.total)}</Text>
              </View>

              <View style={styles.cardRow}>
                <Text style={styles.rowLabel}>Method</Text>
                <Text style={styles.rowValue}>{paymentMethodLabel}</Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.cardRow}>
                <Text style={styles.rowLabel}>Reference no.</Text>
                <Text style={styles.monoValue}>{order.refNo}</Text>
              </View>
            </View>
            <Text style={styles.receiptNote}>This server-verified receipt remains available in Order history.</Text>
          </View>

          {/* 3. Delivery Details Card */}
          <View style={styles.sectionBlock}>
            <Text style={styles.sectionTitle}>Delivery</Text>
            <View style={styles.cardBox}>
              <Text style={styles.recipientName}>{order.shippingAddress.name}</Text>
              <Text style={styles.deliveryAddress}>{deliveryAddress}</Text>

              <View style={styles.etaRow}>
                <View style={styles.etaDot} />
                <Text style={styles.etaText}>
                  {requiresReview
                    ? 'Support will review inventory allocation before fulfillment.'
                    : 'Tracking updates will appear after dispatch.'}
                </Text>
              </View>
            </View>
          </View>

          {/* 4. Items Summary Card */}
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Items</Text>
              <Text style={styles.itemCountText}>{itemCount} pieces</Text>
            </View>

            <View style={styles.cardBox}>
              {order.items && order.items.length > 0 ? (
                order.items.map((it, idx) => (
                  <View key={it.id || idx} style={styles.itemRow}>
                    {it.image ? (
                      <Image source={{ uri: it.image }} style={styles.itemThumb} />
                    ) : (
                      <View style={styles.itemBadge}>
                        <Text style={styles.itemBadgeText}>
                        {it.name ? it.name.charAt(0) : 'M'}
                        </Text>
                      </View>
                    )}

                    <View style={styles.itemInfo}>
                      <Text numberOfLines={1} style={styles.itemName}>
                        {it.name}
                      </Text>
                      <Text style={styles.itemVariant}>
                        {it.variant || 'Standard option'} · ×{it.quantity}
                      </Text>
                    </View>

                    <Text style={styles.itemPrice}>
                      {formatPeso(it.totalPrice)}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.mutedText}>No items found</Text>
              )}
            </View>
          </View>

          {/* 5. Bottom Action Buttons */}
          <View style={styles.actionArea}>
            <Pressable
              accessibilityLabel="View full receipt"
              accessibilityRole="button"
              onPress={() => setReceiptModalVisible(true)}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.secondaryButtonText}>View receipt</Text>
            </Pressable>

            <Pressable
              accessibilityLabel="Track order"
              accessibilityRole="button"
              onPress={() =>
                navigation.navigate('OrderTracking', { orderId: order.orderId })
              }
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.primaryButtonPressed,
              ]}
            >
              <Text style={styles.primaryButtonText}>Track order</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* Receipt Modal */}
      <Modal
        animationType="slide"
        onRequestClose={() => setReceiptModalVisible(false)}
        transparent={true}
        visible={receiptModalVisible}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Order receipt</Text>
              <Pressable
                accessibilityLabel="Close receipt"
                accessibilityRole="button"
                onPress={() => setReceiptModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.modalScroll}>
              <Text style={styles.receiptStoreName}>METRODRIP MANILA</Text>
              <Text style={styles.receiptMeta}>
                Order: {order.refNo} · {confirmationDate}
              </Text>
              <Text style={styles.receiptMeta}>Ref: {order.refNo}</Text>

              <View style={styles.modalDivider} />

              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Subtotal</Text>
                <Text style={styles.receiptVal}>{formatPeso(order.subtotal ?? order.total)}</Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Shipping</Text>
                <Text style={styles.receiptVal}>{formatPeso(order.shipping ?? 0)}</Text>
              </View>

              <View style={styles.modalDivider} />

              <View style={styles.receiptRow}>
                <Text style={styles.receiptTotalLabel}>
                  {isCashOnDelivery ? 'AMOUNT DUE' : 'AMOUNT PAID'}
                </Text>
                <Text style={styles.receiptTotalVal}>{formatPeso(order.total)}</Text>
              </View>

              <View style={styles.modalDivider} />

              <Text style={styles.receiptFooterText}>
                {isCashOnDelivery
                  ? 'Payment is collected by the courier when this order is delivered.'
                  : 'Payment was confirmed by the server after PayMongo provider verification.'}
              </Text>
            </ScrollView>

            <Pressable
              onPress={() => setReceiptModalVisible(false)}
              style={styles.modalDoneButton}
            >
              <Text style={styles.modalDoneButtonText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  invalidState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 12,
  },
  invalidEyebrow: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 10,
    letterSpacing: 1.3,
    color: colors.muted,
  },
  invalidTitle: {
    fontFamily: fonts.interBold,
    fontSize: 22,
    color: colors.ink,
    textAlign: 'center',
  },
  invalidMessage: {
    maxWidth: 380,
    fontFamily: fonts.interRegular,
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
    textAlign: 'center',
  },
  invalidAction: {
    flex: 0,
    minWidth: 190,
    minHeight: 48,
    marginTop: 8,
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: 32,
  },
  desktopScrollContent: {
    alignItems: 'center',
  },
  container: {
    width: '100%',
    paddingHorizontal: 16,
  },
  desktopContainer: {
    maxWidth: 640,
  },
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 16,
  },
  navButton: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  navButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
    fontFamily: fonts.interSemiBold || fonts.helveticaNeueMedium,
  },
  brandTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: colors.ink,
    fontFamily: fonts.interBold || fonts.helveticaNeueBold,
  },
  /* 1. Success Hero (Figma M07: #141414) */
  successHero: {
    backgroundColor: colors.ink,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  checkBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.volt,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  checkIcon: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.ink,
  },
  successSub: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.volt,
    letterSpacing: 1.2,
    marginBottom: 4,
    fontFamily: fonts.monoRegular || fonts.interRegular,
  },
  orderConfirmedTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.paper,
    marginBottom: 12,
    fontFamily: fonts.interBold || fonts.helveticaNeueBold,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderChip: {
    backgroundColor: '#252524',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  orderChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#F2F2EF',
    fontFamily: fonts.monoRegular || fonts.interRegular,
  },
  dateText: {
    fontSize: 11,
    color: '#8F8F88',
    fontFamily: fonts.interRegular,
  },
  /* Section Blocks */
  sectionBlock: {
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 8,
    fontFamily: fonts.interBold || fonts.helveticaNeueBold,
  },
  itemCountText: {
    fontSize: 12,
    color: colors.muted,
  },
  cardBox: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLabel: {
    fontSize: 13,
    color: colors.muted,
    fontFamily: fonts.interRegular,
  },
  rowValue: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.ink,
    fontFamily: fonts.interMedium,
  },
  rowValueBold: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
    fontFamily: fonts.interBold,
  },
  monoValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink,
    fontFamily: fonts.monoRegular || fonts.interRegular,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  receiptNote: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 6,
    paddingLeft: 4,
    fontFamily: fonts.interRegular,
  },
  /* Delivery Card */
  recipientName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
    fontFamily: fonts.interBold,
  },
  deliveryAddress: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
    fontFamily: fonts.interRegular,
  },
  etaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  etaDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.volt,
  },
  etaText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink,
    fontFamily: fonts.interSemiBold,
  },
  courierTag: {
    backgroundColor: colors.surface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  courierText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.muted,
  },
  /* Items List */
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  itemThumb: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: colors.surface,
  },
  itemBadge: {
    width: 40,
    height: 40,
    borderRadius: 6,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.muted,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
    fontFamily: fonts.interSemiBold,
  },
  itemVariant: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
    fontFamily: fonts.interRegular,
  },
  itemPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
    fontFamily: fonts.interSemiBold,
  },
  mutedText: {
    fontSize: 12,
    color: colors.muted,
  },
  /* Bottom Buttons */
  actionArea: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.paper,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
    fontFamily: fonts.interBold,
  },
  primaryButton: {
    flex: 1,
    minHeight: 48,
    backgroundColor: colors.volt,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonPressed: {
    opacity: 0.85,
  },
  primaryButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: 0.3,
    fontFamily: fonts.interBold,
  },
  pressed: {
    opacity: 0.7,
  },
  /* Modal Styles */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.paper,
    borderRadius: 16,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  modalCloseBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    fontSize: 16,
    color: colors.muted,
  },
  modalScroll: {
    maxHeight: 300,
  },
  receiptStoreName: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.ink,
    marginBottom: 4,
  },
  receiptMeta: {
    fontSize: 11,
    color: colors.muted,
    fontFamily: fonts.monoRegular || fonts.interRegular,
  },
  modalDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 10,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  receiptLabel: {
    fontSize: 12,
    color: colors.muted,
  },
  receiptVal: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.ink,
  },
  receiptTotalLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.ink,
  },
  receiptTotalVal: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.ink,
  },
  receiptFooterText: {
    fontSize: 10,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 8,
  },
  modalDoneButton: {
    backgroundColor: colors.volt,
    paddingVertical: 14,
    borderRadius: 9999,
    alignItems: 'center',
    marginTop: 16,
  },
  modalDoneButtonText: {
    color: colors.ink,
    fontWeight: '700',
    fontSize: 14,
    fontFamily: fonts.interBold,
  },
});
export default OrderConfirmationScreen;
