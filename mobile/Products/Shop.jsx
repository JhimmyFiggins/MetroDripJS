import React, { useState } from 'react';
import { StyleSheet, FlatList, Text, View, TouchableOpacity } from 'react-native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import { Ionicons } from '@expo/vector-icons';
import SearchField from './SearchField.jsx';

import FilterContainer from './FilterContainer.jsx';
import ProductCards from './ProductCards.jsx';
import ProductDetails from './ProductDetails.jsx';
import { products } from '../data/product.js';

//Components
import ShopHeader from '../components/ShopHeader.jsx';
import AdaptHeader from '../components/AdaptHeader.jsx';
import Footer from '../components/Footer';

import {fonts} from '../Checkout/src/theme';
const Drawer = createDrawerNavigator();


// Inner screen rendering your products grid
function ShopContent({ navigation, route }) {
  
  const [selectedProductId, setSelectedProductId] = useState(null);
  const selectedCategory = route.params?.selectedCategory ?? null;
  // Track whether we should show header/search
  const [showTopSection, setShowTopSection] = useState(true);

  const items = products.length;
  const data = [
    { id: '0', name: 'All' },
    { id: '1', name: `${items} Items` },
  ];

  const screenTitle = 'Shop';

  const handleSelectProduct = (id) => {
    setSelectedProductId(id);
    setShowTopSection(false); // Hide header and search
  };

  const handleBack = () => {
    setSelectedProductId(null);
    setShowTopSection(true); // Show header and search again
  };

  return (
    <View style={styles.container}>
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
              <SearchField />
            </View>
          </View>
        </>
      )}

      {/* Conditionally Render Details or Products */}
      {selectedProductId ? (
        <ProductDetails
          selectedProductId={selectedProductId}
          onBack={handleBack}
        />
      ) : (
        <>
          <FlatList
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
          />

          <View style={styles.mainLayout}>
            <View style={styles.prodSide}>
              <ProductCards
                  selectedCategory={selectedCategory}
              />
            </View>
          </View>
        </>
      )}
      
      {/* Always show footer */}
      <Footer />
    </View>
  );
}

// Export Drawer wrapping ShopContent
export default function Shop() {
  return (
    <Drawer.Navigator
      styles={styles.drawerContainer}
      drawerContent={(props) => (
          <FilterContainer {...props} />
      )}
      screenOptions={{
        headerShown: false,
        drawerPosition: 'left',
        drawerStyle: styles.drawerContainer,
      }}
    >
      <Drawer.Screen name="ShopContent" component={ShopContent} />
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
    paddingVertical: 5,
    backgroundColor: 'rgb(240, 240, 240)',
    borderRadius: 25,
    marginVertical: 10,
  },
  pCHeader: {
    width: '100%',
    backgroundColor: '#FFF',
    paddingTop: 6,
    paddingHorizontal: 20,
    maxHeight: 50,
  },
  leftSide: {
    fontSize: 25,
    textAlign: 'left',
    fontFamily: fonts.interBold,
  },
  rightSide: {
    fontSize: 15,
    paddingTop: 10,
    fontWeight: '300',
    textAlign: 'right',
    fontFamily: fonts.interBold,
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
  row: {
    justifyContent: 'space-between',
  },
});