import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  SafeAreaView,
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';

import Footer from '../components/Footer';
import AdaptHeader from '../components/AdaptHeader';
import { useCart } from '../context/CartContext';
import { StatusBar } from 'expo-status-bar';
const PRODUCTS = [
  {
    id: 1,
    name: 'METRODRIP OVERSIZED HOODIE',
    size: 'Large',
    color: 'Lime',
    price: 1899,
    quantity: 1,
    image: 'https://via.placeholder.com/300x350',
  },
  {
    id: 2,
    name: 'METRODRIP GRAPHIC TEE',
    size: 'Medium',
    color: 'White / Black',
    price: 899,
    quantity: 2,
    image: 'https://via.placeholder.com/300x350',
  },
  {
    id: 3,
    name: 'METRODRIP GRAPHIC TEE',
    size: 'Medium',
    color: 'White / Black',
    price: 899,
    quantity: 2,
    image: 'https://via.placeholder.com/300x350',
  },
  {
    id: 4,
    name: 'METRODRIP GRAPHIC TEE',
    size: 'Medium',
    color: 'White / Black',
    price: 899,
    quantity: 2,
    image: 'https://via.placeholder.com/300x350',
  },
  {
    id: 5,
    name: 'METRODRIP GRAPHIC TEE',
    size: 'Medium',
    color: 'White / Black',
    price: 899,
    quantity: 2,
    image: 'https://via.placeholder.com/300x350',
  },
];


