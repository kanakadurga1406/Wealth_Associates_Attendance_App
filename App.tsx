import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View, ActivityIndicator, Text } from 'react-native';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import DeviceInfo from 'react-native-device-info';

import { store, RootState } from './src/redux/store';
import { AppNavigator } from './src/navigation/AppNavigator';
import { setUser, setError, setLoading, UserProfile } from './src/redux/slices/authSlice';
import { COLORS } from './src/constants/theme';
import { CustomAlertProvider, useCustomAlert } from './src/context/CustomAlertContext';
import { SplashScreen } from './src/components/SplashScreen';

const RootAppContent: React.FC = () => {
  const dispatch = useDispatch();
  const { loading } = useSelector((state: RootState) => state.auth);
  const { showAlert } = useCustomAlert();
  
  useEffect(() => {
    let unsubscribeFirestore: (() => void) | null = null;

    // Listen to Firebase Auth state updates
    const unsubscribeAuth = auth().onAuthStateChanged(async (firebaseUser) => {
      // Clean up previous profile snap listener if present
      if (unsubscribeFirestore) {
        unsubscribeFirestore();
        unsubscribeFirestore = null;
      }

      if (firebaseUser) {
        dispatch(setLoading(true));

        // Real-time listener for the user profile document in Firestore
        unsubscribeFirestore = firestore()
          .collection('users')
          .doc(firebaseUser.uid)
          .onSnapshot(
            async (docSnapshot) => {
              if (docSnapshot && docSnapshot.exists()) {
                const data = docSnapshot.data();
                
                // 1. If user is blocked, force sign out immediately
                if (data?.status === 'blocked') {
                  await auth().signOut();
                  dispatch(setUser(null));
                  dispatch(setError('Your account has been deactivated or blocked by the Admin.'));
                  showAlert('Account Blocked', 'Your account has been deactivated or blocked by the Admin.');
                  return;
                }

                // 2. Check device ID binding for employees
                let currentDeviceId = '';
                try {
                  currentDeviceId = await DeviceInfo.getUniqueId();
                } catch (deviceErr) {
                  console.warn('Failed to retrieve unique device ID in App.tsx:', deviceErr);
                }

                if (data?.role === 'EMPLOYEE' && currentDeviceId) {
                  const boundDeviceId = data.deviceId;
                  if (!boundDeviceId) {
                    // Bind device ID on first login
                    await firestore().collection('users').doc(firebaseUser.uid).update({
                      deviceId: currentDeviceId,
                    });
                    return; // Firestore listener will trigger again with updated document
                  } else if (boundDeviceId !== currentDeviceId) {
                    // Device mismatch! Run the registration check and signOut in background
                    const registerDeviceRequestAndSignOut = async () => {
                      try {
                        const pendingQuery = await firestore()
                          .collection('device_requests')
                          .where('employeeId', '==', firebaseUser.uid)
                          .where('newDeviceId', '==', currentDeviceId)
                          .where('status', '==', 'Pending')
                          .limit(1)
                          .get();

                        if (pendingQuery.empty) {
                          // Create pending request
                          await firestore().collection('device_requests').add({
                            employeeId: firebaseUser.uid,
                            employeeName: data.name || 'Employee',
                            employeeEmail: data.email || '',
                            adminId: data.adminId || '',
                            oldDeviceId: boundDeviceId,
                            newDeviceId: currentDeviceId,
                            status: 'Pending',
                            requestedAt: firestore.FieldValue.serverTimestamp(),
                          });

                          // Log activity
                          await firestore().collection('activity_logs').add({
                            employeeId: firebaseUser.uid,
                            activity: `Login blocked: Device ID mismatch (Requested binding for device: ${currentDeviceId})`,
                            timestamp: firestore.FieldValue.serverTimestamp(),
                          });

                          // Notify Admin
                          if (data.adminId) {
                            await firestore().collection('notifications').add({
                              employeeId: data.adminId,
                              title: 'Device Approval Request',
                              body: `${data.name || 'Employee'} requested login approval on a new device.`,
                              status: 'unread',
                              createdAt: firestore.FieldValue.serverTimestamp(),
                            });
                          }
                        }
                      } catch (dbErr) {
                        console.warn('Background device registration failed:', dbErr);
                      } finally {
                        try {
                          await auth().signOut();
                        } catch (signOutErr) {
                          console.warn('Background signOut failed:', signOutErr);
                        }
                      }
                    };

                    // Kick off background tasks
                    registerDeviceRequestAndSignOut();

                    // Immediately show the mismatch alert and clear Redux (which hides SplashScreen)
                    dispatch(setUser(null));
                    dispatch(setError('Device ID mismatch. Please wait for Admin approval.'));
                    showAlert(
                      'Device Mismatch',
                      'Device ID mismatch. A request has been sent to your Admin for approval. Please wait for approval.'
                    );
                    return;
                  }
                }

                // If role is EMPLOYEE, fetch employee-specific fields
                let department = '';
                let phone = '';
                
                if (data?.role === 'EMPLOYEE') {
                  try {
                    const empSnap = await firestore().collection('employees').doc(firebaseUser.uid).get();
                    if (empSnap.exists()) {
                      const empData = empSnap.data();
                      department = empData?.department || 'General';
                      phone = empData?.phone || '';
                    }
                  } catch (e) {
                    console.warn('Error fetching secondary employee details:', e);
                  }
                }

                const userProfile: UserProfile = {
                  uid: firebaseUser.uid,
                  name: data?.name || firebaseUser.displayName || 'Member',
                  email: data?.email || firebaseUser.email || '',
                  role: data?.role || 'EMPLOYEE',
                  status: data?.status || 'active',
                  department,
                  phone,
                };
                
                dispatch(setUser(userProfile));
              } else {
                // authenticated but profile doesn't exist in registry
                dispatch(setUser(null));
              }
            },
            (err) => {
              console.warn('Profile listener error:', err);
              dispatch(setError(err.message));
            }
          );
      } else {
        dispatch(setUser(null));
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeFirestore) unsubscribeFirestore();
    };
  }, [dispatch]);

  if (loading) {
    return <SplashScreen />;
  }

  return (
    <View style={styles.container}>
      <NavigationContainer>
        <AppNavigator />
      </NavigationContainer>
    </View>
  );
};

export const App: React.FC = () => {
  return (
    <Provider store={store}>
      <SafeAreaProvider>
        <CustomAlertProvider>
          <RootAppContent />
        </CustomAlertProvider>
      </SafeAreaProvider>
    </Provider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
});

export default App;
