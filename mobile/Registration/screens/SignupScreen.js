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
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme';
import { fonts } from '../../Checkout/src/theme';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { signup } from '../../../src/services/authService';
import { ApiError } from '../../../src/services/apiClient';

export default function SignupScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { logout } = useAuth();
  const { clearCart } = useCart();
  const { theme } = useTheme();
  const styles = useMemoStyles(theme);
  const isDark = theme.mode === 'dark';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const confirmRef = useRef(null);

  const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const validate = () => {
    const nextErrors = {};

    if (!name.trim()) nextErrors.name = 'Full name is required.';

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

    if (!confirmPassword) {
      nextErrors.confirmPassword = 'Please confirm your password.';
    } else if (password !== confirmPassword) {
      nextErrors.confirmPassword = 'Passwords do not match.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSignup = async () => {
    if (!validate()) return;

    setLoading(true);

    try {
      await signup({
        name: name.trim(),
        email: email.trim(),
        password: password,
      });

      Alert.alert(
        'Welcome to MetroDrip',
        'Your account has been created! Please sign in to continue.',
        [{ text: 'Sign in', onPress: () => navigation.navigate('Login') }]
      );
    } catch (error) {
      console.error('Signup failed:', error);
      if (error instanceof ApiError && error.status > 0) {
        Alert.alert(
          'Sign Up Failed',
          (error.data && error.data.error) || 'Unable to create account.'
        );
      } else {
        Alert.alert('Error', 'Unable to connect to the server.');
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
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>
              Join MetroDrip and discover your street style.
            </Text>
          </View>

          {/* Segmented Switcher - Sign in & Register (Figma 67:17) */}
          <View style={styles.segmentedContainer}>
            <TouchableOpacity
              style={styles.segmentBtn}
              onPress={() => navigation.navigate('Login')}
              activeOpacity={0.7}
            >
              <Text style={styles.segmentTextInactive}>Sign in</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.segmentBtn, styles.segmentBtnActive]}
              activeOpacity={0.9}
            >
              <Text style={styles.segmentTextActive}>Register</Text>
            </TouchableOpacity>
          </View>

          {/* Form Fields (Figma EL-f6fb781b) */}
          <View style={styles.form}>
            {/* FULL NAME */}
            <View style={[styles.fieldCard, errors.name && styles.fieldCardError]}>
              <Text style={styles.fieldLabel}>FULL NAME</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="Juan dela Cruz"
                placeholderTextColor={theme.placeholder}
                returnKeyType="next"
                value={name}
                onChangeText={(text) => {
                  setName(text);
                  if (errors.name) setErrors((e) => ({ ...e, name: null }));
                }}
                onSubmitEditing={() => emailRef.current?.focus()}
                accessibilityLabel="Full name"
              />
            </View>
            {errors.name ? (
              <Text style={styles.errorText} accessibilityRole="alert">
                {errors.name}
              </Text>
            ) : null}

            {/* EMAIL */}
            <View style={[styles.fieldCard, errors.email && styles.fieldCardError]}>
              <Text style={styles.fieldLabel}>EMAIL</Text>
              <TextInput
                ref={emailRef}
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
                  placeholder="Create a password"
                  placeholderTextColor={theme.placeholder}
                  secureTextEntry={!showPassword}
                  returnKeyType="next"
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (errors.password) setErrors((e) => ({ ...e, password: null }));
                  }}
                  onSubmitEditing={() => confirmRef.current?.focus()}
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

            {/* CONFIRM PASSWORD */}
            <View style={[styles.fieldCard, errors.confirmPassword && styles.fieldCardError]}>
              <Text style={styles.fieldLabel}>CONFIRM PASSWORD</Text>
              <View style={styles.inputRow}>
                <TextInput
                  ref={confirmRef}
                  style={styles.fieldInput}
                  placeholder="Confirm your password"
                  placeholderTextColor={theme.placeholder}
                  secureTextEntry={!showConfirm}
                  returnKeyType="done"
                  value={confirmPassword}
                  onChangeText={(text) => {
                    setConfirmPassword(text);
                    if (errors.confirmPassword)
                      setErrors((e) => ({ ...e, confirmPassword: null }));
                  }}
                  onSubmitEditing={handleSignup}
                  accessibilityLabel="Confirm password"
                />
                <TouchableOpacity
                  style={styles.eyeBtn}
                  onPress={() => setShowConfirm((v) => !v)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                >
                  <Ionicons
                    name={showConfirm ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={theme.textMuted}
                  />
                </TouchableOpacity>
              </View>
            </View>
            {errors.confirmPassword ? (
              <Text style={styles.errorText} accessibilityRole="alert">
                {errors.confirmPassword}
              </Text>
            ) : null}

            {/* PRIMARY CTA - CREATE ACCOUNT (Figma 67:33) */}
            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={handleSignup}
              disabled={loading}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Create account"
              accessibilityState={{ disabled: loading, busy: loading }}
            >
              {loading ? (
                <ActivityIndicator color={theme.accentText} />
              ) : (
                <Text style={styles.primaryButtonText}>Create account</Text>
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