import { StyleSheet, FlatList, TouchableOpacity, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import {fonts} from '../Checkout/src/theme';
export default function AdaptHeader({screenTitle}){
    const navigation = useNavigation();
    return(
        <View style={styles.header}>
            {/* <TouchableOpacity 
            onPress={() => navigation.navigate('Shop')}
            >
                <Text style={styles.backButton}> <Ionicons name="chevron-back" size={24} color="#111111" /> </Text>
            </TouchableOpacity> */}

            <Text style={styles.title}>{screenTitle}</Text>
        </View>
    );
}

const styles = StyleSheet.create({

    header: {
        marginTop: 40,
        marginBottom: 0,
        flexDirection: 'column',     // Vertical layout (main axis = top to bottom)
        justifyContent: 'flex-end',  // Pushes the title to the BOTTOM
        alignItems: 'center',       // Centers the title HORIZONTALLY
        position: 'relative',
        width: '100%',
        minHeight: 60,
        paddingBottom: 10,           // Spacing from the bottom edge
    },
    // backButton: {
    //     color: '#111111',
    //     fontSize: 30,
    //     alignSelf: 'center',
    //     fontWeight: '900',
    //     right: 75,
        
    // },
    title: {
        color: '#111111',
        fontSize: 20,
        fontFamily:fonts.interBold,
        letterSpacing: -1,
        justifyContent: 'center',
        // marginRight: 30,
    },
})