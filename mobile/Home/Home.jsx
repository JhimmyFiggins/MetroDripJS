import React, { useState, useEffect } from 'react';
import { useFocusEffect } from '@react-navigation/native';

const [loading, setLoading] = useState(true);
import { ScrollView, FlatList, StyleSheet, Text, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { fonts } from '../../src/theme/font';

//Components
import HomeHeader from '../components/HomeHeader';
import Footer from '../components/Footer';


import { SafeAreaProvider } from 'react-native-safe-area-context';

// Temp API Services
import { categoryService } from '../../src/services/categoryService';
import { productService } from '../../src/services/productService';
import { products } from '../data/product.js';
import ProductCards from '../Products/ProductCards';
import ProductDetails from '../Products/ProductDetails';

export default function Home({ navigation, route }) {
    
    //Rendering of Products
    const [categoryList, setCategoryList] = useState([]);
    const [selectedProductId, setSelectedProductId] = useState(null);
    const selectedCategory = route.params?.selectedCategory ?? null;

    const [productList, setProductList] = useState([]); 
    
    const [currentCategory, setCurrentCategory] = useState(1);
    const [loading, setLoading] = useState(true);
    const [showTopSection, setShowTopSection] = useState(true);
    const formatPrice = price => {
        return `₱${price.toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        })}`;
    };

    const items = products.length;
    const data = [
        { id: '0', name: 'All' },
        { id: '1', name: `${items} Items` },
    ];

    useEffect(() => {
            fetch('https://metrodripjs.onrender.com/categories/')
                .then(response => response.json())
                .then(data => setCategoryList(data))
                .catch(error => console.error('Failed to load categories:', error));
        }, []);

    // useEffect(() => {
    //     async function fetchCategories() {
    //         try {
    //             const data = await categoryService.getAllCategories();
    //             setCategoryList(data);
    //         } catch (error) {
    //             console.error('Failed to load categories:', error);
    //         } finally {
    //             setLoading(false);
    //         }
    //     }

    //     fetchCategories();
    // }, []);

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

    // const handleSelectProduct = (id) => {
    //     navigation.navigate('ProductDetails', {
    //         selectedProductId: id,
    //     });
    // };
    const handleSelectProduct = (id) => {
        setSelectedProductId(id);
        setShowTopSection(false); // Hide header and search
    };

    const handleBack = () => {
        setSelectedProductId(null);
        setShowTopSection(true); // Show header and search again
    };
    return (
        <SafeAreaProvider style={styles.Container}>
            <StatusBar style="dark" />
            {showTopSection && (
                <>
                <HomeHeader/>
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
                            showsVerticalScrollIndicator={false}
                
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
                                        onPress={() => 
                                            setCurrentCategory(category.id)
                                            

                                        }
                                    >
                                        <Text 
                                            style={[
                                                styles.CategoryText, isActive && styles.ActiveCategoryText
                                                
                                                ]}>
                                            {/* {typeof category === 'string' ? category : category.name} */}
                                            {category.name}
                                            
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    )}
                </View>
                </>
            )}
            

            
            {selectedProductId ? (
                <ProductDetails
                    selectedProductId={selectedProductId}
                    onBack={handleBack}
                />
                ) : (
                <>
                        {/* <FlatList
                            style={styles.pCHeader}
                            data={data}
                            numColumns={2}
                            columnWrapperStyle={styles.row}
                            renderItem={({ item, index }) => (
                                <Text style={index === 0 ? styles.leftSide : styles.rightSide}>
                                    {item.name}
                                </Text>
                            )}
                            keyExtractor={(item) => item.id}
                        /> */}
        
                        <View style={styles.mainLayout}>
                            <View style={styles.prodSide}>
                                <ProductCards
                                    selectedCategory={currentCategory}
                                    onSelectProduct={handleSelectProduct}
                                />
                            </View>
                        </View>
                    </>
                )}
            <Footer/>
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
        fontSize: 13,
        fontFamily: fonts.interRegular,
    },
    HeroBannerTitle: {
        color: 'rgb(255, 255, 255)',
        fontSize: 40,
        fontFamily: fonts.interBold,
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
        fontFamily: fonts.interBold,
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
        fontFamily: fonts.interSemiBold,
        color: 'rgb(17, 17, 17)',
    },
    row: {
        justifyContent: 'space-between',
        paddingHorizontal: 10, // Keep your padding here
        paddingBottom: 10,
        gap: 10, // <-- Add this! Controls the gap size explicitly
    },
    mainLayout: {
        flex: 1,
    },
    prodSide: {
        flex: 1,
        backgroundColor: '#FFF',
        borderRadius: 10,
        margin: 10,
    },

    productCard: {
        width: '48%', // <-- Changed from 45% to 48%
        height: 200,
        borderColor: 'black',
        borderWidth: .5,
        backgroundColor: 'rgb(255, 255, 255)',
        borderRadius: 10,
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
        fontFamily: fonts.monoSemiBold,
    },
});