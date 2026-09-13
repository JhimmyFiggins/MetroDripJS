// Import React state for the editable form, payment radios, and selector modal.
import { useState } from 'react';
// Import the native primitives required by this complete mobile checkout surface.
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
// Read the device bottom inset for the fixed, safe payment footer.
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNavigation } from '@react-navigation/native';

// Compose the screen from focused reusable controls.
import { CheckoutProgress } from '../components/CheckoutProgress';
import { LabeledField } from '../components/LabeledField';
import { PaymentOption } from '../components/PaymentOption';
import { PayMongoFooter } from '../components/PayMongoFooter';
// Import the exact Figma content and local formatter.
import {
  deliveryZones,
  formatPeso,
  initialDeliveryAddress,
  orderTotal,
  paymentOptions,
} from '../data/checkout';
// Import the shared visual tokens.
import { colors, fonts } from '../theme';

// Render the Figma status bar only on web, where no native OS status bar exists.
function WebStatusBar() {
  // Native devices already supply this 44-pixel system area.
  if (Platform.OS !== 'web') {
    // Avoid duplicating the device clock and signal indicators.
    return null;
  }

  // Reproduce the exact status strip visible in the supplied 390×844 frame.
  return (
    <View style={styles.webStatusBar}>
      <Text style={styles.webTime}>9:41</Text>
      <View style={styles.webIndicators}>
        <Text style={styles.webIndicatorText}>▪▪▪</Text>
        <Text style={styles.webIndicatorText}>◗</Text>
        <Text style={styles.webIndicatorText}>▰</Text>
      </View>
    </View>
  );
}

