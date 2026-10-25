import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';

import InitialScreen from '../Registration/screens/InitialScreen';
import LoginScreen from '../Registration/screens/LoginScreen';
import SignupScreen from '../Registration/screens/SignupScreen';
import OtpScreen from '../Registration/screens/OtpScreen';
import ForgotPasswordScreen from '../Registration/screens/ForgotPasswordScreen.js';

import HomeScreen from '../Home/Home';

import ShopScreen from '../Products/Shop';

import WishlistScreen from '../Wishlist/Wishlist.jsx';

import OrderHistory from '../Orders/OrderHistory.jsx';
import OrderTracking from '../Orders/OrderTracking.jsx';

import NotificationsScreen from '../Notifications/NotificationsScreen.jsx';

import Account from '../Account_Management/Account.jsx';
import ProductDetailsScreen from '../Products/ProductDetails';

import ShoppingCart from '../Cart/CartScreen';
import CheckoutScreen from '../Checkout/App';

import { PaymentDetailsScreen } from '../Checkout/src/screens/PaymentDetailsScreen';
import OrderConfirmationScreen from '../Checkout/src/screens/OrderConfirmationScreen';

import ProfileManagement from '../Account_Management/ProfileManagement';
import { normalizeOrderId } from '../../src/services/orderService';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
    const navigationRef = useRef(null);
    useEffect(() => {
        let Notifications;
        try {
            Notifications = require('expo-notifications');
        } catch {
            return undefined;
        }

        Notifications.setNotificationHandler({
            handleNotification: async () => ({
                shouldShowAlert: true,
                shouldPlaySound: true,
                shouldSetBadge: false,
            }),
        });

        if (Platform.OS === 'android') {
            Notifications.setNotificationChannelAsync('default', {
                name: 'Default',
                importance: Notifications.AndroidImportance.MAX,
                vibrationPattern: [0, 250, 250, 250],
                lightColor: '#FF231F7C',
            }).catch(() => {});
        }

        Notifications.getLastNotificationResponseAsync()
            .then((response) => {
                const orderId = response?.notification?.request?.content?.data?.order_id;
                if (orderId) navigationRef.current?.navigate('OrderTracking', { orderId });
            })
            .catch(() => {});

        const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
            const orderId = response?.notification?.request?.content?.data?.order_id;
            if (orderId) navigationRef.current?.navigate('OrderTracking', { orderId });
        });
        return () => subscription.remove();
    }, []);
    return (
        <NavigationContainer
            ref={navigationRef}
            linking={{
                prefixes: ['metrodripjs://'],
                config: {
                    screens: {
                        Checkout: 'checkout',
                        PaymentDetails: {
                            path: 'payment-details',
                            parse: { orderId: normalizeOrderId },
                        },
                        History: 'orders',
                        OrderTracking: {
                            path: 'orders/:orderId',
                            parse: { orderId: normalizeOrderId },
                        },
                    },
                },
            }}
        >
            <StatusBar style="dark" />
            <Stack.Navigator initialRouteName="Initial" screenOptions={{ headerShown: false }}>
                <Stack.Screen name="Initial" component={InitialScreen} />
                <Stack.Screen name="Login" component={LoginScreen} />
                <Stack.Screen name="Signup" component={SignupScreen} />
                <Stack.Screen name="Otp" component={OtpScreen} />
                <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
                <Stack.Screen name="Home" component={HomeScreen} />
                <Stack.Screen name="Shop" component={ShopScreen} />
                <Stack.Screen name="Saved" component={WishlistScreen}/>
                <Stack.Screen name="History" component={OrderHistory} />
                <Stack.Screen name="OrderTracking" component={OrderTracking} />
                <Stack.Screen name="Notifications" component={NotificationsScreen} />
                <Stack.Screen name="ProductDetails" component={ProductDetailsScreen}/>
                <Stack.Screen name="Cart" component={ShoppingCart}/>
                <Stack.Screen name="Checkout" component={CheckoutScreen} />
                <Stack.Screen
                    name="PaymentDetails"
                    component={PaymentDetailsScreen}
                    getId={({ params }) => normalizeOrderId(params?.orderId) || 'active-checkout'}
                />
                <Stack.Screen name="OrderConfirmation" component={OrderConfirmationScreen} />
                <Stack.Screen name="Account" component={Account} />
                <Stack.Screen name="Profile" component={ProfileManagement} />
            </Stack.Navigator>
        </NavigationContainer>
    );
}
