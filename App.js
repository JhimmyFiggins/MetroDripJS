import AppNavigator from './mobile/navigation/AppNavigator';
import { CartProvider } from './mobile/context/CartContext';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './mobile/context/AuthContext';

export default function App() {
    return (
        <SafeAreaProvider>
            <CartProvider>
                <StatusBar style="dark" />
                <AuthProvider>
                    <AppNavigator />
                </AuthProvider>
            </CartProvider>
        </SafeAreaProvider>
    );
}
