export function resolveBannerImageUrl(url, customBase) {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed)) return trimmed;
  const cleanPath = trimmed.replace(/^\/+/, '');

  let base = customBase || '';
  if (!base && typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) {
    base = process.env.EXPO_PUBLIC_API_URL;
  }
  if (!base) {
    try {
      // In React Native runtime, resolve through apiClient's BASE_URL
      // eslint-disable-next-line global-require
      const { BASE_URL } = require('./apiClient.js');
      if (BASE_URL) base = BASE_URL;
    } catch {
      base = '';
    }
  }
  const cleanBase = (base || '').replace(/\/+$/, '');
  return cleanBase ? `${cleanBase}/${cleanPath}` : trimmed;
}

export function handleBannerPress(banner, navigation) {
  const link = safeBannerDestination(banner?.link_url);
  if (link) {
    if (link.startsWith('http://') || link.startsWith('https://')) {
      try {
        // eslint-disable-next-line global-require
        const { Linking } = require('react-native');
        Linking.openURL(link).catch(() => {});
      } catch {
        if (typeof window !== 'undefined' && window.open) {
          window.open(link, '_blank');
        }
      }
      return;
    }
    const matchProduct = link.match(/\/products\/(\d+)/);
    if (matchProduct && navigation?.navigate) {
      navigation.navigate('ProductDetails', { selectedProductId: parseInt(matchProduct[1], 10) });
      return;
    }
    if (link.includes('cart') && navigation?.navigate) {
      navigation.navigate('Cart');
      return;
    }
    if ((link.includes('saved') || link.includes('wishlist')) && navigation?.navigate) {
      navigation.navigate('Saved');
      return;
    }
  }
  if (navigation?.navigate) {
    navigation.navigate('Shop');
  }
}

export function safeBannerDestination(url) {
  if (typeof url !== 'string') return '';
  const value = url.trim();
  if (!value || value.startsWith('//') || /[\s\\]/.test(value)) return '';
  if (value.startsWith('/')) return value;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) return parsed.toString();
  } catch {
    return '';
  }
  return '';
}

export function normalizeBannerList(payload) {
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.banners) ? payload.banners : null;
  if (!rows) return null;
  return rows
    .filter((row) => row && typeof row === 'object' && typeof row.placement === 'string')
    .map((row) => ({
      ...row,
      headline: String(row.headline || row.title || ''),
      button_label: String(row.button_label || 'Shop Now'),
      link_url: safeBannerDestination(row.link_url),
      image_url: resolveBannerImageUrl(row.image_url) || (typeof row.image_url === 'string' ? row.image_url : ''),
    }))
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
}

export function bannersForPlacement(list, placement) {
  return (Array.isArray(list) ? list : []).filter((banner) => banner.placement === placement);
}

