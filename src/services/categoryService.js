import { categories } from '../../mobile/data/categories';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const categoryService= {
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
};
