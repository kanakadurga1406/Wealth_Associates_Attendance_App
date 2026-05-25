import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  Image,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { useDispatch } from 'react-redux';
import { setError, setLoading } from '../redux/slices/authSlice';
import { COLORS, SPACING, SHADOWS } from '../constants/theme';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { useCustomAlert } from '../context/CustomAlertContext';

const logoImg = require('../assets/attendance_icon.png');

export const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const dispatch = useDispatch();
  const { showAlert } = useCustomAlert();

  const handleLogin = async () => {
    if (!email || !password) {
      showAlert('Validation Error', 'Please fill in all fields.');
      return;
    }

    setIsSubmitting(true);
    dispatch(setLoading(true));

    try {
      // 1. Sign in with Firebase Auth. App.tsx's onAuthStateChanged real-time listener
      // will handle role extraction, status deactivation, and device ID validation.
      await auth().signInWithEmailAndPassword(email.trim(), password);
    } catch (err: any) {
      console.error('--- LOGIN ERROR DETAILS ---');
      console.error('Error Code:', err.code);
      console.error('Error Message:', err.message);
      console.error('---------------------------');

      const errMsg = err.message || 'Authentication failed.';
      const errCode = err.code ? `\nCode: ${err.code}` : '';
      dispatch(setError(errMsg));
      showAlert('Login Failed', `${errMsg}${errCode}`);
    } finally {
      setIsSubmitting(false);
      dispatch(setLoading(false));
    }
  };

  const handleCreateSuperAdmin = async () => {
    if (!email || !password) {
      showAlert('Validation Error', 'Please enter email and password for the Super Admin account.');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Create in Firebase Auth
      const userCredential = await auth().createUserWithEmailAndPassword(email.trim(), password);
      const { uid } = userCredential.user;

      // 2. Create in Firestore users collection
      await firestore().collection('users').doc(uid).set({
        uid,
        name: 'Super Admin',
        email: email.trim().toLowerCase(),
        role: 'SUPER_ADMIN',
        status: 'active',
        createdAt: firestore.FieldValue.serverTimestamp(),
      });

      showAlert('Success', `Super Admin account registered!\nEmail: ${email.trim()}\nYou can now log in.`);
    } catch (err: any) {
      console.error('Failed to create Super Admin:', err);
      showAlert('Registration Failed', err.message || 'An error occurred.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      {/* Ambient backgrounds */}
      <View style={styles.bgBlob1} />
      <View style={styles.bgBlob2} />

      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Image source={logoImg} style={styles.logo} />
            </View>
            <Text style={styles.brand}>
              Wealth<Text style={{ color: COLORS.primaryLight }}>Attendance</Text>
            </Text>
            <Text style={styles.tagline}>Clean & Secure Enterprise Attendance Portal</Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Sign In</Text>

            <Input
              label="Email Address"
              placeholder="name@wealthapp.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Input
              label="Password"
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Button
              title="Login to Dashboard"
              loading={isSubmitting}
              onPress={handleLogin}
              style={styles.button}
            />
          </View>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    position: 'relative',
  },
  bgBlob1: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: COLORS.primaryLight + '12', // Subtle low opacity primary color
    zIndex: -1,
  },
  bgBlob2: {
    position: 'absolute',
    bottom: -80,
    left: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: COLORS.secondaryLight + '12', // Subtle low opacity secondary color
    zIndex: -1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  logoContainer: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
    elevation: 4,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  logo: {
    width: 54,
    height: 54,
    resizeMode: 'contain',
  },
  brand: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 6,
    textAlign: 'center',
    fontWeight: '500',
    paddingHorizontal: SPACING.md,
  },
  formCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: SPACING.xl,
    elevation: 8,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  button: {
    marginTop: SPACING.sm,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: SPACING.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: COLORS.border,
  },
  dividerText: {
    marginHorizontal: SPACING.sm,
    color: COLORS.textLight,
    fontSize: 12,
    fontWeight: '600',
  },
  setupButton: {
    borderWidth: 1.5,
  },
});
