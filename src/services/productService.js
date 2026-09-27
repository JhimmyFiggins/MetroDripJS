import { apiFetch } from './apiClient';

// Query params supported by GET /products/ (see metrodrip_backend/catalog/views.py).
const FILTER_KEYS = ['search', 'category', 'size', 'color', 'fit', 'sort'];

function buildQueryString(params = {}) {
  const parts = [];
  for (const key of FILTER_KEYS) {
    const value = params[key];
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

export const productService = {
  // params (all optional): { search, category, size, color, fit, sort }
  // sort: 'newest' | 'price_asc' | 'price_desc'
  getAllProducts: async (params = {}) => {
    return apiFetch(`/products/${buildQueryString(params)}`);
  },

  getProductById: async (productId) => {
    return apiFetch(`/products/${productId}/`);
  },
};
