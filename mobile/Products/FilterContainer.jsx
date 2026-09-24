import React, { useState, useEffect } from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, Text, View } from 'react-native';
import { DrawerContentScrollView } from '@react-navigation/drawer';

import { fonts } from '../../src/theme/font';
import { apiFetch } from '../../src/services/apiClient';
import { size, fit, sort } from '../data/categories.js';

// Backend currently seeds Black only; extra options are harmless (they just
// filter to zero results until matching variants exist).
const colorOptions = [
    { id: 1, color_name: 'Black' },
    { id: 2, color_name: 'White' },
    { id: 3, color_name: 'Gray' },
    { id: 4, color_name: 'Navy' },
];

// Map the hardcoded sort labels to the API's sort param values.
const SORT_VALUE_BY_NAME = {
    'Newest': 'newest',
    'Low Price': 'price_asc',
    'High Price': 'price_desc',
};

export default function FilterContainer({
    filters,
    onFiltersChange,
    onClearAll,
    categories: categoriesProp,
    ...props
}) {
    const [categories, setCategories] = useState(
        Array.isArray(categoriesProp) ? categoriesProp : []
    );

    useEffect(() => {
        if (Array.isArray(categoriesProp)) {
            setCategories(categoriesProp);
            return;
        }
        let cancelled = false;
        apiFetch('/categories/')
            .then((data) => {
                if (!cancelled) setCategories(Array.isArray(data) ? data : []);
            })
            .catch((error) => console.error('Failed to load categories:', error));
        return () => {
            cancelled = true;
        };
    }, [categoriesProp]);

    const patch = (p) => {
        if (onFiltersChange) onFiltersChange(p);
    };

    const activeCategory = filters ? filters.category : null;
    const activeSize = filters ? filters.size : null;
    const activeColor = filters ? filters.color : null;
    const activeFit = filters ? filters.fit : null;
    const activeSort = filters ? filters.sort : 'newest';

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
                    <View style={styles.fullWidthItem}>
                        <TouchableOpacity
                            style={[styles.baseButton, activeCategory == null && styles.activeButton]}
                            onPress={() => patch({ category: null })}
                        >
                            <Text style={[styles.baseButtonText, activeCategory == null && styles.activeButtonText]}>
                                All
                            </Text>
                        </TouchableOpacity>
                    </View>
                    {categories.map((item) => {
                        const isActive = item.id === activeCategory;

                        return (
                            <View key={item.id} style={styles.fullWidthItem}>
                                <TouchableOpacity
                                    style={[styles.baseButton, isActive && styles.activeButton]}
                                    onPress={() => patch({ category: isActive ? null : item.id })}
                                >
                                    <Text style={[styles.baseButtonText, isActive && styles.activeButtonText]}>
                                        {item.name}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        );
                    })}
                </View>

                <Text style={styles.title}>Size</Text>
                <View style={styles.buttonRowContainer}>
                    {size.map((item) => {
                        // "All" clears the size filter; everything else maps to
                        // the variant attribute value the API expects.
                        const value = item.size_attribute === 'All' ? null : item.size_attribute;
                        const isSizeActive = value === null ? activeSize == null : item.size_attribute === activeSize;

                        return (
                            <TouchableOpacity
                                key={item.id}
                                style={[
                                    styles.baseButton,
                                    styles.sizeButton,
                                    isSizeActive && styles.activeButton
                                ]}
                                onPress={() => patch({ size: value })}
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

                <Text style={styles.title}>Color</Text>
                <View style={styles.buttonRowContainer}>
                    {colorOptions.map((item) => {
                        const isColorActive = item.color_name === activeColor;

                        return (
                            <TouchableOpacity
                                key={item.id}
                                style={[styles.baseButton, isColorActive && styles.activeButton]}
                                onPress={() => patch({ color: isColorActive ? null : item.color_name })}
                            >
                                <Text style={[styles.baseButtonText, isColorActive && styles.activeButtonText]}>
                                    {item.color_name}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <Text style={styles.title}>Fit</Text>
                <View style={styles.buttonRowContainer}>
                    {fit.map((item) => {
                        const isActiveFit = item.fit_name === activeFit;

                        return (
                            <TouchableOpacity
                                key={item.id}
                                style={[styles.baseButton, isActiveFit && styles.activeButton]}
                                onPress={() => patch({ fit: isActiveFit ? null : item.fit_name })}
                            >
                                <Text style={[styles.baseButtonText, isActiveFit && styles.activeButtonText]}>
                                    {item.fit_name}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <Text style={styles.title}>Sort</Text>
                <View style={styles.buttonRowContainer}>
                    {sort.map((item) => {
                        const value = SORT_VALUE_BY_NAME[item.sort_name] || 'newest';
                        const isActiveSort = value === activeSort;

                        return (
                            <TouchableOpacity
                                key={item.id}
                                style={[styles.baseButton, isActiveSort && styles.activeButton]}
                                onPress={() => patch({ sort: value })}
                            >
                                <Text style={[styles.baseButtonText, isActiveSort && styles.activeButtonText]}>
                                    {item.sort_name}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <View style={styles.actionsRow}>
                    <TouchableOpacity
                        style={styles.clearButton}
                        onPress={() => {
                            if (onClearAll) onClearAll();
                        }}
                    >
                        <Text style={styles.clearButtonText}>Clear all</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.applyButton}
                        onPress={() => props.navigation && props.navigation.closeDrawer()}
                    >
                        <Text style={styles.applyButtonText}>Show results</Text>
                    </TouchableOpacity>
                </View>
                </ScrollView>
        </DrawerContentScrollView>
    );
}

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
    actionsRow: {
        flexDirection: 'row',
        gap: 8,
        paddingHorizontal: 9,
        paddingTop: 16,
        paddingBottom: 24,
    },
    clearButton: {
        flex: 1,
        borderRadius: 9999,
        borderWidth: 1,
        borderColor: 'rgb(228, 228, 223)',
        paddingVertical: 10,
        alignItems: 'center',
    },
    clearButtonText: {
        fontFamily: fonts.interBold,
        fontSize: 12,
        color: 'rgb(0, 0, 0)',
    },
    applyButton: {
        flex: 1,
        borderRadius: 9999,
        backgroundColor: 'rgb(0, 0, 0)',
        paddingVertical: 10,
        alignItems: 'center',
    },
    applyButtonText: {
        fontFamily: fonts.interBold,
        fontSize: 12,
        color: '#FFF',
    },
    row: {
        width: '100%',
    },
});
