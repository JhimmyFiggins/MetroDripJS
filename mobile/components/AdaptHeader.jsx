import { StyleSheet, FlatList, TouchableOpacity, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

export default function AdaptHeader({screenTitle}){
    const navigation = useNavigation();
    return(
        <View style={styles.header}>
            <TouchableOpacity 
            onPress={() => navigation.navigate('Shop')}
            >
                <Text style={styles.backButton}> <Ionicons name="chevron-back" size={24} color="#111111" /> </Text>
            </TouchableOpacity>

            <Text style={styles.title}>{screenTitle}</Text>
        </View>
    );
}

const styles = StyleSheet.create({

    header: {
        marginTop: 10,
        flexDirection: 'row',
        alignItems: 'center',       // Centers both items vertically on the Y-axis
        justifyContent: 'center',    // Centers the title horizontally on the screen
        position: 'relative',       // Provides a reference point for the back button
        width: '100%',
        minHeight: 60,
    },  
    backButton: {
        color: '#111111',
        fontSize: 30,
        alignSelf: 'center',
        fontWeight: '900',
        right: 75,
        
    },
    title: {
        color: '#111111',
        fontSize: 20,
        fontWeight: '900',
        letterSpacing: -1,
        justifyContent: 'center',
        marginRight: 30,
    },
})