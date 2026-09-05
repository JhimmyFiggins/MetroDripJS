import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useNavigation } from '@react-navigation/native';

export default function Footer() {
  const navigation = useNavigation();
  return (
    
        <View style={styles.container}>
        <NavItem
            icon="home-outline"
            label="Home"
            active
            onPress={() => navigation.navigate('Home')}
        />

        <NavItem icon="search-outline" label="Shop" onPress={() => navigation.navigate('Shop')} />
        <NavItem icon="heart-outline" label="Saved" onPress={() => navigation.navigate('Saved')} />
        <NavItem icon="receipt-outline" label="Orders" onPress={() => navigation.navigate('Cart')} />
        <NavItem icon="person-circle-outline" label="Account" onPress={() => navigation.navigate('Account')} />
        </View>
    

    
  );
}

const NavItem = ({ icon, label, active = false, onPress }) => {
  return (
      <TouchableOpacity 
        style={styles.item} 
        onPress={onPress}
      >
        <Ionicons 
          name={icon} 
          size={24} 
          color={active ? '#000' : '#888'} 
        />
        <Text style={[styles.label, active && styles.activeLabel]}>
          {label}
        </Text>
        {active && <View style={styles.indicator} />}
      </TouchableOpacity>
  );
};



const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: 'rgb(238, 238, 238)',
    },
    item: {
        alignItems: 'center',
        flex: 1,
    },
    label: {
        fontSize: 12,
        marginTop: 4,
        color: 'rgb(136, 136, 136)',
    },
    activeLabel: {
        color: 'rgb(0, 0, 0)',
        fontWeight: '600',
    },
    indicator: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#a4d65e', // Green dot under "Home"
        marginTop: 2,
    },
  
  
});