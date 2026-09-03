// Load the exact font weights used by the MetroDrip Figma frame.
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
// Load the monospaced label and security-copy weights from the design.
import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono/400Regular';
import { IBMPlexMono_600SemiBold } from '@expo-google-fonts/ibm-plex-mono/600SemiBold';
// Use Expo Font's runtime hook so only the six imported weights enter the bundle.
import { useFonts } from 'expo-font';
// Use Expo's status-bar adapter so the screen behaves consistently on iOS and Android.
import { StatusBar } from 'expo-status-bar';
// Render a minimal white surface while the local font files are loading.
import { StyleSheet, View } from 'react-native';
// Supply safe-area measurements to the checkout screen and its fixed payment footer.
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Import the completed checkout feature as the application's initial screen.
import { CheckoutScreen } from './src/screens/CheckoutScreen';
// Import the shared MetroDrip palette rather than duplicating raw colors.
import { colors } from './src/theme';

// Export the Expo application root.
export default function App() {
  // Load all Figma font weights at runtime, which also works in Expo web previews.
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    IBMPlexMono_400Regular,
    IBMPlexMono_600SemiBold,
  });

  // Avoid showing a layout with fallback fonts because it would visibly shift.
  if (!fontsLoaded) {
    // Keep the launch surface aligned with the Figma paper background.
    return <View style={styles.loadingSurface} />;
  }

  // Provide native insets, a dark system status bar, and the checkout feature.
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <CheckoutScreen />
    </SafeAreaProvider>
  );
}

// Keep root-only styles colocated with the application root.
const styles = StyleSheet.create({
  // Fill the screen with the design's paper color while fonts load.
  loadingSurface: {
    flex: 1,
    backgroundColor: colors.paper,
  },
});