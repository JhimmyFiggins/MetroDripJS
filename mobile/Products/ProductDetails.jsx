import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { fonts } from '../../src/theme/font';
import { productService } from '../../src/services/productService';

export default function ProductDetails({ selectedProductId, onBack }) {
    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchDetails() {
            if (!selectedProductId) return;
            try {
                setLoading(true);
                const data = await productService.getProductById(selectedProductId);
                setProduct(data);
            } catch (error) {
                console.error('Error fetching product details:', error);
            } finally {
                setLoading(false);
            }
        }
        fetchDetails();
    }, [selectedProductId]);

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

    return (
        <View style={styles.container}>
            <TouchableOpacity style={styles.backButton} onPress={onBack}>
                <Text style={styles.backButtonText}>← Back to Products</Text>
            </TouchableOpacity>

            <View style={styles.imagePlaceholder}>
                <Text>*Insert Image Here</Text>
            </View>

            <Text style={styles.title}>{product.product_name}</Text>
            <Text style={styles.description}>{product.description}</Text>
        </View>
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
        marginBottom: 16,
        paddingVertical: 8,
    },
    backButtonText: {
        fontFamily: fonts.interBold,
        fontSize: 14,
        color: '#000',
    },
    imagePlaceholder: {
        width: '100%',
        height: 250,
        backgroundColor: 'rgb(244, 244, 242)',
        borderRadius: 10,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    title: {
        fontFamily: fonts.interBold,
        fontSize: 18,
        marginBottom: 8,
    },
    description: {
        fontSize: 14,
        color: '#666',
    },
});