// Export the complete Checkout & Payment module.
export function CheckoutScreen() {
  const navigation = useNavigation();
  // Track delivery values as one object so the future API payload is straightforward.
  const [address, setAddress] = useState(initialDeliveryAddress);
  // Match Figma by selecting GCash initially.
  const [paymentMethod, setPaymentMethod] = useState('gcash');
  // Open the custom selector only when the zone control is pressed.
  const [zoneSelectorVisible, setZoneSelectorVisible] = useState(false);
  // Store invalid field names without altering the pristine initial design.
  const [invalidFields, setInvalidFields] = useState([]);
  // Read the device's home-indicator inset for the fixed payment area.
  const insets = useSafeAreaInsets();

  // Update one address value while preserving the rest of the controlled form.
  const updateAddress = (field, value) => {
    // Write the edited value into its named field.
    setAddress((current) => ({ ...current, [field]: value }));
    // Clear that field's error as soon as the customer corrects it.
    setInvalidFields((current) => current.filter((item) => item !== field));
  };

  // Validate the user-editable delivery payload before initiating payment.
  const handlePay = () => {
    // Require every displayed delivery field for this demonstration module.
    const emptyFields = Object.keys(address).filter(
      (field) => address[field].trim().length === 0,
    );
    // Persist validation state so invalid controls receive a visible red border.
    setInvalidFields(emptyFields);

    // Stop before the payment handoff when delivery data is incomplete.
    if (emptyFields.length > 0) {
      // Explain the correction without discarding the customer's existing values.
      Alert.alert('Check your details', 'Complete every delivery field before paying.');
      // Exit the handler before producing a simulated success state.
      return;
    }

    // Simulate the backend handoff because no PayMongo key or order API was supplied.
    Alert.alert(
      'Ready for payment',
      `${paymentOptions.find((option) => option.id === paymentMethod)?.title} selected for ${formatPeso(orderTotal)}.`,
    );
  };

  // Render the responsive 390-pixel design shell and safe footer.
  return (
    <SafeAreaView edges={Platform.OS === 'web' ? [] : ['top']} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.phoneCanvas}>
          <WebStatusBar />

          <View style={styles.header}>
            <View style={styles.headerTitleGroup}>
              <Pressable accessibilityLabel="Go back" hitSlop={10} style={styles.backButton}
                onPress={() => navigation.navigate('Shop')}
              >
                <Text style={styles.backIcon}>‹</Text>
              </Pressable>
              <Text style={styles.headerTitle}>Checkout</Text>
            </View>
            <Text accessibilityLabel="Secure checkout" style={styles.lockIcon}>
              🔒
            </Text>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.scrollView}
          >
            <CheckoutProgress />

            <View style={styles.form}>
              <Text style={styles.sectionTitle}>Delivery address</Text>

              <LabeledField
                accessibilityLabel="Full name"
                error={invalidFields.includes('fullName') ? 'Full name is required' : undefined}
                label="FULL NAME"
                onChangeText={(value) => updateAddress('fullName', value)}
                value={address.fullName}
              />

              <View style={styles.fieldRow}>
                <LabeledField
                  accessibilityLabel="Mobile"
                  error={invalidFields.includes('mobile') ? 'Mobile is required' : undefined}
                  keyboardType="phone-pad"
                  label="MOBILE"
                  onChangeText={(value) => updateAddress('mobile', value)}
                  style={styles.flexField}
                  value={address.mobile}
                />
                <LabeledField
                  accessibilityLabel="Email"
                  autoCapitalize="none"
                  error={invalidFields.includes('email') ? 'Email is required' : undefined}
                  keyboardType="email-address"
                  label="EMAIL"
                  onChangeText={(value) => updateAddress('email', value)}
                  style={styles.flexField}
                  value={address.email}
                />
              </View>

              <LabeledField
                accessibilityLabel="Address"
                error={invalidFields.includes('address') ? 'Address is required' : undefined}
                label="ADDRESS"
                onChangeText={(value) => updateAddress('address', value)}
                value={address.address}
              />

              <View style={styles.fieldRow}>
                <LabeledField
                  accessibilityLabel="City"
                  error={invalidFields.includes('city') ? 'City is required' : undefined}
                  label="CITY"
                  onChangeText={(value) => updateAddress('city', value)}
                  style={styles.flexField}
                  value={address.city}
                />

                <Pressable
                  accessibilityLabel={`Delivery zone, ${address.zone}`}
                  accessibilityRole="button"
                  onPress={() => setZoneSelectorVisible(true)}
                  style={({ pressed }) => [
                    styles.zoneField,
                    invalidFields.includes('zone') ? styles.invalidField : undefined,
                    pressed ? styles.pressed : undefined,
                  ]}
                >
                  <Text style={styles.zoneLabel}>ZONE</Text>
                  <View style={styles.zoneValueRow}>
                    <Text numberOfLines={1} style={styles.zoneValue}>
                      {address.zone}
                    </Text>
                    <Text style={styles.chevron}>⌄</Text>
                  </View>
                </Pressable>
              </View>

              <Text style={styles.sectionTitle}>Payment method</Text>

              {paymentOptions.map((option) => (
                <PaymentOption
                  key={option.id}
                  onSelect={setPaymentMethod}
                  option={option}
                  selected={paymentMethod === option.id}
                />
              ))}
            </View>

            <View style={styles.scrollSpacer} />
          </ScrollView>

          <View style={[styles.paymentFooter, { paddingBottom: Math.max(insets.bottom, 30) }]}>
            <Pressable
              accessibilityLabel={`Pay ${formatPeso(orderTotal)}`}
              accessibilityRole="button"
              onPress={handlePay}
              style={({ pressed }) => [styles.payButton, pressed ? styles.payButtonPressed : undefined]}
            >
              <Text style={styles.payButtonText}>Pay {formatPeso(orderTotal)}</Text>
            </Pressable>
            <PayMongoFooter />
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal
        animationType="fade"
        onRequestClose={() => setZoneSelectorVisible(false)}
        transparent
        visible={zoneSelectorVisible}
      >
        <Pressable
          accessibilityLabel="Close delivery zone selector"
          onPress={() => setZoneSelectorVisible(false)}
          style={styles.modalBackdrop}
        >
          <View style={styles.zoneSheet}>
            <Text style={styles.zoneSheetTitle}>Delivery zone</Text>
            {deliveryZones.map((zone) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: address.zone === zone }}
                key={zone}
                onPress={() => {
                  updateAddress('zone', zone);
                  setZoneSelectorVisible(false);
                }}
                style={({ pressed }) => [styles.zoneChoice, pressed ? styles.pressed : undefined]}
              >
                <Text style={styles.zoneChoiceText}>{zone}</Text>
                <Text style={styles.zoneChoiceCheck}>{address.zone === zone ? '●' : '○'}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// Translate every Figma measurement into native React Native styles.
