import { useState, useEffect } from 'react';
import { StyleSheet, FlatList, TouchableOpacity, Text, View, ActivityIndicator, Image } from 'react-native';
import { productService } from '../../src/services/productService';
import { fonts } from '../Checkout/src/theme';
import { useNavigation } from '@react-navigation/native'; // Import navigation hook

export default function ProductCards({ selectedCategory, onSelectProduct, products: productsProp }) {
    const navigation = useNavigation();

    // When the parent passes `products`, it owns fetching/filtering (Shop).
    // Otherwise keep the legacy self-fetch behavior (Home).
    const isControlled = Array.isArray(productsProp);

    const [productList, setProductList] = useState([]);
    const [loading, setLoading] = useState(!isControlled);
    const [error, setError] = useState(null);

    const sourceProducts = isControlled ? productsProp : productList;

    let filteredProducts;

    // Add new arrivals and trending logic here
    if (!isControlled && selectedCategory) {
        if(selectedCategory === 1){ //Default Category - All
            filteredProducts = sourceProducts;
        }else{
            filteredProducts = sourceProducts.filter(product =>
            product.category === selectedCategory);
        }
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
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
                data={filteredProducts}
                numColumns={2}
                columnWrapperStyle={styles.row}
                renderItem={({ item }) => (
                    <TouchableOpacity
                        style={styles.productCard}
                        // 3. Fixed: Use item.id instead of 'id'
                        onPress={() => onSelectProduct(item.id)}
                    >
                        <Image
                            source={require('../assets/products/Men\'s Round T-shirt.webp')}
                            style={styles.productImage}
                        />
                        <Text style={styles.productDetails}>
                            {item.name}
                        </Text>
                        <Text style={styles.productDetails}>
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
        height: 200,
        borderColor: 'black',
        borderWidth: .5,
        backgroundColor: 'rgb(255, 255, 255)',
        borderRadius: 10,
    },
    productImage: {
        backgroundColor: 'rgb(244, 244, 242)',
        height: 150,
        width: '99.8%',
        paddingTop: 10,
        paddingLeft: 10,
        borderRadius: 10,
        resizeMode: 'contain',
    },
    productDetails:{
        paddingTop: 5,
        paddingLeft: 5,
        fontSize: 12,
        fontFamily: fonts.monoSemiBold,
    },
});