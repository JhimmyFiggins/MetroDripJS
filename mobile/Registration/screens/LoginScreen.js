import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useTheme } from '../theme.js';
import { fonts} from '../../Checkout/src/theme.ts';
import { useAuth } from '../../context/AuthContext';

export default function LoginScreen({ navigation }) {
  

  const { login } = useAuth();
  const { theme, mode, setMode } = useTheme();
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
      const response = await fetch('https://metrodripjs.onrender.com/login/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          password: password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || 'Invalid email or password.');
        return;
      }

      login(data);
      navigation.navigate('Home');

    } catch (error) {
      console.error('Login failed:', error);
      alert('Unable to connect to the server.');
    } finally {
      setLoading(false);
    }
  };

  // Requirement 25 — mobile app must support guest checkout at parity with
  // web. Skips auth and drops the user straight into the shopping flow.
  const handleContinueAsGuest = () => {
    navigation.navigate('Home', { guest: true });
  };

  const toggleTheme = () => {
    setMode(isDark ? 'light' : 'dark');
  };

  return (
    <SafeAreaProvider style={styles.container}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <View style={styles.main}>

          {/* Insert Header here */}
          {/* LOGO + DARK MODE TOGGLE */}
          {/* <View style={styles.topRow}>
            <View style={styles.logoContainer}>
              <Text style={styles.logo}>METRODRIP</Text>
              <Text style={styles.logoSub}>
                STREETWEAR • FASHION • CULTURE
              </Text>
            </View>

            <TouchableOpacity
              style={styles.themeToggle}
              onPress={toggleTheme}
              accessibilityRole="switch"
              accessibilityLabel="Toggle dark mode"
              accessibilityState={{ checked: isDark }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.themeToggleText}>
                {isDark ? 'LIGHT' : 'DARK'}
              </Text>
            </TouchableOpacity>
          </View> */}

          {/* HEADER */}
          <View style={styles.header}>
            <Text style={styles.title}>WELCOME</Text>
            <Text style={styles.description}>
              Sign in to continue your MetroDrip journey.
            </Text>
          </View>

          {/* Navigation - Sign in and Sign up */}
          <View style={styles.navigationContainer}>
            <TouchableOpacity 
              style={styles.signInBtn}
              onPress={() => navigation.navigate('Login')}
            >
              <Text style={styles.signInBtnText}>Sign In</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.registerBtn}
              onPress={() => navigation.navigate('Signup')}
            >
              <Text style={styles.registerBtnText}>Register</Text>
            </TouchableOpacity>
          </View>

          {/* FORM */}
          <View style={styles.form}>

            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              style={[styles.input, errors.email && styles.inputError]}
              placeholder="Enter your email"
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
              accessibilityHint="Enter the email address for your account"
            />
            {errors.email ? (
              <Text style={styles.errorText} accessibilityRole="alert">
                {errors.email}
              </Text>
            ) : null}

            <Text style={styles.label}>PASSWORD</Text>
            <View style={styles.passwordRow}>
              <TextInput
                ref={passwordRef}
                style={[
                  styles.input,
                  styles.passwordInput,
                  errors.password && styles.inputError,
                ]}
                placeholder="Enter your password"
                placeholderTextColor={theme.placeholder}
                secureTextEntry={!showPassword}
                returnKeyType="done"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (errors.password)
                    setErrors((e) => ({ ...e, password: null }));
                }}
                onSubmitEditing={handleLogin}
                accessibilityLabel="Password"
                accessibilityHint="Enter your account password"
              />
              <TouchableOpacity
                style={styles.showToggle}
                onPress={() => setShowPassword((v) => !v)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={
                  showPassword ? 'Hide password' : 'Show password'
                }
              >
                <Text style={styles.showToggleText}>
                  {showPassword ? 'HIDE' : 'SHOW'}
                </Text>
              </TouchableOpacity>
            </View>
            {errors.password ? (
              <Text style={styles.errorText} accessibilityRole="alert">
                {errors.password}
              </Text>
            ) : null}

            <TouchableOpacity
              style={styles.forgotButton}
              onPress={() => navigation.navigate('ForgotPassword')}
              accessibilityRole="link"
              accessibilityLabel="Forgot password"
            >
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>

            {/* LOGIN */}
            <TouchableOpacity
              style={[styles.loginButton, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Log in"
              accessibilityState={{ disabled: loading, busy: loading }}
            >
              {loading ? (
                <ActivityIndicator color={theme.accentText} />
              ) : (
                <Text style={styles.loginButtonText}>LOGIN</Text>
              )}
            </TouchableOpacity>

            {/* GUEST CHECKOUT */}
            <TouchableOpacity
              style={styles.guestButton}
              onPress={handleContinueAsGuest}
              accessibilityRole="button"
              accessibilityLabel="Continue as guest"
            >
              <Text style={styles.guestButtonText}>CONTINUE AS GUEST</Text>
            </TouchableOpacity>

          </View>

          {/* SIGN UP */}
          {/* <View style={styles.bottomContainer}>
            <Text style={styles.accountText}>Don't have an account?</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
              <Text style={styles.signupText}>CREATE ACCOUNT</Text>
            </TouchableOpacity>
          </View> */}

        </View>

        {/* FOOTER BAND */}
        <View style={styles.footerBand}>
          <Text style={styles.footer}>BUILT FOR THE STREETS</Text>
        </View>

      </KeyboardAvoidingView>
    </SafeAreaProvider>
  );
}

// Regenerates the stylesheet whenever the theme changes.
function useMemoStyles(theme) {
  return React.useMemo(() => makeStyles(theme), [theme]);
}

function makeStyles(theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    keyboard: {
      flex: 1,
      justifyContent: 'space-between',
    },
    main: {
      flex: 1,
      paddingHorizontal: 24,
      paddingTop: 25,
    },
    topRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 45,
    },
    logoContainer: {},
    logo: {
      fontSize: 21,
      fontWeight: '900',
      color: theme.text,
      letterSpacing: -1,
    },
    logoSub: {
      fontSize: 7,
      fontWeight: '600',
      color: theme.textMuted,
      marginTop: 2,
      letterSpacing: 0.5,
    },
    themeToggle: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 3,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    themeToggleText: {
      fontSize: 9,
      fontWeight: '900',
      color: theme.text,
      letterSpacing: 0.5,
    },
    header: {
      marginTop: 70,
      borderTopWidth: 1,
      borderTopColor: 'rgb(0,0,0)',
      marginBottom: 10,
      paddingTop:30,
    },
    title: {
      fontSize: 31,
      fontWeight: '900',
      color: theme.text,
      letterSpacing: -1,
    },
    description: {
      fontSize: 12,
      color: theme.textMuted,
      marginTop: 8,
      lineHeight: 18,
    },
    navigationContainer: {
      flexDirection: 'row',
      backgroundColor: 'rgb(244, 244, 242)',
      borderRadius: 10,
      padding: 4,
      width: '100%',
      marginBottom: 15,
    },
    signInBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      paddingVertical: 10,
      backgroundColor: 'rgb(255, 255, 255)',
    },
    signInBtnText: {
      fontSize: 14,
      fontFamily: fonts.interBold,
      color: theme.text,
      textAlign: 'center',
    },
    registerBtnText: {
      fontSize: 14,
      fontFamily: fonts.interBold,
      color: theme.textMuted,
      textAlign: 'center',
    },
    registerBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      paddingVertical: 10,
    },
    form: {
      width: '100%',
    },
    label: {
      fontSize: 10,
      // fontWeight: '900',
      fontFamily:fonts.interBold,
      color: theme.label,
      marginBottom: 8,
      letterSpacing: 0.5,
    },
    input: {
      height: 52,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 5,
      paddingHorizontal: 14,
      fontSize: 13,
      color: theme.text,
      marginBottom: 20,
    },
    inputError: {
      borderColor: theme.error,
      marginBottom: 6,
    },
    errorText: {
      fontSize: 10,
      fontWeight: '700',
      color: theme.error,
      marginBottom: 14,
    },
    passwordRow: {
      position: 'relative',
      justifyContent: 'center',
    },
    passwordInput: {
      paddingRight: 60,
    },
    showToggle: {
      position: 'absolute',
      right: 14,
      top: 0,
      height: 52,
      justifyContent: 'center',
    },
    showToggleText: {
      fontSize: 9,
      fontWeight: '900',
      color: theme.textMuted,
      letterSpacing: 0.5,
    },
    forgotButton: {
      alignSelf: 'flex-end',
      marginTop: -8,
      marginBottom: 25,
    },
    forgotText: {
      fontSize: 10,
      fontWeight: '700',
      color: theme.textMuted,
    },
    loginButton: {
      height: 53,
      backgroundColor: theme.accent,
      borderRadius: 3,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius:25,
    },
    buttonDisabled: {
      opacity: 0.7,
    },
    loginButtonText: {
      fontSize: 12,
      fontWeight: '900',
      color: theme.accentText,
      letterSpacing: 1,
    },
    guestButton: {
      height: 48,
      borderRadius:25,
      borderWidth: 1,
      borderColor: theme.border,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 12,
      
    },
    guestButtonText: {
      fontSize: 11,
      fontWeight: '900',
      color: theme.text,
      letterSpacing: 0.8,
    },
    bottomContainer: {
      alignItems: 'center',
      marginTop: 30,
    },
    accountText: {
      fontSize: 11,
      color: theme.textMuted,
      marginBottom: 7,
    },
    signupText: {
      fontSize: 11,
      fontWeight: '900',
      color: theme.text,
      textDecorationLine: 'underline',
    },
    footerBand: {
      backgroundColor: theme.footerBg,
      paddingVertical: 14,
      paddingHorizontal: 24,
    },
    footer: {
      fontSize: 9,
      fontWeight: '900',
      color: theme.footerText,
      letterSpacing: 0.5,
    },
  });
}