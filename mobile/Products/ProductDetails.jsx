import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, ActivityIndicator, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { fonts } from '../../src/theme/font';
import { productService } from '../../src/services/productService';
import { useCart } from '../context/CartContext';

import { useNavigation } from '@react-navigation/native';
import CustomerReviews from './components/CustomerReviews';

export default function ProductDetails({ 
    route, 
    navigation, 
    selectedProductId: propProductId, 
    onBack: propOnBack }) {
    
    const selectedProductId =
    route?.params?.selectedProductId ?? propProductId;
    const onBack = propOnBack ?? (() => navigation.goBack());

    const { addToCart } = useCart();


    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);

    const [variants, setVariants] = useState([]);
    const [selectedColor, setSelectedColor] = useState(null);
    const [selectedSize, setSelectedSize] = useState(null);
    const [selectedFit, setSelectedFit] = useState(null);
    const [activeDotIndex, setActiveDotIndex] = useState(0);

    const selectedVariant = variants.find(
        variant =>
        variant.attributes.color === selectedColor &&
        variant.attributes.size === selectedSize &&
        variant.attributes.fit === selectedFit
    );

    // Stock
    const [stock, setStock] = useState(null);

    const productId = selectedProductId; 
    console.log('PRODUCT ID:', productId);
    //Variants
    useEffect(() => {
        fetch(`https://metrodripjs.onrender.com/products/${productId}/variants/`)
            .then(response => response.json())
            .then(data => setVariants(data))
            .catch(error => console.error('Failed to load variants:', error));
    }, [productId]);

    
    // Check later if this is still important
    useEffect(() => {
        async function fetchDetails() {
            if (!productId) return;
            try {
                setLoading(true);
                const data = await productService.getProductById(productId);
                setProduct(data);
                
                // Extract options with safe fallbacks
                const colors = data.colors && data.colors.length > 0 ? data.colors : ['Black', 'White'];
                const sizes = data.sizes && data.sizes.length > 0 ? data.sizes : ['S', 'M', 'L'];
                const fits = data.fits && data.fits.length > 0 ? data.fits : (data.fit ? [data.fit] : ['Regular']);

                // Set default selections
                setSelectedColor(colors[0]);
                setSelectedSize(sizes[0]);
                setSelectedFit(fits[0]);
            } catch (error) {
                console.error('Error fetching product details:', error);
            } finally {
                setLoading(false);
            }
        }
        fetchDetails();
    }, [productId]);
    
    useEffect(() => {
        if (!selectedVariant) {
            setStock(null);
            return;
        }

        fetch(
            `https://metrodripjs.onrender.com/variants/${selectedVariant.id}/stock/`
        )
            .then(response => response.json())
            .then(data => {
                setStock(data[0] || null);
            })
            .catch(error => {
                console.error('Failed to load stock:', error);
                setStock(null);
        });
    }, [selectedVariant]);

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
        variants.map(variant => variant.attributes.size)
    )];

    const fits = [...new Set(
        variants.map(variant => variant.attributes.fit)
    )];

    const colorsList = variants
        .filter(variant => variant.color_hex)
        .map(variant => ({
            name: variant.color_name,
            hex_code: variant.color_hex,
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
            alert('Please select a valid product variant.');
            return;
        }

        if (!stock || stock.available_stock <= 0) {
            alert('This variant is out of stock.');
            return;
        }
        if (!product) return;
        const productItem = {
            id: `${product.id || productId}-${selectedColor || 'Default'}-${selectedSize || 'M'}-${selectedFit || 'Regular'}`,
            variantId: selectedVariant.id,
            fit: selectedVariant.fit,
            sku: selectedVariant.sku,
            stock: stock.available_stock,
            productId: product.id || productId,
            name: product.product_name || product.name || 'MetroDrip Product',
            size: selectedSize || 'M',
            color: selectedColor || 'Black',
            fit: selectedFit || 'Regular',
            price: (
                parseFloat(product.base_price || 0) +
                parseFloat(selectedVariant?.price_adjustment || 0)
            ).toFixed(2),
            quantity: 1,
            image: 'https://via.placeholder.com/300x350',
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
                    onPress={() => {
                        fetch('http://10.0.2.2:8000/wishlist/', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            product_ref: product.id,
                        }),
                        });
                    }}
                    >
                    <Text style={styles.heartIcon}>♡</Text>
                </TouchableOpacity>
                
            </View>

            {/* Image Carousel */}
            <View style={styles.imageContainer}>
                <Image
                    source={require("../assets/products/Men's Round T-shirt.webp")}
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
            <View style={styles.selectorRow}>
                <Text style={styles.selectorLabel}>Color</Text>
                <Text style={styles.selectorValue}>{selectedColor}</Text>
            </View>

            {/* Color Options */}
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

            {/* Size Selector */}
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

            {/* Size Options */}

            {/* <View style={styles.sizeOptions}>
                {sizesList.map((size) => (
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
            </View> */}


            {/* Fit Selector */}
            <View style={styles.selectorRow}>
                <Text style={styles.selectorLabel}>Fit</Text>
                <Text style={styles.selectorValue}>{selectedFit}</Text>
            </View>

            {/* Fit Options */}
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


            {/* Stock Warning */}
            <Text style={styles.stockWarning}>
                {stock && (
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
            <TouchableOpacity style={styles.addToCartButton} onPress={handleAddToCart}>
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
        backgroundColor: 'rgb(186, 255, 0)',
        borderRadius: 25,
        paddingVertical: 16,
        alignItems: 'center',
        marginTop: 'auto',
        marginBottom: 30,
    },
    addToCartText: {
        fontFamily: fonts.interBold,
        fontSize: 16,
        color: '#000',
    },
});