export default function CartScreen({navigation}) {
  const { cart, changeQuantity, removeItem } = useCart();

  const subtotal = cart.reduce(
    (total, item) => total + item.price * item.quantity,
    0
  );


  const shipping = subtotal > 0 ? 150 : 0;
  const discount = 0;
  const total = subtotal + shipping - discount;
  const screenTitle = 'Your Cart';

  const formatPrice = price => {
    return `₱${price.toLocaleString('en-PH', {
      minimumFractionDigits: 2,
    })}`;
  };


  // const checkout = () => {
  //   Alert.alert(
  //     'MetroDrip Checkout',
  //     'Proceeding to MetroDrip Checkout...'
  //   );
  // };


  return (
    <SafeAreaProvider style={styles.safeArea}>
      <StatusBar style="dark" />
      {/* NAVIGATION */}
      {/* <View style={styles.navbar}>
        <Text style={styles.logo}>
          METRO<Text style={styles.logoAccent}>DRIP</Text>
        </Text>


        <View style={styles.navLinks}>
          <Text style={styles.navLink}>SHOP</Text>
          <Text style={styles.navLink}>COLLECTIONS</Text>
          <Text style={styles.navLink}>ABOUT</Text>
          <Text style={styles.navLink}>CART</Text>
        </View>
      </View> */}


      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* PAGE HEADER */}
        {/* <View style={styles.header}>
          <TouchableOpacity 
          onPress={() => navigation.navigate('Shop')}
          >
            <Text style={styles.backButton}> <Ionicons name="chevron-back" size={24} color="#111111" /> </Text>
          </TouchableOpacity>

          <Text style={styles.title}>{screenTitle}</Text>
        </View> */}
        <AdaptHeader screenTitle={screenTitle}/>
        {cart.length === 0 ? (
          /* EMPTY CART */
          <View style={styles.emptyCart}>
            <Text style={styles.emptyTitle}>
              YOUR CART IS EMPTY
            </Text>


            <Text style={styles.emptyText}>
              Add some MetroDrip products to your cart.
            </Text>


            <TouchableOpacity 
              style={styles.shopButton}
              onPress={() => navigation.navigate('Shop')}
            >
              <Text style={styles.shopButtonText}>
                CONTINUE SHOPPING
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            {/* CART ITEMS */}
            <View style={styles.cartItems}>
              {cart.map(item => (
                <View
                  key={item.id}
                  style={styles.cartItem}
                >
                  <Image
                    source={{ uri: item.image }}
                    style={styles.productImage}
                  />

                  {/* Product Details and Quantity */}
                  <View style={styles.productDetails}>
                    <Text style={styles.productName}>
                      {item.name}
                    </Text>

                    <View style={styles.productInfoContainer}>
                      <Text style={styles.productInfo}>
                        {item.size}
                      </Text>
                      <Text style={styles.productInfo}>
                        ●
                      </Text>
                      <Text style={styles.productInfo}>
                        {item.color}
                      </Text>
                    </View>
                    

                    <View style={styles.quantity}>
                      <TouchableOpacity
                        style={styles.quantityButton}
                        onPress={() =>
                          changeQuantity(item.id, -1)
                        }
                      >
                        <Text style={styles.quantityButtonText}>
                          −
                        </Text>
                      </TouchableOpacity>


                      <Text style={styles.quantityText}>
                        {item.quantity}
                      </Text>


                      <TouchableOpacity
                        style={styles.quantityButton}
                        onPress={() =>
                          changeQuantity(item.id, 1)
                        }
                      >
                        <Text style={styles.quantityButtonText}>
                          +
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Remove Button */}
                    <TouchableOpacity
                      onPress={() => removeItem(item.id)}
                    >
                      <Text style={styles.remove}>
                        REMOVE
                      </Text>
                    </TouchableOpacity>

                    
                  </View>
                  

                  {/* Price */}
                  <View style={styles.priceContainer}>
                    <Text style={styles.productPrice}>
                      {formatPrice(item.price)}
                    </Text>
                  </View>

                </View>
              ))}
            </View>


            {/* ORDER SUMMARY */}
            <View style={styles.summary}>
              <Text style={styles.summaryTitle}>
                ORDER SUMMARY
              </Text>


              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  Subtotal
                </Text>


                <Text style={styles.summaryValue}>
                  {formatPrice(subtotal)}
                </Text>
              </View>


              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  Shipping
                </Text>


                <Text style={styles.summaryValue}>
                  {formatPrice(shipping)}
                </Text>
              </View>


              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  Discount
                </Text>


                <Text style={styles.summaryValue}>
                  {formatPrice(discount)}
                </Text>
              </View>


              <View style={styles.summaryTotal}>
                <Text style={styles.totalLabel}>
                  TOTAL
                </Text>


                <Text style={styles.totalValue}>
                  {formatPrice(total)}
                </Text>
              </View>

            </View>

            
          </View>
        )}
      </ScrollView>

      {/* Checkout/Footer */}
      {cart.length > 0 && (
        <View style={styles.checkoutContainer}>
          <TouchableOpacity
            style={styles.checkout}
            onPress={() => navigation.navigate('Checkout') }
          >
            <Text style={styles.checkoutText}>
              PROCEED TO CHECKOUT
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaProvider>
  );
}


