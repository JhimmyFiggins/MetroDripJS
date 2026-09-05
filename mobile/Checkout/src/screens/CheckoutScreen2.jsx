/**
 * M06 · Checkout — Figma node 64:152.
 *
 * Step indicator (24pt circles; done/current = volt with onVolt numeral) →
 * labelled address fields (mono 9pt tracking-0.8 uppercase labels) → ZONE
 * select with 2pt ink outline → three payment radios (selected = 2pt ink
 * border + volt inner dot) → sticky volt "Pay <total>" + mono security line.
 *
 * The Pay label's amount is the SERVER total from zone-aware /cart/validate/;
 * the order itself is created by POST /checkout/ (D-13).
 */

import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError, OfflineError, request } from '@/api/client';
import { commerce } from '@/api/endpoints';
import { Mono, NavBar, PillButton, StickyBar } from '@/components/primitives';
import { useAuth } from '@/store/AuthContext';
import { useCart } from '@/store/CartContext';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/theme';
import { fonts } from '@/theme/typography';

const PAYMENT_METHODS = [
  { key: 'gcash', name: 'GCash', subline: 'Pay via the GCash app' },
  { key: 'maya', name: 'Maya', subline: 'Wallet or Maya card' },
  { key: 'card', name: 'Card', subline: 'Visa · Mastercard · JCB' },
];

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
  flex,
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flex: flex ? 1 : undefined,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.input,
        paddingHorizontal: space.s14,
        paddingVertical: 11,
        gap: 3,
      }}
    >
      <Mono size={9} color={colors.muted} style={{ letterSpacing: 0.8 }}>
        {label}
      </Mono>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'}
        accessibilityLabel={label}
        style={{ fontFamily: fonts.body, fontSize: 14, color: colors.ink, padding: 0 }}
      />
    </View>
  );
}

