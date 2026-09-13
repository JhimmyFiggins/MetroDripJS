import React, { useState } from 'react';
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
import { useTheme } from '../theme';

export default function ForgotPasswordScreen({ navigation }) {
  const { theme, mode, setMode } = useTheme();
  const styles = useMemoStyles(theme);
  const isDark = theme.mode === 'dark';

  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const handleReset = () => {
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

    // Simulated request — the public mobile API (/api/mobile/v1/) will send
    // the actual reset link once the backend team wires it up.
    setTimeout(() => {
      setLoading(false);
      setSent(true);
    }, 900);
  };

  const toggleTheme = () => {
    setMode(isDark ? 'light' : 'dark');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <View style={styles.main}>

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

          {/* BACK */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.backText}>‹ BACK</Text>
          </TouchableOpacity>

          {!sent ? (
            <>
              {/* HEADER */}
              <View style={styles.header}>
                <Text style={styles.title}>RESET PASSWORD</Text>
                <Text style={styles.description}>
                  Enter the email linked to your account and we'll send you a
                  link to reset your password.
                </Text>
              </View>

              {/* FORM */}
              <View style={styles.form}>
                <Text style={styles.label}>EMAIL</Text>
                <TextInput
                  style={[styles.input, error && styles.inputError]}
                  placeholder="Enter your email"
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
                  accessibilityHint="Enter the email address linked to your account"
                />
                {error ? (
                  <Text style={styles.errorText} accessibilityRole="alert">
                    {error}
                  </Text>
                ) : null}

                <TouchableOpacity
                  style={[
                    styles.resetButton,
                    loading && styles.buttonDisabled,
                  ]}
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
                    <Text style={styles.resetButtonText}>
                      SEND RESET LINK
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              {/* SUCCESS STATE */}
              <View style={styles.header}>
                <Text style={styles.title}>CHECK YOUR EMAIL</Text>
                <Text style={styles.description}>
                  If an account exists for {email.trim()}, a password reset
                  link is on its way. It may take a few minutes to arrive.
                </Text>
              </View>

              <TouchableOpacity
                style={styles.resetButton}
                onPress={() => navigation.navigate('Login')}
                accessibilityRole="button"
                accessibilityLabel="Back to login"
              >
                <Text style={styles.resetButtonText}>BACK TO LOGIN</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.resendButton}
                onPress={handleReset}
                accessibilityRole="button"
                accessibilityLabel="Resend reset link"
              >
                <Text style={styles.resendText}>Didn't get it? Resend</Text>
              </TouchableOpacity>
            </>
          )}

        </View>

        {/* FOOTER BAND */}
        <View style={styles.footerBand}>
          <Text style={styles.footer}>BUILT FOR THE STREETS</Text>
        </View>

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
      marginBottom: 30,
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
    backButton: {
      alignSelf: 'flex-start',
      marginBottom: 20,
    },
    backText: {
      fontSize: 11,
      fontWeight: '900',
      color: theme.textMuted,
      letterSpacing: 0.5,
    },
    header: {
      marginBottom: 35,
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
      height: 52,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 3,
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
    resetButton: {
      height: 53,
      backgroundColor: theme.accent,
      borderRadius: 3,
      justifyContent: 'center',
      alignItems: 'center',
    },
    buttonDisabled: {
      opacity: 0.7,
    },
    resetButtonText: {
      fontSize: 12,
      fontWeight: '900',
      color: theme.accentText,
      letterSpacing: 1,
    },
    resendButton: {
      alignItems: 'center',
      marginTop: 18,
    },
    resendText: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.textMuted,
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