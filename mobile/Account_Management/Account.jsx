import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { colors, fonts } from '../Checkout/src/theme';

import AdaptHeader from '../components/AdaptHeader';
import Footer from '../components/Footer';


// User
import { useAuth } from '../context/AuthContext';

export default function Account({}) {
  const navigation = useNavigation();
  const screenTitle = 'My Account'
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

  const [orders, setOrders] = useState([]);
  const [wishlistItems, setWishlistItems] = useState([]);

  const [loading, setLoading] = useState(true);

  // User
  const { user, isGuest } = useAuth();


  const ordersLength = orders.length;

  useEffect(() => {
      fetch('http://10.0.2.2:8000/profile/')
          .then(response => response.json())
          .then(data => {
          setName(data.name);
          setEmail(data.email);
          setPhone(data.phone);
  
          const savedAddress = data.addresses?.address || '';
          setAddress(savedAddress);
          })
          .catch(error => {
          console.error('Failed to load profile:', error);
          });
      }, []);
      
  useEffect(() => {
      fetch('http://10.0.2.2:8000/orders/')
        .then(response => response.json())
        .then(data => {
          setOrders(data);
          setLoading(false);
        })
        .catch(error => {
          console.error('Failed to load orders:', error);
          setLoading(false);
        });
    }, []);

  useFocusEffect(
      useCallback(() => {
        fetch('http://10.0.2.2:8000/wishlist/')
          .then(response => response.json())
          .then(data => {
            setWishlistItems(data);
          })
          .catch(error => {
            console.error('Failed to load wishlist:', error);
          });
      }, [])
    );

  const orderList = orders
    .slice(0, 2)
    .map((order) => ({
      id: order.id,
      orderNumber: `MD-2026-${String(order.id).padStart(5, '0')}`,
      details: `${order.lines?.reduce((sum, line) => sum + line.quantity, 0) || 0} items · ₱${order.total} · ${new Date(order.created_at).toLocaleDateString('en-US')}`,
      status: order.status.charAt(0).toUpperCase() + order.status.slice(1),
    }));

  const wishlistList = wishlistItems
  .slice(0, 2)
  .map((item) => ({
    id: item.id,
    productRef: item.product_ref,
    name: item.name,
    details: `₱${item.price} · Added ${new Date(item.created_at).toLocaleDateString('en-US')}`,
  }));

  return (
    <SafeAreaProvider>
      <View style={styles.screen}>
        <StatusBar style="dark" />
        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
        >
          <AdaptHeader screenTitle={screenTitle}/>

          {isGuest ? (
            <View style={styles.profile}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>G</Text>
              </View>

              <View style={styles.profileInfo}>
                <Text style={styles.name}>Guest</Text>
                <Text style={styles.memberText}>NOT SIGNED IN</Text>
              </View>
            </View>
          ) : (
            <View style={styles.profile}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>JD</Text>
              </View>

              <View style={styles.profileInfo}>
                <Text style={styles.name}>Juan Dela Cruz</Text>

                <View style={styles.memberInfo}>
                  <Text style={styles.memberText}>
                    MEMBER SINCE 07.2026
                  </Text>

                  <Text style={styles.dot}>•</Text>

                  <Text style={styles.memberText}>
                    3 ORDERS
                  </Text>
                </View>
              </View>
            </View>
            )}
          {/* Order History */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>ORDER HISTORY</Text>

            <TouchableOpacity onPress={() => {navigation.navigate('History')}}>
              {orderList === 0 ? (<Text style={styles.viewAll}>No orders </Text>
              ):(
              <Text style={styles.viewAll}>View all · {ordersLength}</Text>)}
            </TouchableOpacity>
          </View>

          {orderList.length === 0 ? (
            <Text>No orders yet.</Text>
          ) : (
            orderList.map((order) => (
            <TouchableOpacity
              key={order.id}
              style={styles.orderCard}
              onPress={() => {}}
            >
              <View>
                <Text style={styles.orderNumber}>
                  {order.orderNumber}
                </Text>

                <Text style={styles.orderDetails}>
                  {order.details}
                </Text>
              </View>

              <View
                style={
                  order.status === 'delivered'
                    ? styles.deliveredBadge
                    : styles.shippedBadge
                }
                >
                <View style={styles.badgeDot} />

                <Text
                  style={
                    order.status === 'delivered'
                      ? styles.deliveredText
                      : styles.shippedText
                  }
                >
                  {order.status}
                </Text>
              </View>
            </TouchableOpacity>
               ))
              )}

          {/* Wishlist */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>WISHLIST</Text>

            <TouchableOpacity onPress={() => {navigation.navigate('Saved')}}>
              <Text style={styles.viewAll}>
                View all · {wishlistItems.length}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.wishlistRow}>
            {wishlistList.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.wishlistItem}
                onPress={() =>
                  navigation.navigate('ProductDetails', {
                    selectedProductId: item.productRef,
                  })
                }
              >
                <Text style={styles.placeholderText}>
                  {item.name?.charAt(0) || '?'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Account Options */}
          <TouchableOpacity
            style={styles.option}
            onPress={() => {navigation.navigate('Profile')}}
          >
            <Text style={styles.optionTitle}>
              Profile & saved addresses
            </Text>

            <Text style={styles.optionValue}>
              Unit 4B, Maginghawa St.
            </Text>

            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.option}
            onPress={() => {}}
          >
            <Text style={styles.optionTitle}>
              Help & FAQ
            </Text>

            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.option}
            onPress={() => {}}
          >
            <Text style={styles.optionTitle}>
              Contact us
            </Text>

            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.option}
            onPress={() => {}}
          >
            <Text style={styles.signOut}>
              Sign out
            </Text>

            <Text style={styles.arrow}>›</Text>
          </TouchableOpacity>
          
        </ScrollView>
        <Footer/>
      </View>
      {/* <Footer/> */}
    </SafeAreaProvider>
  );
}


