import { useState, useEffect } from 'react';
import { StyleSheet, FlatList, TouchableOpacity, Text, View } from 'react-native';
import { products } from '../data/product.js';
import { productService } from '../../src/services/productService';

export default function ProductCards({ onSelectProduct }) {
    const [productList, setProductList] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchProducts() {
            try {
                const data = await productService.getAllProducts();
                setProductList(data);
            } catch (error) {
                console.error('Failed to load products:', error);
            } finally {
                setLoading(false);
            }
        }
        fetchProducts();
    }, []);

    return (
        <View style={styles.container}>
            <FlatList
                data={products}
                numColumns={2}
                columnWrapperStyle={styles.row}
                renderItem={({ item }) => (
                    <TouchableOpacity 
                        style={styles.productCard}
                        onPress={() => onSelectProduct(item.id)}
                    >
                        <Text style={styles.productImage}>*Insert Image Here</Text>

                        <Text style={styles.productDetails}>
                            {item.product_name}
                        </Text>
                        <Text style={styles.productDetails}>
                            {item.description}
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
        paddingHorizontal: 2,
        paddingBottom: 10,
    },

    productCard: {
        width: '48%',
        height: 200,
        borderColor: 'black',
        borderWidth: .5,
        backgroundColor: 'rgb(255, 255, 255)',
        borderRadius: 10,
        
    },
    productImage:{
        backgroundColor: 'rgb(244, 244, 242)',
        height: 120,
        paddingTop: 10,
        paddingLeft: 10,
        borderRadius: 10,
    },
    productDetails:{
        paddingTop: 5,
        paddingLeft: 5,
        fontSize: 12,
    },
});