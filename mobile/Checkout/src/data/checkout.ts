// Import checkout-only types so sample data remains type-safe.
import type { DeliveryAddress, PaymentOptionModel } from '../types/checkout';

// Start with no personal data. Checkout may prefill real fields from the
// authenticated account, but never displays a fabricated customer identity.
export const initialDeliveryAddress: DeliveryAddress = {
  fullName: '',
  mobile: '',
  email: '',
  address: '',
  city: '',
  zone: '',
};

export const paymentOptions: readonly PaymentOptionModel[] = [
  { id: 'cod', title: 'Cash on Delivery', subtitle: 'Pay when your package arrives' },
  { id: 'gcash', title: 'GCash', subtitle: 'Continue in PayMongo secure checkout' },
  { id: 'maya', title: 'Maya', subtitle: 'Continue in PayMongo secure checkout' },
  { id: 'card', title: 'Credit or Debit Card', subtitle: 'Enter card details securely on PayMongo' },
];

// Provide realistic Philippine delivery zones for the interactive selector.
export const deliveryZones = [
  'Metro Manila (NCR)',
  'Luzon',
  'Visayas',
  'Mindanao',
] as const;

// Format totals using the exact peso presentation shown in the design.
export const formatPeso = (amount: number) => `₱${amount.toLocaleString('en-PH')}`;
