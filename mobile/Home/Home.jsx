import React, { useState, useEffect } from 'react';
import { ScrollView, FlatList, StyleSheet, Text, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { fonts } from '../../src/theme/font';
import Header from '../components/Header';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { categoryService } from '../../src/services/categoryService';

import { productService } from '../../src/services/productService';
import { products } from '../data/product.js';

export default function Home() {
    // 1. Hooks MUST sit inside the function component
    const [categoryList, setCategoryList] = useState([]);
    const [productList, setProductList] = useState([]);
    const [currentCategory, setCurrentCategory] = useState(1);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchCategories() {
            try {
                const data = await categoryService.getAllCategories();
                setCategoryList(data);
            } catch (error) {
                console.error('Failed to load categories:', error);
            } finally {
                setLoading(false);
            }
        }
        fetchCategories();
    }, []);

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
        <SafeAreaProvider style={styles.Container}>
            <View style={styles.HeroBanner}>
                <Text style={styles.HeroBannerUpper}>Metro Manila Streetwear</Text>
                <Text style={styles.HeroBannerTitle}>
                    Urban Style Redefined
                </Text>

                <TouchableOpacity style={styles.HeroLowerButton}>
                    <Text style={styles.HeroBannerLower}>Shop the Drop</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.CategorySection}>
                {loading ? (
                    <ActivityIndicator size="small" color="#000" style={{ padding: 20 }} />
                ) : (
                    <ScrollView
                        horizontal 
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.CategoryScroll}
                    >
                        {categoryList.map((category, index) => {
                            const isActive = category.id === currentCategory;
                            return(
                                <TouchableOpacity 
                                    key={category.id || index} 
                                    style={[
                                        styles.CategoryChip,
                                        isActive && styles.ActiveCategoryChip
                                    ]}
                                    onPress={() => setCurrentCategory(category.id)}
                                >
                                    <Text 
                                        style={[
                                            styles.CategoryText, isActive && styles.ActiveCategoryText
                                            
                                            ]}>
                                        {/* {typeof category === 'string' ? category : category.name} */}
                                        {category.category_name}
                                        
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                )}
            </View>

            <View style={styles.Container}>
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
        </SafeAreaProvider>
    );
}

const styles = StyleSheet.create({
    Container: {
        flex: 1,
        backgroundColor: 'rgb(244, 244, 242)',
        // backgroundColor: 'rgb(107, 40, 40)',
    },
    HeroBanner: {
        width: '100%',
        backgroundColor: 'rgb(0, 0, 0)',
        paddingLeft: 20,
        paddingVertical: 20,
    },
    HeroBannerUpper: {
        color: 'rgb(186, 222, 53)',
        fontSize: 15,
        fontWeight: '400',
    },
    HeroBannerTitle: {
        color: 'rgb(255, 255, 255)',
        fontSize: 48,
        fontWeight: '900',
    },
    HeroLowerButton: {
        backgroundColor: 'rgb(255, 255, 255)',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 25,
        marginVertical: 5,
        maxWidth: 200,
    },
    HeroBannerLower: {
        color: 'rgb(21, 21, 21)',
        fontSize: 18,
        fontWeight: '800',
        textAlign: 'center',
    },
    CategorySection: {
        paddingVertical: 15,
    },
    CategoryScroll: {
        paddingHorizontal: 15,
    },
    CategoryChip: {
        backgroundColor: '#fff',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        marginRight: 10,
        borderWidth: 1,
        borderColor: 'rgb(17, 17, 17)',
    },
    ActiveCategoryChip: {
        backgroundColor: 'rgb(17, 17, 17)',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        marginRight: 10,
        borderWidth: 1,
        borderColor: 'rgb(17, 17, 17)',
    },
    ActiveCategoryText: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgb(255, 255, 255)',
    },
    CategoryText: {
        fontSize: 14,
        fontWeight: '600',
        color: 'rgb(17, 17, 17)',
    },
    productCard: {
        width: '45%',
        height: 200,
        borderColor: 'black',
        borderWidth: .5,
        backgroundColor: 'rgb(255, 255, 255)',
        borderRadius: 10,
        marginLeft: 10,
        marginRight: 5,
        marginBottom: 10,
        
    },
    productImage:{
        backgroundColor: 'rgb(244, 244, 242)',
        width: '99%',
        height: 150,
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