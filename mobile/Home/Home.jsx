import React, { useState, useEffect } from 'react';

import { ScrollView, StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Image, ImageBackground, Linking } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { fonts } from '../../src/theme/font';

//Components
import HomeHeader from '../components/HomeHeader';
import Footer from '../components/Footer';


import { SafeAreaProvider } from 'react-native-safe-area-context';

import { apiFetch } from '../../src/services/apiClient';
import ProductCards from '../Products/ProductCards';
import ProductDetails from '../Products/ProductDetails';

export default function Home({ navigation, route }) {
    
    //Rendering of Products

    const [categoryList, setCategoryList] = useState([]);
    const [selectedProductId, setSelectedProductId] = useState(null);
    const [currentCategory, setCurrentCategory] = useState(1);
    const [categoriesLoading, setCategoriesLoading] = useState(true);
    const [showTopSection, setShowTopSection] = useState(true);
    const [heroBanner, setHeroBanner] = useState(null);
    const [imageError, setImageError] = useState(false);

    useEffect(() => {
            apiFetch('/categories/', { auth: false })
                .then(data => setCategoryList(data))
                .catch(error => console.error('Failed to load categories:', error))
                .finally(() => setCategoriesLoading(false));

            apiFetch('/banners/?placement=homepage_hero', { auth: false })
                .then(data => {
                    if (Array.isArray(data) && data.length > 0) {
                        setHeroBanner(data[0]);
                        setImageError(false);
                    } else {
                        setHeroBanner(null);
                    }
                })
                .catch(() => setHeroBanner(null));
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

    const handleHeroPress = () => {
        const link = heroBanner?.link_url;
        if (link) {
            if (link.startsWith('http://') || link.startsWith('https://')) {
                Linking.openURL(link).catch(() => {});
                return;
            }
            const matchProduct = link.match(/\/products\/(\d+)/);
            if (matchProduct) {
                navigation.navigate('ProductDetails', { selectedProductId: parseInt(matchProduct[1], 10) });
                return;
            }
            if (link.includes('cart')) {
                navigation.navigate('Cart');
                return;
            }
            if (link.includes('saved') || link.includes('wishlist')) {
                navigation.navigate('Saved');
                return;
            }
        }
        navigation.navigate('Shop');
    };

    // Determine legacy image background vs modern hero artwork card
    const isLegacyImageBg = !heroBanner?.artwork_mode && !!heroBanner?.image_url && !imageError;
    const showArtworkCard = heroBanner?.artwork_mode === 'graphic' || heroBanner?.artwork_mode === 'image';

    const bannerContent = (
        <View style={isLegacyImageBg ? styles.HeroBannerWithOverlay : styles.HeroBanner}>
            <Text style={styles.HeroBannerUpper}>
                {heroBanner?.subtext || 'Metro Manila Streetwear'}
            </Text>
            <Text style={styles.HeroBannerTitle}>
                {heroBanner?.headline || 'Urban Style Redefined'}
            </Text>

            {/* Configurable Hero Artwork Component for Mobile */}
            {showArtworkCard && (
                heroBanner?.artwork_mode === 'image' && heroBanner?.image_url && !imageError ? (
                    <View style={styles.ArtworkCard}>
                        <Image
                            source={{ uri: heroBanner.image_url }}
                            style={[
                                styles.ArtworkImage,
                                { resizeMode: heroBanner?.image_fit === 'contain' ? 'contain' : 'cover' }
                            ]}
                            onError={() => setImageError(true)}
                            accessibilityLabel={heroBanner?.headline || 'Hero Promotion Artwork'}
                        />
                    </View>
                ) : (
                    <View style={[
                        styles.GraphicArtworkCard,
                        {
                            backgroundColor: heroBanner?.graphic_bg_color || '#D3EE42',
                            alignItems: heroBanner?.graphic_alignment === 'left' ? 'flex-start' : heroBanner?.graphic_alignment === 'right' ? 'flex-end' : 'center',
                        }
                    ]}>
                        <Text style={[
                            styles.GraphicArtworkMain,
                            { color: heroBanner?.graphic_text_color || '#141414' },
                            heroBanner?.graphic_font_size === 'small' && styles.GraphicFontSmall,
                            heroBanner?.graphic_font_size === 'large' && styles.GraphicFontLarge,
                        ]}>
                            {heroBanner?.graphic_text_main || 'MD'}
                        </Text>
                        <Text style={[
                            styles.GraphicArtworkTagline,
                            {
                                color: heroBanner?.graphic_text_color || '#141414',
                                textAlign: heroBanner?.graphic_alignment || 'center',
                            }
                        ]}>
                            {heroBanner?.graphic_text_tagline || 'BUILT FOR THE STREETS'}
                        </Text>
                        <Text style={[
                            styles.GraphicArtworkSub,
                            {
                                color: heroBanner?.graphic_accent_color || heroBanner?.graphic_text_color || '#141414',
                                textAlign: heroBanner?.graphic_alignment || 'center',
                            }
                        ]}>
                            {heroBanner?.graphic_text_sub || 'METRODRIP / MANILA'}
                        </Text>
                    </View>
                )
            )}

            <TouchableOpacity
                accessibilityLabel={heroBanner?.button_label || "Shop the latest drop"}
                accessibilityRole="button"
                style={styles.HeroLowerButton}
                onPress={handleHeroPress}
            >
                <Text style={styles.HeroBannerLower}>
                    {heroBanner?.button_label || 'Shop the drop'}
                </Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <SafeAreaProvider style={styles.Container}>
            <StatusBar style="dark" />
            {showTopSection && (
                <>
                <HomeHeader/>
                {isLegacyImageBg ? (
                    <ImageBackground
                        source={{ uri: heroBanner.image_url }}
                        style={styles.HeroBannerImageBg}
                        resizeMode="cover"
                        onError={() => setImageError(true)}
                    >
                        {bannerContent}
                    </ImageBackground>
                ) : (
                    bannerContent
                )}

                <View style={styles.CategorySection}>
                    {categoriesLoading ? (
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
                                        accessibilityLabel={`Filter by ${category.name}`}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected: isActive }}
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
                    navigation={navigation}
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
            <Footer active="Home"/>
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
        backgroundColor: '#141414',
        paddingHorizontal: 20,
        paddingVertical: 24,
    },
    HeroBannerImageBg: {
        width: '100%',
    },
    HeroBannerWithOverlay: {
        width: '100%',
        backgroundColor: 'rgba(20, 20, 20, 0.72)',
        paddingHorizontal: 20,
        paddingVertical: 24,
    },
    HeroBannerUpper: {
        color: '#D3EE42',
        fontSize: 13,
        fontFamily: fonts.interRegular,
        marginBottom: 6,
    },
    HeroBannerTitle: {
        color: '#FFFFFF',
        fontSize: 38,
        fontFamily: fonts.interBold,
        letterSpacing: -1,
        lineHeight: 42,
        marginBottom: 16,
    },
    HeroLowerButton: {
        backgroundColor: '#D3EE42',
        paddingVertical: 12,
        paddingHorizontal: 22,
        borderRadius: 25,
        alignSelf: 'flex-start',
    },
    HeroBannerLower: {
        color: '#141414',
        fontSize: 15,
        fontFamily: fonts.interBold,
        textAlign: 'center',
    },
    ArtworkCard: {
        width: '100%',
        height: 160,
        borderRadius: 14,
        overflow: 'hidden',
        marginBottom: 16,
        backgroundColor: '#1E1E1E',
        justifyContent: 'center',
        alignItems: 'center',
    },
    ArtworkImage: {
        width: '100%',
        height: '100%',
    },
    GraphicArtworkCard: {
        width: '100%',
        borderRadius: 14,
        paddingVertical: 18,
        paddingHorizontal: 16,
        marginBottom: 16,
        justifyContent: 'center',
    },
    GraphicArtworkMain: {
        fontSize: 32,
        fontFamily: fonts.interBold,
        letterSpacing: -0.5,
        lineHeight: 36,
        marginBottom: 4,
    },
    GraphicArtworkTagline: {
        fontSize: 13,
        fontFamily: fonts.interBold,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    GraphicArtworkSub: {
        fontSize: 10,
        fontFamily: fonts.interSemiBold,
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    GraphicFontSmall: {
        fontSize: 24,
        lineHeight: 28,
    },
    GraphicFontLarge: {
        fontSize: 40,
        lineHeight: 44,
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
