// Import React state for the editable form, payment radios, and selector modal.
import { useState } from 'react';
// Import native primitives required by this adaptive checkout surface.
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
// Read device safe area insets for fixed elements.
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useNavigation } from '@react-navigation/native';

// Compose the screen from focused reusable controls.
import { CheckoutProgress } from '../components/CheckoutProgress';
import { LabeledField } from '../components/LabeledField';
import { PaymentOption } from '../components/PaymentOption';
import { PayMongoFooter } from '../components/PayMongoFooter';
// Import the shared checkout data and formatter.
import {
  deliveryZones,
  formatPeso,
  initialDeliveryAddress,
  orderTotal,
  paymentOptions,
} from '../data/checkout';
// Import shared visual tokens.
import { colors, fonts } from '../theme';

// Export the complete, fully responsive Checkout & Payment module.
export function CheckoutScreen() {
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  // 768px breakpoint distinguishes mobile devices from tablets and desktop screens.
  const isWide = width >= 768;

  // Track delivery values as one object for structured form handling.
  const [address, setAddress] = useState(initialDeliveryAddress);
  // Default to GCash.
  const [paymentMethod, setPaymentMethod] = useState('gcash');
  // Control delivery zone selector modal visibility.
  const [zoneSelectorVisible, setZoneSelectorVisible] = useState(false);
  // Store invalid field names without altering pristine state.
  const [invalidFields, setInvalidFields] = useState([]);
  // Read safe area insets.
  const insets = useSafeAreaInsets();

  // Update one address value while clearing its validation error upon editing.
  const updateAddress = (field, value) => {
    setAddress((current) => ({ ...current, [field]: value }));
    setInvalidFields((current) => current.filter((item) => item !== field));
  };

  // Cross-platform alert messaging (react-native-web's Alert.alert is an empty stub).
  const showAlert = (title, message) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(`${title}\n\n${message}`);
      }
    } else {
      Alert.alert(title, message);
    }
  };

  // Validate all fields before simulated payment initiation.
  const handlePay = () => {
    const emptyFields = Object.keys(address).filter(
      (field) => address[field].trim().length === 0,
    );
    setInvalidFields(emptyFields);

    if (emptyFields.length > 0) {
      showAlert('Check your details', 'Complete every delivery field before paying.');
      return;
    }

    showAlert(
      'Ready for payment',
      `${paymentOptions.find((option) => option.id === paymentMethod)?.title} selected for ${formatPeso(orderTotal)}.`,
    );
  };

  // Delivery Address Form Section
  const deliverySection = (
    <View style={styles.formSection}>
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
    </View>
  );

  // Payment Method Options Section
  const paymentSection = (
    <View style={styles.paymentSection}>
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
  );

  return (
    <SafeAreaView edges={Platform.OS === 'web' ? [] : ['top']} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {/* Navigation Header spanning responsive container */}
        <View style={styles.header}>
          <View style={styles.headerInner}>
            <View style={styles.headerTitleGroup}>
              <Pressable
                accessibilityLabel="Go back"
                accessibilityRole="button"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.navigate('Cart');
                  }
                }}
                style={({ pressed }) => [styles.backButton, pressed ? styles.pressed : undefined]}
              >
                <Text style={styles.backIcon}>‹</Text>
              </Pressable>
              <Text style={styles.headerTitle}>Checkout</Text>
            </View>
            <Text accessibilityLabel="Secure checkout" style={styles.lockIcon}>
              🔒
            </Text>
          </View>
        </View>

        {/* Responsive Content: 2-Column Grid on Desktop/Tablet, 1-Column on Mobile */}
        {isWide ? (
          <ScrollView
            contentContainerStyle={styles.desktopScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.scrollView}
          >
            <View style={styles.desktopContainer}>
              <View style={styles.leftColumn}>
                <CheckoutProgress />
                {deliverySection}
              </View>

              <View style={styles.rightColumn}>
                <View style={styles.desktopPaymentPanel}>
                  {paymentSection}

                  <View style={styles.desktopActionArea}>
                    <Pressable
                      accessibilityLabel={`Pay ${formatPeso(orderTotal)}`}
                      accessibilityRole="button"
                      onPress={handlePay}
                      style={({ pressed }) => [
                        styles.payButton,
                        pressed ? styles.payButtonPressed : undefined,
                      ]}
                    >
                      <Text style={styles.payButtonText}>Pay {formatPeso(orderTotal)}</Text>
                    </Pressable>
                    <PayMongoFooter />
                  </View>
                </View>
              </View>
            </View>
          </ScrollView>
        ) : (
          <View style={styles.mobileContainer}>
            <ScrollView
              contentContainerStyle={styles.mobileScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.scrollView}
            >
              <CheckoutProgress />
              <View style={styles.mobileForm}>
                {deliverySection}
                {paymentSection}
              </View>
              <View style={styles.scrollSpacer} />
            </ScrollView>

            {/* Mobile Fixed Safe Payment Footer */}
            <View style={[styles.paymentFooter, { paddingBottom: Math.max(insets.bottom, 24) }]}>
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
        )}
      </KeyboardAvoidingView>

      {/* Zone Selector Modal: Bottom Sheet on Mobile, Centered Card on Desktop */}
      <Modal
        animationType="fade"
        onRequestClose={() => setZoneSelectorVisible(false)}
        transparent
        visible={zoneSelectorVisible}
      >
        <Pressable
          accessibilityLabel="Close delivery zone selector"
          onPress={() => setZoneSelectorVisible(false)}
          style={[styles.modalBackdrop, isWide ? styles.modalBackdropDesktop : undefined]}
        >
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={[styles.zoneSheet, isWide ? styles.zoneSheetDesktop : undefined]}
          >
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
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  keyboardView: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
    width: '100%',
  },

  // Navigation Header
  header: {
    width: '100%',
    height: 52,
    borderBottomWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInner: {
    width: '100%',
    maxWidth: 960,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    minWidth: 32,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    color: colors.ink,
    fontFamily: fonts.interRegular,
    fontSize: 26,
    lineHeight: 31,
  },
  headerTitle: {
    color: colors.ink,
    fontFamily: fonts.interBold,
    fontSize: 17,
    lineHeight: 21,
  },
  lockIcon: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 18,
  },

  // Mobile Layout Container (screens < 768px)
  mobileContainer: {
    flex: 1,
    width: '100%',
    maxWidth: 540,
    alignSelf: 'center',
    backgroundColor: colors.paper,
  },
  mobileScrollContent: {
    flexGrow: 1,
  },
  mobileForm: {
    width: '100%',
    paddingHorizontal: 16,
    gap: 20,
  },

  // Desktop/Tablet Layout (screens >= 768px)
  desktopScrollContent: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  desktopContainer: {
    width: '100%',
    maxWidth: 960,
    flexDirection: 'row',
    gap: 32,
    alignItems: 'flex-start',
  },
  leftColumn: {
    flex: 1.1,
    minWidth: 340,
    gap: 16,
  },
  rightColumn: {
    flex: 0.9,
    minWidth: 320,
    maxWidth: 420,
  },
  desktopPaymentPanel: {
    width: '100%',
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 20,
    gap: 20,
  },
  desktopActionArea: {
    marginTop: 4,
    gap: 10,
  },

  // Shared Form & Section Styles
  formSection: {
    width: '100%',
    gap: 12,
  },
  paymentSection: {
    width: '100%',
    gap: 12,
  },
  sectionTitle: {
    color: colors.ink,
    fontFamily: fonts.interBold,
    fontSize: 16,
    lineHeight: 20,
    marginBottom: 2,
  },
  fieldRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
  },
  flexField: {
    flex: 1,
    minWidth: 0,
  },
  zoneField: {
    flex: 1,
    minWidth: 0,
    height: 54,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingTop: 7,
    paddingBottom: 5,
    backgroundColor: colors.paper,
  },
  invalidField: {
    borderColor: colors.danger,
  },
  zoneLabel: {
    color: colors.ink,
    fontFamily: fonts.monoRegular,
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.8,
  },
  zoneValueRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  zoneValue: {
    flex: 1,
    color: colors.ink,
    fontFamily: fonts.interSemiBold,
    fontSize: 13,
    lineHeight: 17,
  },
  chevron: {
    color: colors.muted,
    fontFamily: fonts.interRegular,
    fontSize: 13,
    lineHeight: 17,
  },
  scrollSpacer: {
    height: 16,
  },

  // Fixed Footer on Mobile
  paymentFooter: {
    width: '100%',
    gap: 8,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingTop: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.paper,
  },

  // Action Button
  payButton: {
    width: '100%',
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.volt,
  },
  payButtonPressed: {
    opacity: 0.78,
  },
  payButtonText: {
    color: colors.onVolt,
    fontFamily: fonts.interBold,
    fontSize: 16,
    lineHeight: 19,
  },
  pressed: {
    opacity: 0.7,
  },

  // Modal Backdrop & Sheet
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    backgroundColor: colors.overlay,
  },
  modalBackdropDesktop: {
    justifyContent: 'center',
    padding: 24,
  },
  zoneSheet: {
    width: '100%',
    maxWidth: 540,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 30,
    backgroundColor: colors.paper,
  },
  zoneSheetDesktop: {
    maxWidth: 420,
    borderRadius: 18,
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  zoneSheetTitle: {
    marginBottom: 10,
    color: colors.ink,
    fontFamily: fonts.interBold,
    fontSize: 18,
    lineHeight: 22,
  },
  zoneChoice: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  zoneChoiceText: {
    color: colors.ink,
    fontFamily: fonts.interRegular,
    fontSize: 14,
    lineHeight: 18,
  },
  zoneChoiceCheck: {
    color: colors.volt,
    fontFamily: fonts.interBold,
    fontSize: 18,
    lineHeight: 22,
  },
});