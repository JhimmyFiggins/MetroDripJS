import React, { useState } from 'react';
import { StyleSheet, FlatList, Text, View, TouchableOpacity } from 'react-native';
import SearchField from './SearchField.jsx';
import FilterContainer from './FilterContainer.jsx';
import ProductCards from './ProductCards.jsx';
import ProductDetails from './ProductDetails.jsx';
import { products } from '../data/product.js';

export default function Shop() {
  const [selectedProductId, setSelectedProductId] = useState(null);

  const items = products.length;
  const data = [
    { id: '0', name: 'All' },
    { id: '1', name: `${items} Items` },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <SearchField />
      </View>

      {/* Conditionally Render: Product Details OR Main Shop Grid */}
      {selectedProductId ? (
        <ProductDetails
          selectedProductId={selectedProductId}
          onBack={() => setSelectedProductId(null)}
        />
      ) : (
        <>
          {/* Category Header Bar */}
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

          {/* Main Content Layout: Sidebar Filters + Product Grid */}
          <View style={styles.mainLayout}>
            <View style={styles.catSide}>
              <FilterContainer />
            </View>

            <View style={styles.prodSide}>
              <ProductCards
                onSelectProduct={(id) => setSelectedProductId(id)}
              />
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  searchContainer: {
    width: '80%',
    alignSelf: 'center',
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
    fontWeight: 'bold',
    textAlign: 'left',
  },
  rightSide: {
    fontSize: 15,
    paddingTop: 10,
    fontWeight: '300',
    textAlign: 'right',
  },
  mainLayout: {
    flex: 1,
    flexDirection: 'row',
  },
  catSide: {
    // minWidth: '30%',
    // maxWidth: '35',
    width: '30%',
    backgroundColor: 'rgb(244, 244, 242)',
    borderRadius: 10,
    margin: 10,
  },
  prodSide: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 10,
    marginTop: 10,
    marginBottom: 10,
    marginRight: 10,
  },
  row: {
    justifyContent: 'space-between',
  },
});