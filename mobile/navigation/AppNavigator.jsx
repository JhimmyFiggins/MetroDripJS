import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';

import InitialScreen from '../Registration/screens/InitialScreen';
import LoginScreen from '../Registration/screens/LoginScreen';
import SignupScreen from '../Registration/screens/SignupScreen';

import HomeScreen from '../Home/Home';

import ShopScreen from '../Products/Shop';

import WishlistScreen from '../Wishlist/Wishlist.jsx';

import OrderHistory from '../Orders/OrderHistory.jsx';

import Account from '../Account_Management/Account.jsx';
import ProductDetailsScreen from '../Products/ProductDetails';

import ShoppingCart from '../Cart/CartScreen';
import CheckoutScreen from '../Checkout/App';

import { PaymentDetailsScreen } from '../Checkout/src/screens/PaymentDetailsScreen';
import OrderConfirmationScreen from '../Checkout/src/screens/OrderConfirmationScreen';

import ProfileManagement from '../Account_Management/ProfileManagement';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
    return (
        <NavigationContainer
            linking={{
                prefixes: [],
                config: {
                    screens: {
                        Checkout: 'checkout',
                        PaymentDetails: 'payment-details',
                        OrderConfirmation: 'order-confirmation',
                    },
                },
            }}
        >
            <StatusBar style="dark" />
            <Stack.Navigator initialRouteName="Initial" screenOptions={{ headerShown: false }}>
                <Stack.Screen name="Initial" component={InitialScreen} />
                <Stack.Screen name="Login" component={LoginScreen} />
                <Stack.Screen name="Signup" component={SignupScreen} />
                <Stack.Screen name="Home" component={HomeScreen} />
                <Stack.Screen name="Shop" component={ShopScreen} />
                <Stack.Screen name="Saved" component={WishlistScreen}/>
                <Stack.Screen name="History" component={OrderHistory} />
                <Stack.Screen name="ProductDetails" component={ProductDetailsScreen}/>
                <Stack.Screen name="Cart" component={ShoppingCart}/>
                <Stack.Screen name="Checkout" component={CheckoutScreen} />
                <Stack.Screen name="PaymentDetails" component={PaymentDetailsScreen} />
                <Stack.Screen name="OrderConfirmation" component={OrderConfirmationScreen} />
                <Stack.Screen name="Account" component={Account} />
                <Stack.Screen name="Profile" component={ProfileManagement} />
            </Stack.Navigator>
        </NavigationContainer>
    );
}
