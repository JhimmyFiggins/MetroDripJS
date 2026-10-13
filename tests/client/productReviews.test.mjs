import './helpers/loader.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { getReviewStats } from '../../mobile/Products/data/reviewsData.js';

const root = path.resolve(import.meta.dirname, '..', '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('an empty review feed reports zero instead of fabricated social proof', () => {
  assert.deepEqual(getReviewStats([]), {
    average: 0,
    count: 0,
    breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
  });
});

test('review statistics are derived only from received reviews', () => {
  assert.deepEqual(getReviewStats([{ rating: 5 }, { rating: 3 }, { rating: 5 }]), {
    average: 4.3,
    count: 3,
    breakdown: { 5: 2, 4: 0, 3: 1, 2: 0, 1: 0 },
  });
});

test('review failures stay failures and never create a local verified review', () => {
  const component = read('mobile/Products/components/CustomerReviews.jsx');
  const data = read('mobile/Products/data/reviewsData.js');

  assert.doesNotMatch(component, /addReviewForProduct|getReviewsForProduct/);
  assert.match(component, /setErrorMsg\(error\?\.message/);
  assert.doesNotMatch(data, /VERIFIED|Verified Buyer|Bea S\.|Miguel R\.|defaultReviews/);
});

test('checkout contains no demo identity or pre-server order number', () => {
  const screen = read('mobile/Checkout/src/screens/CheckoutScreen.jsx');
  const checkoutData = read('mobile/Checkout/src/data/checkout.ts');

  assert.doesNotMatch(screen, /Math\.random|supported_channels|127\.0\.0\.1:8000/);
  assert.match(screen, /getPaymentCapabilities\(\)/);
  assert.doesNotMatch(checkoutData, /Juan R\. Dela Cruz|juan@email\.com|Maginhawa|2632/);
});
