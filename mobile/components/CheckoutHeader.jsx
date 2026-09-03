import { StyleSheet, FlatList, Text, View } from 'react-native';

const data = [
  { id: '0', name: 'Checkout' },
  { id: '1', name: 'Button 2' },
];

export default function CheckoutHeader() {
  return (
    <View style={styles.header}>
        <FlatList
            data={data}
            numColumns={2} // Splits your list items into 2 columns
            columnWrapperStyle={styles.row}
            renderItem={({ item, index }) => 
                <Text style={[
                    index === 0 && styles.title, 
                    index === 1 && styles.rightSide]}>{item.name}
                </Text>}

        />        
    </View>

    
  );
}

const styles = StyleSheet.create({
  header: {
  position: 'fixed',
  paddingTop: 50,
  paddingLeft: 20,
  paddingRight: 20,
  width: '100%',
  top: 0,
  left: 0,
  right: 0,
  height: 100,
  justifyContent: 'center',
  // backgroundColor: 'rbg(255, 255, 255)',
  },
  title:{
    fontSize: 25,
    fontWeight: 'bold',
    textAlign: 'left',
  }, 
  rightSide:{
    fontSize: 15,
    fontWeight: 'bold',
    textAlign: 'right',
  },
  row: {
    justifyContent: 'space-between',
  },
  
});