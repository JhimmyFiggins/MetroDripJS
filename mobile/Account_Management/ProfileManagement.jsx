import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';

import { colors, fonts } from '../Checkout/src/theme';
import { getProfile, updateProfile } from '../../src/services/authService';

import AdaptHeader from '../components/AdaptHeader';

export default function ProfileManagement() {
    const navigation = useNavigation();

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [memberSince, setMemberSince] = useState('');

    const screenTitle = "Profile Management"
    useEffect(() => {
    let active = true;
    getProfile()
        .then(data => {
        if (!active) return;
        setName(data.name || '');
        setEmail(data.email || '');
        setPhone(data.phone || '');

        const savedAddress = data.addresses?.address || '';
        setAddress(savedAddress);

        const joined = new Date(data.date_joined);
        if (!Number.isNaN(joined.getTime())) {
            setMemberSince(
            `${String(joined.getMonth() + 1).padStart(2, '0')}.${joined.getFullYear()}`
            );
        }
        })
        .catch(error => {
        console.error('Failed to load profile:', error);
        });
    return () => {
        active = false;
    };
    }, []);
    const handleSave = () => {
    updateProfile({
        name: name,
        email: email,
        phone: phone,
        addresses: {
            address: address,
        },
    })
        .then(() => {
        Alert.alert('Profile updated.');
        })
        .catch(error => {
        console.error('Failed to update profile:', error);
        Alert.alert('Failed to update profile.');
        });
    };

  return (
    <SafeAreaProvider>
          <View style={styles.screen}>
            <StatusBar style="dark" />
            <ScrollView
              contentContainerStyle={styles.container}
              showsVerticalScrollIndicator={false}
            >
              <AdaptHeader screenTitle={screenTitle}/>

          {/* Profile */}
            <View style={styles.profile}>
                <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                    {name
                        .split(' ')
                        .map(word => word.charAt(0))
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </Text>
                </View>

                <View style={styles.profileInfo}>
                    <Text style={styles.name}>{name}</Text>

                    <View style={styles.memberInfo}>
                    <Text style={styles.memberText}>
                        MEMBER SINCE {memberSince || '—'}
                    </Text>
                    </View>
                </View>
            </View>

          
          {/* Personal Information */}
            <Text style={styles.sectionTitle}>PERSONAL INFORMATION</Text>

            <View style={styles.field}>
            <Text style={styles.label}>FULL NAME</Text>

            <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Full name"
                placeholderTextColor={colors.muted}
            />
            </View>

            <View style={styles.field}>
            <Text style={styles.label}>EMAIL</Text>

            <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="Email address"
                placeholderTextColor={colors.muted}
                keyboardType="email-address"
                autoCapitalize="none"
            />
            </View>

            <View style={styles.field}>
            <Text style={styles.label}>PHONE NUMBER</Text>

            <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="Phone number"
                placeholderTextColor={colors.muted}
                keyboardType="phone-pad"
            />
            </View>
            {/* Saved Address */}
            <Text style={styles.sectionTitle}>SAVED ADDRESS</Text>

            <View style={styles.addressCard}>
            <Text style={styles.addressLabel}>PRIMARY ADDRESS</Text>

            <TextInput
                style={styles.addressInput}
                value={address}
                onChangeText={setAddress}
                placeholder="Saved address"
                placeholderTextColor={colors.muted}
                multiline
            />
            </View>

            {/* Address */}
            <Text style={styles.sectionTitle}>SAVED ADDRESS</Text>

             <View style={styles.addressCard}>
                <Text style={styles.addressLabel}>PRIMARY ADDRESS</Text>

                <TextInput
                style={styles.addressInput}
                value={address}
                onChangeText={setAddress}
                placeholder="Saved address"
                placeholderTextColor={colors.muted}
                multiline
                />
             </View>

          {/* Save */}
          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSave}
          >
            <Text style={styles.saveText}>SAVE CHANGES</Text>
          </TouchableOpacity>

          {/* Back */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backText}>Back to account</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        paddingTop: 50,
        backgroundColor: colors.paper,
    },

    container: {
        paddingBottom: 40,
    },

    profileSection: {
        alignItems: 'center',
        paddingTop: 28,
        paddingBottom: 34,
    },

    avatar: {
        width: 76,
        height: 76,
        borderRadius: 38,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
    },

    avatarText: {
        fontFamily: fonts.interBold,
        fontSize: 22,
        color: colors.ink,
    },

    profileName: {
        fontFamily: fonts.interBold,
        fontSize: 20,
        color: colors.ink,
        marginBottom: 6,
    },

    memberText: {
        fontFamily: fonts.monoRegular,
        fontSize: 10,
        color: colors.muted,
        letterSpacing: 0.5,
    },

    sectionTitle: {
        fontFamily: fonts.monoRegular,
        fontSize: 11,
        color: colors.ink,
        letterSpacing: 1,
        marginHorizontal: 20,
        marginBottom: 14,
        marginTop: 10,
        
    },

    field: {
        marginHorizontal: 20,
        marginBottom: 18,
    },

    label: {
        fontFamily: fonts.monoRegular,
        fontSize: 9,
        color: colors.muted,
        letterSpacing: 0.8,
        marginBottom: 7,
    },

    input: {
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        paddingHorizontal: 14,
        height: 48,
        fontFamily: fonts.interRegular,
        fontSize: 14,
        color: colors.ink,
    },

    addressCard: {
        marginHorizontal: 20,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        padding: 16,
        marginBottom: 26,
    },

    addressLabel: {
        fontFamily: fonts.monoRegular,
        fontSize: 9,
        color: colors.muted,
        letterSpacing: 0.8,
        marginBottom: 8,
    },

    addressInput: {
        fontFamily: fonts.interRegular,
        fontSize: 14,
        color: colors.ink,
        minHeight: 55,
        textAlignVertical: 'top',
    },

    saveButton: {
        marginHorizontal: 20,
        height: 50,
        backgroundColor: colors.ink,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
        backgroundColor: 'rgb(163, 197, 41)',
    },

    saveText: {
        fontFamily: fonts.monoRegular,
        fontSize: 11,
        color: colors.ink,
        letterSpacing: 1,
        
    },

    backButton: {
        alignItems: 'center',
        paddingVertical: 14,
    },

    backText: {
        fontFamily: fonts.monoRegular,
        fontSize: 11,
        color: colors.muted,
    },
    profile: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 34,
    },

    avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    },

    avatarText: {
    fontFamily: fonts.interBold,
    fontSize: 20,
    color: colors.ink,
    },

    profileInfo: {
    flex: 1,
    },

    name: {
    fontFamily: fonts.interBold,
    fontSize: 20,
    color: colors.ink,
    marginBottom: 8,
    },

    memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    },

    memberText: {
    fontFamily: fonts.monoRegular,
    fontSize: 10,
    color: colors.muted,
    letterSpacing: 0.5,
    },

    dot: {
    fontFamily: fonts.monoRegular,
    fontSize: 10,
    color: colors.muted,
    marginHorizontal: 8,
    },
});