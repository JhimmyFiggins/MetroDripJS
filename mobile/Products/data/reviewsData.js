// Seeded reviews matching Figma frame M04a · Product Detail (node 449:21)
const defaultReviews = [
  {
    id: 'rev-1',
    author: 'Bea S.',
    verified: true,
    rating: 5,
    date: '2 days ago',
    comment: 'Super lapad ng fit, exactly what I wanted. Worth it.',
  },
  {
    id: 'rev-2',
    author: 'Miguel R.',
    verified: true,
    rating: 4,
    date: '3 days ago',
    comment: 'Quality is solid, shipped in 2 days to QC.',
  },
  {
    id: 'rev-3',
    author: 'Paolo M.',
    verified: true,
    rating: 5,
    date: '1 week ago',
    comment: 'Heavyweight fleece is top tier. Two-way YKK zip feels premium and sturdy.',
  },
  {
    id: 'rev-4',
    author: 'Camille T.',
    verified: true,
    rating: 5,
    date: '2 weeks ago',
    comment: 'Bagay sa street style aesthetic. Dropped shoulders sit just right.',
  },
];

// Product reviews store in memory
const reviewsStore = {};

export const getReviewsForProduct = (productId) => {
  if (!reviewsStore[productId]) {
    // Clone default reviews for any product
    reviewsStore[productId] = [...defaultReviews];
  }
  return reviewsStore[productId];
};

export const getReviewStats = (reviews = []) => {
  if (!reviews || reviews.length === 0) {
    return { average: 4.6, count: 23, breakdown: { 5: 18, 4: 4, 3: 1, 2: 0, 1: 0 } };
  }
  const total = reviews.reduce((sum, r) => sum + r.rating, 0);
  const avg = (total / reviews.length).toFixed(1);
  return {
    average: parseFloat(avg),
    count: reviews.length,
  };
};

export const addReviewForProduct = (productId, review) => {
  if (!reviewsStore[productId]) {
    reviewsStore[productId] = [...defaultReviews];
  }
  const newReview = {
    id: `rev-${Date.now()}`,
    author: review.author || 'Anonymous User',
    verified: true,
    rating: review.rating || 5,
    date: 'Just now',
    comment: review.comment || '',
  };
  reviewsStore[productId] = [newReview, ...reviewsStore[productId]];
  return reviewsStore[productId];
};
