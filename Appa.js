import { StatusBar } from 'expo-status-bar';
import { StyleSheet, FlatList,Text, View } from 'react-native';
import { Button } from 'react-native';
import Header from './mobile/components/Header.jsx';
import Shop from './mobile/Products/Shop.jsx';


// const data = [
//   { id: '1', name: 'Item 1' },
//   { id: '2', name: 'Item 2' },
//   { id: '3', name: 'Item 3' },
//   { id: '4', name: 'Item 4' },
// ];

export default function App() {
  return (
    <View style={styles.container}>

      <Header />
      <Shop />
      {/* <StatusBar style="auto" /> */}
    </View>

  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    flex: 1,
    // backgroundColor: 'rgb(255, 248, 240)',
    
  },
 
});
