import { useState, useEffect } from 'react';
import { StyleSheet, FlatList, TouchableOpacity, Text, View, ActivityIndicator, useWindowDimensions } from 'react-native';
import { productService } from '../../src/services/productService';
import { fonts } from '../Checkout/src/theme';
import { useNavigation } from '@react-navigation/native'; // Import navigation hook
import ProductImage from '../components/ProductImage';

export default function ProductCards({ selectedCategory, onSelectProduct, products: productsProp }) {
    const navigation = useNavigation();
    const { width } = useWindowDimensions();
    const numColumns = width >= 768 ? 3 : 2;
    const cardWidth = `${Math.floor(100 / numColumns) - 2}%`;
    const imageHeight = Math.min(Math.round((width / numColumns) * 0.75), 180);

    // When the parent passes `products`, it owns fetching/filtering (Shop).
    // Otherwise keep the legacy self-fetch behavior (Home).
    const isControlled = Array.isArray(productsProp);

    const [productList, setProductList] = useState([]);
    const [loading, setLoading] = useState(!isControlled);
    const [error, setError] = useState(null);

    const sourceProducts = isControlled ? productsProp : productList;

    let filteredProducts;

    // Add new arrivals and trending logic here
    if (!isControlled && selectedCategory != null) {
        filteredProducts = sourceProducts.filter(product =>
            String(product.category) === String(selectedCategory));
    } else {
        filteredProducts = sourceProducts;
    }
    const formatPrice = price => {
        return `₱${price.toLocaleString('en-PH', {
            minimumFractionDigits: 2,
        })}`;
    };
    

    useEffect(() => {
        if (isControlled) return; // Parent (Shop) owns fetching.

        const fetchProducts = async () => {
            try {
                const data = await productService.getAllProducts();
                setProductList(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchProducts();
    }, [isControlled]);

    if (!isControlled && loading) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" />
            </View>
        );
    }

    if (!isControlled && error) {
        return (
            <View style={styles.container}>
                <Text>Error loading products: {error}</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <FlatList
                key={`grid-${numColumns}`}
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
                data={filteredProducts}
                numColumns={numColumns}
                columnWrapperStyle={styles.row}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        accessibilityLabel={`${item.name}, ${formatPrice(Number(item.base_price))}`}
                        accessibilityRole="button"
                        style={[styles.productCard, { width: cardWidth }]}
                        onPress={() => onSelectProduct(item.id)}
                    >
                        <ProductImage
                            accessibilityLabel={`${item.name} product image`}
                            product={item}
                            resizeMode="contain"
                            style={[styles.productImage, { height: imageHeight }]}
                        />
                        <Text numberOfLines={1} ellipsizeMode="tail" style={styles.productDetails}>
                            {item.name}
                        </Text>
                        <Text numberOfLines={1} style={[styles.productDetails, styles.productPrice]}>
                            {formatPrice(item.base_price)}
                        </Text>
                    </TouchableOpacity>
                )}
                keyExtractor={(item) => item.id.toString()}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        flex: 1,
    },
    row: {
        justifyContent: 'space-between',
        paddingHorizontal: 10,
        paddingBottom: 10,
        gap: 10,
    },
    productCard: {
        width: '48%',
        minHeight: 210,
        paddingBottom: 8,
        borderColor: 'black',
        borderWidth: .5,
        backgroundColor: 'rgb(255, 255, 255)',
        borderRadius: 10,
        overflow: 'hidden',
    },
    productImage: {
        backgroundColor: 'rgb(244, 244, 242)',
        height: 150,
        width: '100%',
        paddingTop: 10,
        paddingLeft: 10,
        borderTopLeftRadius: 9,
        borderTopRightRadius: 9,
        resizeMode: 'contain',
    },
    productDetails:{
        paddingTop: 4,
        paddingHorizontal: 8,
        fontSize: 12,
        fontFamily: fonts.monoSemiBold,
    },
    productPrice: {
        marginTop: 2,
        color: '#141414',
    },
});
