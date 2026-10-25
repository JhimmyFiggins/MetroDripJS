import React, { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { resendOtp, verifyOtp } from '../../../src/services/authService';
import { ApiError } from '../../../src/services/apiClient';
import { useAuth } from '../../context/AuthContext';

export default function OtpScreen({ navigation, route }) {
  const { login } = useAuth();
  const length = Number(route.params?.codeLength) || 6;
  const [digits, setDigits] = useState(Array.from({ length }, () => ''));
  const [challengeId, setChallengeId] = useState(route.params?.challengeId || '');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(Number(route.params?.resendAfter) || 60);
  const inputs = useRef([]);
  const purpose = route.params?.purpose;
  const maskedEmail = route.params?.maskedEmail || 'your email';

  React.useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const setDigit = (index, text) => {
    const clean = text.replace(/\D/g, '');
    if (clean.length > 1) {
      const next = [...digits];
      clean.slice(0, length - index).split('').forEach((digit, offset) => {
        next[index + offset] = digit;
      });
      setDigits(next);
      inputs.current[Math.min(index + clean.length, length - 1)]?.focus();
      return;
    }
    const next = [...digits];
    next[index] = clean;
    setDigits(next);
    if (clean) inputs.current[index + 1]?.focus();
  };

  const submit = async () => {
    const code = digits.join('');
    if (loading || code.length !== length) {
      setMessage('Enter the full code from your email.');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const data = await verifyOtp(challengeId, code);
      if (purpose === 'email_verification' || data.verified) {
        setMessage('Email confirmed. Sign in to continue.');
        navigation.navigate('Login');
        return;
      }
      if (!data?.token && !data?.access_token) {
        setMessage('Verification did not create a session. Please try again.');
        return;
      }
      login(data);
      navigation.navigate('Home');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'The code could not be verified.');
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (loading || cooldown > 0) return;
    setLoading(true);
    setMessage('');
    try {
      const data = await resendOtp(challengeId);
      setChallengeId(data.challenge_id);
      setCooldown(Number(data.resend_after) || 60);
      setMessage(`A new code was sent to ${data.masked_email || maskedEmail}.`);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'A new code could not be sent.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.heading}>{purpose === 'email_verification' ? 'Verify your email' : 'Two-factor authentication'}</Text>
      <Text style={styles.copy}>Enter the code sent to {maskedEmail}. It expires in 5 minutes.</Text>
      <View accessibilityLabel="Email verification code" style={styles.row}>
        {digits.map((digit, index) => (
          <TextInput
            key={index}
            ref={(node) => { inputs.current[index] = node; }}
            accessibilityLabel={`Digit ${index + 1}`}
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            inputMode="numeric"
            keyboardType="number-pad"
            maxLength={index === 0 ? length : 1}
            onChangeText={(text) => setDigit(index, text)}
            onKeyPress={({ nativeEvent }) => {
              if (nativeEvent.key === 'Backspace' && !digits[index] && index > 0) inputs.current[index - 1]?.focus();
            }}
            style={styles.box}
            textContentType="oneTimeCode"
            value={digit}
          />
        ))}
      </View>
      {!!message && <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>}
      <TouchableOpacity accessibilityRole="button" disabled={loading} onPress={submit} style={styles.button}>
        {loading ? <ActivityIndicator color="#111" /> : <Text style={styles.buttonText}>Verify</Text>}
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" disabled={loading || cooldown > 0} onPress={resend} style={styles.secondary}>
        <Text style={styles.secondaryText}>{cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}</Text>
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('Login')}>
        <Text style={styles.secondaryText}>Back to sign in</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff', padding: 24, gap: 14 },
  heading: { fontSize: 28, fontWeight: '700', color: '#111' },
  copy: { color: '#333', fontSize: 15, lineHeight: 22 },
  row: { flexDirection: 'row', gap: 8 },
  box: { flex: 1, minHeight: 52, maxWidth: 52, borderWidth: 1, borderColor: '#111', textAlign: 'center', fontSize: 24, fontWeight: '700', color: '#111' },
  button: { minHeight: 48, borderRadius: 999, backgroundColor: '#E6FF00', alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontWeight: '700', color: '#111' },
  secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#111', textDecorationLine: 'underline' },
  message: { color: '#8A1F1F' },
});
