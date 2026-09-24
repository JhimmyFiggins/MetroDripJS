import { apiFetch } from './apiClient';

// Response: array of { id, product_ref, name, price, image_url, created_at }.
export async function getWishlist() {
  return apiFetch('/wishlist/');
}

// The backend expects the product id as `product_ref` in the request body.
// Response: { id, product_ref, created } (201).
export async function addToWishlist(productId) {
  return apiFetch('/wishlist/', {
    method: 'POST',
    body: { product_ref: productId },
  });
}

// DELETE /wishlist/ (no /<id>/ route exists); the backend accepts `id`
// (wishlist item id) or `product_ref` in the JSON body or query params.
export async function removeFromWishlist(productId) {
  return apiFetch('/wishlist/', {
    method: 'DELETE',
    body: { product_ref: productId },
  });
}
