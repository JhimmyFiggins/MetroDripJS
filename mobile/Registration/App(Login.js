import { StatusBar } from 'expo-status-bar';
import { StyleSheet, FlatList,Text, View } from 'react-native';
import { Button } from 'react-native';
import Header from '../components/Header.jsx';
import Shop from '../Products/Shop.jsx';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ThemeProvider } from './theme.js';
import LoginScreen from './screens/LoginScreen.js';
import SignupScreen from './screens/SignupScreen.js';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen.js';

const Stack = createNativeStackNavigator();

// const data = [
//   { id: '1', name: 'Item 1' },
//   { id: '2', name: 'Item 2' },
//   { id: '3', name: 'Item 3' },
//   { id: '4', name: 'Item 4' },
// ];

export default function App() {
  return (
    <ThemeProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Login"
          screenOptions={{
            headerShown: false,
          }}
        >
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Signup" component={SignupScreen} />
          <Stack.Screen
            name="ForgotPassword"
            component={ForgotPasswordScreen}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flex: 1,
    // backgroundColor: 'rgb(255, 248, 240)',
    
  },
 
});
