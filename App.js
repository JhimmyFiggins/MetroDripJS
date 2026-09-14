import React from 'react';
import { View } from 'react-native';
import AppNavigator from './mobile/navigation/AppNavigator';
import { CartProvider } from './mobile/context/CartContext';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAppFonts } from './src/theme/font';

export default function App() {
    const { fontsLoaded } = useAppFonts();

    if (!fontsLoaded) {
        return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;
    }

    return (
        <SafeAreaProvider>
            <CartProvider>
                <StatusBar style="dark" />
                <AppNavigator />
            </CartProvider>
        </SafeAreaProvider>
    );
}
