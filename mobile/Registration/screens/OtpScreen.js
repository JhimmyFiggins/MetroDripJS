import React, { useRef, useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme.js';
import { fonts } from '../../Checkout/src/theme.ts';
import { resendOtp, verifyOtp } from '../../../src/services/authService';
import { ApiError } from '../../../src/services/apiClient';
import { useAuth } from '../../context/AuthContext';

export default function OtpScreen({ navigation, route }) {
  const { login } = useAuth();
  const { theme } = useTheme();
  const styles = useMemoStyles(theme);

  const length = Number(route.params?.codeLength) || 6;
  const [digits, setDigits] = useState(Array.from({ length }, () => ''));
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [challengeId, setChallengeId] = useState(route.params?.challengeId || '');
  const [status, setStatus] = useState({ text: '', type: '' });
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(Number(route.params?.resendAfter) || 60);
  const inputs = useRef([]);
  const purpose = route.params?.purpose;
  const maskedEmail = route.params?.maskedEmail || 'your email';

  const isEmailVerification = purpose === 'email_verification';
  const code = digits.join('');
  const isComplete = code.length === length;

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const setDigit = (index, text) => {
    if (status.text) setStatus({ text: '', type: '' });
    const clean = text.replace(/\D/g, '');
    if (clean.length > 1) {
      const next = [...digits];
      clean.slice(0, length - index).split('').forEach((digit, offset) => {
        if (index + offset < length) {
          next[index + offset] = digit;
        }
      });
      setDigits(next);
      const targetIndex = Math.min(index + clean.length, length - 1);
      inputs.current[targetIndex]?.focus();
      return;
    }
    const next = [...digits];
    next[index] = clean;
    setDigits(next);
    if (clean && index < length - 1) {
      inputs.current[index + 1]?.focus();
    }
  };

  const submit = async () => {
    if (loading || !isComplete) {
      setStatus({ text: `Enter the full ${length}-digit verification code.`, type: 'error' });
      return;
    }
    setLoading(true);
    setStatus({ text: '', type: '' });
    try {
      const data = await verifyOtp(challengeId, code);
      if (purpose === 'email_verification' || data.verified) {
        setStatus({ text: 'Email confirmed! Sign in to continue.', type: 'success' });
        setTimeout(() => {
          navigation.navigate('Login');
        }, 800);
        return;
      }
      if (!data?.token && !data?.access_token) {
        setStatus({ text: 'Verification did not create a session. Please try again.', type: 'error' });
        return;
      }
      login(data);
      navigation.navigate('Home');
    } catch (error) {
      setStatus({
        text: error instanceof ApiError ? error.message : 'The code could not be verified. Please check and try again.',
        type: 'error',
      });
      inputs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (loading || cooldown > 0) return;
    setLoading(true);
    setStatus({ text: '', type: '' });
    try {
      const data = await resendOtp(challengeId);
      setChallengeId(data.challenge_id);
      setCooldown(Number(data.resend_after) || 60);
      setDigits(Array.from({ length }, () => ''));
      setStatus({
        text: `A new code was sent to ${data.masked_email || maskedEmail}.`,
        type: 'success',
      });
      inputs.current[0]?.focus();
    } catch (error) {
      setStatus({
        text: error instanceof ApiError ? error.message : 'A new code could not be sent. Please wait and try again.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <View style={styles.topNav}>
        <TouchableOpacity
          accessibilityLabel="Go back"
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Ionicons color={theme.text} name="arrow-back" size={24} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>{isEmailVerification ? 'Email Verification' : 'Two-Factor 2FA'}</Text>
        <View style={styles.navPlaceholder} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.cardContainer}>
            <View style={styles.iconCircle}>
              <Image
                source={require('../../assets/branding/logo-emblem.png')}
                style={{ width: 36, height: 36 }}
                resizeMode="contain"
                accessible={false}
              />
            </View>

            <Text style={styles.heading}>
              {isEmailVerification ? 'Verify your email' : 'Two-factor auth'}
            </Text>

            <Text style={styles.subtitle}>
              {isEmailVerification
                ? 'Enter the 6-digit verification code sent to activate your MetroDrip account.'
                : 'Enter the 6-digit security code sent to verify your identity.'}
            </Text>

            <View style={styles.emailBadge}>
              <Ionicons color={theme.textMuted} name="mail-outline" size={14} style={{ marginRight: 6 }} />
              <Text numberOfLines={1} style={styles.emailBadgeText}>
                {maskedEmail}
              </Text>
            </View>

            <View accessibilityLabel="Email verification code" style={styles.otpRow}>
              {digits.map((digit, index) => {
                const isFocused = focusedIndex === index;
                const isFilled = Boolean(digit);
                const hasError = status.type === 'error';

                let borderColor = theme.border;
                if (hasError) borderColor = theme.error;
                else if (isFocused) borderColor = theme.accent;
                else if (isFilled) borderColor = theme.text;

                return (
                  <TextInput
                    key={index}
                    ref={(node) => { inputs.current[index] = node; }}
                    accessibilityLabel={`Digit ${index + 1} of ${length}`}
                    autoComplete={index === 0 ? 'one-time-code' : 'off'}
                    inputMode="numeric"
                    keyboardType="number-pad"
                    maxLength={index === 0 ? length : 1}
                    onBlur={() => setFocusedIndex(-1)}
                    onFocus={() => setFocusedIndex(index)}
                    onChangeText={(text) => setDigit(index, text)}
                    onKeyPress={({ nativeEvent }) => {
                      if (nativeEvent.key === 'Backspace') {
                        if (!digits[index] && index > 0) {
                          const next = [...digits];
                          next[index - 1] = '';
                          setDigits(next);
                          inputs.current[index - 1]?.focus();
                        }
                      }
                    }}
                    selectionColor={theme.accent}
                    style={[
                      styles.otpBox,
                      { borderColor },
                      isFocused && styles.otpBoxFocused,
                      isFilled && styles.otpBoxFilled,
                    ]}
                    textContentType="oneTimeCode"
                    value={digit}
                  />
                );
              })}
            </View>

            <View style={styles.expiryRow}>
              <Ionicons color={theme.textMuted} name="time-outline" size={13} style={{ marginRight: 4 }} />
              <Text style={styles.expiryText}>Code expires in 5 minutes</Text>
            </View>

            {Boolean(status.text) && (
              <View
                accessibilityLiveRegion="polite"
                style={[
                  styles.statusContainer,
                  status.type === 'error' ? styles.statusError : styles.statusSuccess,
                ]}
              >
                <Ionicons
                  color={status.type === 'error' ? theme.error : (theme.mode === 'dark' ? theme.accent : '#2E7D32')}
                  name={status.type === 'error' ? 'alert-circle-outline' : 'checkmark-circle-outline'}
                  size={16}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.statusText,
                    status.type === 'error' ? styles.statusTextError : styles.statusTextSuccess,
                  ]}
                >
                  {status.text}
                </Text>
              </View>
            )}

            <TouchableOpacity
              accessibilityLabel="Verify code"
              accessibilityRole="button"
              activeOpacity={0.85}
              disabled={loading || !isComplete}
              onPress={submit}
              style={[
                styles.primaryButton,
                (!isComplete || loading) && styles.primaryButtonDisabled,
              ]}
            >
              {loading ? (
                <ActivityIndicator color={theme.accentText} />
              ) : (
                <Text style={styles.primaryButtonText}>Verify</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityLabel="Resend verification code"
              accessibilityRole="button"
              activeOpacity={0.7}
              disabled={loading || cooldown > 0}
              onPress={resend}
              style={[
                styles.secondaryButton,
                (cooldown > 0 || loading) && styles.secondaryButtonDisabled,
              ]}
            >
              <Ionicons
                color={cooldown > 0 ? theme.textMuted : theme.text}
                name="refresh-outline"
                size={15}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.secondaryButtonText, cooldown > 0 && styles.secondaryTextMuted]}>
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              accessibilityLabel="Back to sign in"
              accessibilityRole="button"
              activeOpacity={0.7}
              onPress={() => navigation.navigate('Login')}
              style={styles.backLink}
            >
              <Ionicons color={theme.textMuted} name="arrow-back" size={14} style={{ marginRight: 6 }} />
              <Text style={styles.backLinkText}>Back to sign in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function useMemoStyles(theme) {
  return React.useMemo(() => makeStyles(theme), [theme]);
}

function makeStyles(theme) {
  const isDark = theme.mode === 'dark';
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
    },
    topNav: {
      height: 52,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    backBtn: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'flex-start',
    },
    navTitle: {
      fontFamily: fonts.interSemiBold,
      fontSize: 15,
      color: theme.text,
    },
    navPlaceholder: {
      width: 40,
    },
    keyboard: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: 20,
      paddingVertical: 24,
    },
    cardContainer: {
      width: '100%',
      maxWidth: 440,
      alignSelf: 'center',
      backgroundColor: theme.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 24,
      paddingVertical: 32,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0 : 0.06,
      shadowRadius: 16,
      elevation: isDark ? 0 : 2,
    },
    iconCircle: {
      width: 56,
      height: 56,
      borderRadius: 14,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 16,
    },
    heading: {
      fontFamily: fonts.anton,
      fontSize: 28,
      lineHeight: 34,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: theme.text,
      textAlign: 'center',
      marginBottom: 8,
    },
    subtitle: {
      fontFamily: fonts.interRegular,
      fontSize: 14,
      lineHeight: 20,
      color: theme.textMuted,
      textAlign: 'center',
      marginBottom: 14,
      paddingHorizontal: 8,
    },
    emailBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 6,
      marginBottom: 20,
      maxWidth: '100%',
    },
    emailBadgeText: {
      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
      fontSize: 13,
      fontWeight: '600',
      color: theme.text,
    },
    otpRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      width: '100%',
      marginBottom: 10,
    },
    otpBox: {
      width: 44,
      height: 52,
      borderRadius: 10,
      borderWidth: 1.5,
      backgroundColor: theme.surface,
      textAlign: 'center',
      fontSize: 22,
      fontWeight: '700',
      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
      color: theme.text,
    },
    otpBoxFocused: {
      backgroundColor: theme.card,
    },
    otpBoxFilled: {
      backgroundColor: theme.card,
    },
    expiryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    expiryText: {
      fontFamily: fonts.interRegular,
      fontSize: 12.5,
      color: theme.textMuted,
    },
    statusContainer: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
      marginBottom: 16,
    },
    statusError: {
      backgroundColor: isDark ? 'rgba(255, 107, 107, 0.12)' : '#FDF2F2',
      borderColor: isDark ? 'rgba(255, 107, 107, 0.4)' : '#FCA5A5',
    },
    statusSuccess: {
      backgroundColor: isDark ? 'rgba(211, 238, 66, 0.12)' : '#F0FDF4',
      borderColor: isDark ? 'rgba(211, 238, 66, 0.4)' : '#86EFAC',
    },
    statusText: {
      fontFamily: fonts.interMedium,
      fontSize: 13,
      lineHeight: 18,
      flex: 1,
      textAlign: 'center',
    },
    statusTextError: {
      color: theme.error,
    },
    statusTextSuccess: {
      color: isDark ? theme.accent : '#2E7D32',
    },
    primaryButton: {
      width: '100%',
      minHeight: 48,
      borderRadius: 999,
      backgroundColor: theme.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    primaryButtonDisabled: {
      opacity: 0.45,
    },
    primaryButtonText: {
      fontFamily: fonts.interBold,
      fontSize: 15,
      fontWeight: '700',
      color: theme.accentText,
      letterSpacing: 0.3,
    },
    secondaryButton: {
      width: '100%',
      minHeight: 44,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    secondaryButtonDisabled: {
      opacity: 0.6,
    },
    secondaryButtonText: {
      fontFamily: fonts.interSemiBold,
      fontSize: 14,
      color: theme.text,
    },
    secondaryTextMuted: {
      color: theme.textMuted,
    },
    backLink: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 6,
    },
    backLinkText: {
      fontFamily: fonts.interSemiBold,
      fontSize: 13.5,
      color: theme.textMuted,
    },
  });
}
