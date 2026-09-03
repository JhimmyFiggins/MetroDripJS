import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Import font hook and colors
import { useAppFonts } from './src/theme/font';
import Header from './mobile/components/Header.jsx';
import Shop from './mobile/Products/Shop.jsx';

export default function App() {
  const { fontsLoaded } = useAppFonts();

  if (!fontsLoaded) {
    return <View style={styles.container} />;
  }

  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        <Header />
        <Shop />
        <StatusBar style="auto" />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flex: 1,
  },
});