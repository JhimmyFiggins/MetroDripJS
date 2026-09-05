import React, { useState } from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, Text, View } from 'react-native';
import { DrawerContentScrollView } from '@react-navigation/drawer'; // Added import

import { fonts } from '../../src/theme/font'; 
import { categories, size, fit, sort, subCategories } from '../data/categories.js';

export default function FilterContainer(props) {
    const [activeCategory, setActiveCategory] = useState(1);
    const [activeSubCategory, setActiveSubCategory] = useState(null);
    const [activeSize, setActiveSize] = useState(1);
    const [activeFit, setActiveFit] = useState(null);
    const [activeSort, setActiveSort] = useState(null);

    return (
        <DrawerContentScrollView {...props} contentContainerStyle={styles.container}
            
        > 
            <ScrollView
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
            >
                <Text style={styles.titleFilter}>FILTERS</Text>
                
                <Text style={styles.title}>Category</Text>
                
                <View style={styles.buttonRowContainer}>
                    {categories.map((item) => {
                        const isActive = item.id === activeCategory;

                        return (
                            <View key={item.id} style={styles.fullWidthItem}>
                                <TouchableOpacity 
                                    style={[styles.baseButton, isActive && styles.activeButton]}
                                    onPress={() => {
                                        setActiveCategory(item.id); 
                                        setActiveSubCategory(null);
                                    }}
                                >
                                    <Text style={[styles.baseButtonText, isActive && styles.activeButtonText]}>
                                        {item.category_name}
                                    </Text>
                                </TouchableOpacity>

                                {isActive && renderSubCategory(activeCategory, activeSubCategory, setActiveSubCategory)}
                            </View>
                        );
                    })}
                </View>

                <Text style={styles.title}>Size</Text>
                {renderSizes(activeSize, setActiveSize)}

                <Text style={styles.title}>Fit</Text>
                {renderFits(activeFit, setActiveFit)}

                <Text style={styles.title}>Sort</Text>
                {renderSort(activeSort, setActiveSort)}
                </ScrollView>
        </DrawerContentScrollView>
    );
}


// Sub-Category Component Renderer
const renderSubCategory = (activeCategory, activeSubCategory, setActiveSubCategory) => {
    const currentSubs = subCategories[activeCategory];

    if (!currentSubs || currentSubs.length === 0) return null;

    return (
        <View style={styles.buttonRowContainer}>
            {currentSubs.map((subItem) => {
                const isSubActive = subItem.id === activeSubCategory;
                
                return (
                    <TouchableOpacity 
                        key={subItem.id} 
                        style={[styles.baseButton, styles.subCatButton, isSubActive && styles.activeButton]}
                        onPress={() => setActiveSubCategory(subItem.id)}
                    >
                        <Text style={[styles.baseButtonText, isSubActive && styles.activeButtonText]}>
                            {subItem.name}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
};

// Sizes Renderer
const renderSizes = (activeSize, setActiveSize) => {
    return (
        <View style={styles.buttonRowContainer}>
            {size.map((item) => {
                const isSizeActive = item.id === activeSize;

                return (
                    <TouchableOpacity
                        key={item.id}
                        style={[
                            styles.baseButton,
                            styles.sizeButton,
                            isSizeActive && styles.activeButton
                        ]}
                        onPress={() => setActiveSize(item.id)}
                    >
                        <Text
                            style={[
                                styles.baseButtonText,
                                styles.sizeButtonText,
                                isSizeActive && styles.activeButtonText
                            ]}
                        >
                            {item.size_attribute}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
};

// Fit Renderer
const renderFits = (activeFit, setActiveFit) => {
    return (
        <View style={styles.buttonRowContainer}>
            {fit.map((item) => {
                const isActiveFit = item.id === activeFit;

                return (
                    <TouchableOpacity 
                        key={item.id}
                        style={[styles.baseButton, isActiveFit && styles.activeButton]}
                        onPress={() => setActiveFit(item.id)}
                    >
                        <Text style={[styles.baseButtonText, isActiveFit && styles.activeButtonText]}>
                            {item.fit_name}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
};

// Sort Renderer
const renderSort = (activeSort, setActiveSort) => {
    return (
        <View style={styles.buttonRowContainer}>
            {sort.map((item) => {
                const isActiveSort = item.id === activeSort;

                return (
                    <TouchableOpacity 
                        key={item.id}
                        style={[styles.baseButton, isActiveSort && styles.activeButton]}
                        onPress={() => setActiveSort(item.id)}
                    >
                        <Text style={[styles.baseButtonText, isActiveSort && styles.activeButtonText]}>
                            {item.sort_name}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: '100%',
        flex: 1,
        margin: 0,
    },
    titleFilter: {
        fontFamily: fonts.interBold,
        fontSize: 11,
        paddingTop: 5,
        paddingLeft: 10,
        color: 'rgb(173, 173, 173)',
    },
    title: {
        fontFamily: fonts.interBold,
        fontSize: 13,
        paddingTop: 10,
        paddingLeft: 10,
    },
    buttonRowContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        width: '100%',
        paddingHorizontal: 5,
    },
    fullWidthItem: {
        width: '100%',
    },

    // BASE REUSABLE BUTTON
    baseButton: {
        flexGrow: 1,
        backgroundColor: 'rgb(255, 255, 255)',
        borderRadius: 6,
        borderColor: 'rgb(228, 228, 223)',
        borderWidth: 1,
        minHeight: 30,
        paddingHorizontal: 8,
        paddingVertical: 6,
        margin: 4,
        justifyContent: 'center',
        alignItems: 'center',
    },
    baseButtonText: {
        fontFamily: fonts.interBold,
        fontSize: 11,
        color: 'rgb(0, 0, 0)',
        textAlign: 'center',
    },

    // SPECIFIC OVERRIDES
    subCatButton: {
        backgroundColor: 'rgb(246, 246, 246)',
        marginLeft: 10,
    },
    sizeButton: {
        minHeight: 35,
    },
    sizeButtonText: {
        fontSize: 13,
    },
    activeButton: {
        backgroundColor: 'rgb(0, 0, 0)',
        borderColor: 'rgb(0, 0, 0)',
    },
    activeButtonText: {
        color: '#FFF',
    },
    row: {
        width: '100%',
    },
});