const styles = StyleSheet.create({
  screen: {
    height: '100%',
    weight: '100%',
    backgroundColor: 'rgb(255, 255, 255)',
  },

  container: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 40,
  },

  // Header
  header: {
    height: 43,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },

  // back: {
  //   fontSize: 24,
  //   color: colors.ink,
  //   marginRight: 7,
  //   marginTop: -3,
  // },

  // headerTitle: {
  //   fontFamily: fonts.interBold,
  //   fontSize: 14,
  //   color: colors.ink,
  // },

  // Profile
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: 13,
    paddingBottom: 12,
  },

  avatar: {
    width: 39,
    height: 39,
    borderRadius: 20,
    backgroundColor: colors.volt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  avatarText: {
    fontFamily: fonts.interBold,
    fontSize: 15,
    color: colors.ink,
  },

  profileInfo: {
    flex: 1,
  },

  name: {
    fontFamily: fonts.interBold,
    fontSize: 17,
    color: colors.ink,
  },

  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },

  memberText: {
    fontFamily: fonts.monoRegular,
    fontSize: 8,
    color: colors.muted,
  },

  dot: {
    fontSize: 9,
    color: colors.muted,
    marginHorizontal: 6,
  },

  // Section
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    marginBottom: 8,
  },

  sectionTitle: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 15,
    color: colors.ink,
  },

  viewAll: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    color: colors.muted,
  },

  // Orders
  orderCard: {
    minHeight: 58,
    marginHorizontal: 10,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  orderNumber: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 12,
    color: colors.ink,
  },

  orderDetails: {
    fontFamily: fonts.monoRegular,
    fontSize: 11,
    color: colors.muted,
    marginTop: 3,
  },

  shippedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },

  deliveredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.volt,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },

  badgeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgb(163, 197, 41)',
    marginRight: 4,
  },

  shippedText: {
    fontFamily: fonts.interMedium,
    fontSize: 10,
    color: colors.paper,
  },

  deliveredText: {
    fontFamily: fonts.interMedium,
    fontSize: 10,
    color: colors.ink,
  },

  // Wishlist
  wishlistRow: {
    flexDirection: 'row',
    gap: 9,
    paddingHorizontal: 10,
    marginBottom: 12,
  },

  wishlistItem: {
    flex: 1,
    height: 79,
    backgroundColor: colors.surface,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  placeholderText: {
    fontFamily: fonts.interBold,
    fontSize: 44,
    color: colors.border,
  },

  // Options
  option: {
    minHeight: 40,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },

  optionTitle: {
    flex: 1,
    fontFamily: fonts.interSemiBold,
    fontSize: 13,
    color: colors.ink,
  },

  optionValue: {
    fontFamily: fonts.monoRegular,
    fontSize: 10,
    color: colors.muted,
    marginRight: 6,
  },

  arrow: {
    fontFamily: fonts.interRegular,
    fontSize: 20,
    color: colors.muted,
  },

  signOut: {
    flex: 1,
    fontFamily: fonts.interRegular,
    fontSize: 13,
    color: colors.danger,
  },
});