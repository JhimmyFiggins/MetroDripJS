import { categories } from '../../mobile/data/categories';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const categoryService = {
  // Get all categories
  getAllCategories: async () => {
    await delay(200); // Simulates network load
    return categories;
  },

  // Get a single category by its ID
  getCategoryById: async (categoryId) => {
    await delay(200); // Simulates network load
    const category = categories.find((item) => item.id === categoryId);

    if (!category) {
      throw new Error(`Category with ID ${categoryId} not found.`);
    }

    return category;
  },

  // Get product details (colors, sizes, fit) by product ID
  getProductDetails: async (productId) => {
    await delay(200); // Simulates network load

    // Search through categories to find the matching product
    for (const category of categories) {
      const product = category.products?.find((item) => item.id === productId);

      if (product) {
        return {
          id: product.id,
          name: product.name,
          categoryName: category.name,
          colors: product.colors ?? ['Black', 'White'],
          sizes: product.sizes ?? ['S', 'M', 'L', 'XL'],
          fit: product.fit ?? 'Regular Fit',
          details: product.details ?? {},
        };
      }
    }

    throw new Error(`Product with ID ${productId} not found.`);
  },

  // Format product details for UI rendering
  formatProductVariantInfo: (product) => {
    return {
      availableColors: product.colors?.join(' · ') ?? 'N/A',
      availableSizes: product.sizes?.join(', ') ?? 'N/A',
      fitType: product.fit ?? 'Standard',
    };
  },
};