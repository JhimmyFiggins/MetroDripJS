import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bannersForPlacement,
  handleBannerPress,
  normalizeBannerList,
  resolveBannerImageUrl,
  safeBannerDestination,
} from '../../src/services/bannerContent.js';

test('mobile banner helper selects the published hero and rejects unsafe links', () => {
  const banners = normalizeBannerList([
    { id: 9, placement: 'homepage_hero', headline: 'Cyber Monday Sale', button_label: 'Shop Now', link_url: '/shop', order: 1 },
    { id: 3, placement: 'announcement_bar', headline: 'Free shipping note', link_url: 'javascript:alert(1)', order: 1 },
  ]);
  const hero = bannersForPlacement(banners, 'homepage_hero')[0];
  assert.equal(hero.headline, 'Cyber Monday Sale');
  assert.equal(hero.link_url, '/shop');
  assert.equal(safeBannerDestination('javascript:alert(1)'), '');
  assert.equal(bannersForPlacement(banners, 'checkout_footer').length, 0);
});

test('resolveBannerImageUrl correctly resolves relative and absolute image URLs', () => {
  assert.equal(resolveBannerImageUrl('https://example.com/banner.jpg'), 'https://example.com/banner.jpg');
  assert.equal(resolveBannerImageUrl('http://example.com/banner.png'), 'http://example.com/banner.png');
  assert.equal(resolveBannerImageUrl('data:image/png;base64,abc123=='), 'data:image/png;base64,abc123==');
  assert.equal(resolveBannerImageUrl('/media/banners/photo.webp', 'https://api.metrodrip.ph'), 'https://api.metrodrip.ph/media/banners/photo.webp');
  assert.equal(resolveBannerImageUrl('media/banners/photo.webp', 'https://api.metrodrip.ph/'), 'https://api.metrodrip.ph/media/banners/photo.webp');
  assert.equal(resolveBannerImageUrl(''), '');
  assert.equal(resolveBannerImageUrl(null), '');
});

test('bannersForPlacement accurately filters across all five storefront placement locations', () => {
  const sampleData = [
    { id: 1, placement: 'homepage_hero', headline: 'Hero Drop', order: 1 },
    { id: 2, placement: 'homepage_secondary', headline: 'Secondary Flash', order: 2 },
    { id: 3, placement: 'announcement_bar', headline: 'Free Delivery', order: 3 },
    { id: 4, placement: 'category_banner', headline: 'Hoodies 20% Off', order: 4 },
    { id: 5, placement: 'checkout_footer', headline: 'Secure Payment Guarantee', order: 5 },
  ];
  const list = normalizeBannerList(sampleData);
  assert.equal(bannersForPlacement(list, 'homepage_hero').length, 1);
  assert.equal(bannersForPlacement(list, 'homepage_hero')[0].headline, 'Hero Drop');
  assert.equal(bannersForPlacement(list, 'homepage_secondary').length, 1);
  assert.equal(bannersForPlacement(list, 'homepage_secondary')[0].headline, 'Secondary Flash');
  assert.equal(bannersForPlacement(list, 'announcement_bar').length, 1);
  assert.equal(bannersForPlacement(list, 'announcement_bar')[0].headline, 'Free Delivery');
  assert.equal(bannersForPlacement(list, 'category_banner').length, 1);
  assert.equal(bannersForPlacement(list, 'category_banner')[0].headline, 'Hoodies 20% Off');
  assert.equal(bannersForPlacement(list, 'checkout_footer').length, 1);
  assert.equal(bannersForPlacement(list, 'checkout_footer')[0].headline, 'Secure Payment Guarantee');
  assert.equal(bannersForPlacement(list, 'non_existent_placement').length, 0);
});

test('handleBannerPress navigates correctly according to banner destination', () => {
  let navigatedRoute = null;
  let navigatedParams = null;
  const mockNavigation = {
    navigate: (route, params) => {
      navigatedRoute = route;
      navigatedParams = params;
    },
  };

  handleBannerPress({ link_url: '/products/123' }, mockNavigation);
  assert.equal(navigatedRoute, 'ProductDetails');
  assert.deepEqual(navigatedParams, { selectedProductId: 123 });

  handleBannerPress({ link_url: '/cart' }, mockNavigation);
  assert.equal(navigatedRoute, 'Cart');

  handleBannerPress({ link_url: '/wishlist' }, mockNavigation);
  assert.equal(navigatedRoute, 'Saved');

  handleBannerPress({ link_url: '/shop' }, mockNavigation);
  assert.equal(navigatedRoute, 'Shop');

  handleBannerPress(null, mockNavigation);
  assert.equal(navigatedRoute, 'Shop');
});