const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    // backgroundColor: '#111111',
    backgroundColor: 'rgb(255, 255, 255)',
  },


  /* NAVBAR */
  // navbar: {
  //   height: 75,
  //   paddingHorizontal: 20,
  //   flexDirection: 'row',
  //   justifyContent: 'space-between',
  //   alignItems: 'center',
  //   borderBottomWidth: 1,
  //   borderBottomColor: '#333333',
  // },
  header: {
    flexDirection: 'row',
    alignItems: 'center',       // Centers both items vertically on the Y-axis
    justifyContent: 'center',    // Centers the title horizontally on the screen
    position: 'relative',       // Provides a reference point for the back button
    width: '100%',
    minHeight: 60,
  },  
  backButton: {
    color: '#111111',
    fontSize: 30,
    alignSelf: 'center',
    fontWeight: '900',
    right: 75,
    
  },
  title: {
    color: '#111111',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -1,
    justifyContent: 'center',
    marginRight: 30,
  },
  logo: {
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: -2,
    color: '#060505',
  },


  logoAccent: {
    color: '#BAFF00',
  },


  navLinks: {
    flexDirection: 'row',
    gap: 12,
  },


  navLink: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: 'bold',
  },


  /* PAGE */
  container: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 40,
  },


  pageLabel: {
    color: '#BAFF00',
    fontSize: 13,
    letterSpacing: 2,
    fontWeight: 'bold',
    marginBottom: 10,
  },


  /* CART */
  cartItems: {
    borderTopWidth: 1,
    borderTopColor: '#444444',
  },


  cartItem: {
    paddingVertical: 22,
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },


  productImage: {
    width: 95,
    height: 115,
    borderRadius: 10,
    backgroundColor: '#222222',
    marginRight: 15,
  },


  productDetails: {
    flex: 1,
  },


  productName: {
    color: '#111111',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 8,
  },

  productInfoContainer: {
    borderRadius: 5,
    borderWidth: 1,
    flexDirection: 'row',     
    alignItems: 'center',     
    
    justifyContent: 'center', 
    alignSelf: 'flex-start',  
    
    paddingHorizontal: 4,     
    paddingVertical: 2,       
  },
  productInfo: {
    color: '#999999',
    fontSize: 12,
    marginHorizontal: 2,
    textAlign: 'center',
  },

  priceContainer:{
    marginTop: 100,
  },
  productPrice: {
    color: '#111111',
    fontSize: 17,
    fontWeight: 'bold',
  },


  remove: {
    color: '#888888',
    fontSize: 11,
    marginTop: 10,
  },


  /* QUANTITY */

  quantity: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 5,
    borderColor: '#555555',
    marginTop: 10,
    
    justifyContent: 'center', //Center the contents
    alignSelf: 'flex-start', //To fit the border the contents
  },


  quantityButton: {
    width: 32,
    height: 35,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: '2',
  },


  quantityButtonText: {
    color: '#222222',
    fontSize: 19,
  },


  quantityText: {
    width: 32,
    textAlign: 'center',
    color: '#111111',
    fontSize: 14,
  },


  /* SUMMARY */
  summary: {
    backgroundColor: '#FFFFFF',
    padding: 25,
    marginTop: 35,
    borderWidth: 1,
    borderColor: '#333333',
    // borderStyle: 'dotted',
    borderRadius: 5,    
  },


  summaryTitle: {
    color: '#333333',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
  },


  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },


  summaryLabel: {
    color: '#111111',
    fontSize: 14,
  },


  summaryValue: {
    color: '#333333',
    fontSize: 14,
  },


  summaryTotal: {
    borderTopWidth: 1,
    borderTopColor: '#444444',
    marginTop: 15,
    paddingTop: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },


  totalLabel: {
    color: '#111111',
    fontSize: 22,
    fontWeight: 'bold',
  },


  totalValue: {
    color: '#111111',
    fontSize: 22,
    fontWeight: 'bold',
  },


  /* CHECKOUT */
  checkoutContainer:{
    paddingVertical: 20,
    paddingHorizontal: 30,
    backgroundColor:'rgb(255, 255, 255)',
    borderTopWidth: 2,
    borderTopColor: '#bcbbbb', 
    paddingTop: 15,            
              
    
    
  },
  checkout: {
    width: '100%',
    paddingVertical: 17,
    backgroundColor: 'rgb(186, 255, 0)',
    borderRadius: 25,
    alignItems: 'center',
  },


  checkoutText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '900',
  },


  /* EMPTY CART */
  emptyCart: {
    paddingVertical: 70,
    paddingHorizontal: 20,
    borderRadius: 12.5,
    borderWidth: 1,
    borderColor: '#333333',
    alignItems: 'center',

  },


  emptyTitle: {
    color: '#111111',
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 8,
    textAlign: 'center',
  },


  emptyText: {
    color: '#999999',
    textAlign: 'center',
  },


  shopButton: {
    marginTop: 25,
    paddingVertical: 15,
    paddingHorizontal: 25,
    borderRadius: 25,
    backgroundColor: '#BAFF00',
  },


  shopButtonText: {
    color: '#000000',
    fontWeight: 'bold',
  },
});

