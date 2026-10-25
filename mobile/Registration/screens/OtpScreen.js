import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { resendOtp, verifyOtp } from '../../../src/services/authService';
import { ApiError } from '../../../src/services/apiClient';
import { useAuth } from '../../context/AuthContext';

export default function OtpScreen({ navigation, route }) {
  const { login } = useAuth();
  const [code, setCode] = useState('');
  const [challengeId, setChallengeId] = useState(route.params?.challengeId || '');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const purpose = route.params?.purpose;
  const maskedEmail = route.params?.maskedEmail || 'your email';

  const submit = async () => {
    if (loading) return;
    setLoading(true);
    setMessage('');
    try {
      const data = await verifyOtp(challengeId, code);
      if (purpose === 'email_verification' || data.verified) {
        setMessage('Email confirmed. Sign in to continue.');
        navigation.navigate('Login');
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
    if (loading) return;
    setLoading(true);
    setMessage('');
    try {
      const data = await resendOtp(challengeId);
      setChallengeId(data.challenge_id);
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
      <Text style={styles.copy}>Enter the 6-digit code sent to {maskedEmail}. It expires in 5 minutes.</Text>
      <TextInput
        accessibilityLabel="One-time code"
        autoComplete="one-time-code"
        inputMode="numeric"
        keyboardType="number-pad"
        maxLength={6}
        onChangeText={setCode}
        style={styles.input}
        textContentType="oneTimeCode"
        value={code}
      />
      {!!message && <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>}
      <TouchableOpacity accessibilityRole="button" disabled={loading || code.length !== 6} onPress={submit} style={styles.button}>
        {loading ? <ActivityIndicator color="#111" /> : <Text style={styles.buttonText}>Verify</Text>}
      </TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" disabled={loading} onPress={resend} style={styles.secondary}>
        <Text style={styles.secondaryText}>Resend code</Text>
      </TouchableOpacity>
      <View>
        <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('Login')}>
          <Text style={styles.secondaryText}>Back to sign in</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff', padding: 24, gap: 12 },
  heading: { fontSize: 28, fontWeight: '700', color: '#111' },
  copy: { color: '#444', fontSize: 15, lineHeight: 22 },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#111', borderRadius: 8, paddingHorizontal: 16, fontSize: 24, letterSpacing: 8 },
  button: { minHeight: 48, borderRadius: 999, backgroundColor: '#E6FF00', alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontWeight: '700', color: '#111' },
  secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#111', textDecorationLine: 'underline' },
  message: { color: '#8A1F1F' },
});
