import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import { productImageUrl, resolveProductImageUrl } from '../../src/services/productImage';

const FALLBACK_IMAGE = require("../assets/products/Men's Round T-shirt.webp");

export default function ProductImage({
  product,
  uri,
  style,
  resizeMode = 'cover',
  accessibilityLabel = 'Product image',
}) {
  const remoteUrl = useMemo(
    () => (product ? productImageUrl(product) : resolveProductImageUrl(uri)),
    [product, uri],
  );
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(Boolean(remoteUrl));

  useEffect(() => {
    setFailed(false);
    setLoading(Boolean(remoteUrl));
  }, [remoteUrl]);

  const useFallback = failed || !remoteUrl;

  return (
    <View style={[styles.frame, style]}>
      <Image
        accessibilityLabel={accessibilityLabel}
        source={useFallback ? FALLBACK_IMAGE : { uri: remoteUrl }}
        resizeMode={resizeMode}
        style={styles.image}
        onLoadStart={() => {
          if (!useFallback) setLoading(true);
        }}
        onLoadEnd={() => setLoading(false)}
        onError={() => {
          setFailed(true);
          setLoading(false);
        }}
      />
      {loading && !useFallback ? (
        <View pointerEvents="none" style={styles.loading}>
          <ActivityIndicator accessibilityLabel="Loading product image" color="#111111" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    backgroundColor: 'rgb(244, 244, 242)',
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(244, 244, 242, 0.82)',
  },
});

