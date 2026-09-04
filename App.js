import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View, Button } from 'react-native'; 
import { useState } from 'react'; 

import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';

import { useAppFonts } from './src/theme/font';
import Header from './mobile/components/Header.jsx';
import Footer from './mobile/components/Footer';

import Shop from './mobile/Products/Shop.jsx';
import Home from './mobile/Home/Home.jsx';
import Checkout from './mobile/Checkout/App';
import CheckoutHeader from './mobile/components/CheckoutHeader.jsx';
import LoginScreen from './mobile/Registration/screens/LoginScreen';
import Cart from './mobile/Cart/ShoppingCart';

export default function App() {
  const { fontsLoaded } = useAppFonts();


  const [currentPage, setCurrentPage] = useState('Shop');
  

  if (!fontsLoaded) {
    return <View style={styles.container} />;
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <View style={styles.container}>

          {currentPage === 'Checkout' && <CheckoutHeader />}
          {currentPage === 'Shop' && <Header />}
          {currentPage === 'Home' && <Header />}
          

          <View style={styles.content}>
            {currentPage === 'Home' && <Home />}
            {currentPage === 'Shop' && <Shop />}
            {currentPage === 'Checkout' && <Checkout />}
            {currentPage === 'LoginScreen' && <LoginScreen />}
            {currentPage === 'Cart' && <Cart />}
          </View>

          <StatusBar style="auto" />

        </View>
        <Footer/>
        </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flex: 1,
  },

  
  navigation: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginTop: 60,
  },

  
  content: {
    flex: 1,
  },
});