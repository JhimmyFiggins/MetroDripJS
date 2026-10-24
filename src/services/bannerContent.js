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
    }))
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
}

export function bannersForPlacement(list, placement) {
  return (Array.isArray(list) ? list : []).filter((banner) => banner.placement === placement);
}
