// src/screens/SplashScreen.js
// Updated to use your bundled logo at src/assets/logo.png
// Theme adjusted to match app (dark/navy background + blue accent).
// - Uses Animated.Image for smooth scale & fade
// - Keeps navigation.replace('Auth') after 2s
// - SafeAreaView + StatusBar for proper notch handling
// - Copy-paste ready

import React, { useEffect, useRef } from 'react';
import { SafeAreaView, View, Text, StyleSheet, Animated, Image, StatusBar, Platform } from 'react-native';

export default function SplashScreen({ navigation }) {
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    // entrance animation: scale + fade + subtle lift
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 7, tension: 120, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(lift, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]).start();

    const t = setTimeout(() => {
      // move to Auth screen (login/signup)
      navigation.replace('Auth');
    }, 2000);

    return () => clearTimeout(t);
  }, [navigation, scale, opacity, lift]);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={styles.safe.backgroundColor}
      />
      <View style={styles.container}>
        <Animated.View style={[
          styles.logoWrap,
          {
            transform: [
              { translateY: lift },
              { scale },
            ],
            opacity,
          }
        ]}>
          <Animated.Image
            source={require('../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
            accessible
            accessibilityLabel="App logo"
          />
        </Animated.View>

        <Text style={styles.title}>CITADEL</Text>
        <Text style={styles.subtitle}>Secure · Offline · Fast</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0F172A', // dark/navy to match app header theme
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  // logoWrap: {
  //   width: 160,
  //   height: 160,
  //   borderRadius: 22,
  //   alignItems: 'center',
  //   justifyContent: 'center',
  //   backgroundColor: '#0F172A',
  //   // subtle glow
  //   shadowColor: '#3B82F6',
  //   shadowOpacity: 0.12,
  //   shadowRadius: 18,
  //   shadowOffset: { width: 0, height: 10 },
  //   elevation: 12,
  //   marginBottom: 18,
  // },
  logo: {
    width: 160,
    height: 190,
    borderRadius:15,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 0,
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 13,
    marginTop: 0,
  },
});
