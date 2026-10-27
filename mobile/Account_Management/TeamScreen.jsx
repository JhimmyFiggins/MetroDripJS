import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { colors, fonts } from '../Checkout/src/theme';
import AdaptHeader from '../components/AdaptHeader';
import Footer from '../components/Footer';
import { TEAM_MEMBERS, TEAM_HEADING, TEAM_SUBTITLE } from '../../src/data/teamData';

const AVATARS = {
  navarro: require('../assets/team/navarro.png'),
  pameroyan: require('../assets/team/pameroyan.png'),
  deborja: require('../assets/team/deborja.png'),
  carlos: require('../assets/team/carlos.png'),
  nogoy: require('../assets/team/nogoy.png'),
};

export default function TeamScreen() {
  return (
    <SafeAreaProvider>
      <View style={styles.screen}>
        <StatusBar style="dark" />
        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
        >
          <AdaptHeader screenTitle="Our Team" fallbackRoute="Account" />

          {/* Section Heading & Subtitle */}
          <View style={styles.headingWrap}>
            <Text style={styles.headingText}>{TEAM_HEADING}</Text>
            <Text style={styles.subtitleText}>{TEAM_SUBTITLE}</Text>
          </View>

          {/* Team Cards */}
          <View style={styles.cardsWrap}>
            {TEAM_MEMBERS.map((member) => (
              <View
                key={member.id}
                style={styles.card}
                accessible={true}
                accessibilityLabel={`${member.name}, ${member.role}`}
              >
                {/* 1:1 Aspect Ratio Avatar Box */}
                <View style={styles.avatarBox}>
                  {/* Decorative Initials Fallback */}
                  <View style={styles.initialsWrap}>
                    <Text style={styles.initialsText}>{member.initials}</Text>
                  </View>

                  {/* High-Resolution Brand Avatar */}
                  {AVATARS[member.id] ? (
                    <Image
                      source={AVATARS[member.id]}
                      style={styles.avatarImage}
                      resizeMode="cover"
                      accessibilityLabel={member.name}
                    />
                  ) : null}

                  {/* Contribution Badge */}
                  <View style={styles.badgeWrap}>
                    <Text style={styles.badgeText}>{member.contribution}</Text>
                  </View>
                </View>

                {/* Member Info */}
                <View style={styles.infoWrap}>
                  <Text style={styles.memberName}>{member.name}</Text>
                  <Text style={styles.memberRole}>{member.role}</Text>
                  <Text style={styles.memberBio}>{member.bio}</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
        <Footer active="Account" />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: {
    height: '100%',
    backgroundColor: colors.paper,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 40,
  },
  headingWrap: {
    marginVertical: 24,
  },
  headingText: {
    fontFamily: fonts.anton,
    fontSize: 28,
    textTransform: 'uppercase',
    color: colors.ink,
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  subtitleText: {
    fontFamily: fonts.interRegular,
    fontSize: 14,
    color: colors.muted,
    lineHeight: 21,
  },
  cardsWrap: {
    gap: 20,
  },
  card: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    overflow: 'hidden',
  },
  avatarBox: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#141414',
    position: 'relative',
    overflow: 'hidden',
  },
  initialsWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    fontFamily: fonts.anton,
    fontSize: 72,
    color: colors.volt,
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
  },
  badgeWrap: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: colors.volt,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  badgeText: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 10,
    color: colors.ink,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  infoWrap: {
    padding: 18,
  },
  memberName: {
    fontFamily: fonts.interBold,
    fontSize: 17,
    color: colors.ink,
    marginBottom: 4,
    lineHeight: 22,
  },
  memberRole: {
    fontFamily: fonts.monoSemiBold,
    fontSize: 11,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  memberBio: {
    fontFamily: fonts.interRegular,
    fontSize: 13.5,
    color: colors.muted,
    lineHeight: 20,
  },
});
