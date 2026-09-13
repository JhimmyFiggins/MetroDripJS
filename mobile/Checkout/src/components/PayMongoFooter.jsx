import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '../theme';

export function PayMongoFooter() {
  return (
    <View style={styles.container}>
      <Text style={styles.lockIcon}>🔒</Text>
      <Text style={styles.text}>
        Secured by PayMongo · card details never stored
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: colors.surface,
    marginTop: 24,
    borderRadius: 8,
  },
  lockIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  text: {
    fontFamily: fonts.interMedium,
    fontSize: 12,
    color: colors.muted,
  },
});
