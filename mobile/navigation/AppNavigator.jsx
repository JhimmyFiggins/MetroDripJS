import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';


import InitialScreen from '../Registration/screens/InitialScreen';
import LoginScreen from '../Registration/screens/LoginScreen';
import SignupScreen from '../Registration/screens/SignupScreen';

import HomeScreen from '../Home/Home';

import ShopScreen from '../Products/Shop';
import ShoppingCart from '../Cart/CartScreen';
import CheckoutScreen from '../Checkout/App';



import ProfileManagement from '../ProfileManagement/Account';


const Stack = createNativeStackNavigator();

export default function AppNavigator() {
    return (
        <NavigationContainer>
            <Stack.Navigator initialRouteName="Initial" screenOptions={{ headerShown: false }}>
                <Stack.Screen name="Initial" component={InitialScreen} />
                <Stack.Screen name="Login" component={LoginScreen} />
                <Stack.Screen name="Signup" component={SignupScreen} />
                <Stack.Screen name="Home" component={HomeScreen} />
                <Stack.Screen name="Shop" component={ShopScreen} />
                <Stack.Screen name="Cart" component={ShoppingCart}/>
                <Stack.Screen name="Checkout" component={CheckoutScreen} />
                <Stack.Screen name="Account" component={ProfileManagement} />
            </Stack.Navigator>
        </NavigationContainer>
    );
}