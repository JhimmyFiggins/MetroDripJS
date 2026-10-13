export const getReviewStats = (reviews = []) => {
  if (!reviews || reviews.length === 0) {
    return { average: 0, count: 0, breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } };
  }
  const total = reviews.reduce((sum, r) => sum + r.rating, 0);
  const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  reviews.forEach((review) => {
    if (breakdown[review.rating] !== undefined) breakdown[review.rating] += 1;
  });
  return {
    average: Number((total / reviews.length).toFixed(1)),
    count: reviews.length,
    breakdown,
  };
};
