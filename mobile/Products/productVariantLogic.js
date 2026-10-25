function normalized(value) {
  return value == null ? '' : String(value).trim().toLowerCase();
}

export function variantOption(variant, option) {
  if (!variant || typeof variant !== 'object') return '';
  if (option === 'color') {
    return String(variant.color_name || variant.attributes?.color || '').trim();
  }
  return String(variant.attributes?.[option] || '').trim();
}

/** Resolve only the exact selected combination; never substitute another SKU. */
export function findExactVariant(variants, selection = {}) {
  if (!Array.isArray(variants) || variants.length === 0) return null;
  const selected = ['color', 'size', 'fit'].filter((option) => normalized(selection[option]));
  if (selected.length === 0) return variants[0];
  return variants.find((variant) => selected.every(
    (option) => normalized(variantOption(variant, option)) === normalized(selection[option]),
  )) || null;
}

export function initialVariantSelection(variants) {
  const first = Array.isArray(variants) ? variants[0] : null;
  return {
    color: variantOption(first, 'color') || null,
    size: variantOption(first, 'size') || null,
    fit: variantOption(first, 'fit') || null,
  };
}

/**
 * Even though the endpoint is scoped by URL, accept only rows whose canonical
 * variant FK matches the request. This prevents a malformed or stale response
 * from being attached to a different selection.
 */
export function selectPurchasableStock(rows, variantId) {
  const expected = Number(variantId);
  if (!Number.isSafeInteger(expected) || expected < 1 || !Array.isArray(rows)) return null;

  return rows
    .filter((row) => Number(row?.variant) === expected)
    .reduce((best, row) => {
      const available = Number(row?.available_stock);
      if (!Number.isFinite(available) || available < 0) return best;
      return !best || available > Number(best.available_stock) ? row : best;
    }, null);
}
