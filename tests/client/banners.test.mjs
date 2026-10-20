import assert from 'node:assert/strict';
import test from 'node:test';

import { customerHref } from '../../web/customer/contracts.js';

function resolveHeroBanner(banners) {
  if (!Array.isArray(banners) || banners.length === 0) {
    return {
      isDynamic: false,
      title: 'Urban Style Redefined',
      subtitle: 'Designed for the City',
      buttonLabel: 'Shop Now →',
      href: customerHref('/shop'),
      imageUrl: null,
    };
  }
  const hero = banners.find((b) => b.placement === 'homepage_hero') || banners[0];
  const href = hero.link_url
    ? (hero.link_url.startsWith('http://') || hero.link_url.startsWith('https://') || hero.link_url.startsWith('//')
      ? hero.link_url
      : customerHref(hero.link_url))
    : customerHref('/shop');

  return {
    isDynamic: true,
    title: hero.headline || hero.title || 'Urban Style Redefined',
    subtitle: hero.subtext || 'Designed for the City',
    buttonLabel: hero.button_label ? `${hero.button_label} →` : 'Shop Now →',
    href,
    imageUrl: hero.image_url || null,
  };
}

test('banner resolution falls back cleanly to Figma default copy when empty', () => {
  const result = resolveHeroBanner([]);
  assert.equal(result.isDynamic, false);
  assert.equal(result.title, 'Urban Style Redefined');
  assert.equal(result.subtitle, 'Designed for the City');
  assert.equal(result.buttonLabel, 'Shop Now →');
  assert.equal(result.href, '/customer/shop');
  assert.equal(result.imageUrl, null);
});

test('banner resolution binds merchant banner data when active hero banner is present', () => {
  const banners = [
    {
      id: 42,
      placement: 'homepage_hero',
      title: 'Drop 04 Release',
      headline: 'DROP 04 // LIMITED MANILA EDITION',
      subtext: 'Heavyweight tees designed in NCR',
      button_label: 'Explore Drop',
      link_url: '/shop?category=drop-4',
      image_url: 'https://images.example.com/banners/drop4.jpg',
    },
  ];
  const result = resolveHeroBanner(banners);
  assert.equal(result.isDynamic, true);
  assert.equal(result.title, 'DROP 04 // LIMITED MANILA EDITION');
  assert.equal(result.subtitle, 'Heavyweight tees designed in NCR');
  assert.equal(result.buttonLabel, 'Explore Drop →');
  assert.equal(result.href, '/customer/shop?category=drop-4');
  assert.equal(result.imageUrl, 'https://images.example.com/banners/drop4.jpg');
});

test('banner link resolution handles external and internal paths safely', () => {
  const externalBanner = [
    {
      placement: 'homepage_hero',
      headline: 'Pop-Up Store',
      button_label: 'View Map',
      link_url: 'https://maps.example.com/popup',
    },
  ];
  const extResult = resolveHeroBanner(externalBanner);
  assert.equal(extResult.href, 'https://maps.example.com/popup');

  const relativeBanner = [
    {
      placement: 'homepage_hero',
      headline: 'Accessories Drop',
      button_label: 'Shop Caps',
      link_url: '/shop?category=caps',
    },
  ];
  const relResult = resolveHeroBanner(relativeBanner);
  assert.equal(relResult.href, '/customer/shop?category=caps');
});
