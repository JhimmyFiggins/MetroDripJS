import assert from 'node:assert/strict';
import test from 'node:test';

import { customerHref } from '../../web/customer/contracts.js';

function resolveHeroBanner(banners) {
  if (!Array.isArray(banners) || banners.length === 0) {
    return {
      isDynamic: false,
      title: 'Urban Style Redefined',
      subtitle: 'Designed for the City',
      buttonLabel: 'Shop Now',
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
    buttonLabel: hero.button_label || 'Shop Now',
    href,
    imageUrl: hero.image_url || null,
    artwork: resolveHeroArtwork(hero),
  };
}

export function resolveHeroArtwork(banner) {
  if (!banner) {
    return {
      mode: 'default',
      isCustomImage: false,
      mainText: 'MD',
      taglineText: 'BUILT FOR THE STREETS',
      subText: 'METRODRIP / MANILA',
      bgColor: '#d3ee42',
      textColor: '#141414',
      accentColor: '#141414',
      alignment: 'center',
      fontSize: 'normal',
      imageUrl: null,
      imageFit: 'cover',
    };
  }

  if (banner.artwork_mode === 'image' && banner.image_url) {
    return {
      mode: 'image',
      isCustomImage: true,
      imageUrl: banner.image_url,
      imageFit: banner.image_fit || 'cover',
      fallback: {
        mainText: 'MD',
        taglineText: 'BUILT FOR THE STREETS',
        subText: 'METRODRIP / MANILA',
      },
    };
  }

  return {
    mode: 'graphic',
    isCustomImage: false,
    mainText: banner.graphic_text_main || 'MD',
    taglineText: banner.graphic_text_tagline || 'BUILT FOR THE STREETS',
    subText: banner.graphic_text_sub || 'METRODRIP / MANILA',
    bgColor: banner.graphic_bg_color || '#d3ee42',
    textColor: banner.graphic_text_color || '#141414',
    accentColor: banner.graphic_accent_color || banner.graphic_text_color || '#141414',
    alignment: banner.graphic_alignment || 'center',
    fontSize: banner.graphic_font_size || 'normal',
    imageUrl: null,
  };
}

test('banner resolution falls back cleanly to Figma default copy when empty', () => {
  const result = resolveHeroBanner([]);
  assert.equal(result.isDynamic, false);
  assert.equal(result.title, 'Urban Style Redefined');
  assert.equal(result.subtitle, 'Designed for the City');
  assert.equal(result.buttonLabel, 'Shop Now');
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
  assert.equal(result.buttonLabel, 'Explore Drop');
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

test('hero artwork resolution defaults to branded graphic template when unconfigured', () => {
  const artwork = resolveHeroArtwork(null);
  assert.equal(artwork.mode, 'default');
  assert.equal(artwork.isCustomImage, false);
  assert.equal(artwork.mainText, 'MD');
  assert.equal(artwork.taglineText, 'BUILT FOR THE STREETS');
  assert.equal(artwork.subText, 'METRODRIP / MANILA');
  assert.equal(artwork.bgColor, '#d3ee42');
  assert.equal(artwork.textColor, '#141414');
});

test('hero artwork resolution binds Mode A custom image with fallback details', () => {
  const banner = {
    artwork_mode: 'image',
    image_url: '/media/banners/campaign_banner.webp',
    image_fit: 'contain',
    headline: 'Summer Release',
  };
  const artwork = resolveHeroArtwork(banner);
  assert.equal(artwork.mode, 'image');
  assert.equal(artwork.isCustomImage, true);
  assert.equal(artwork.imageUrl, '/media/banners/campaign_banner.webp');
  assert.equal(artwork.imageFit, 'contain');
  assert.equal(artwork.fallback.mainText, 'MD');
});

test('hero artwork resolution binds Mode B custom graphic with styled attributes', () => {
  const banner = {
    artwork_mode: 'graphic',
    graphic_text_main: 'VIP',
    graphic_text_tagline: 'EXCLUSIVE MANILA ACCESS',
    graphic_text_sub: 'MEMBERS ONLY // 2026',
    graphic_bg_color: '#ff3366',
    graphic_text_color: '#ffffff',
    graphic_accent_color: '#ffd700',
    graphic_alignment: 'left',
    graphic_font_size: 'large',
  };
  const artwork = resolveHeroArtwork(banner);
  assert.equal(artwork.mode, 'graphic');
  assert.equal(artwork.isCustomImage, false);
  assert.equal(artwork.mainText, 'VIP');
  assert.equal(artwork.taglineText, 'EXCLUSIVE MANILA ACCESS');
  assert.equal(artwork.subText, 'MEMBERS ONLY // 2026');
  assert.equal(artwork.bgColor, '#ff3366');
  assert.equal(artwork.textColor, '#ffffff');
  assert.equal(artwork.accentColor, '#ffd700');
  assert.equal(artwork.alignment, 'left');
  assert.equal(artwork.fontSize, 'large');
});