export default function CheckoutScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const cart = useCart();
  const { customer } = useAuth();

  const [zones, setZones] = useState([]);
  const [zone, setZoneState] = useState(null);
  const [method, setMethod] = useState('gcash');
  const [totalDisplay, setTotalDisplay] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    customer_name: customer?.name ?? '',
    email: customer?.email ?? '',
    phone: customer?.phone ?? '',
    address_line1: '',
    city: '',
  });
  const set = (key) => (value) => setForm({ ...form, [key]: value });

  // Step state: address (1) and shipping (2) live on this screen; payment (3)
  // completes on the provider page — so 1 and 2 render volt, 3 renders todo.
  const steps = [
    { number: 1, label: 'Address', done: true },
    { number: 2, label: 'Shipping', done: true },
    { number: 3, label: 'Payment', done: false },
  ];

  useEffect(() => {
    commerce
      .zones()
      .then((page) => {
        setZones(page.results);
        if (page.results.length > 0) setZoneState(page.results[0]);
      })
      .catch((err) => {
        setError(
          err instanceof OfflineError
            ? "You're offline — reconnect to choose a delivery zone."
            : 'Could not load delivery zones. Pull to retry.',
        );
      });
  }, []);

  useEffect(() => {
    if (!zone || cart.lines.length === 0) return;
    const items = cart.lines.map((line) => ({ variant_id: line.variantId, qty: line.qty }));
    request('/cart/validate/', {
      method: 'POST',
      body: { items, zone_id: zone.id },
      auth: false,
    })
      .then((data) => setTotalDisplay(data.total_display ?? ''))
      .catch(() => setTotalDisplay(''));
  }, [zone, cart.lines]);

  const chooseZone = () => {
    Alert.alert(
      'Region / Zone',
      undefined,
      zones.map((candidate) => ({
        text: `${candidate.name} — ${candidate.fee_display}`,
        onPress: () => setZoneState(candidate),
      })),
    );
  };

  const pay = async () => {
    if (!zone) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await commerce.checkout(
        { ...form, zone_id: zone.id },
        cart.lines.map((line) => ({ variant_id: line.variantId, qty: line.qty })),
      );
      cart.clear();
      if (result.payment_provider === 'simulated') {
        // Sandbox completion (server-gated); then straight to tracking.
        await commerce.confirmSimulated(result.status_token).catch(() => undefined);
        navigation.replace('OrderTracking', { token: result.status_token });
      } else {
        // Hosted PayMongo page; the deep link returns to tracking (§6.2 —
        // card data never touches the app).
        await Linking.openURL(result.checkout_url);
        navigation.replace('OrderTracking', { token: result.status_token });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Network error — please try again.');
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.paper }}>
      <NavBar
        title="Checkout"
        onBack={() => navigation.goBack()}
        right={<Text style={{ fontSize: 18 }}>🔒</Text>}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView>
          {/* Step indicator. */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.s6,
              paddingHorizontal: space.screenX,
              paddingVertical: space.s14,
            }}
          >
            {steps.map((step, index) => (
              <React.Fragment key={step.number}>
                {index > 0 ? <View style={{ flex: 1, height: 2, backgroundColor: colors.border }} /> : null}
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: radius.pill,
                    backgroundColor: step.done ? colors.volt : colors.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Mono size={11} weight="semibold" color={step.done ? colors.onVolt : colors.muted}>
                    {step.number}
                  </Mono>
                </View>
                <Text
                  style={{
                    fontFamily: fonts.bodyMedium,
                    fontSize: 12,
                    color: step.done ? colors.ink : colors.muted,
                  }}
                >
                  {step.label}
                </Text>
              </React.Fragment>
            ))}
          </View>

          <View style={{ paddingHorizontal: space.screenX, gap: space.s12 }}>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink }}>
              Delivery address
            </Text>

            <Field label="FULL NAME" value={form.customer_name} onChange={set('customer_name')} />
            <View style={{ flexDirection: 'row', gap: space.s10 }}>
              <Field label="MOBILE" value={form.phone} onChange={set('phone')} keyboardType="phone-pad" flex />
              <Field label="EMAIL" value={form.email} onChange={set('email')} keyboardType="email-address" flex />
            </View>
            <Field label="ADDRESS" value={form.address_line1} onChange={set('address_line1')} placeholder="Unit, street, barangay" />
            <View style={{ flexDirection: 'row', gap: space.s10 }}>
              <Field label="CITY" value={form.city} onChange={set('city')} flex />
              {/* Zone select — 2pt ink outline per the frame. */}
              <Pressable
                onPress={chooseZone}
                accessibilityRole="button"
                accessibilityLabel={`Shipping zone, ${zone?.name ?? 'select'}`}
                style={{
                  flex: 1,
                  borderWidth: 2,
                  borderColor: colors.ink,
                  borderRadius: radius.input,
                  paddingHorizontal: space.s14,
                  paddingVertical: 11,
                  gap: 3,
                }}
              >
                <Mono size={9} color={colors.ink} style={{ letterSpacing: 0.8 }}>
                  ZONE
                </Mono>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.ink }}>
                    {zone ? zone.name : 'Select'}
                  </Text>
                  <Text style={{ fontFamily: fonts.body, fontSize: 13, color: colors.muted }}>⌄</Text>
                </View>
              </Pressable>
            </View>

            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink }}>
              Payment method
            </Text>

            {PAYMENT_METHODS.map((candidate) => {
              const selected = method === candidate.key;
              return (
                <Pressable
                  key={candidate.key}
                  onPress={() => setMethod(candidate.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={candidate.name}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.s12,
                    borderWidth: selected ? 2 : 1,
                    borderColor: selected ? colors.ink : colors.border,
                    borderRadius: radius.input,
                    paddingHorizontal: space.s14,
                    paddingVertical: 13,
                  }}
                >
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: radius.pill,
                      borderWidth: selected ? 2 : 1.5,
                      borderColor: selected ? colors.ink : colors.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {selected ? (
                      <View style={{ width: 9, height: 9, borderRadius: radius.pill, backgroundColor: colors.volt }} />
                    ) : null}
                  </View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={{ fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.ink }}>
                      {candidate.name}
                    </Text>
                    <Text style={{ fontFamily: fonts.body, fontSize: 11, color: colors.muted }}>
                      {candidate.subline}
                    </Text>
                  </View>
                </Pressable>
              );
            })}

            {error ? (
              <Mono
                size={11}
                weight="medium"
                color={colors.danger}
                accessibilityLiveRegion="assertive"
                accessibilityRole="alert"
              >
                {error}
              </Mono>
            ) : null}
          </View>
          <View style={{ height: space.s12 }} />
        </ScrollView>

        <StickyBar>
          <View style={{ gap: space.s8 }}>
            <PillButton
              label={totalDisplay ? `Pay ${totalDisplay}` : 'Pay'}
              variant="volt"
              loading={submitting}
              disabled={cart.lines.length === 0 || !zone}
              style={{ minHeight: 54 }}
              textStyle={{ fontFamily: fonts.bodyBold, fontSize: 16 }}
              onPress={pay}
            />
            {error && !zone ? (
              <Mono size={10} color={colors.danger} style={{ textAlign: 'center' }}>
                {error}
              </Mono>
            ) : (
              <Mono size={10} color={colors.muted} style={{ textAlign: 'center' }}>
                Handled by the configured server provider · card details never stored by MetroDrip
              </Mono>
            )}
          </View>
        </StickyBar>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}