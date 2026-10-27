import React from 'react';
import { Image } from 'react-native';

const BRAND_ASSETS = {
  full: {
    light: require('../assets/branding/logo.png'),
    dark: require('../assets/branding/logo-dark.png'),
  },
  emblem: {
    light: require('../assets/branding/logo-emblem.png'),
    dark: require('../assets/branding/logo-emblem-dark.png'),
  },
  wordmark: {
    light: require('../assets/branding/logo-wordmark.png'),
    dark: require('../assets/branding/logo-wordmark-dark.png'),
  },
};

/** Selects the artwork for the surface behind the logo, not the device theme alone. */
export default function BrandLogo({ variant = 'full', surface = 'light', ...imageProps }) {
  const assets = BRAND_ASSETS[variant] || BRAND_ASSETS.full;
  const source = surface === 'dark' ? assets.dark : assets.light;

  return <Image {...imageProps} resizeMode="contain" source={source} />;
}
