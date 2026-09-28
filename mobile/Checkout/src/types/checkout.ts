// Keep client-facing values provider-neutral; the backend owns PayMongo's
// provider-specific mapping (for example, `maya` to `paymaya`).
export type PaymentMethod = 'cod' | 'gcash' | 'maya' | 'card';

// Describe the editable delivery information collected by checkout.
export type DeliveryAddress = {
  fullName: string;
  mobile: string;
  email: string;
  address: string;
  city: string;
  zone: string;
};

// Describe one selectable payment row.
export type PaymentOptionModel = {
  id: PaymentMethod;
  title: string;
  subtitle: string;
};
