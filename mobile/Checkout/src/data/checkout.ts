// Import checkout-only types so sample data remains type-safe.
import type { DeliveryAddress, PaymentOptionModel } from '../types/checkout';

// Seed the form with the exact customer values shown in Figma.
export const initialDeliveryAddress: DeliveryAddress = {
  fullName: 'Juan R. Dela Cruz',
  mobile: '0917 555 0143',
  email: 'juan@email.com',
  address: 'Unit 4B, 21 Maginhawa St., Teachers Village',
  city: 'Quezon City',
  zone: 'Metro Manila (NCR)',
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

// Keep the display total in one place so the footer and payment handoff agree.
export const orderTotal = 2632;

// Format totals using the exact peso presentation shown in the design.
export const formatPeso = (amount: number) => `₱${amount.toLocaleString('en-PH')}`;
