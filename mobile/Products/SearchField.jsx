import { StyleSheet, View, Text, TextInput, FlatList } from 'react-native';

import React, { useState } from 'react';

// type SearchBarComponentProps = {};

export default function SearchField(){
    const [search, setSearch] = useState('');
    //  const filteredProducts = products.filter((product) =>
    //     product.name.toLowerCase().includes(search.toLowerCase())
    // );
    return (
        <View>
            <TextInput style={styles.searchInput}
                placeholder="Search products..."
                placeholderTextColor="gray"
                value={search}
                onChangeText={setSearch}
            />

            {/* <FlatList
                data={filteredProducts}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                <Text>{item.name}</Text>
                )}
            /> */}
        </View>
    );
}

const styles = StyleSheet.create({
   searchInput:{
    fontSize: 16,
    color: 'gray',
    fontWeight: 'bold',
    paddingLeft: 10,
    
   }, 
});