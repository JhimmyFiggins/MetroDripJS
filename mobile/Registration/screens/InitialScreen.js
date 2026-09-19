import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../../Checkout/src/theme';

export default function InitialScreen({ navigation }) {
    const insets = useSafeAreaInsets();

    return (
        <View style={[styles.container, { paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 28) }]}>
            <StatusBar style="light" />

            {/* Central Branding & Tagline (Figma frame 63:10) */}
            <View style={styles.contentContainer}>
                <View style={styles.logoRow}>
                    <Text style={styles.logoMetro}>Metro</Text>
                    <Text style={styles.logoDrip}>Drip</Text>
                </View>

                <Text style={styles.subTextUpper}>METRO MANILA STREETWEAR</Text>

                {/* Decorative Streetwear Barcode (Figma node 63:15) */}
                <View style={styles.barcodeRow} accessible={false}>
                    <View style={styles.bThick} />
                    <View style={styles.bThin} />
                    <View style={styles.bMed} />
                    <View style={styles.bThin} />
                    <View style={styles.bThick} />
                    <View style={styles.bMed} />
                    <View style={styles.bThin} />
                    <View style={styles.bThick} />
                    <View style={styles.bThin} />
                    <View style={styles.bMed} />
                    <View style={styles.bThin} />
                    <View style={styles.bThick} />
                    <View style={styles.bMed} />
                    <View style={styles.bThin} />
                    <View style={styles.bThick} />
                    <View style={styles.bThin} />
                    <View style={styles.bMed} />
                    <View style={styles.bThick} />
                </View>

                <Text style={styles.subText}>Shop the drop from your phone.</Text>
                <Text style={styles.subText}>Track every order to your door.</Text>
            </View>

            {/* Bottom Actions (Figma frame 63:61) */}
            <View style={styles.buttonContainer}>
                {/* 1. Create account (Primary CTA, node 63:62) */}
                <TouchableOpacity 
                    style={styles.createAccountBtn}
                    onPress={() => navigation.navigate('Signup')}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Create account"
                >
                    <Text style={styles.createAccountBtnText}>Create account</Text>
                </TouchableOpacity>

                {/* 2. Sign in (Secondary outlined, node 63:64) */}
                <TouchableOpacity 
                    style={styles.signInBtn}
                    onPress={() => navigation.navigate('Login')}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Sign in"
                >
                    <Text style={styles.signInBtnText}>Sign in</Text>
                </TouchableOpacity>

                {/* 3. Continue as guest (Figma node 63:66) */}
                <TouchableOpacity 
                    style={styles.guestBtn}
                    onPress={() => navigation.navigate('Home', { guest: true })}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Continue as guest"
                >
                    <Text style={styles.guestBtnText}>Continue as guest</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#141414',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
    },
    contentContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 40,
    },
    logoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    logoMetro: {
        fontFamily: fonts.anton || 'Anton_400Regular',
        fontSize: 48,
        color: '#FFFFFF',
        letterSpacing: 0.5,
        ...Platform.select({
            web: { fontFamily: 'Anton_400Regular, Anton, Impact, sans-serif' },
        }),
    },
    logoDrip: {
        fontFamily: fonts.anton || 'Anton_400Regular',
        fontSize: 48,
        color: '#D3EE42',
        letterSpacing: 0.5,
        ...Platform.select({
            web: { fontFamily: 'Anton_400Regular, Anton, Impact, sans-serif' },
        }),
    },
    subTextUpper: {
        fontFamily: fonts.monoSemiBold || fonts.monoRegular,
        color: '#D3EE42',
        textAlign: 'center',
        fontSize: 11,
        letterSpacing: 2,
        marginTop: 8,
        marginBottom: 20,
    },
    barcodeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        height: 28,
        gap: 3,
        marginBottom: 22,
        opacity: 0.7,
    },
    bThick: {
        width: 4,
        height: 28,
        backgroundColor: '#FFFFFF',
        borderRadius: 1,
    },
    bMed: {
        width: 2.5,
        height: 28,
        backgroundColor: '#63635C',
        borderRadius: 1,
    },
    bThin: {
        width: 1.5,
        height: 28,
        backgroundColor: '#FFFFFF',
        borderRadius: 1,
    },
    subText: {
        fontFamily: fonts.interRegular,
        color: '#A8A8A0',
        textAlign: 'center',
        fontSize: 15,
        lineHeight: 23,
    },
    buttonContainer: {
        width: '100%',
        gap: 12,
        paddingBottom: 16,
    },
    createAccountBtn: {
        height: 54,
        backgroundColor: '#D3EE42',
        borderRadius: 9999,
        alignItems: 'center',
        justifyContent: 'center',
    },
    createAccountBtnText: {
        color: '#141414',
        textAlign: 'center',
        fontSize: 16,
        fontFamily: fonts.interBold,
    },
    signInBtn: {
        height: 54,
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: '#63635C',
        borderRadius: 9999,
        alignItems: 'center',
        justifyContent: 'center',
    },
    signInBtnText: {
        color: '#FFFFFF',
        textAlign: 'center',
        fontSize: 16,
        fontFamily: fonts.interBold,
    },
    guestBtn: {
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    guestBtnText: {
        color: '#A8A8A0',
        textAlign: 'center',
        fontSize: 14,
        fontFamily: fonts.interMedium,
        fontWeight: '500',
    },
});
