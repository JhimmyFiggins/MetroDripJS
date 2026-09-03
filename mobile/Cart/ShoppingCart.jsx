import React, { useState } from 'react';
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


const PRODUCTS = [
  {
    id: 1,
    name: 'METRODRIP OVERSIZED HOODIE',
    size: 'Large',
    color: 'Black / Lime',
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
];


export default function App() {
  const [cart, setCart] = useState(PRODUCTS);


  const changeQuantity = (id, amount) => {
    setCart(currentCart =>
      currentCart.map(item => {
        if (item.id === id) {
          return {
            ...item,
            quantity: Math.max(1, item.quantity + amount),
          };
        }


        return item;
      })
    );
  };


  const removeItem = id => {
    setCart(currentCart =>
      currentCart.filter(item => item.id !== id)
    );
  };


  const subtotal = cart.reduce(
    (total, item) => total + item.price * item.quantity,
    0
  );


  const shipping = subtotal > 0 ? 150 : 0;
  const discount = 0;
  const total = subtotal + shipping - discount;


  const formatPrice = price => {
    return `₱${price.toLocaleString('en-PH', {
      minimumFractionDigits: 2,
    })}`;
  };


  const checkout = () => {
    Alert.alert(
      'MetroDrip Checkout',
      'Proceeding to MetroDrip Checkout...'
    );
  };


  return (
    <SafeAreaView style={styles.safeArea}>
      {/* NAVIGATION */}
      <View style={styles.navbar}>
        <Text style={styles.logo}>
          METRO<Text style={styles.logoAccent}>DRIP</Text>
        </Text>


        <View style={styles.navLinks}>
          <Text style={styles.navLink}>SHOP</Text>
          <Text style={styles.navLink}>COLLECTIONS</Text>
          <Text style={styles.navLink}>ABOUT</Text>
          <Text style={styles.navLink}>CART</Text>
        </View>
      </View>


      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* PAGE HEADER */}
        <Text style={styles.pageLabel}>
          METRODRIP / CART
        </Text>


        <Text style={styles.title}>YOUR CART</Text>


        {cart.length === 0 ? (
          /* EMPTY CART */
          <View style={styles.emptyCart}>
            <Text style={styles.emptyTitle}>
              YOUR CART IS EMPTY
            </Text>


            <Text style={styles.emptyText}>
              Add some MetroDrip products to your cart.
            </Text>


            <TouchableOpacity style={styles.shopButton}>
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


                  <View style={styles.productDetails}>
                    <Text style={styles.productName}>
                      {item.name}
                    </Text>


                    <Text style={styles.productInfo}>
                      Size: {item.size}
                      {'\n'}
                      {item.color}
                    </Text>


                    <Text style={styles.productPrice}>
                      {formatPrice(item.price)}
                    </Text>


                    <TouchableOpacity
                      onPress={() => removeItem(item.id)}
                    >
                      <Text style={styles.remove}>
                        REMOVE
                      </Text>
                    </TouchableOpacity>
                  </View>


                  {/* QUANTITY */}
                  <View style={styles.itemActions}>
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


              <TouchableOpacity
                style={styles.checkout}
                onPress={checkout}
              >
                <Text style={styles.checkoutText}>
                  PROCEED TO CHECKOUT
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}


const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#111111',
  },


  /* NAVBAR */
  navbar: {
    height: 75,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
  },


  logo: {
    fontSize: 27,
    fontWeight: '900',
    letterSpacing: -2,
    color: '#FFFFFF',
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


  title: {
    color: '#FFFFFF',
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: -2,
    marginBottom: 35,
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
    backgroundColor: '#222222',
    marginRight: 15,
  },


  productDetails: {
    flex: 1,
  },


  productName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },


  productInfo: {
    color: '#999999',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 12,
  },


  productPrice: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
  },


  remove: {
    color: '#888888',
    fontSize: 11,
    marginTop: 10,
  },


  /* QUANTITY */
  itemActions: {
    marginLeft: 10,
    marginTop: 2,
  },


  quantity: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#555555',
  },


  quantityButton: {
    width: 32,
    height: 35,
    backgroundColor: '#222222',
    alignItems: 'center',
    justifyContent: 'center',
  },


  quantityButtonText: {
    color: '#FFFFFF',
    fontSize: 19,
  },


  quantityText: {
    width: 32,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 14,
  },


  /* SUMMARY */
  summary: {
    backgroundColor: '#1B1B1B',
    padding: 25,
    marginTop: 35,
    borderWidth: 1,
    borderColor: '#333333',
  },


  summaryTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
  },


  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 11,
  },


  summaryLabel: {
    color: '#BBBBBB',
    fontSize: 14,
  },


  summaryValue: {
    color: '#BBBBBB',
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
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
  },


  totalValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
  },


  /* CHECKOUT */
  checkout: {
    width: '100%',
    marginTop: 25,
    paddingVertical: 17,
    backgroundColor: '#BAFF00',
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
    borderWidth: 1,
    borderColor: '#333333',
    alignItems: 'center',
  },


  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 12,
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
    backgroundColor: '#BAFF00',
  },


  shopButtonText: {
    color: '#000000',
    fontWeight: 'bold',
  },
});

