// Import native accessible press and layout primitives.
import { Pressable, StyleSheet, Text, View } from 'react-native';

// Import shared tokens.
import { colors, fonts } from '../theme';

// Render one payment method as a native, keyboard-accessible radio control.
export function PaymentOption({ option, selected, onSelect }) {
  const isEnabled = option.enabled !== false;

  return (
    <Pressable
      accessibilityLabel={`${option.title}: ${option.subtitle}${isEnabled ? '' : ' (Temporarily Unavailable)'}`}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: !isEnabled }}
      disabled={!isEnabled}
      onPress={() => isEnabled && onSelect(option.id)}
      style={({ pressed }) => [
        styles.container,
        selected ? styles.containerSelected : styles.containerIdle,
        !isEnabled ? styles.containerDisabled : undefined,
        pressed && isEnabled ? styles.containerPressed : undefined,
      ]}
    >
      <View style={[styles.radio, selected ? styles.radioSelected : styles.radioIdle]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, !isEnabled && styles.titleDisabled]}>{option.title}</Text>
          {!isEnabled && (
            <View style={styles.unavailableBadge}>
              <Text style={styles.unavailableBadgeText}>
                {option.unavailableReason || 'Unavailable'}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.subtitle}>{option.subtitle}</Text>
      </View>
    </Pressable>
  );
}

// Match the Figma payment-card dimensions and type hierarchy.
const styles = StyleSheet.create({
  // Keep every card exactly 58 pixels tall with 12-pixel corners.
  container: {
    minHeight: 58,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.paper,
  },
  // Draw the stronger two-pixel border and volt tint background on the chosen method.
  containerSelected: {
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.voltTint || '#F7FBE8',
  },
  // Draw the subtle one-pixel border on idle methods.
  containerIdle: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.paper,
  },
  // Degraded / unavailable rail styling
  containerDisabled: {
    opacity: 0.48,
  },
  // Provide restrained tactile feedback.
  containerPressed: {
    opacity: 0.82,
    borderColor: colors.olive,
  },
  // Match the outer radio's 20-pixel circle.
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Use the design's primary ink for the selected ring.
  radioSelected: {
    borderWidth: 2,
    borderColor: colors.ink,
  },
  // Use a 1.5-pixel neutral ring for unselected options.
  radioIdle: {
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  // Match the selected nine-pixel volt center dot (#D3EE42).
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: colors.volt,
  },
  // Let payment copy fill the rest of the card without wrapping.
  copy: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  // Match the 14-pixel semibold payment title.
  title: {
    color: colors.ink,
    fontFamily: fonts.interSemiBold,
    fontSize: 14,
    lineHeight: 18,
  },
  titleDisabled: {
    color: colors.muted,
  },
  unavailableBadge: {
    backgroundColor: colors.surface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unavailableBadgeText: {
    color: colors.muted,
    fontFamily: fonts.monoRegular,
    fontSize: 10,
    lineHeight: 12,
  },
  // Match the smaller muted supporting line.
  subtitle: {
    color: colors.muted,
    fontFamily: fonts.interRegular,
    fontSize: 12,
    lineHeight: 15,
  },
});