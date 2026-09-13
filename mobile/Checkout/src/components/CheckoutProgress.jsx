// Import the small set of native primitives needed by the progress indicator.
import { StyleSheet, Text, View } from 'react-native';

// Import shared MetroDrip typography and palette tokens.
import { colors, fonts } from '../theme';

// Render one numbered circle and its adjacent text label.
function Step({ number, label, active }) {
  // Select active colors without changing geometry.
  return (
    <View style={styles.step}>
      <View style={[styles.circle, active ? styles.circleActive : styles.circleInactive]}>
        <Text style={[styles.number, active ? styles.numberActive : styles.numberInactive]}>
          {number}
        </Text>
      </View>
      <Text style={[styles.label, active ? styles.labelActive : styles.labelInactive]}>
        {label}
      </Text>
    </View>
  );
}

// Render the Address → Shipping → Payment sequence shown above the form.
export function CheckoutProgress({ currentStep = 2 }) {
  const isPaymentStep = currentStep >= 3;
  return (
    <View
      accessibilityLabel={
        isPaymentStep ? 'Checkout progress: payment step' : 'Checkout progress: shipping step'
      }
      style={styles.container}
    >
      <Step active={currentStep >= 1} label="Address" number={1} />
      <View style={styles.connector} />
      <Step active={currentStep >= 2} label="Shipping" number={2} />
      <View style={[styles.connector, isPaymentStep && styles.connectorActive]} />
      <Step active={isPaymentStep} label="Payment" number={3} />
    </View>
  );
}

// Keep the progress geometry isolated and reusable.
const styles = StyleSheet.create({
  // Match the 52-pixel strip and 16-pixel horizontal frame inset.
  container: {
    height: 52,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 6,
  },
  // Keep each number aligned with its label.
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // Match the Figma step circle's 24-pixel diameter.
  circle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Apply the high-visibility MetroDrip volt token to completed steps.
  circleActive: {
    backgroundColor: colors.volt,
  },
  // Use the neutral surface token for the pending payment step.
  circleInactive: {
    backgroundColor: colors.surface,
  },
  // Match the 11-pixel IBM Plex step numbers.
  number: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 11,
    lineHeight: 14,
  },
  // Keep completed step numbers legible on volt.
  numberActive: {
    color: colors.onVolt,
  },
  // De-emphasize the upcoming payment step.
  numberInactive: {
    color: colors.muted,
  },
  // Match the compact 12-pixel Inter step labels.
  label: {
    fontFamily: fonts.interMedium,
    fontSize: 12,
    lineHeight: 15,
  },
  // Use primary ink for reached steps.
  labelActive: {
    color: colors.ink,
  },
  // Use muted ink for the pending step.
  labelInactive: {
    color: colors.muted,
  },
  // Let both 2-pixel connectors share the remaining row width.
  connector: {
    flex: 1,
    minWidth: 10,
    height: 2,
    backgroundColor: colors.border,
  },
  // Active connector line highlighted with volt per Figma node 452:23
  connectorActive: {
    backgroundColor: colors.volt,
  },
});