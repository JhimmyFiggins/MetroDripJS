import { StyleSheet, TouchableOpacity, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

export default function AdaptHeader({screenTitle, onBack, fallbackRoute = 'Shop'}){
    const navigation = useNavigation();
    const handleBack = onBack || (() => {
        if (navigation.canGoBack()) navigation.goBack();
        else navigation.navigate(fallbackRoute);
    });
    return(
        <View style={styles.header}>
            <TouchableOpacity
            accessibilityLabel={`Go back from ${screenTitle}`}
            accessibilityRole="button"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={handleBack}
            style={styles.backTarget}
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
        borderBottomWidth: 1,
    },  
    backTarget: {
        position: 'absolute',
        left: 0,
        minWidth: 44,
        minHeight: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    backButton: {
        color: '#111111',
        fontSize: 30,
        alignSelf: 'center',
        fontWeight: '900',
    },
    title: {
        color: '#111111',
        fontSize: 20,
        fontWeight: '900',
        letterSpacing: -1,
        justifyContent: 'center',
    },
})
