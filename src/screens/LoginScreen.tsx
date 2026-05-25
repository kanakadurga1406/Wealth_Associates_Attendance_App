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
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { useDispatch } from 'react-redux';
import { setError, setLoading } from '../redux/slices/authSlice';
import { COLORS, SPACING } from '../constants/theme';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { useCustomAlert } from '../context/CustomAlertContext';

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
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.brand}>WealthAttendance</Text>
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

          <Button
            title="Register Initial Super Admin"
            loading={isSubmitting}
            onPress={handleCreateSuperAdmin}
            style={{ marginTop: 12, backgroundColor: '#10B981' }}
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
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: SPACING.xxl,
  },
  brand: {
    fontSize: 32,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    textAlign: 'center',
  },
  formCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: SPACING.xl,
    elevation: 4,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  formTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.lg,
  },
  button: {
    marginTop: SPACING.md,
  },
});
