import React from 'react';
import { StyleSheet, TouchableOpacity, Text, View, Platform, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, colors } from '../Checkout/src/theme';

export default function Header() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

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
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
        >
          <Ionicons name="notifications-outline" size={22} color={colors.ink} />
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartIcon: {
    width: 24,
    height: 24,
  },
});