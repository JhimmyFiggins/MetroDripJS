import React, { useState, useCallback } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  
} from 'react-native';
import { useAuth } from '../context/AuthContext';

import { SafeAreaProvider } from 'react-native-safe-area-context';

import { StatusBar } from 'expo-status-bar';

import { colors, fonts } from '../Checkout/src/theme';

import AdaptHeader from '../components/AdaptHeader';
import Footer from '../components/Footer';



export default function Wishlist({navigate}) {
  const { user } = useAuth();
  const navigation = useNavigation();
  const [wishlistItems, setWishlistItems] = useState([]);
  const screenTitle = 'Wish list'

  useFocusEffect(
    useCallback(() => {
      fetch('http://10.0.2.2:8000/wishlist/', {
        headers: {
          'X-Customer-ID': String(user.id),
        },
      })
        .then(response => response.json())
        .then(data => {
          setWishlistItems(data);
        })
        .catch(error => {
          console.error('Failed to load wishlist:', error);
        });
    }, [user])
  );
  return (
    <SafeAreaProvider>
      <View style={styles.screen}>
        <StatusBar style="dark" />
        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
        >
          <AdaptHeader screenTitle={screenTitle}/>

          {wishlistItems.length === 0 ? (
            <Text style={styles.emptyText}>
              Your wish list is empty
            </Text>
          ) : (
            wishlistItems.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.orderCard}
              onPress={() =>
                navigation.navigate('ProductDetails', {
                  selectedProductId: item.product_ref,
                })
              }
            >
              <View>
                <Text style={styles.orderNumber}>
                  {item.name}
                </Text>

                <Text style={styles.orderDetails}>
                  {item.price ? `₱${item.price}` : ''}
                </Text>
              </View>
<TouchableOpacity
                  onPress={() => {
                      fetch('http://10.0.2.2:8000/wishlist/', {
                          method: 'DELETE',
                          headers: {
                            'Content-Type': 'application/json',
                            'X-Customer-ID': String(user.id),
                          },
                          body: JSON.stringify({
                              id: item.id,
                          }),
                      })
                      .then(response => {
                          if (response.ok) {
                              setWishlistItems(current =>
                                  current.filter(wishlistItem => wishlistItem.id !== item.id)
                              );
                          }
                      })
                      .catch(error => {
                          console.error('Failed to remove wishlist item:', error);
                      });
                  }}
              >
                  <Text>Remove</Text>
              </TouchableOpacity>
              
            </TouchableOpacity>
            ))
          )}
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
  emptyText: {
    fontFamily: fonts.monoRegular,
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
    marginTop: 30,
  },
  

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
    marginTop: 10,
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