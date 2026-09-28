// Restrict payment state to methods the orders service actually settles.
export type PaymentMethod = 'cod';

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