const styles = StyleSheet.create({
  // Fill the device and center the fixed-width reference canvas on wider displays.
  safeArea: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: colors.paper,
  },
  // Allow keyboard avoidance to resize the complete screen.
  keyboardView: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
  },
  // Preserve the 390-pixel Figma width while remaining usable on narrower devices.
  phoneCanvas: {
    flex: 1,
    width: '100%',
    maxWidth: 390,
    backgroundColor: colors.paper,
  },
  // Recreate the iOS status-bar area only for browser-based visual validation.
  webStatusBar: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  // Match the 14-pixel semibold system time in the reference.
  webTime: {
    color: colors.ink,
    fontFamily: fonts.interSemiBold,
    fontSize: 14,
    lineHeight: 17,
  },
  // Keep the three Figma status symbols grouped at the right edge.
  webIndicators: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  // Match the compact indicator glyph size from the design.
  webIndicatorText: {
    color: colors.ink,
    fontFamily: fonts.interRegular,
    fontSize: 11,
    lineHeight: 15,
  },
  // Match the 52-pixel checkout navigation bar and one-pixel separators.
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    backgroundColor: colors.paper,
  },
  // Align the back affordance and title with a 10-pixel design gap.
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  // Give the narrow chevron a reliable 10-pixel visual width.
  backButton: {
    width: 10,
    height: 31,
    justifyContent: 'center',
  },
  // Match the 26-pixel Figma chevron glyph.
  backIcon: {
    color: colors.ink,
    fontFamily: fonts.interRegular,
    fontSize: 26,
    lineHeight: 31,
  },
  // Match the 17-pixel bold checkout title.
  headerTitle: {
    color: colors.ink,
    fontFamily: fonts.interBold,
    fontSize: 17,
    lineHeight: 21,
  },
  // Use the design's lock-as-text treatment and exact size.
  lockIcon: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 18,
  },
  // Let the address/payment region consume all space above the fixed footer.
  scrollView: {
    flex: 1,
  },
  // Keep scroll content at full canvas width.
  scrollContent: {
    flexGrow: 1,
  },
  // Apply the design's 16-pixel side inset and 12-pixel vertical rhythm.
  form: {
    width: '100%',
    gap: 12,
    paddingHorizontal: 16,
  },
  // Match both Figma section headings.
  sectionTitle: {
    color: colors.ink,
    fontFamily: fonts.interBold,
    fontSize: 16,
    lineHeight: 19,
  },
  // Place paired fields side-by-side with a 10-pixel gap.
  fieldRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
  },
  // Give each paired field an equal share of available width.
  flexField: {
    flex: 1,
    minWidth: 0,
  },
  // Reproduce the selected two-pixel zone field from the Figma frame.
  zoneField: {
    flex: 1,
    minWidth: 0,
    height: 54,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingTop: 7,
    paddingBottom: 5,
    backgroundColor: colors.paper,
  },
  // Reuse the validation color without affecting the initial frame.
  invalidField: {
    borderColor: colors.danger,
  },
  // Match the zone's tiny monospaced uppercase label.
  zoneLabel: {
    color: colors.ink,
    fontFamily: fonts.monoRegular,
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.8,
  },
  // Align the selected zone and dropdown chevron on one baseline.
  zoneValueRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  // Match the 13-pixel semibold selected zone copy.
  zoneValue: {
    flex: 1,
    color: colors.ink,
    fontFamily: fonts.interSemiBold,
    fontSize: 13,
    lineHeight: 17,
  },
  // De-emphasize the dropdown affordance exactly like Figma.
  chevron: {
    color: colors.muted,
    fontFamily: fonts.interRegular,
    fontSize: 13,
    lineHeight: 17,
  },
  // Preserve the small blank tail at the bottom of the Figma scroll content.
  scrollSpacer: {
    height: 12,
  },
  // Reproduce the fixed white footer and top divider.
  paymentFooter: {
    width: '100%',
    gap: 8,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingTop: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.paper,
  },
  // Match the 54-pixel full-width volt pill.
  payButton: {
    width: '100%',
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.volt,
  },
  // Darken the button slightly during touch feedback.
  payButtonPressed: {
    opacity: 0.78,
  },
  // Match the 16-pixel bold payment call to action.
  payButtonText: {
    color: colors.onVolt,
    fontFamily: fonts.interBold,
    fontSize: 16,
    lineHeight: 19,
  },
  // Apply restrained opacity feedback to selector interactions.
  pressed: {
    opacity: 0.7,
  },
  // Dim the app behind the delivery-zone selection sheet.
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: colors.overlay,
  },
  // Present the selector as a compact, mobile-friendly bottom sheet.
  zoneSheet: {
    width: '100%',
    maxWidth: 390,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 30,
    backgroundColor: colors.paper,
  },
  // Introduce the zone options with the existing section-title hierarchy.
  zoneSheetTitle: {
    marginBottom: 10,
    color: colors.ink,
    fontFamily: fonts.interBold,
    fontSize: 18,
    lineHeight: 22,
  },
  // Give every zone a generous 48-pixel touch target.
  zoneChoice: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  // Match regular body copy in the selector.
  zoneChoiceText: {
    color: colors.ink,
    fontFamily: fonts.interRegular,
    fontSize: 14,
    lineHeight: 18,
  },
  // Use volt for the selected option indicator.
  zoneChoiceCheck: {
    color: colors.volt,
    fontFamily: fonts.interBold,
    fontSize: 18,
    lineHeight: 22,
  },
});