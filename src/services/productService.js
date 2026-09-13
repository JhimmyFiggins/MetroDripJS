const API_URL = 'https://metrodripjs.onrender.com';

export const productService = {
  getAllProducts: async () => {
    const response = await fetch(`${API_URL}/products/`);

    if (!response.ok) {
      throw new Error('Failed to fetch products.');
    }

    return await response.json();
  },

  getProductById: async (productId) => {
    const response = await fetch(`${API_URL}/products/${productId}/`);

    if (!response.ok) {
      throw new Error(`Product with ID ${productId} not found.`);
    }

    return await response.json();
  },
};