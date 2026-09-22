import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  ScrollView,
  Text,
  View,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { Ionicons } from '@expo/vector-icons';
import SearchField from './SearchField.jsx';

import FilterContainer from './FilterContainer.jsx';
import ProductCards from './ProductCards.jsx';
import ProductDetails from './ProductDetails.jsx';

//Components
import ShopHeader from '../components/ShopHeader.jsx';
import Footer from '../components/Footer';

import { apiFetch } from '../../src/services/apiClient';
import { productService } from '../../src/services/productService';
import { colors, fonts } from '../Checkout/src/theme';

const Drawer = createDrawerNavigator();

const DEFAULT_FILTERS = {
  search: '',
  category: null,
  size: null,
  color: null,
  fit: null,
  sort: 'newest',
};

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
];

function sortLabel(value) {
  const match = SORT_OPTIONS.find((option) => option.value === value);
  return match ? match.label : 'Newest';
}

// Inner screen rendering the products grid
function ShopContent({ navigation, route, filters, onFiltersChange, onClearAll }) {

  const [selectedProductId, setSelectedProductId] = useState(null);
  // Track whether we should show header/search
  const [showTopSection, setShowTopSection] = useState(true);

  const [categories, setCategories] = useState([]);
  const [productList, setProductList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [sortModalVisible, setSortModalVisible] = useState(false);

  const screenTitle = 'Shop';

  // Pick up category selections pushed via route params (e.g. legacy drawer navigation).
  useEffect(() => {
    const routeCategory = route.params?.selectedCategory;
    if (routeCategory != null) {
      onFiltersChange({ category: routeCategory });
      navigation.setParams({ selectedCategory: undefined });
    }
  }, [route.params?.selectedCategory]);

  // Category chips row: All + categories from the API.
  useEffect(() => {
    let cancelled = false;
    apiFetch('/categories/')
      .then((data) => {
        if (!cancelled) setCategories(Array.isArray(data) ? data : []);
      })
      .catch((fetchError) => console.error('Failed to load categories:', fetchError));
    return () => {
      cancelled = true;
    };
  }, []);

  // Single source of truth: refetch whenever any filter/sort/search changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    productService
      .getAllProducts({
        search: filters.search,
        category: filters.category,
        size: filters.size,
        color: filters.color,
        fit: filters.fit,
        sort: filters.sort,
      })
      .then((data) => {
        if (!cancelled) setProductList(Array.isArray(data) ? data : []);
      })
      .catch((fetchError) => {
        if (!cancelled) {
          setProductList([]);
          setError(fetchError.message || 'Failed to load products.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, reloadKey]);

  const categoryName =
    filters.category != null
      ? (categories.find((item) => item.id === filters.category) || {}).name
      : null;

  const activeChips = [];
  if (filters.search) activeChips.push({ key: 'search', label: `"${filters.search}"` });
  if (filters.category != null) activeChips.push({ key: 'category', label: categoryName || 'Category' });
  if (filters.size) activeChips.push({ key: 'size', label: `Size ${filters.size}` });
  if (filters.color) activeChips.push({ key: 'color', label: filters.color });
  if (filters.fit) activeChips.push({ key: 'fit', label: filters.fit });
  if (filters.sort && filters.sort !== 'newest') {
    activeChips.push({ key: 'sort', label: sortLabel(filters.sort) });
  }
  const filterCount = activeChips.length;

  const removeChip = (key) => {
    if (key === 'search') onFiltersChange({ search: '' });
    else if (key === 'sort') onFiltersChange({ sort: 'newest' });
    else onFiltersChange({ [key]: null });
  };

  const handleSelectProduct = (id) => {
    setSelectedProductId(id);
    setShowTopSection(false); // Hide header and search
  };

  const handleBack = () => {
    setSelectedProductId(null);
    setShowTopSection(true); // Show header and search again
  };

  const renderGridContent = () => {
    if (loading) {
      return (
        <View style={styles.stateContainer}>
          <ActivityIndicator size="large" color={colors.ink} />
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.stateContainer}>
          <Text style={styles.stateText}>Error loading products: {error}</Text>
          <TouchableOpacity
            style={styles.stateButton}
            onPress={() => setReloadKey((key) => key + 1)}
          >
            <Text style={styles.stateButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (productList.length === 0) {
      return (
        <View style={styles.stateContainer}>
          <Text style={styles.stateText}>No products match</Text>
          {filterCount > 0 && (
            <TouchableOpacity style={styles.stateButton} onPress={onClearAll}>
              <Text style={styles.stateButtonText}>Clear filters</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }
    return (
      <ProductCards
        products={productList}
        onSelectProduct={handleSelectProduct}
      />
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      {/* Conditionally render header and search based on selectedProductId */}
      {showTopSection && (
        <>
          <ShopHeader screenTitle={screenTitle} />
          <View style={styles.topHeader}>
            <TouchableOpacity
              style={styles.hamburgerBtn}
              onPress={() => navigation.toggleDrawer()}
            >
              <Ionicons name="menu" size={28} color="rgb(0, 0, 0)" />
            </TouchableOpacity>

            <View style={styles.searchContainer}>
              <SearchField
                value={filters.search}
                onSearch={(query) => onFiltersChange({ search: query })}
              />
            </View>
          </View>

          {/* Category chips row */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoryScrollView}
            contentContainerStyle={styles.categoryRow}
          >
            <TouchableOpacity
              style={[styles.categoryChip, filters.category == null && styles.categoryChipActive]}
              onPress={() => onFiltersChange({ category: null })}
            >
              <Text style={[styles.categoryChipText, filters.category == null && styles.categoryChipTextActive]}>
                All
              </Text>
            </TouchableOpacity>
            {categories.map((category) => {
              const isActive = filters.category === category.id;
              return (
                <TouchableOpacity
                  key={category.id}
                  style={[styles.categoryChip, isActive && styles.categoryChipActive]}
                  onPress={() => onFiltersChange({ category: isActive ? null : category.id })}
                >
                  <Text style={[styles.categoryChipText, isActive && styles.categoryChipTextActive]}>
                    {category.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Active filter chips + filter drawer pill */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScrollView}
            contentContainerStyle={styles.chipsRow}
          >
            <TouchableOpacity
              style={styles.filterPill}
              onPress={() => navigation.openDrawer()}
            >
              <Text style={styles.filterPillText}>Filter · {filterCount}</Text>
            </TouchableOpacity>
            {activeChips.map((chip) => (
              <View key={chip.key} style={styles.chip}>
                <Text style={styles.chipLabel}>{chip.label}</Text>
                <TouchableOpacity
                  onPress={() => removeChip(chip.key)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.chipRemove}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>

          {/* Results count + sort control */}
          <View style={styles.resultsRow}>
            <Text style={styles.resultsCount}>
              {loading ? 'Loading…' : `${productList.length} results`}
            </Text>
            <TouchableOpacity
              style={styles.sortButton}
              onPress={() => setSortModalVisible(true)}
            >
              <Text style={styles.sortButtonText}>{sortLabel(filters.sort)} ⌄</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Conditionally Render Details or Products */}
      {selectedProductId ? (
        <ProductDetails
            selectedProductId={selectedProductId}
            onBack={handleBack}
            navigation={navigation}
        />
          ) : (
              <View style={styles.mainLayout}>
                  <View style={styles.prodSide}>
                      {renderGridContent()}
                  </View>
              </View>
      )}

      {/* Sort modal */}
      <Modal
        visible={sortModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSortModalVisible(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setSortModalVisible(false)}
        >
          <View style={styles.sortSheet}>
            {SORT_OPTIONS.map((option) => {
              const isActive = filters.sort === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={styles.sortOption}
                  onPress={() => {
                    onFiltersChange({ sort: option.value });
                    setSortModalVisible(false);
                  }}
                >
                  <Text style={[styles.sortOptionText, isActive && styles.sortOptionTextActive]}>
                    {option.label}
                  </Text>
                  {isActive && <Ionicons name="checkmark" size={16} color={colors.ink} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Modal>

      {/* Always show footer */}
      <Footer active="Shop" />
    </View>
  );
}

// Export Drawer wrapping ShopContent
export default function Shop() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  const onFiltersChange = useCallback((patch) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  const onClearAll = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  return (
    <Drawer.Navigator
      drawerContent={(props) => (
          <FilterContainer
            {...props}
            filters={filters}
            onFiltersChange={onFiltersChange}
            onClearAll={onClearAll}
          />
      )}
      screenOptions={{
        headerShown: false,
        drawerPosition: 'left',
        drawerStyle: styles.drawerContainer,
      }}
    >
      <Drawer.Screen name="ShopContent">
        {(props) => (
          <ShopContent
            {...props}
            filters={filters}
            onFiltersChange={onFiltersChange}
            onClearAll={onClearAll}
          />
        )}
      </Drawer.Screen>
    </Drawer.Navigator>
  );
}

const styles = StyleSheet.create({
  drawerContainer:{
    width: '60%',
  },
  container: {
    flex: 1,
    backgroundColor: 'rgb(255, 255, 255)',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    marginTop: 10,
  },
  hamburgerBtn: {
    paddingRight: 10,
  },
  searchContainer: {
    flex: 1,
    marginVertical: 10,
  },
  categoryScrollView: {
    flexGrow: 0,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    gap: 8,
    paddingBottom: 10,
  },
  categoryChip: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 9999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  categoryChipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  categoryChipText: {
    fontFamily: fonts.interSemiBold,
    fontSize: 13,
    color: colors.ink,
  },
  categoryChipTextActive: {
    color: colors.paper,
  },
  chipsScrollView: {
    flexGrow: 0,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    gap: 6,
    paddingBottom: 10,
  },
  filterPill: {
    backgroundColor: colors.ink,
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterPillText: {
    fontFamily: fonts.interSemiBold,
    fontSize: 12,
    color: colors.paper,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 9999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipLabel: {
    fontFamily: fonts.interRegular,
    fontSize: 12,
    color: colors.ink,
  },
  chipRemove: {
    fontFamily: fonts.interRegular,
    fontSize: 10,
    color: colors.muted,
  },
  resultsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 6,
  },
  resultsCount: {
    fontFamily: fonts.interRegular,
    fontSize: 13,
    color: colors.muted,
  },
  sortButton: {
    paddingVertical: 4,
    paddingLeft: 10,
  },
  sortButtonText: {
    fontFamily: fonts.interSemiBold,
    fontSize: 13,
    color: colors.ink,
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
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 12,
  },
  stateText: {
    fontFamily: fonts.interRegular,
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
  },
  stateButton: {
    backgroundColor: colors.ink,
    borderRadius: 9999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  stateButtonText: {
    fontFamily: fonts.interSemiBold,
    fontSize: 13,
    color: colors.paper,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  sortSheet: {
    backgroundColor: colors.paper,
    borderRadius: 12,
    paddingVertical: 8,
  },
  sortOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sortOptionText: {
    fontFamily: fonts.interRegular,
    fontSize: 14,
    color: colors.ink,
  },
  sortOptionTextActive: {
    fontFamily: fonts.interSemiBold,
  },
});
