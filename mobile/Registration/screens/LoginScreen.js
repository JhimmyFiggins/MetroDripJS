import React, { useState, useRef } from 'react';
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

import { useTheme } from '../theme.js';
import { fonts } from '../../Checkout/src/theme.ts';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { login as loginCustomer } from '../../../src/services/authService';
import { ApiError } from '../../../src/services/apiClient';

export default function LoginScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { login, logout } = useAuth();
  const { clearCart } = useCart();
  const { theme } = useTheme();
  const styles = useMemoStyles(theme);
  const isDark = theme.mode === 'dark';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const passwordRef = useRef(null);

  const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const validate = () => {
    const nextErrors = {};

    if (!email.trim()) {
      nextErrors.email = 'Email is required.';
    } else if (!isValidEmail(email.trim())) {
      nextErrors.email = 'Enter a valid email address.';
    }

    if (!password) {
      nextErrors.password = 'Password is required.';
    } else if (password.length < 6) {
      nextErrors.password = 'Password must be at least 6 characters.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;

    setLoading(true);

    try {
      const data = await loginCustomer(email.trim(), password);
      login(data);
      navigation.navigate('Home');
    } catch (error) {
      console.error('Login failed:', error);
      if (error instanceof ApiError && error.status > 0) {
        alert((error.data && error.data.error) || 'Invalid email or password.');
      } else {
        alert('Unable to connect to the server.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleContinueAsGuest = () => {
    clearCart();
    logout();
    navigation.navigate('Home', { guest: true });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {/* Top Navigation Bar with Back Button (Figma 67:9) */}
      <View style={styles.topNav}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'))}
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
          {/* Header Title & Subtitle (Figma 67:14 - 67:16) */}
          <View style={styles.header}>
            <Text style={styles.title}>Welcome</Text>
            <Text style={styles.subtitle}>
              Sign in to track orders, save your fits, and check out faster.
            </Text>
          </View>

          {/* Segmented Switcher - Sign in & Register (Figma 67:17) */}
          <View style={styles.segmentedContainer}>
            <TouchableOpacity
              style={[styles.segmentBtn, styles.segmentBtnActive]}
              activeOpacity={0.9}
            >
              <Text style={styles.segmentTextActive}>Sign in</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.segmentBtn}
              onPress={() => navigation.navigate('Signup')}
              activeOpacity={0.7}
            >
              <Text style={styles.segmentTextInactive}>Register</Text>
            </TouchableOpacity>
          </View>

          {/* Form Fields (Figma EL-f6fb781b) */}
          <View style={styles.form}>
            {/* EMAIL */}
            <View style={[styles.fieldCard, errors.email && styles.fieldCardError]}>
              <Text style={styles.fieldLabel}>EMAIL</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="juan@email.com"
                placeholderTextColor={theme.placeholder}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (errors.email) setErrors((e) => ({ ...e, email: null }));
                }}
                onSubmitEditing={() => passwordRef.current?.focus()}
                accessibilityLabel="Email"
              />
            </View>
            {errors.email ? (
              <Text style={styles.errorText} accessibilityRole="alert">
                {errors.email}
              </Text>
            ) : null}

            {/* PASSWORD */}
            <View style={[styles.fieldCard, errors.password && styles.fieldCardError]}>
              <Text style={styles.fieldLabel}>PASSWORD</Text>
              <View style={styles.inputRow}>
                <TextInput
                  ref={passwordRef}
                  style={styles.fieldInput}
                  placeholder="••••••••••"
                  placeholderTextColor={theme.placeholder}
                  secureTextEntry={!showPassword}
                  returnKeyType="done"
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (errors.password) setErrors((e) => ({ ...e, password: null }));
                  }}
                  onSubmitEditing={handleLogin}
                  accessibilityLabel="Password"
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={theme.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </View>
            {errors.password ? (
              <Text style={styles.errorText} accessibilityRole="alert">
                {errors.password}
              </Text>
            ) : null}

            {/* FORGOT PASSWORD (Figma 67:31) */}
            <TouchableOpacity
              style={styles.forgotButton}
              onPress={() => navigation.navigate('ForgotPassword')}
              accessibilityRole="link"
              accessibilityLabel="Forgot password"
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>

            {/* PRIMARY CTA - SIGN IN (Figma 67:33) */}
            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
              accessibilityState={{ disabled: loading, busy: loading }}
            >
              {loading ? (
                <ActivityIndicator color={theme.accentText} />
              ) : (
                <Text style={styles.primaryButtonText}>Sign in</Text>
              )}
            </TouchableOpacity>

            {/* "or" DIVIDER (Figma 67:38) */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* SECONDARY CTA - CONTINUE AS GUEST (Figma 67:42) */}
            <TouchableOpacity
              style={styles.guestButton}
              onPress={handleContinueAsGuest}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Continue as guest"
            >
              <Text style={styles.guestButtonText}>Continue as guest</Text>
            </TouchableOpacity>

            {/* FOOTNOTE (Figma 67:44) */}
            <Text style={styles.footnote}>
              Bought as a guest before? Register with the same email and your past orders come with you.
            </Text>
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
      marginBottom: 16,
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
    segmentedContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.surface,
      borderRadius: 12,
      padding: 4,
      height: 46,
      marginBottom: 18,
    },
    segmentBtn: {
      flex: 1,
      height: 38,
      borderRadius: 9,
      justifyContent: 'center',
      alignItems: 'center',
    },
    segmentBtnActive: {
      backgroundColor: theme.card,
    },
    segmentTextActive: {
      fontFamily: fonts.interSemiBold,
      fontSize: 14,
      color: theme.text,
    },
    segmentTextInactive: {
      fontFamily: fonts.interSemiBold,
      fontSize: 14,
      color: theme.textMuted,
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
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    eyeBtn: {
      paddingLeft: 10,
      justifyContent: 'center',
      alignItems: 'center',
    },
    errorText: {
      fontFamily: fonts.interRegular,
      fontSize: 11,
      color: theme.error,
      marginTop: -6,
      marginBottom: 10,
      paddingHorizontal: 4,
    },
    forgotButton: {
      alignSelf: 'flex-end',
      marginTop: 2,
      marginBottom: 16,
    },
    forgotText: {
      fontFamily: fonts.interMedium,
      fontSize: 13,
      color: theme.link,
    },
    primaryButton: {
      height: 54,
      borderRadius: 9999,
      backgroundColor: theme.accent,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 4,
    },
    buttonDisabled: {
      opacity: 0.7,
    },
    primaryButtonText: {
      fontFamily: fonts.interBold,
      fontSize: 16,
      color: theme.accentText,
    },
    dividerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 18,
    },
    dividerLine: {
      flex: 1,
      height: 1,
      backgroundColor: theme.border,
    },
    dividerText: {
      fontFamily: fonts.interRegular,
      fontSize: 12,
      color: theme.textMuted,
      marginHorizontal: 12,
    },
    guestButton: {
      height: 52,
      borderRadius: 9999,
      backgroundColor: theme.surface,
      justifyContent: 'center',
      alignItems: 'center',
    },
    guestButtonText: {
      fontFamily: fonts.interSemiBold,
      fontSize: 15,
      color: theme.text,
    },
    footnote: {
      fontFamily: fonts.interRegular,
      fontSize: 12,
      lineHeight: 18,
      color: theme.textMuted,
      textAlign: 'center',
      marginTop: 18,
      paddingHorizontal: 12,
    },
  });
}