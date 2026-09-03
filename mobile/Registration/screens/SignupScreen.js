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
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTheme } from '../theme';

export default function SignupScreen({ navigation }) {
  const { theme, mode, setMode } = useTheme();
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

  const handleSignup = () => {
    if (!validate()) return;

    setLoading(true);

    // Simulated account creation — the public mobile API
    // (/api/mobile/v1/) will replace this once the backend team wires it up.
    setTimeout(() => {
      setLoading(false);
      Alert.alert(
        'Welcome to MetroDrip',
        'Your account has been created!',
        [{ text: 'LOGIN', onPress: () => navigation.navigate('Login') }]
      );
    }, 900);
  };

  const toggleTheme = () => {
    setMode(isDark ? 'light' : 'dark');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >

          {/* LOGO + DARK MODE TOGGLE */}
          <View style={styles.topRow}>
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
          </View>

          {/* HEADER */}
          <View style={styles.header}>
            <Text style={styles.title}>CREATE ACCOUNT</Text>
            <Text style={styles.description}>
              Join MetroDrip and discover your street style.
            </Text>
          </View>

          {/* FORM */}
          <View style={styles.form}>

            <Text style={styles.label}>FULL NAME</Text>
            <TextInput
              style={[styles.input, errors.name && styles.inputError]}
              placeholder="Enter your full name"
              placeholderTextColor={theme.placeholder}
              returnKeyType="next"
              value={name}
              onChangeText={(text) => {
                setName(text);
                if (errors.name) setErrors((e) => ({ ...e, name: null }));
              }}
              onSubmitEditing={() => emailRef.current?.focus()}
              accessibilityLabel="Full name"
              accessibilityHint="Enter your first and last name"
            />
            {errors.name ? (
              <Text style={styles.errorText} accessibilityRole="alert">
                {errors.name}
              </Text>
            ) : null}

            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              ref={emailRef}
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
              accessibilityHint="Enter the email address you'll sign in with"
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
                placeholder="Create a password"
                placeholderTextColor={theme.placeholder}
                secureTextEntry={!showPassword}
                returnKeyType="next"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (errors.password)
                    setErrors((e) => ({ ...e, password: null }));
                }}
                onSubmitEditing={() => confirmRef.current?.focus()}
                accessibilityLabel="Password"
                accessibilityHint="Create a password with at least 6 characters"
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

            <Text style={styles.label}>CONFIRM PASSWORD</Text>
            <View style={styles.passwordRow}>
              <TextInput
                ref={confirmRef}
                style={[
                  styles.input,
                  styles.passwordInput,
                  errors.confirmPassword && styles.inputError,
                ]}
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
                accessibilityHint="Re-enter the same password"
              />
              <TouchableOpacity
                style={styles.showToggle}
                onPress={() => setShowConfirm((v) => !v)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={
                  showConfirm ? 'Hide confirm password' : 'Show confirm password'
                }
              >
                <Text style={styles.showToggleText}>
                  {showConfirm ? 'HIDE' : 'SHOW'}
                </Text>
              </TouchableOpacity>
            </View>
            {errors.confirmPassword ? (
              <Text style={styles.errorText} accessibilityRole="alert">
                {errors.confirmPassword}
              </Text>
            ) : null}

            {/* SIGN UP BUTTON */}
            <TouchableOpacity
              style={[styles.signupButton, loading && styles.buttonDisabled]}
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
                <Text style={styles.signupButtonText}>CREATE ACCOUNT</Text>
              )}
            </TouchableOpacity>

          </View>

          {/* LOGIN */}
          <View style={styles.bottomContainer}>
            <Text style={styles.accountText}>Already have an account?</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.loginText}>BACK TO LOGIN</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>

        {/* FOOTER BAND */}
        <View style={styles.footerBand}>
          <Text style={styles.footer}>BUILT FOR THE STREETS</Text>
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
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
    scroll: {
      flexGrow: 1,
      paddingHorizontal: 24,
      paddingTop: 25,
      paddingBottom: 20,
    },
    topRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 40,
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
      marginBottom: 30,
    },
    title: {
      fontSize: 28,
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
    form: {
      width: '100%',
    },
    label: {
      fontSize: 10,
      fontWeight: '900',
      color: theme.label,
      marginBottom: 8,
      letterSpacing: 0.5,
    },
    input: {
      height: 50,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 3,
      paddingHorizontal: 14,
      fontSize: 13,
      color: theme.text,
      marginBottom: 18,
    },
    inputError: {
      borderColor: theme.error,
      marginBottom: 6,
    },
    errorText: {
      fontSize: 10,
      fontWeight: '700',
      color: theme.error,
      marginBottom: 12,
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
      height: 50,
      justifyContent: 'center',
    },
    showToggleText: {
      fontSize: 9,
      fontWeight: '900',
      color: theme.textMuted,
      letterSpacing: 0.5,
    },
    signupButton: {
      height: 53,
      backgroundColor: theme.accent,
      borderRadius: 3,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: 5,
    },
    buttonDisabled: {
      opacity: 0.7,
    },
    signupButtonText: {
      fontSize: 12,
      fontWeight: '900',
      color: theme.accentText,
      letterSpacing: 0.8,
    },
    bottomContainer: {
      alignItems: 'center',
      marginTop: 28,
    },
    accountText: {
      fontSize: 11,
      color: theme.textMuted,
      marginBottom: 7,
    },
    loginText: {
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