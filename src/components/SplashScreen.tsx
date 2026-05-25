import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Text, Animated, Image, StatusBar } from 'react-native';
import { COLORS } from '../constants/theme';

const logoImg = require('../assets/attendance_icon.png');

export const SplashScreen: React.FC = () => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.6)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // 1. Initial parallel fade-in and scale-up animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // 2. Loop pulse animation once the entry animation is finished
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.06,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 900,
            useNativeDriver: true,
          }),
        ])
      ).start();
    });
  }, [fadeAnim, scaleAnim, pulseAnim]);

  // Multiply scaleAnim (initial entry) and pulseAnim (continuous breath)
  const animatedScale = Animated.multiply(scaleAnim, pulseAnim);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      
      <View style={styles.logoWrapper}>
        <Animated.Image
          source={logoImg}
          style={[
            styles.logo,
            {
              opacity: fadeAnim,
              transform: [{ scale: animatedScale }],
            },
          ]}
          resizeMode="contain"
        />
      </View>

      <Animated.View style={[styles.textWrapper, { opacity: fadeAnim }]}>
        <Text style={styles.brandText}>WealthAttendance</Text>
        <Text style={styles.subtitleText}>Verifying system credentials...</Text>
      </Animated.View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Secure Enterprise Portal</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  logo: {
    width: 130,
    height: 130,
    borderRadius: 28,
  },
  textWrapper: {
    alignItems: 'center',
  },
  brandText: {
    fontSize: 30,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  subtitleText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '600',
    marginTop: 10,
  },
  footer: {
    position: 'absolute',
    bottom: 40,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.4)',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
});
