import { resolveApiUrl } from './apiClient.js';

function mediaCandidate(product) {
  if (!product || typeof product !== 'object') return null;

  const media = Array.isArray(product.media)
    ? product.media
    : (Array.isArray(product.images) ? product.images : []);
  const primary = media.find((item) => item?.is_primary) || media[0];

  return product.image_url || primary?.url || primary?.image_url || null;
}

/**
 * Resolve a catalog image against the configured API origin.
 *
 * Django commonly returns `/media/...` for locally served files. Browsers can
 * resolve that path against the page origin, but React Native cannot. Absolute
 * HTTPS storage URLs remain untouched while API-relative paths use BASE_URL.
 */
export function resolveProductImageUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const candidate = value.trim();
  if (/^[a-z][a-z\d+.-]*:/i.test(candidate) && !/^https?:/i.test(candidate)) {
    return null;
  }

  try {
    return resolveApiUrl(candidate);
  } catch (_error) {
    return null;
  }
}

export function productImageUrl(product) {
  return resolveProductImageUrl(mediaCandidate(product));
}
