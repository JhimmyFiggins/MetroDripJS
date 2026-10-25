import React, { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';

import AdaptHeader from '../components/AdaptHeader';
import ProductImage from '../components/ProductImage';
import { useCart } from '../context/CartContext';
import {
  cartTotals,
  quantityLimit,
  quantityLimitMessage,
} from '../context/cartLogic';
import { buildOrderItems, CheckoutPayloadError } from '../Checkout/src/data/buildOrderPayload';
import { StatusBar } from 'expo-status-bar';


export default function CartScreen({navigation}) {
  const { cart, changeQuantity, removeItem } = useCart();
  const [cartNotice, setCartNotice] = useState('');

  const { subtotal, shipping, discount, total } = cartTotals(cart);

  const screenTitle = 'Your Cart';

  const formatPrice = price => {
    return `₱${price.toLocaleString('en-PH', {
      minimumFractionDigits: 2,
    })}`;
  };

  const handleBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Shop');
  };

  const handleIncrease = (item) => {
    const current = Number(item?.quantity);
    if (!Number.isSafeInteger(current) || current >= quantityLimit(item)) {
      const message = `${item.name}: ${quantityLimitMessage(item)}`;
      setCartNotice(message);
      Alert.alert('Quantity limit reached', message);
      return;
    }
    setCartNotice('');
    changeQuantity(item.id, 1);
  };

  const handleCheckout = () => {
    try {
      buildOrderItems(cart);
      navigation.navigate('Checkout');
    } catch (caught) {
      const message = caught instanceof CheckoutPayloadError
        ? caught.message
        : 'Review the quantities in your cart before checkout.';
      setCartNotice(message);
      Alert.alert('Update your cart', message);
    }
  };


  return (
    <SafeAreaProvider style={styles.safeArea}>
      <StatusBar style="dark" />
  

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
      
        <AdaptHeader onBack={handleBack} screenTitle={screenTitle}/>
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
              accessibilityLabel="Continue shopping"
              accessibilityRole="button"
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
                  <ProductImage
                    accessibilityLabel={item.name}
                    resizeMode="contain"
                    style={styles.productImage}
                    uri={item.image}
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
                      <Text style={styles.productInfo}>
                        ●
                      </Text>
                      <Text style={styles.productInfo}>
                        {item.fit}
                      </Text>
                    </View>
                    

                    <View style={styles.quantity}>
                      <TouchableOpacity
                        accessibilityLabel={`Decrease ${item.name} quantity`}
                        accessibilityRole="button"
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
                        accessibilityLabel={`Increase ${item.name} quantity`}
                        accessibilityHint={quantityLimitMessage(item)}
                        accessibilityRole="button"
                        style={styles.quantityButton}
                        onPress={() => handleIncrease(item)}
                      >
                        <Text style={styles.quantityButtonText}>
                          +
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <Text accessibilityLiveRegion="polite" style={styles.quantityLimitText}>
                      Maximum {quantityLimit(item)} for this variant
                    </Text>

                    {/* Remove Button */}
                    <TouchableOpacity
                      accessibilityLabel={`Remove ${item.name} from cart`}
                      accessibilityRole="button"
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
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
          {!!cartNotice && (
            <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={styles.quantityLimitText}>
              {cartNotice}
            </Text>
          )}
          <TouchableOpacity
            accessibilityLabel={`Proceed to checkout, total ${formatPrice(total)}`}
            accessibilityRole="button"
            style={styles.checkout}
            onPress={handleCheckout}
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
    color: '#D3EE42',
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
    color: '#D3EE42',
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

  quantityLimitText: {
    marginTop: 6,
    color: '#555555',
    fontSize: 10,
    lineHeight: 14,
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
    width: 44,
    height: 44,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
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
    backgroundColor: '#D3EE42',
    borderRadius: 25,
    alignItems: 'center',
  },


  checkoutText: {
    color: '#141414',
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
    backgroundColor: '#D3EE42',
  },


  shopButtonText: {
    color: '#141414',
    fontWeight: 'bold',
  },
});
