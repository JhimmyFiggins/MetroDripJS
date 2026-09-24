import React, { useState, useCallback } from 'react';
import { StyleSheet, TouchableOpacity, Text, View, Platform, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, colors } from '../Checkout/src/theme';
import * as notificationService from '../../src/services/notificationService';

export default function Header() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [unreadCount, setUnreadCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      notificationService
        .getUnreadCount()
        .then((count) => {
          if (active) setUnreadCount(count || 0);
        })
        .catch(() => {
          if (active) setUnreadCount(0);
        });
      return () => {
        active = false;
      };
    }, [])
  );

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top, 12) }]}>
      <TouchableOpacity 
        style={styles.logoButton}
        onPress={() => navigation.navigate('Home')}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="MetroDrip Home"
      >
        <Text style={styles.logoMetro}>Metro</Text>
        <Text style={styles.logoDrip}>Drip</Text>
      </TouchableOpacity>

      <View style={styles.actionsRow}>
        <TouchableOpacity 
          style={styles.iconButton}
          onPress={() => navigation.navigate('Notifications')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
        >
          <Ionicons name="notifications-outline" size={22} color={colors.ink} />
          {unreadCount > 0 && <View style={styles.notificationDot} />}
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.iconButton}
          onPress={() => navigation.navigate('Cart')}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Shopping Cart"
        >
          <Image 
            source={require('../assets/cart_icon.png')} 
            style={styles.cartIcon} 
            resizeMode="contain"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  logoButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoMetro: {
    fontFamily: fonts.anton || 'Anton_400Regular',
    fontSize: 26,
    color: '#141414',
    letterSpacing: -0.3,
    ...Platform.select({
      web: { fontFamily: 'Anton_400Regular, Anton, Impact, sans-serif' },
    }),
  },
  logoDrip: {
    fontFamily: fonts.anton || 'Anton_400Regular',
    fontSize: 26,
    color: '#5C6B12',
    letterSpacing: -0.3,
    ...Platform.select({
      web: { fontFamily: 'Anton_400Regular, Anton, Impact, sans-serif' },
    }),
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconButton: {
    padding: 6,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationDot: {
    position: 'absolute',
    top: 4,
    right: 5,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#C2282D',
  },
  cartIcon: {
    width: 24,
    height: 24,
  },
});