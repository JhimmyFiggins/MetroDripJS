import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useCart } from '../../../context/CartContext';
import { createOrder } from '../../../../src/services/orderService';
import { CheckoutProgress } from '../components/CheckoutProgress';
import { colors, fonts } from '../theme';

// Method definitions with icons and subtitles matching Figma
const PAYMENT_METHODS = [
  {
    id: 'gcash',
    title: 'GCash',
    subtitle: 'Pay via the GCash app',
    badge: 'GCash',
  },
  {
    id: 'maya',
    title: 'Maya',
    subtitle: 'Wallet or Maya card',
    badge: 'Maya',
  },
  {
    id: 'card',
    title: 'Card',
    subtitle: 'Visa · Mastercard · JCB',
    badge: 'Card',
  },
  {
    id: 'cod',
    title: 'Cash on Delivery',
    subtitle: 'Pay when your package arrives',
    badge: 'COD',
  },
];

export function PaymentDetailsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const cartContext = useCart();
  const clearCart = cartContext?.clearCart || (() => {});

  // Retrieve draft order and method from navigation params, with Figma fallbacks (node 452:2)
  const orderDraft = route.params?.orderDraft || {
    orderId: 'MD-2026-00318',
    total: 2632,
    fullName: 'Juan R. Dela Cruz',
    mobile: '0917 555 0143',
    email: 'juan@email.com',
    address: 'Unit 4B, 21 Maginhawa St., Teachers Village, Quezon City, Metro Manila (NCR)',
    items: [
      {
        id: '1',
        name: 'Drip Zip-Up Hoodie',
        variant: 'BLACK · M · OVS ×1',
        price: 1249,
        quantity: 1,
        badge: 'H',
      },
      {
        id: '2',
        name: 'Metro Core Boxy Tee',
        variant: 'WHITE · L · REG ×2',
        price: 1383,
        quantity: 2,
        badge: 'T',
      },
    ],
  };

  const initialMethod = route.params?.paymentMethod || 'gcash';
  const [selectedMethod, setSelectedMethod] = useState(initialMethod);
  const [methodModalVisible, setMethodModalVisible] = useState(false);

  // Form states - GCash (Figma node 452:2)
  const [gcashMobile, setGcashMobile] = useState(orderDraft.mobile || '0917 555 0143');
  const [gcashAccountName, setGcashAccountName] = useState(orderDraft.fullName || 'Juan R. Dela Cruz');
  const [saveGcash, setSaveGcash] = useState(true);

  // Form states - Maya (Figma node 452:99)
  const [mayaFundingSource, setMayaFundingSource] = useState('wallet'); // 'wallet' | 'card'
  const [mayaMobile, setMayaMobile] = useState(orderDraft.mobile || '0917 555 0143');
  const [mayaAccountName, setMayaAccountName] = useState(orderDraft.fullName || 'Juan R. Dela Cruz');
  const [saveMaya, setSaveMaya] = useState(true);

  // Form states - Card (Figma node 453:2)
  const [cardNumber, setCardNumber] = useState('4111 1111 1111 1111');
  const [cardExpiry, setCardExpiry] = useState('09 / 28');
  const [cardCvv, setCardCvv] = useState('888');
  const [cardName, setCardName] = useState((orderDraft.fullName || 'JUAN R DELA CRUZ').toUpperCase());
  const [billingSameAsDelivery, setBillingSameAsDelivery] = useState(true);
  const [saveCard, setSaveCard] = useState(false);

  // Submission state
  const [isProcessing, setIsProcessing] = useState(false);

  const totalAmount = Number(orderDraft.total) || 0;
  const itemCount = orderDraft.items?.reduce((sum, it) => sum + (it.quantity || 1), 0) || 0;

  const formatPeso = (val) =>
    `₱${Number(val).toLocaleString('en-PH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  const formatCardInput = (text) => {
    const cleaned = text.replace(/\D/g, '').slice(0, 16);
    const parts = cleaned.match(/[\s\S]{1,4}/g) || [];
    setCardNumber(parts.join(' '));
  };

  const getCardBrand = (num) => {
    const clean = num.replace(/\s+/g, '');
    if (clean.startsWith('4')) return 'VISA';
    if (
      clean.startsWith('51') ||
      clean.startsWith('52') ||
      clean.startsWith('53') ||
      clean.startsWith('54') ||
      clean.startsWith('55')
    )
      return 'MC';
    if (clean.startsWith('35')) return 'JCB';
    return 'CARD';
  };

  const currentMethodObj =
    PAYMENT_METHODS.find((m) => m.id === selectedMethod) || PAYMENT_METHODS[0];
  
    const handlePay = async () => {
    // Validation
    if (selectedMethod === 'gcash') {
      if (!gcashMobile.trim() || !gcashAccountName.trim()) {
        const msg = 'Please enter both your GCash mobile number and account name.';
        Platform.OS === 'web' && typeof window !== 'undefined'
          ? window.alert(`Incomplete GCash Details\n\n${msg}`)
          : Alert.alert('Incomplete GCash Details', msg);
        return;
      }
    } else if (selectedMethod === 'maya') {
      if (!mayaMobile.trim() || !mayaAccountName.trim()) {
        const msg = 'Please enter both your Maya mobile number and account name.';
        Platform.OS === 'web' && typeof window !== 'undefined'
          ? window.alert(`Incomplete Maya Details\n\n${msg}`)
          : Alert.alert('Incomplete Maya Details', msg);
        return;
      }
    } else if (selectedMethod === 'card') {
      if (!cardNumber.trim() || !cardExpiry.trim() || !cardCvv.trim() || !cardName.trim()) {
        const msg = 'Please fill in all card details (number, expiry, CVV, and name on card).';
        Platform.OS === 'web' && typeof window !== 'undefined'
          ? window.alert(`Incomplete Card Details\n\n${msg}`)
          : Alert.alert('Incomplete Card Details', msg);
        return;
      }
    }

    setIsProcessing(true);

    // Simulate PayMongo transaction processing
      setTimeout(async () => {
      console.log('PAY BUTTON REACHED');
      setIsProcessing(false);
      
      // Compute display payment details string for confirmation receipt
      let paymentDetailStr = '';
      if (selectedMethod === 'gcash') {
        paymentDetailStr = `GCash · ${gcashMobile}`;
      } else if (selectedMethod === 'maya') {
        paymentDetailStr = `Maya ${mayaFundingSource === 'wallet' ? 'Wallet' : 'Card'} · ${mayaMobile}`;
      } else if (selectedMethod === 'card') {
        const last4 = cardNumber.replace(/\s+/g, '').slice(-4) || '1111';
        paymentDetailStr = `${getCardBrand(cardNumber)} ending in ${last4}`;
      } else {
        paymentDetailStr = `Cash on Delivery · ${orderDraft.mobile}`;
      } 
      console.log('STARTING ORDER API REQUEST');
      console.log('ORDER ITEMS:', JSON.stringify(orderDraft.items, null, 2));
      console.log('FIRST ITEM:', orderDraft.items?.[0]);

      // customer_id is resolved server-side from the X-Customer-ID header,
      // which apiClient fills from AuthContext.
      const orderBody = {
        status: 'pending',
        subtotal: orderDraft.items.reduce(
          (sum, item) => sum + Number(item.price) * item.quantity,
          0
        ),
        tax: 0,
        shipping: 150,
        discount: 0,
        total: totalAmount,
        currency: 'PHP',
        notes: null,
        shipping_address: {
          name: orderDraft.fullName,
          address_line1: orderDraft.address,
          address_line2: null,
          city: 'Quezon City',
          state: 'Metro Manila (NCR)',
          postal_code: null,
          country: 'PH',
          phone: orderDraft.mobile,
        },
        lines: orderDraft.items.map((item) => ({
          product: item.productId,
          variant: item.variantId,
          quantity: item.quantity,
          unit_price: Number(item.price),
          discount_amount: 0,
          tax_amount: 0,
          tax_rate: 0,
        })),
      };
      console.log('ORDER BODY:', JSON.stringify(orderBody, null, 2));

      let savedOrder;
      try {
        savedOrder = await createOrder(orderBody);
      } catch (error) {
        console.error('Failed to create order:', error);
        const msg =
          (error && error.message) ||
          'Something went wrong while creating your order. Please try again.';
        Platform.OS === 'web' && typeof window !== 'undefined'
          ? window.alert(`Order Failed\n\n${msg}`)
          : Alert.alert('Order Failed', msg);
        return;
      }

      const now = new Date();
      const formattedDate = `${now.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      })} · ${now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })}`;

      const orderPayload = {
        orderId: savedOrder.id,
        refNo: `PM-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        total: totalAmount,
        date: formattedDate,
        paymentMethod: currentMethodObj.title,
        paymentDetail: paymentDetailStr,
        email: orderDraft.email || 'juan@email.com',
        fullName: orderDraft.fullName || 'Juan R. Dela Cruz',
        address: orderDraft.address || 'Metro Manila (NCR)',
        eta: 'Arriving in 2–3 days (Jul 20 · 2–5 PM)',
        courier: 'J&T Express',
        items: orderDraft.items || [],
      };

      clearCart();

      navigation.navigate('OrderConfirmation', {
        order: orderPayload,
      });
    }, 900);
  };

  // Reusable custom Checkbox component
  const RenderCheckbox = ({ checked, onPress, label }) => (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onPress}
      style={styles.checkboxRow}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Text style={styles.checkboxCheck}>✓</Text>}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );

  // Method selector summary card (Figma node 452:78, 452:129, 453:32)
  const selectedMethodCard = (
    <View style={styles.selectedMethodCard}>
      <View style={styles.radioOuter}>
        <View style={styles.radioInner} />
      </View>
      <View style={styles.methodInfo}>
        <Text style={styles.methodTitle}>{currentMethodObj.title}</Text>
        <Text style={styles.methodSubtitle}>{currentMethodObj.subtitle}</Text>
      </View>
      <Pressable
        accessibilityLabel="Change payment method"
        accessibilityRole="button"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        onPress={() => setMethodModalVisible(true)}
        style={styles.changeButton}
      >
        <Text style={styles.changeButtonText}>Change</Text>
      </Pressable>
    </View>
  );

  // Amount due card (Figma node 452:74, 452:125, 453:28)
  const amountDueCard = (
    <View style={styles.amountDueCard}>
      <Text style={styles.amountDueLabel}>AMOUNT DUE</Text>
      <Text style={styles.amountDuePrice}>{formatPeso(totalAmount)}</Text>
      <Text style={styles.amountDueSubtitle}>
        Order {orderDraft.orderId} · {itemCount} items
      </Text>
    </View>
  );

  return (
    <SafeAreaView edges={Platform.OS === 'web' ? [] : ['top']} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        {/* Navigation Header (Figma 452:9, 452:106, 453:9) */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Pressable
              accessibilityLabel="Go back to checkout"
              accessibilityRole="button"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              onPress={() => navigation.goBack()}
              style={styles.backButton}
            >
              <Text style={styles.backArrow}>‹</Text>
            </Pressable>
            <Text style={styles.headerTitle}>Payment</Text>
          </View>
          <Text accessibilityLabel="Secured checkout" style={styles.lockIcon}>
            🔒
          </Text>
        </View>

        {isWide ? (
          /* Desktop Responsive 2-Column Layout */
          <ScrollView
            contentContainerStyle={styles.desktopScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.desktopRow}>
              {/* Left Column: Progress & Payment Form */}
              <View style={styles.desktopLeft}>
                <CheckoutProgress currentStep={3} />
                <View style={styles.bodyWrapper}>
                  {selectedMethodCard}

                  {/* GCash Form */}
                  {selectedMethod === 'gcash' && (
                    <View style={styles.formContainer}>
                      <Text style={styles.formSectionTitle}>GCash account</Text>
                      <View style={[styles.fieldContainer, styles.fieldActive]}>
                        <Text style={styles.fieldLabel}>GCASH MOBILE NUMBER</Text>
                        <TextInput
                          keyboardType="phone-pad"
                          onChangeText={setGcashMobile}
                          style={styles.fieldInput}
                          value={gcashMobile}
                        />
                      </View>
                      <View style={styles.fieldContainer}>
                        <Text style={styles.fieldLabel}>ACCOUNT NAME</Text>
                        <TextInput
                          onChangeText={setGcashAccountName}
                          style={styles.fieldInput}
                          value={gcashAccountName}
                        />
                      </View>
                      <View style={styles.noteCard}>
                        <Text style={styles.noteIcon}>ⓘ</Text>
                        <Text style={styles.noteText}>
                          You will be redirected to the GCash app to authorize{' '}
                          {formatPeso(totalAmount)}. Do not close this screen.
                        </Text>
                      </View>
                      <RenderCheckbox
                        checked={saveGcash}
                        label="Save GCash for faster checkout"
                        onPress={() => setSaveGcash(!saveGcash)}
                      />
                    </View>
                  )}

                  {/* Maya Form */}
                  {selectedMethod === 'maya' && (
                    <View style={styles.formContainer}>
                      <Text style={styles.formSectionTitle}>Maya account</Text>
                      <View style={styles.fundingSourceToggle}>
                        <Pressable
                          onPress={() => setMayaFundingSource('wallet')}
                          style={[
                            styles.fundingTab,
                            mayaFundingSource === 'wallet' && styles.fundingTabActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.fundingTabText,
                              mayaFundingSource === 'wallet' && styles.fundingTabTextActive,
                            ]}
                          >
                            Maya Wallet
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setMayaFundingSource('card')}
                          style={[
                            styles.fundingTab,
                            mayaFundingSource === 'card' && styles.fundingTabActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.fundingTabText,
                              mayaFundingSource === 'card' && styles.fundingTabTextActive,
                            ]}
                          >
                            Maya Card
                          </Text>
                        </Pressable>
                      </View>
                      <View style={[styles.fieldContainer, styles.fieldActive]}>
                        <Text style={styles.fieldLabel}>MAYA MOBILE NUMBER</Text>
                        <TextInput
                          keyboardType="phone-pad"
                          onChangeText={setMayaMobile}
                          style={styles.fieldInput}
                          value={mayaMobile}
                        />
                      </View>
                      <View style={styles.fieldContainer}>
                        <Text style={styles.fieldLabel}>ACCOUNT NAME</Text>
                        <TextInput
                          onChangeText={setMayaAccountName}
                          style={styles.fieldInput}
                          value={mayaAccountName}
                        />
                      </View>
                      <View style={styles.noteCard}>
                        <Text style={styles.noteIcon}>ⓘ</Text>
                        <Text style={styles.noteText}>
                          A 6-digit OTP will be sent to your Maya-registered number to confirm{' '}
                          {formatPeso(totalAmount)}.
                        </Text>
                      </View>
                      <RenderCheckbox
                        checked={saveMaya}
                        label="Save Maya for faster checkout"
                        onPress={() => setSaveMaya(!saveMaya)}
                      />
                    </View>
                  )}

                  {/* Card Form */}
                  {selectedMethod === 'card' && (
                    <View style={styles.formContainer}>
                      <Text style={styles.formSectionTitle}>Card details</Text>
                      <View style={[styles.fieldContainer, styles.fieldActive]}>
                        <Text style={styles.fieldLabel}>CARD NUMBER</Text>
                        <View style={styles.cardInputRow}>
                          <TextInput
                            keyboardType="number-pad"
                            maxLength={19}
                            onChangeText={formatCardInput}
                            style={[styles.fieldInput, styles.cardFieldInput]}
                            value={cardNumber}
                          />
                          <View style={styles.brandBadge}>
                            <Text style={styles.brandBadgeText}>
                              {getCardBrand(cardNumber)}
                            </Text>
                          </View>
                        </View>
                      </View>
                      <View style={styles.fieldDoubleRow}>
                        <View style={[styles.fieldContainer, styles.fieldFlex]}>
                          <Text style={styles.fieldLabel}>EXPIRY</Text>
                          <TextInput
                            maxLength={7}
                            onChangeText={setCardExpiry}
                            placeholder="MM / YY"
                            style={styles.fieldInput}
                            value={cardExpiry}
                          />
                        </View>
                        <View style={[styles.fieldContainer, styles.fieldFlex]}>
                          <Text style={styles.fieldLabel}>CVV</Text>
                          <TextInput
                            keyboardType="number-pad"
                            maxLength={4}
                            onChangeText={setCardCvv}
                            placeholder="•••"
                            secureTextEntry
                            style={styles.fieldInput}
                            value={cardCvv}
                          />
                        </View>
                      </View>
                      <View style={styles.fieldContainer}>
                        <Text style={styles.fieldLabel}>NAME ON CARD</Text>
                        <TextInput
                          autoCapitalize="characters"
                          onChangeText={setCardName}
                          style={styles.fieldInput}
                          value={cardName}
                        />
                      </View>
                      <RenderCheckbox
                        checked={billingSameAsDelivery}
                        label="Billing address same as delivery"
                        onPress={() => setBillingSameAsDelivery(!billingSameAsDelivery)}
                      />
                      <View style={styles.noteCard}>
                        <Text style={styles.noteIcon}>ⓘ</Text>
                        <Text style={styles.noteText}>
                          Card details are tokenized by PayMongo. MetroDrip never sees or stores
                          your card number.
                        </Text>
                      </View>
                      <RenderCheckbox
                        checked={saveCard}
                        label="Save card for faster checkout"
                        onPress={() => setSaveCard(!saveCard)}
                      />
                    </View>
                  )}

                  {/* COD Fallback */}
                  {selectedMethod === 'cod' && (
                    <View style={styles.formContainer}>
                      <Text style={styles.formSectionTitle}>Cash on Delivery</Text>
                      <View style={styles.noteCard}>
                        <Text style={styles.noteIcon}>ⓘ</Text>
                        <Text style={styles.noteText}>
                          Please prepare exact cash of {formatPeso(totalAmount)} upon courier
                          arrival at your delivery address.
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              </View>

              {/* Right Column: Amount Due & Action Sidebar */}
              <View style={styles.desktopRight}>
                {amountDueCard}
                <View style={styles.desktopPayCard}>
                  <Pressable
                    accessibilityLabel={`Pay ${formatPeso(totalAmount)}`}
                    accessibilityRole="button"
                    disabled={isProcessing}
                    onPress={handlePay}
                    style={({ pressed }) => [
                      styles.payButton,
                      pressed && styles.payButtonPressed,
                      isProcessing && styles.payButtonDisabled,
                    ]}
                  >
                    {isProcessing ? (
                      <ActivityIndicator color={colors.ink} size="small" />
                    ) : (
                      <Text style={styles.payButtonText}>
                        Pay ₱{Math.round(totalAmount).toLocaleString()}
                      </Text>
                    )}
                  </Pressable>
                  <Text style={styles.payMongoSecurityText}>
                    Secured by PayMongo · card details never stored
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>
        ) : (
          /* Mobile Single-Column Layout */
          <View style={styles.mobileWrapper}>
            <ScrollView
              contentContainerStyle={styles.mobileScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <CheckoutProgress currentStep={3} />

              <View style={styles.bodyWrapper}>
                {amountDueCard}
                {selectedMethodCard}

                {/* GCash Form (Figma node 452:2) */}
                {selectedMethod === 'gcash' && (
                  <View style={styles.formContainer}>
                    <Text style={styles.formSectionTitle}>GCash account</Text>
                    <View style={[styles.fieldContainer, styles.fieldActive]}>
                      <Text style={styles.fieldLabel}>GCASH MOBILE NUMBER</Text>
                      <TextInput
                        keyboardType="phone-pad"
                        onChangeText={setGcashMobile}
                        style={styles.fieldInput}
                        value={gcashMobile}
                      />
                    </View>
                    <View style={styles.fieldContainer}>
                      <Text style={styles.fieldLabel}>ACCOUNT NAME</Text>
                      <TextInput
                        onChangeText={setGcashAccountName}
                        style={styles.fieldInput}
                        value={gcashAccountName}
                      />
                    </View>
                    <View style={styles.noteCard}>
                      <Text style={styles.noteIcon}>ⓘ</Text>
                      <Text style={styles.noteText}>
                        You will be redirected to the GCash app to authorize {formatPeso(totalAmount)}.
                        Do not close this screen.
                      </Text>
                    </View>
                    <RenderCheckbox
                      checked={saveGcash}
                      label="Save GCash for faster checkout"
                      onPress={() => setSaveGcash(!saveGcash)}
                    />
                  </View>
                )}

                {/* Maya Form (Figma node 452:99) */}
                {selectedMethod === 'maya' && (
                  <View style={styles.formContainer}>
                    <Text style={styles.formSectionTitle}>Maya account</Text>
                    <View style={styles.fundingSourceToggle}>
                      <Pressable
                        onPress={() => setMayaFundingSource('wallet')}
                        style={[
                          styles.fundingTab,
                          mayaFundingSource === 'wallet' && styles.fundingTabActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.fundingTabText,
                            mayaFundingSource === 'wallet' && styles.fundingTabTextActive,
                          ]}
                        >
                          Maya Wallet
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setMayaFundingSource('card')}
                        style={[
                          styles.fundingTab,
                          mayaFundingSource === 'card' && styles.fundingTabActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.fundingTabText,
                            mayaFundingSource === 'card' && styles.fundingTabTextActive,
                          ]}
                        >
                          Maya Card
                        </Text>
                      </Pressable>
                    </View>
                    <View style={[styles.fieldContainer, styles.fieldActive]}>
                      <Text style={styles.fieldLabel}>MAYA MOBILE NUMBER</Text>
                      <TextInput
                        keyboardType="phone-pad"
                        onChangeText={setMayaMobile}
                        style={styles.fieldInput}
                        value={mayaMobile}
                      />
                    </View>
                    <View style={styles.fieldContainer}>
                      <Text style={styles.fieldLabel}>ACCOUNT NAME</Text>
                      <TextInput
                        onChangeText={setMayaAccountName}
                        style={styles.fieldInput}
                        value={mayaAccountName}
                      />
                    </View>
                    <View style={styles.noteCard}>
                      <Text style={styles.noteIcon}>ⓘ</Text>
                      <Text style={styles.noteText}>
                        A 6-digit OTP will be sent to your Maya-registered number to confirm{' '}
                        {formatPeso(totalAmount)}.
                      </Text>
                    </View>
                    <RenderCheckbox
                      checked={saveMaya}
                      label="Save Maya for faster checkout"
                      onPress={() => setSaveMaya(!saveMaya)}
                    />
                  </View>
                )}

                {/* Card Form (Figma node 453:2) */}
                {selectedMethod === 'card' && (
                  <View style={styles.formContainer}>
                    <Text style={styles.formSectionTitle}>Card details</Text>
                    <View style={[styles.fieldContainer, styles.fieldActive]}>
                      <Text style={styles.fieldLabel}>CARD NUMBER</Text>
                      <View style={styles.cardInputRow}>
                        <TextInput
                          keyboardType="number-pad"
                          maxLength={19}
                          onChangeText={formatCardInput}
                          style={[styles.fieldInput, styles.cardFieldInput]}
                          value={cardNumber}
                        />
                        <View style={styles.brandBadge}>
                          <Text style={styles.brandBadgeText}>{getCardBrand(cardNumber)}</Text>
                        </View>
                      </View>
                    </View>
                    <View style={styles.fieldDoubleRow}>
                      <View style={[styles.fieldContainer, styles.fieldFlex]}>
                        <Text style={styles.fieldLabel}>EXPIRY</Text>
                        <TextInput
                          maxLength={7}
                          onChangeText={setCardExpiry}
                          placeholder="MM / YY"
                          style={styles.fieldInput}
                          value={cardExpiry}
                        />
                      </View>
                      <View style={[styles.fieldContainer, styles.fieldFlex]}>
                        <Text style={styles.fieldLabel}>CVV</Text>
                        <TextInput
                          keyboardType="number-pad"
                          maxLength={4}
                          onChangeText={setCardCvv}
                          placeholder="•••"
                          secureTextEntry
                          style={styles.fieldInput}
                          value={cardCvv}
                        />
                      </View>
                    </View>
                    <View style={styles.fieldContainer}>
                      <Text style={styles.fieldLabel}>NAME ON CARD</Text>
                      <TextInput
                        autoCapitalize="characters"
                        onChangeText={setCardName}
                        style={styles.fieldInput}
                        value={cardName}
                      />
                    </View>
                    <RenderCheckbox
                      checked={billingSameAsDelivery}
                      label="Billing address same as delivery"
                      onPress={() => setBillingSameAsDelivery(!billingSameAsDelivery)}
                    />
                    <View style={styles.noteCard}>
                      <Text style={styles.noteIcon}>ⓘ</Text>
                      <Text style={styles.noteText}>
                        Card details are tokenized by PayMongo. MetroDrip never sees or stores your
                        card number.
                      </Text>
                    </View>
                    <RenderCheckbox
                      checked={saveCard}
                      label="Save card for faster checkout"
                      onPress={() => setSaveCard(!saveCard)}
                    />
                  </View>
                )}

                {/* COD Fallback */}
                {selectedMethod === 'cod' && (
                  <View style={styles.formContainer}>
                    <Text style={styles.formSectionTitle}>Cash on Delivery</Text>
                    <View style={styles.noteCard}>
                      <Text style={styles.noteIcon}>ⓘ</Text>
                      <Text style={styles.noteText}>
                        Please prepare exact cash of {formatPeso(totalAmount)} upon courier arrival
                        at your delivery address.
                      </Text>
                    </View>
                  </View>
                )}
              </View>

              <View style={styles.mobileScrollSpacer} />
            </ScrollView>

            {/* Mobile Fixed Safe Bottom Payment Bar (Figma node 452:69, 452:150, 453:53) */}
            <View
              style={[
                styles.mobileFixedFooter,
                { paddingBottom: Math.max(insets.bottom, 24) },
              ]}
            >
              <Pressable
                accessibilityLabel={`Pay ${formatPeso(totalAmount)}`}
                accessibilityRole="button"
                disabled={isProcessing}
                onPress={handlePay}
                style={({ pressed }) => [
                  styles.payButton,
                  pressed && styles.payButtonPressed,
                  isProcessing && styles.payButtonDisabled,
                ]}
              >
                {isProcessing ? (
                  <ActivityIndicator color={colors.ink} size="small" />
                ) : (
                  <Text style={styles.payButtonText}>
                    Pay ₱{Math.round(totalAmount).toLocaleString()}
                  </Text>
                )}
              </Pressable>
              <Text style={styles.payMongoSecurityText}>
                Secured by PayMongo · card details never stored
              </Text>
            </View>
          </View>
        )}

        {/* Payment Method Switcher Modal */}
        <Modal
          animationType="fade"
          onRequestClose={() => setMethodModalVisible(false)}
          transparent
          visible={methodModalVisible}
        >
          <Pressable
            accessibilityLabel="Close payment method options"
            onPress={() => setMethodModalVisible(false)}
            style={styles.modalBackdrop}
          >
            <Pressable onPress={(e) => e.stopPropagation()} style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Payment Method</Text>
                <Pressable
                  accessibilityLabel="Close"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  onPress={() => setMethodModalVisible(false)}
                >
                  <Text style={styles.modalCloseText}>✕</Text>
                </Pressable>
              </View>
              {PAYMENT_METHODS.map((method) => {
                const isSelected = selectedMethod === method.id;
                return (
                  <Pressable
                    key={method.id}
                    onPress={() => {
                      setSelectedMethod(method.id);
                      setMethodModalVisible(false);
                    }}
                    style={[
                      styles.methodOptionItem,
                      isSelected && styles.methodOptionItemSelected,
                    ]}
                  >
                    <View style={styles.radioOuter}>
                      {isSelected && <View style={styles.radioInner} />}
                    </View>
                    <View style={styles.methodOptionTextGroup}>
                      <Text style={styles.methodOptionTitle}>{method.title}</Text>
                      <Text style={styles.methodOptionSubtitle}>{method.subtitle}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </Pressable>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  // Header per Figma 452:9, 452:106, 453:9
  header: {
    height: 52,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: colors.paper,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    paddingRight: 4,
  },
  backArrow: {
    fontSize: 26,
    color: colors.ink,
    lineHeight: 28,
  },
  headerTitle: {
    fontFamily: fonts.interBold,
    fontWeight: '700',
    fontSize: 17,
    color: colors.ink,
  },
  lockIcon: {
    fontSize: 18,
    color: colors.ink,
  },
  // Body and layout containers
  bodyWrapper: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 16,
    gap: 12,
  },
  mobileWrapper: {
    flex: 1,
  },
  mobileScrollContent: {
    flexGrow: 1,
  },
  mobileScrollSpacer: {
    height: 120,
  },
  // Desktop layout
  desktopScrollContent: {
    paddingHorizontal: 24,
    paddingVertical: 20,
    maxWidth: 1040,
    alignSelf: 'center',
    width: '100%',
  },
  desktopRow: {
    flexDirection: 'row',
    gap: 32,
    alignItems: 'flex-start',
  },
  desktopLeft: {
    flex: 7,
  },
  desktopRight: {
    flex: 5,
    gap: 16,
    position: Platform.OS === 'web' ? 'sticky' : 'relative',
    top: 16,
  },
  desktopPayCard: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 18,
    gap: 10,
  },
  // Amount due card per Figma 452:74
  amountDueCard: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 2,
  },
  amountDueLabel: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1.2,
    color: colors.muted,
  },
  amountDuePrice: {
    fontFamily: fonts.interBold,
    fontWeight: '900',
    fontSize: 30,
    color: colors.ink,
    letterSpacing: -0.5,
  },
  amountDueSubtitle: {
    fontFamily: fonts.monoRegular,
    fontSize: 10,
    color: colors.muted,
  },
  // Selected method banner per Figma 452:78
  selectedMethodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderWidth: 2,
    borderColor: colors.ink,
    borderRadius: 10,
    backgroundColor: colors.paper,
    gap: 12,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: colors.volt,
  },
  methodInfo: {
    flex: 1,
    gap: 2,
  },
  methodTitle: {
    fontFamily: fonts.interSemiBold,
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
  },
  methodSubtitle: {
    fontFamily: fonts.interRegular,
    fontSize: 11,
    color: colors.muted,
  },
  changeButton: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  changeButtonText: {
    fontFamily: fonts.interSemiBold,
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted,
  },
  // Form container & inputs
  formContainer: {
    gap: 12,
    marginTop: 4,
  },
  formSectionTitle: {
    fontFamily: fonts.interBold,
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  fieldContainer: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 3,
    backgroundColor: colors.paper,
  },
  fieldActive: {
    borderWidth: 2,
    borderColor: colors.ink,
  },
  fieldFlex: {
    flex: 1,
  },
  fieldDoubleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  fieldLabel: {
    fontFamily: fonts.monoRegular,
    fontSize: 9,
    letterSpacing: 0.8,
    color: colors.muted,
    textTransform: 'uppercase',
  },
  fieldInput: {
    fontFamily: fonts.interRegular,
    fontSize: 14,
    color: colors.ink,
    padding: 0,
    margin: 0,
  },
  cardInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardFieldInput: {
    flex: 1,
    fontFamily: fonts.monoRegular,
    letterSpacing: 1,
  },
  brandBadge: {
    backgroundColor: colors.ink,
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  brandBadgeText: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.6,
    color: colors.paper,
  },
  // Maya Funding Source toggle pill (Figma 452:154)
  fundingSourceToggle: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  fundingTab: {
    flex: 1,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  fundingTabActive: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.ink,
  },
  fundingTabText: {
    fontFamily: fonts.interRegular,
    fontSize: 13,
    color: colors.muted,
  },
  fundingTabTextActive: {
    fontFamily: fonts.interSemiBold,
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
  // Note Card per Figma 452:92, 452:143, 453:80
  noteCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    alignItems: 'flex-start',
  },
  noteIcon: {
    fontFamily: fonts.interRegular,
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  noteText: {
    flex: 1,
    fontFamily: fonts.interRegular,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
  },
  // Checkbox row per Figma 452:95, 452:146, 453:76
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 2,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper,
  },
  checkboxChecked: {
    backgroundColor: colors.volt,
    borderColor: colors.ink,
  },
  checkboxCheck: {
    fontFamily: fonts.interBold,
    fontWeight: '700',
    fontSize: 11,
    color: colors.ink,
  },
  checkboxLabel: {
    fontFamily: fonts.interRegular,
    fontSize: 13,
    color: colors.ink,
  },
  // Fixed Mobile Footer per Figma 452:69
  mobileFixedFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.paper,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  payButton: {
    height: 54,
    borderRadius: 9999,
    backgroundColor: colors.volt,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  payButtonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  payButtonDisabled: {
    opacity: 0.6,
  },
  payButtonText: {
    fontFamily: fonts.interBold,
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  payMongoSecurityText: {
    fontFamily: fonts.monoRegular,
    fontSize: 10,
    color: colors.muted,
    textAlign: 'center',
  },
  // Modal for changing method
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 20, 20, 0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    gap: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
  },
  modalTitle: {
    fontFamily: fonts.interBold,
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  modalCloseText: {
    fontSize: 16,
    color: colors.muted,
  },
  methodOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  methodOptionItemSelected: {
    borderColor: colors.ink,
    borderWidth: 2,
  },
  methodOptionTextGroup: {
    flex: 1,
  },
  methodOptionTitle: {
    fontFamily: fonts.interSemiBold,
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
  },
  methodOptionSubtitle: {
    fontFamily: fonts.interRegular,
    fontSize: 11,
    color: colors.muted,
  },
});
