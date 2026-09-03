// Import the native input building blocks.
import { StyleSheet, Text, TextInput, View } from 'react-native';

// Consume shared tokens to reproduce the Figma field styling.
import { colors, fonts } from '../theme';

// Render the compact uppercase label and editable value as one 54-pixel control.
export function LabeledField({
  label,
  accessibilityLabel,
  value,
  onChangeText,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  error,
  style,
}) {
  // Merge optional flex sizing with the fixed Figma field shell.
  return (
    <View style={[styles.wrapper, error ? styles.wrapperError : undefined, style]}>
      <Text style={[styles.label, error ? styles.errorText : undefined]}>{label}</Text>
      <TextInput
        accessibilityLabel={accessibilityLabel}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholderTextColor={colors.muted}
        selectionColor={colors.volt}
        style={styles.input}
        value={value}
      />
    </View>
  );
}

// Store the field measurements next to the reusable component.
const styles = StyleSheet.create({
  // Match the 10-pixel corner radius, 14-pixel inset, and 54-pixel height.
  wrapper: {
    height: 54,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 13,
    paddingTop: 8,
    paddingBottom: 6,
    backgroundColor: colors.paper,
  },
  // Recolor only the validation state, leaving initial Figma output untouched.
  wrapperError: {
    borderColor: colors.danger,
  },
  // Match IBM Plex Mono's tiny uppercase field label.
  label: {
    color: colors.muted,
    fontFamily: fonts.monoRegular,
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.8,
  },
  // Keep validation labels visually connected to their invalid control.
  errorText: {
    color: colors.danger,
  },
  // Remove platform input padding so the value sits on the Figma baseline.
  input: {
    flex: 1,
    color: colors.ink,
    fontFamily: fonts.interRegular,
    fontSize: 14,
    lineHeight: 17,
    paddingHorizontal: 0,
    paddingVertical: 0,
    margin: 0,
  },
});