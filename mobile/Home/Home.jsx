import React, { useState, useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { fonts } from '../../src/theme/font';
import Header from '../components/Header';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function Home() {
 
  return (
    <SafeAreaProvider style={styles.Container}>
      <View style={styles.HeroBanner}>

        <Text style={styles.HeroBannerUpper}>Metro Manila Streetwear</Text>
        <Text style={styles.HeroBannerTitle}>
            Urban Style Redefined
        </Text>

        <TouchableOpacity
        style={styles.HeroLowerButton}>
            <Text style={styles.HeroBannerLower}>Shop the Drop</Text>
        </TouchableOpacity>
        

      </View>

      <View>
        <ScrollView
            horizontal 
            showsHorizontalScrollIndicator={false}>

           <TouchableOpacity>
                <Text> </Text>
           </TouchableOpacity>
           
        </ScrollView>
      </View>
    </SafeAreaProvider>
  );
}

const styles =StyleSheet.create({
    Container:{
        backgroundColor: 'rgb(244, 244, 242)',
    },
    HeroBanner:{
        width: '100%',
        // flexGrow: 1,
        justifyContent: ' ',
        alignItems: ' ',
        backgroundColor: 'rgb(0, 0, 0)',
        paddingLeft: 20,
        paddingVertical: 20,
    },
    HeroBannerUpper:{
        color: 'rgb(186, 222, 53)',
        fontSize: 15,
        fontWeight: '400',
        
        
    },
    HeroBannerTitle:{
        color: 'rgb(255, 255, 255)',
        fontSize:48,
        fontWeight: '900',
         
        
    },
    HeroLowerButton:{
        backgroundColor: 'rgb(198, 239, 56)',
        paddingTop: 9,
        paddingVertical: 10,
        paddingLeft: 20,
        paddingRight: 20,
        borderRadius: 25,
        marginVertical: 5,
        maxWidth: 200,
         
    },
    HeroBannerLower:{
        
        color: 'rgb(21, 21, 21)',
        fontSize:18,
        fontWeight: '800',
        textAlign: 'center',
        
        // backgroundColor: 'rgb(134, 143, 103)',
    },
    
    
})