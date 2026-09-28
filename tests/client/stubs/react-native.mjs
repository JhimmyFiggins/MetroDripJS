// Minimal stand-in for the `react-native` runtime so client service modules can
// be imported under plain Node during contract tests.
export const Platform = { OS: 'ios', select: (obj) => obj[Platform.OS] ?? obj.default };

export const StyleSheet = {
  create: (styles) => styles,
  flatten: (style) => style,
  absoluteFill: {},
  hairlineWidth: 1,
};

export const View = 'View';
export const Text = 'Text';
export const Image = 'Image';
export const ScrollView = 'ScrollView';
export const Pressable = 'Pressable';
export const TextInput = 'TextInput';
export const TouchableOpacity = 'TouchableOpacity';
export const ActivityIndicator = 'ActivityIndicator';
export const KeyboardAvoidingView = 'KeyboardAvoidingView';
export const Modal = 'Modal';
export const SafeAreaView = 'SafeAreaView';
export const useWindowDimensions = () => ({ width: 390, height: 844, scale: 2, fontScale: 1 });
export const Alert = { alert() {} };
export const Linking = { openURL() {}, getInitialURL: async () => null };
export const AppState = { addEventListener: () => ({ remove() {} }) };
export const Keyboard = { dismiss() {} };
export const Dimensions = { get: () => ({ width: 390, height: 844, scale: 2, fontScale: 1 }) };
export const PixelRatio = { get: () => 2, roundToNearestPixel: (n) => Math.round(n) };
export const Animated = { Value: class {}, timing() {}, spring() {} };
