import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme';
import { fonts } from '../../Checkout/src/theme';
import { forgotPassword } from '../../../src/services/authService';
import { ApiError } from '../../../src/services/apiClient';

export default function ForgotPasswordScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useMemoStyles(theme);
  const isDark = theme.mode === 'dark';

  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const handleReset = async () => {
    if (!email.trim()) {
      setError('Email is required.');
      return;
    }
    if (!isValidEmail(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const data = await forgotPassword(email.trim());
      if (data && data.success) {
        setSent(true);
      } else {
        setError((data && data.error) || 'Failed to send password reset link.');
      }
    } catch (err) {
      if (err instanceof ApiError && err.status > 0) {
        setError(
          (err.data && err.data.error) || 'Failed to send password reset link.'
        );
      } else {
        // Fallback to confirmation for offline/simulated mode
        setSent(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Top Navigation Bar with Back Button (Figma 67:9) */}
      <View style={styles.topNav}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Login'))}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 24) + 16 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {!sent ? (
            <>
              {/* HEADER */}
              <View style={styles.header}>
                <Text style={styles.title}>Reset Password</Text>
                <Text style={styles.subtitle}>
                  Enter the email linked to your account and we'll send you a link to reset your password.
                </Text>
              </View>

              {/* FORM */}
              <View style={styles.form}>
                {/* EMAIL */}
                <View style={[styles.fieldCard, error && styles.fieldCardError]}>
                  <Text style={styles.fieldLabel}>EMAIL</Text>
                  <TextInput
                    style={styles.fieldInput}
                    placeholder="juan@email.com"
                    placeholderTextColor={theme.placeholder}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    value={email}
                    onChangeText={(text) => {
                      setEmail(text);
                      if (error) setError(null);
                    }}
                    onSubmitEditing={handleReset}
                    accessibilityLabel="Email"
                  />
                </View>
                {error ? (
                  <Text style={styles.errorText} accessibilityRole="alert">
                    {error}
                  </Text>
                ) : null}

                {/* PRIMARY CTA */}
                <TouchableOpacity
                  style={[styles.primaryButton, loading && styles.buttonDisabled]}
                  onPress={handleReset}
                  disabled={loading}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Send reset link"
                  accessibilityState={{ disabled: loading, busy: loading }}
                >
                  {loading ? (
                    <ActivityIndicator color={theme.accentText} />
                  ) : (
                    <Text style={styles.primaryButtonText}>Send reset link</Text>
                  )}
                </TouchableOpacity>

                {/* BACK TO LOGIN */}
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => navigation.navigate('Login')}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Back to sign in"
                >
                  <Text style={styles.secondaryButtonText}>Back to sign in</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              {/* SUCCESS STATE */}
              <View style={styles.header}>
                <Text style={styles.title}>Check Your Email</Text>
                <Text style={styles.subtitle}>
                  If an account exists for {email.trim()}, a password reset link is on its way. It may take a few minutes to arrive.
                </Text>
              </View>

              <View style={styles.form}>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => navigation.navigate('Login')}
                  accessibilityRole="button"
                  accessibilityLabel="Back to sign in"
                >
                  <Text style={styles.primaryButtonText}>Back to sign in</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.resendButton}
                  onPress={handleReset}
                  accessibilityRole="button"
                  accessibilityLabel="Resend reset link"
                >
                  <Text style={styles.resendText}>Didn't get it? Resend</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function useMemoStyles(theme) {
  return React.useMemo(() => makeStyles(theme), [theme]);
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    topNav: {
      height: 52,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      justifyContent: 'center',
    },
    backBtn: {
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'flex-start',
    },
    keyboard: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 24,
      paddingTop: 16,
    },
    header: {
      marginBottom: 20,
    },
    title: {
      fontFamily: fonts.anton,
      fontSize: 34,
      color: theme.text,
      letterSpacing: 0.5,
    },
    subtitle: {
      fontFamily: fonts.interRegular,
      fontSize: 14,
      lineHeight: 20,
      color: theme.textMuted,
      marginTop: 6,
    },
    form: {
      width: '100%',
    },
    fieldCard: {
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingTop: 9,
      paddingBottom: 9,
      marginBottom: 12,
    },
    fieldCardError: {
      borderColor: theme.error,
    },
    fieldLabel: {
      fontFamily: fonts.monoRegular,
      fontSize: 9,
      letterSpacing: 0.8,
      color: theme.label,
      marginBottom: 3,
    },
    fieldInput: {
      fontFamily: fonts.interRegular,
      fontSize: 14,
      color: theme.text,
      height: 24,
      padding: 0,
    },
    errorText: {
      fontFamily: fonts.interRegular,
      fontSize: 11,
      color: theme.error,
      marginTop: -6,
      marginBottom: 10,
      paddingHorizontal: 4,
    },
    primaryButton: {
      height: 54,
      borderRadius: 9999,
      backgroundColor: theme.accent,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 8,
    },
    buttonDisabled: {
      opacity: 0.7,
    },
    primaryButtonText: {
      fontFamily: fonts.interBold,
      fontSize: 16,
      color: theme.accentText,
    },
    secondaryButton: {
      height: 52,
      borderRadius: 9999,
      backgroundColor: theme.surface,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 12,
    },
    secondaryButtonText: {
      fontFamily: fonts.interSemiBold,
      fontSize: 15,
      color: theme.text,
    },
    resendButton: {
      alignItems: 'center',
      paddingVertical: 14,
      marginTop: 8,
    },
    resendText: {
      fontFamily: fonts.interMedium,
      fontSize: 13,
      color: theme.link,
    },
  });
}