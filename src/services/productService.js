// src/services/productService.js
import { products } from '../../mobile/data/product';

// Helper to simulate network latency in development (optional)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const productService = {
  // Get all products
  getAllProducts: async () => {
    await delay(200); // Simulates network load
    return products;
  },

  // Get a single product by its ID
  getProductById: async (productId) => {
    await delay(200); // Simulates network load
    const product = products.find((item) => item.id === productId);
    
    if (!product) {
      throw new Error(`Product with ID ${productId} not found.`);
    }
    
    return product;
  },
};