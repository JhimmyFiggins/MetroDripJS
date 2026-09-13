import { StyleSheet, FlatList, TouchableOpacity, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useNavigation } from '@react-navigation/native';
import {fonts} from '../Checkout/src/theme';


export default function Header() {
  const navigation = useNavigation();
  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={styles.buttonTitle}
        onPress={() => navigation.navigate('Home')}
      >
        <Text style={styles.title}>MetroDrip</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.button}>
        <Text style={styles.buttonText}>🔔</Text>
      </TouchableOpacity>
      
      <TouchableOpacity style={styles.button}
        onPress={() => navigation.navigate('Cart')}
      >
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