import assert from 'node:assert/strict';
import test from 'node:test';
import { bannersForPlacement, normalizeBannerList, safeBannerDestination } from '../../src/services/bannerContent.js';

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
