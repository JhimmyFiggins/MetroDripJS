import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const data = [
  { id: '0', name: 'MetroDrip' },
  { id: '1', name: '🔒' },
];

export default function Footer() {
  return (
    <View> 
        <View style={styles.container}>
        <NavItem icon="home-outline" label="Home" active />
        <NavItem icon="search-outline" label="Shop" />
        <NavItem icon="heart-outline" label="Saved" />
        <NavItem icon="receipt-outline" label="Orders" />
        <NavItem icon="person-circle-outline" label="Account" />
        </View>
    </View>

    
  );
}

const NavItem = ({ icon, label, active = false }) => {
  return (
    <View style={styles.item}>
      <Ionicons 
        name={icon} 
        size={24} 
        color={active ? '#000' : '#888'} 
      />
      <Text style={[styles.label, active && styles.activeLabel]}>{label}</Text>
      {active && <View style={styles.indicator} />}
    </View>
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