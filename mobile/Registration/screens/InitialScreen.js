import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../../Checkout/src/theme';

// Exact 44-stripe barcode pattern extracted from Figma frame 63:15 (334x34)
const BARCODE_STRIPES = [
    { w: 4, c: '#FFFFFF' }, { w: 2, c: '#63635C' }, { w: 2, c: '#63635C' }, { w: 2, c: '#FFFFFF' }, { w: 2, c: '#63635C' },
    { w: 4, c: '#63635C' }, { w: 2, c: '#FFFFFF' }, { w: 2, c: '#63635C' }, { w: 2, c: '#63635C' }, { w: 2, c: '#FFFFFF' },
    { w: 4, c: '#63635C' }, { w: 2, c: '#63635C' }, { w: 2, c: '#FFFFFF' }, { w: 2, c: '#63635C' }, { w: 2, c: '#63635C' },
    { w: 4, c: '#FFFFFF' }, { w: 2, c: '#63635C' }, { w: 2, c: '#63635C' }, { w: 2, c: '#FFFFFF' }, { w: 2, c: '#63635C' },
    { w: 4, c: '#63635C' }, { w: 2, c: '#FFFFFF' }, { w: 2, c: '#63635C' }, { w: 2, c: '#63635C' }, { w: 2, c: '#FFFFFF' },
    { w: 4, c: '#63635C' }, { w: 2, c: '#63635C' }, { w: 2, c: '#FFFFFF' }, { w: 2, c: '#63635C' }, { w: 2, c: '#63635C' },
    { w: 4, c: '#FFFFFF' }, { w: 2, c: '#63635C' }, { w: 2, c: '#63635C' }, { w: 2, c: '#FFFFFF' }, { w: 2, c: '#63635C' },
    { w: 4, c: '#63635C' }, { w: 2, c: '#FFFFFF' }, { w: 2, c: '#63635C' }, { w: 2, c: '#63635C' }, { w: 2, c: '#FFFFFF' },
    { w: 4, c: '#63635C' }, { w: 2, c: '#63635C' }, { w: 2, c: '#FFFFFF' }, { w: 2, c: '#63635C' },
];

export default function InitialScreen({ navigation }) {
    const insets = useSafeAreaInsets();

    return (
        <View style={[styles.container, { paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(insets.bottom, 44) }]}>
            <StatusBar style="light" backgroundColor="#141414" translucent />

            {/* Central Branding & Tagline (Figma frame 63:10) */}
            <View style={styles.contentContainer}>
                {/* Logo Frame (Figma frame 63:11, 175x66) */}
                <View style={styles.logoRow}>
                    <Text style={styles.logoMetro}>Metro</Text>
                    <Text style={styles.logoDrip}>Drip</Text>
                </View>

                {/* Subtitle Badge (Figma text 63:14) */}
                <Text style={styles.subTextUpper}>METRO MANILA STREETWEAR</Text>

                {/* Streetwear Barcode (Figma frame 63:15, 334x34) */}
                <View style={styles.barcodeFrame} accessible={false}>
                    <View style={styles.barcodeRow}>
                        {BARCODE_STRIPES.map((stripe, index) => (
                            <View
                                key={`stripe-${index}`}
                                style={{
                                    width: stripe.w,
                                    height: 34,
                                    backgroundColor: stripe.c,
                                }}
                            />
                        ))}
                    </View>
                </View>

                {/* Value Proposition (Figma text 63:60) */}
                <Text style={styles.subText}>
                    {'Shop the drop from your phone.\nTrack every order to your door.'}
                </Text>
            </View>

            {/* Bottom Actions (Figma frame 63:61) */}
            <View style={styles.buttonContainer}>
                {/* 1. Create account (Primary CTA, Figma frame 63:62, 342x54) */}
                <TouchableOpacity 
                    style={styles.createAccountBtn}
                    onPress={() => navigation?.navigate ? navigation.navigate('Signup') : null}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Create account"
                >
                    <Text style={styles.createAccountBtnText}>Create account</Text>
                </TouchableOpacity>

                {/* 2. Sign in (Secondary outlined, Figma frame 63:64, 342x54) */}
                <TouchableOpacity 
                    style={styles.signInBtn}
                    onPress={() => navigation?.navigate ? navigation.navigate('Login') : null}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Sign in"
                >
                    <Text style={styles.signInBtnText}>Sign in</Text>
                </TouchableOpacity>

                {/* 3. Continue as guest (Figma text 63:66) */}
                <TouchableOpacity 
                    style={styles.guestBtn}
                    onPress={() => navigation?.navigate ? navigation.navigate('Home', { guest: true }) : null}
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
        paddingHorizontal: 4,
    },
    logoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    logoMetro: {
        fontFamily: fonts.anton || 'Anton_400Regular',
        fontSize: 44,
        lineHeight: 52,
        color: '#FFFFFF',
        letterSpacing: 0,
        ...Platform.select({
            web: { fontFamily: 'Anton_400Regular, Anton, Impact, sans-serif' },
        }),
    },
    logoDrip: {
        fontFamily: fonts.anton || 'Anton_400Regular',
        fontSize: 44,
        lineHeight: 52,
        color: '#D3EE42',
        letterSpacing: 0,
        ...Platform.select({
            web: { fontFamily: 'Anton_400Regular, Anton, Impact, sans-serif' },
        }),
    },
    subTextUpper: {
        fontFamily: fonts.monoSemiBold || 'IBMPlexMono_600SemiBold',
        color: '#D3EE42',
        textAlign: 'center',
        fontSize: 11,
        lineHeight: 14.3,
        letterSpacing: 2.0,
        marginTop: 18,
        ...Platform.select({
            web: { fontFamily: 'IBMPlexMono_600SemiBold, monospace' },
        }),
    },
    barcodeFrame: {
        width: '100%',
        maxWidth: 334,
        height: 34,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 18,
    },
    barcodeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        height: 34,
    },
    subText: {
        fontFamily: fonts.interRegular || 'Inter_400Regular',
        color: '#A8A8A0',
        textAlign: 'center',
        fontSize: 15,
        lineHeight: 24,
        marginTop: 18,
        ...Platform.select({
            web: { fontFamily: 'Inter_400Regular, Inter, sans-serif' },
        }),
    },
    buttonContainer: {
        width: '100%',
        maxWidth: 342,
        alignSelf: 'center',
        gap: 12,
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
        fontFamily: fonts.interBold || 'Inter_700Bold',
        fontWeight: '700',
        ...Platform.select({
            web: { fontFamily: 'Inter_700Bold, Inter, sans-serif' },
        }),
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
        fontFamily: fonts.interBold || 'Inter_700Bold',
        fontWeight: '700',
        ...Platform.select({
            web: { fontFamily: 'Inter_700Bold, Inter, sans-serif' },
        }),
    },
    guestBtn: {
        paddingVertical: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    guestBtnText: {
        color: '#A8A8A0',
        textAlign: 'center',
        fontSize: 14,
        lineHeight: 17,
        fontFamily: fonts.interMedium || 'Inter_500Medium',
        fontWeight: '500',
        ...Platform.select({
            web: { fontFamily: 'Inter_500Medium, Inter, sans-serif' },
        }),
    },
});
