// Import native accessible press and layout primitives.
import { Pressable, StyleSheet, Text, View } from 'react-native';

// Import shared tokens.
import { colors, fonts } from '../theme';

// Render one payment method as a native, keyboard-accessible radio control.
export function PaymentOption({ option, selected, onSelect }) {
  // Keep selection behavior in the parent while this component owns visuals.
  return (
    <Pressable
      accessibilityLabel={`${option.title}: ${option.subtitle}`}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={() => onSelect(option.id)}
      style={({ pressed }) => [
        styles.container,
        selected ? styles.containerSelected : styles.containerIdle,
        pressed ? styles.containerPressed : undefined,
      ]}
    >
      <View style={[styles.radio, selected ? styles.radioSelected : styles.radioIdle]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{option.title}</Text>
        <Text style={styles.subtitle}>{option.subtitle}</Text>
      </View>
    </Pressable>
  );
}

// Match the Figma payment-card dimensions and type hierarchy.
const styles = StyleSheet.create({
  // Keep every card exactly 58 pixels tall with 10-pixel corners.
  container: {
    height: 58,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 10,
    paddingHorizontal: 13,
    backgroundColor: colors.paper,
  },
  // Draw the stronger two-pixel border on the chosen method.
  containerSelected: {
    borderWidth: 2,
    borderColor: colors.ink,
  },
  // Draw the subtle one-pixel border on idle methods.
  containerIdle: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  // Provide restrained tactile feedback without changing layout.
  containerPressed: {
    opacity: 0.72,
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
  // Match the selected nine-pixel volt center dot.
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: colors.volt,
  },
  // Let payment copy fill the rest of the card without wrapping.
  copy: {
    flex: 1,
    gap: 1,
  },
  // Match the 14-pixel semibold payment title.
  title: {
    color: colors.ink,
    fontFamily: fonts.interSemiBold,
    fontSize: 14,
    lineHeight: 17,
  },
  // Match the smaller muted supporting line.
  subtitle: {
    color: colors.muted,
    fontFamily: fonts.interRegular,
    fontSize: 11,
    lineHeight: 13,
  },
});