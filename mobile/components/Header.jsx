import { StyleSheet, FlatList, TouchableOpacity, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const data = [
  { id: '1', name: 'MetroDrip' },
  { id: '2', name: '🔔' },
  { id: '3', name: '🛍️' },
];

export default function Header() {
  return (
    // <View style={styles.header}>
    //     {/* <FlatList
    //         data={data}
    //         numColumns={3} // Splits your list items into 2 columns
    //         columnWrapperStyle={styles.row}
    //         renderItem={({ item, index }) => 
    //             <TouchableOpacity style={[
    //               index === 0 &&styles.buttonTitle,
    //               index === 1 &&styles.button,
    //               index === 2 &&styles.button,
    //             ]}>
    //                 <Text style={[
    //                 index === 0 && styles.title, 
    //                 index === 1 && styles.rightSideButton,
    //                 index === 2 && styles.rightSideButton,
    //                 ]}
    //                 >{item.name}</Text>
    //             </TouchableOpacity>}

    //     />         */}
    //     <NavItem icon="home-outline" label="Home" active />
    //   <NavItem icon="search-outline" label="Shop" />
    // </View>
    <View style={styles.container}>
      <TouchableOpacity style={styles.buttonTitle}>
        <Text style={styles.title}>MetroDrip</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button}>
        <Text style={styles.buttonText}>🔔</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.button}>
        <Text style={styles.buttonText}>🛍️</Text>
      </TouchableOpacity>
    </View>
    
  );
}



const styles = StyleSheet.create({
 container: {
    paddingTop: 50,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  title:{
    fontSize: 25,
    fontWeight: 'bold',
    textAlign: 'left',
    // marginRight: 170,
  }, 
  buttonTitle:{
    marginRight: '40%',
  },
  button:{
  
  },
  buttonText:{
    fontSize: 20,
    
  },
});