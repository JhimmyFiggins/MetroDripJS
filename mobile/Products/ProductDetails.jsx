import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { fonts } from '../../src/theme/font';
import { productService } from '../../src/services/productService';
import { apiFetch } from '../../src/services/apiClient';
import { getWishlist, addToWishlist, removeFromWishlist } from '../../src/services/wishlistService';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';

import CustomerReviews from './components/CustomerReviews';
import ProductImage from '../components/ProductImage';
import { productImageUrl } from '../../src/services/productImage';
import {
    findExactVariant,
    initialVariantSelection,
    selectPurchasableStock,
    variantOption,
} from './productVariantLogic';

export default function ProductDetails({ 
    route, 
    navigation, 
    selectedProductId: propProductId, 
    onBack: propOnBack }) {
    
    const selectedProductId =
    route?.params?.selectedProductId ?? propProductId;
    const onBack = propOnBack ?? (() => navigation.goBack());

    const { addToCart } = useCart();
    const { user, isGuest } = useAuth();


    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isSaved, setIsSaved] = useState(false);

    const [variants, setVariants] = useState([]);
    const [selectedColor, setSelectedColor] = useState(null);
    const [selectedSize, setSelectedSize] = useState(null);
    const [selectedFit, setSelectedFit] = useState(null);
    const [activeDotIndex, setActiveDotIndex] = useState(0);

    const selectedVariant = findExactVariant(variants, {
        color: selectedColor,
        size: selectedSize,
        fit: selectedFit,
    });

    // Stock
    const [stock, setStock] = useState(null);
    const stockMatchesSelectedVariant = Boolean(
        selectedVariant && Number(stock?.variant) === Number(selectedVariant.id)
    );

    const productId = selectedProductId; 
    //Variants
    useEffect(() => {
        let cancelled = false;
        setVariants([]);
        setSelectedColor(null);
        setSelectedSize(null);
        setSelectedFit(null);
        if (!productId) return () => { cancelled = true; };
        apiFetch(`/products/${productId}/variants/`, { auth: false })
            .then(data => {
                if (cancelled) return;
                const nextVariants = Array.isArray(data) ? data : [];
                const initial = initialVariantSelection(nextVariants);
                setVariants(nextVariants);
                setSelectedColor(initial.color);
                setSelectedSize(initial.size);
                setSelectedFit(initial.fit);
            })
            .catch(error => console.error('Failed to load variants:', error));
        return () => {
            cancelled = true;
        };
    }, [productId]);

    
    // Check later if this is still important
    useEffect(() => {
        let cancelled = false;
        setProduct(null);
        if (!productId) {
            setLoading(false);
            return () => { cancelled = true; };
        }
        async function fetchDetails() {
            try {
                setLoading(true);
                const data = await productService.getProductById(productId);
                if (!cancelled) setProduct(data);
            } catch (error) {
                console.error('Error fetching product details:', error);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        fetchDetails();
        return () => {
            cancelled = true;
        };
    }, [productId]);
    
    useEffect(() => {
        let cancelled = false;
        const requestedVariantId = selectedVariant?.id;
        setStock(null);
        if (!requestedVariantId) return () => { cancelled = true; };

        apiFetch(`/variants/${requestedVariantId}/stock/`, { auth: false })
            .then(data => {
                if (cancelled) return;
                setStock(selectPurchasableStock(data, requestedVariantId));
            })
            .catch(error => {
                if (cancelled) return;
                console.error('Failed to load stock:', error);
                setStock(null);
            });
        return () => {
            cancelled = true;
        };
    }, [selectedVariant?.id]);

    // Reflect whether this product is already in the user's wishlist
    useEffect(() => {
        if (!productId || isGuest || !user) {
            setIsSaved(false);
            return;
        }
        getWishlist()
            .then(items => {
                const saved = Array.isArray(items) && items.some(
                    item => String(item.product_ref) === String(productId)
                );
                setIsSaved(saved);
            })
            .catch(error => {
                console.error('Failed to check wishlist state:', error);
            });
    }, [productId, user, isGuest]);

    const handleToggleWishlist = () => {
        if (isGuest || !user) {
            Alert.alert(
                'Sign in required',
                'Sign in to save items to your wish list.',
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Sign in', onPress: () => navigation.navigate('Login') },
                ]
            );
            return;
        }

        const request = isSaved
            ? removeFromWishlist(productId)
            : addToWishlist(productId);

        request
            .then(() => setIsSaved(!isSaved))
            .catch(error => {
                console.error('Failed to update wishlist:', error);
            });
    };

    if (loading) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#000" />
            </View>
        );
    }

    if (!product) {
        return (
            <View style={styles.centerContainer}>
                <Text>Product not found.</Text>
                <TouchableOpacity style={styles.backButton} onPress={onBack}>
                    <Text style={styles.backButtonText}>Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }


    


    // Colors, Sizes, and Fits lists derived from variants
    const sizes = [...new Set(
        variants.map(variant => variantOption(variant, 'size')).filter(Boolean)
    )];

    const fits = [...new Set(
        variants.map(variant => variantOption(variant, 'fit')).filter(Boolean)
    )];

    const colorsList = variants
        .filter(variant => variantOption(variant, 'color'))
        .map(variant => ({
            name: variantOption(variant, 'color'),
            hex_code: variant.color_hex || '#000000',
        }))
        .filter(
            (color, index, self) =>
                index === self.findIndex(c => c.name === color.name)
        );

    // const fitsList = product.fits && product.fits.length > 0 ? product.fits : (product.fit ? [product.fit] : ['Regular']);
    const fitsList = fits;

   

    
    
    // console.log("SELECTED VARIANT:", selectedVariant);

    // Generate dot indicators based on image count
    const imageCount = product.images ? product.images.length : 1;
    const dots = [];
    for (let i = 0; i < imageCount; i++) {
        dots.push(
            <View 
                key={i} 
                style={[styles.dot, i === activeDotIndex && styles.activeDot]} 
            />
        );
    }


    const handleAddToCart = () => {
        if (!product || !selectedVariant) {
            Alert.alert('Variant unavailable', 'Choose an available color, size, and fit combination.');
            return;
        }

        if (!stockMatchesSelectedVariant) {
            Alert.alert('Checking stock', 'Stock information is still loading for this variant. Please try again.');
            return;
        }

        if (Number(stock.available_stock) <= 0) {
            Alert.alert('Out of stock', 'This variant is out of stock. Choose another option.');
            return;
        }
        if (!product) return;
        const productItem = {
            id: `variant-${selectedVariant.id}`,
            variantId: selectedVariant.id,
            sku: selectedVariant.sku,
            stock: Number(stock.available_stock),
            maxQuantity: stock.max_order_quantity ?? selectedVariant.max_order_quantity,
            productId: product.id || productId,
            name: product.product_name || product.name || 'MetroDrip Product',
            size: selectedSize || 'One Size',
            color: selectedColor || 'Standard',
            fit: selectedFit || 'Regular',
            price: (
                parseFloat(product.base_price || 0) +
                parseFloat(selectedVariant?.price_adjustment || 0)
            ).toFixed(2),
            quantity: 1,
            image: productImageUrl(product),
        };
        addToCart(productItem);
        navigation.navigate('Cart');
    };

   
    return (
        <ScrollView 
        
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            style={styles.container}>
            <StatusBar style="dark" />
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onBack}>
                    <Text style={styles.backArrow}>←</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{product.name}</Text>
                <TouchableOpacity
                    onPress={handleToggleWishlist}
                    accessibilityRole="button"
                    accessibilityLabel={isSaved ? 'Remove from wishlist' : 'Add to wishlist'}
                    >
                    <Text style={[styles.heartIcon, isSaved && styles.heartIconSaved]}>
                        {isSaved ? '♥' : '♡'}
                    </Text>
                </TouchableOpacity>
                
            </View>

            {/* Image Carousel */}
            <View style={styles.imageContainer}>
                <ProductImage
                    accessibilityLabel={`${product.product_name || product.name} product image`}
                    product={product}
                    style={styles.imagePlaceholder}
                    resizeMode="contain"
                />
                <View style={styles.dotsContainer}>
                    {dots}
                </View>
            </View>

            {/* Product Info */}
            {/* <Text style={styles.sku}>{product.id}</Text> */}
            <View style={styles.productHeader}>
                <Text style={styles.title}>{product.product_name || product.name}</Text>
                <Text style={styles.price}>₱{product.base_price}</Text>
            </View>
            <View style={styles.ratingBadgeRow}>
                <Text style={styles.ratingBadgeStars}>★★★★★</Text>
                <Text style={styles.ratingBadgeScore}>4.6</Text>
                <Text style={styles.ratingBadgeCount}>23 reviews</Text>
            </View>
            <Text style={styles.description}>{product.description}</Text>

            {/* Color Selector */}
            {colorsList.length > 0 && (
                <>
                    <View style={styles.selectorRow}>
                        <Text style={styles.selectorLabel}>Color</Text>
                        <Text style={styles.selectorValue}>{selectedColor}</Text>
                    </View>
                    <View style={styles.colorOptions}>
                        {colorsList.map((color, index) => {
                            const isSelected = selectedColor === color.name;
                            return (
                                <TouchableOpacity
                                    key={index}
                                    style={[
                                        styles.colorSwatch,
                                        { backgroundColor: color.hex_code },
                                        isSelected && styles.selectedColorSwatch
                                    ]}
                                    onPress={() => setSelectedColor(color.name)}
                                >
                                    {isSelected && (
                                        <View
                                            style={[
                                                styles.colorInnerRing,
                                                {
                                                    backgroundColor:
                                                        color.hex_code.toLowerCase() === '#ffffff'
                                                            ? '#000'
                                                            : '#FFF'
                                                }
                                            ]}
                                        />
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </>
            )}

            {/* Size Selector */}
            {sizes.length > 0 && (
                <View style={styles.selectorRow}>
                    <Text style={styles.selectorLabel}>Size</Text>
                    <View style={styles.sizeOptions}>
                        {sizes.map((size) => (
                            <TouchableOpacity
                                key={size}
                                style={[
                                    styles.sizeButton,
                                    selectedSize === size && styles.selectedSizeButton
                                ]}
                                onPress={() => setSelectedSize(size)}
                            >
                                <Text style={[
                                    styles.sizeButtonText,
                                    selectedSize === size && styles.selectedSizeButtonText
                                ]}>
                                    {size}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            )}

            {/* Fit Selector */}
            {fitsList.length > 0 && (
                <>
                    <View style={styles.selectorRow}>
                        <Text style={styles.selectorLabel}>Fit</Text>
                        <Text style={styles.selectorValue}>{selectedFit}</Text>
                    </View>
                    <View style={styles.fitOptions}>
                        {fitsList.map((fit) => (
                            <TouchableOpacity
                                key={fit}
                                style={[
                                    styles.fitButton,
                                    selectedFit === fit && styles.selectedFitButton
                                ]}
                                onPress={() => setSelectedFit(fit)}
                            >
                                <Text style={[
                                    styles.fitButtonText,
                                    selectedFit === fit && styles.selectedFitButtonText
                                ]}>
                                    {fit}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </>
            )}


            {/* Stock Warning */}
            <Text style={styles.stockWarning}>
                {!selectedVariant ? (
                    <Text style={styles.stockText}>This option combination is unavailable. Choose another variant.</Text>
                ) : stockMatchesSelectedVariant && (
                    <Text style={styles.stockText}>
                        {stock.available_stock > 0
                            ? `Only ${stock.available_stock} left in this variant`
                            : 'Out of stock'}
                    </Text>
                )}
            </Text>

            {/* Customer Reviews Section (Figma M04a) */}
            <CustomerReviews productId={productId} />

            {/* Add to Cart Button */}
            <TouchableOpacity
                accessibilityLabel={`Add ${product.product_name || product.name} to cart`}
                accessibilityRole="button"
                style={styles.addToCartButton}
                onPress={handleAddToCart}
            >
                <Text style={styles.addToCartText}>
                    Add To Cart {product.product_name || product.name}
                </Text>
            </TouchableOpacity>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
        backgroundColor: '#FFF',
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    backButton: {
        marginTop: 12,
        padding: 10,
        backgroundColor: '#000',
        borderRadius: 6,
    },
    backButtonText: {
        color: '#FFF',
        fontFamily: fonts.interBold,
    },
    /* Header */
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 50,
        marginBottom: 16,
    },
    backArrow: {
        fontFamily: fonts.interBold,
        fontSize: 20,
        color: '#000',
    },
    headerTitle: {
        fontFamily: fonts.interBold,
        fontSize: 16,
        color: '#000',
    },
    heartIcon: {
        fontFamily: fonts.interBold,
        fontSize: 20,
        color: '#000',
    },
    heartIconSaved: {
        color: '#C2282D',
    },
    /* Image Section */
    imageContainer: {
        alignItems: 'center',
        marginBottom: 16,
    },
    imagePlaceholder: {
        width: '100%',
        height: 400,
        backgroundColor: 'rgb(244, 244, 242)',
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    watermark: {
        fontFamily: fonts.interBold,
        fontSize: 120,
        color: 'rgba(0, 0, 0, 0.1)',
    },
    dotsContainer: {
        flexDirection: 'row',
        gap: 6,
    },
    dot: {
        width: 7,
        height: 7,
        borderRadius: 3.5,
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
    },
    activeDot: {
        backgroundColor: '#000',
    },
    /* Product Info */
    sku: {
        fontFamily: fonts.interRegular,
        fontSize: 12,
        color: 'rgb(102, 102, 102)',
        marginBottom: 4,
    },
    productHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 4,
    },
    title: {
        fontFamily: fonts.interBold,
        fontSize: 18,
        color: '#000',
        flex: 1,
    },
    price: {
        fontFamily: fonts.interRegular,
        fontSize: 16,
        color: '#000',
        marginLeft: 8,
    },
    ratingBadgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        gap: 6,
    },
    ratingBadgeStars: {
        fontSize: 12,
        color: '#5C6B12',
        letterSpacing: 1,
    },
    ratingBadgeScore: {
        fontSize: 13,
        fontFamily: fonts.interBold || fonts.helveticaNeueBold,
        fontWeight: '700',
        color: '#141414',
    },
    ratingBadgeCount: {
        fontSize: 12,
        fontFamily: fonts.interRegular,
        color: '#63635C',
    },
    description: {
        fontFamily: fonts.interRegular,
        fontSize: 14,
        color: '#666',
        marginBottom: 24,
        lineHeight: 20,
    },
    /* Selectors */
    selectorRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        marginTop:10,
    },
    selectorLabel: {
        fontFamily: fonts.interRegular,
        fontSize: 14,
        color: '#666',
        width: 50,
        marginTop: 10,
    },
    colorOptions: {
        flexDirection: 'row',
        gap: 12,
        flex: 1,
        // justifyContent: 'center',
    },
    colorSwatch: {
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgb(204, 204, 204)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    selectedColorSwatch: {
        borderWidth: 2,
        borderColor: '#000',
    },
    colorInnerRing: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    sizeOptions: {
        flexDirection: 'row',
        gap: 8,
        flex: 1,
        // justifyContent: 'center',
    },
    sizeButton: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 6,
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: 'rgb(204, 204, 204)',
    },
    selectedSizeButton: {
        backgroundColor: '#000',
        borderColor: '#000',
    },
    sizeButtonText: {
        fontFamily: fonts.interRegular,
        fontSize: 13,
        color: '#000',
    },
    selectedSizeButtonText: {
        color: '#FFF',
    },
    fitOptions: {
        flexDirection: 'row',
        gap: 8,
        flex: 1,
        marginBottom: 2,
        // justifyContent: 'center',
    },
    fitButton: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 6,
        backgroundColor: '#FFF',
        borderWidth: 1,
        borderColor: 'rgb(204, 204, 204)',
    },
    selectedFitButton: {
        backgroundColor: '#000',
        borderColor: '#000',
    },
    fitButtonText: {
        fontFamily: fonts.interRegular,
        fontSize: 13,
        color: '#000',
    },
    selectedFitButtonText: {
        color: '#FFF',
    },
    selectorValue: {
        fontFamily: fonts.interRegular,
        fontSize: 13,
        color: '#000',
        minWidth: 50,
        textAlign: 'right',
    },
    /* Stock Warning */
    stockWarning: {
        fontFamily: fonts.interMedium,
        fontSize: 12,
        color: '#FF3B30',
        marginBottom: 24,
    },
    redDot: {
        marginRight: 6,
    },
    /* Add to Cart Button */
    addToCartButton: {
        backgroundColor: '#D3EE42',
        borderRadius: 25,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 'auto',
        marginBottom: 30,
    },
    addToCartText: {
        fontFamily: fonts.interBold,
        fontSize: 16,
        color: '#141414',
    },
});
