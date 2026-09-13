import { useState } from 'react'; 
import { StatusBar } from 'expo-status-bar';

// Theme
import {colors, fonts} from '../../Checkout/src/theme';

import {View, Text, TouchableOpacity, StyleSheet} from 'react-native';

export default function InitialScreen({navigation}){
    
    return(
        <View style={styles.container}>
            <StatusBar style="dark" />

            <View style={styles.titleContainer}>
                <Text style={styles.title}>MetroDrip</Text>
                <Text style={styles.subTextUpper}>Metro Manila Streetwear</Text>
                <Text style={styles.subText}>Shop and drop from your phone</Text>
                <Text style={styles.subText}>Track every order to your door    </Text>
            </View>

            <View style={styles.buttonContainer}>
                <TouchableOpacity 
                    style={styles.createAccountBtn}
                    onPress={() => navigation.navigate('Signup')}
                >
                    <Text style={styles.createAccountBtnText}>Create Account</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                    style={styles.signInBtn}
                    onPress={() => navigation.navigate('Login')}
                >
                    <Text style={styles.signInBtnText}>Sign In</Text>
                </TouchableOpacity>
            </View>

        </View>
    );
}


const styles = StyleSheet.create({

    container:{
        
        justifyContent: 'center',
        flex: 1,
        backgroundColor: 'rgb(255, 255, 255)',
    },
    title:{
        fontFamily: fonts.interBold,
        textAlign: 'center',
        fontSize: 50,
        color: 'rgb(0, 0, 0)',
        backgroundColor: 'rgb(255, 255, 255)',
    },
    titleContainer:{
        marginTop: 300,
    },
    subTextUpper:{
        fontFamily:fonts.interMedium,
        color:'rgb(97, 117, 24)',
        textAlign: 'center',
        fontWeight: '500',
        fontSize: 15,
        marginVertical: 20,
    },
    subText:{
        fontFamily: fonts.interRegular,
        color: 'rgb(67, 67, 67)',
        textAlign: 'center',
        fontSize: 17,
    },  
    buttonContainer:{
        marginTop: 200,
    },
    createAccountBtn:{
        backgroundColor: 'rgb(0, 0, 0)',
        paddingVertical: 10,
        marginHorizontal: 30,
        marginTop: 10,
        borderRadius: 20,
        
    },
    createAccountBtnText:{
        color: 'white',
        textAlign: 'center',
        fontSize: 20,
        fontFamily: fonts.interBold,
    },
    signInBtn:{
        backgroundColor: 'rgb(212, 255, 55)',
        paddingVertical: 10,
        marginHorizontal: 30,
        marginTop: 10, 
        borderRadius: 20,
    },
    signInBtnText:{
        color: 'rgb(0, 0, 0)',
        textAlign: 'center',
        fontSize: 20,
        fontFamily: fonts.interBold,
    },


});
