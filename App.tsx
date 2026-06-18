import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View, ActivityIndicator, Text, Platform, PermissionsAndroid } from 'react-native';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import DeviceInfo from 'react-native-device-info';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance } from 'react-native-notify-kit';

import { store, RootState } from './src/redux/store';
import { AppNavigator } from './src/navigation/AppNavigator';
import { setUser, setError, setLoading, UserProfile } from './src/redux/slices/authSlice';
import { COLORS } from './src/constants/theme';
import { CustomAlertProvider, useCustomAlert } from './src/context/CustomAlertContext';
import { SplashScreen } from './src/components/SplashScreen';

// Enable Firestore offline caching persistence
firestore().settings({
  persistence: true,
  cacheSizeBytes: firestore.CACHE_SIZE_UNLIMITED,
});

const RootAppContent: React.FC = () => {
  const dispatch = useDispatch();
  const { loading, user } = useSelector((state: RootState) => state.auth);
  const { showAlert } = useCustomAlert();

  const requestUserPermission = async () => {
    try {
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      // Request Notifee permission (handles Android 13+ runtime permission and iOS)
      await notifee.requestPermission();

      if (enabled) {
        console.log('Authorization status:', authStatus);
        return true;
      }
    } catch (e) {
      console.warn('FCM/Notifee Permission Request error:', e);
    }
    return false;
  };

  const getFcmToken = async (uid: string) => {
    try {
      const hasPermission = await requestUserPermission();
      if (!hasPermission) return;

      const fcmToken = await messaging().getToken();
      if (fcmToken) {
        await firestore().collection('users').doc(uid).update({
          fcmToken,
        });
        console.log('Saved FCM Token to Firestore:', fcmToken);
      }
    } catch (e) {
      console.warn('Failed to get/save FCM token:', e);
    }
  };

  // Initialize notifications on component mount
  useEffect(() => {
    const initNotifications = async () => {
      try {
        // Create the high importance channel
        await notifee.createChannel({
          id: 'high_importance_channel_v3',
          name: 'High Importance Notifications',
          importance: AndroidImportance.HIGH,
          sound: 'default',
        });

        // Request runtime permission for Android 13+
        if (Platform.OS === 'android' && Platform.Version >= 33) {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
          );
          console.log('Android POST_NOTIFICATIONS runtime permission:', granted);
        }

        // Request permission via Notifee and Firebase Messaging
        await notifee.requestPermission();
        await messaging().requestPermission();
      } catch (e) {
        console.warn('Failed to initialize notifications:', e);
      }
    };

    initNotifications();
  }, []);

  useEffect(() => {
    const unsubscribeForeground = messaging().onMessage(async (remoteMessage) => {
      console.log('A new FCM message arrived in foreground!', remoteMessage);
      const title = remoteMessage.notification?.title || 'Notification';
      const body = remoteMessage.notification?.body || '';
      
      // 1. Keep the in-app alert dialog as is
      showAlert(title, body);

      // 2. Display a heads-up system notification banner with default sound
      try {
        await notifee.displayNotification({
          title: title,
          body: body,
          android: {
            channelId: 'high_importance_channel_v3',
            importance: AndroidImportance.HIGH,
            sound: 'default',
            pressAction: {
              id: 'default',
            },
          },
        });
      } catch (err) {
        console.warn('Failed to display foreground local notification:', err);
      }
    });

    return () => {
      unsubscribeForeground();
    };
  }, [showAlert]);

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
                          } else {
                            // Find all Super Admins and notify them
                            const superAdminsSnap = await firestore()
                              .collection('users')
                              .where('role', '==', 'SUPER_ADMIN')
                              .get();
                            
                            const promises = superAdminsSnap.docs.map(doc => 
                              firestore().collection('notifications').add({
                                employeeId: doc.id,
                                title: 'Device Approval Request',
                                body: `${data.name || 'User'} requested login approval on a new device.`,
                                status: 'unread',
                                createdAt: firestore.FieldValue.serverTimestamp(),
                              })
                            );
                            await Promise.all(promises);
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
                let adminId = data?.adminId || '';

                if (data?.role === 'EMPLOYEE') {
                  try {
                    const empSnap = await firestore().collection('employees').doc(firebaseUser.uid).get();
                    if (empSnap.exists()) {
                      const empData = empSnap.data();
                      department = empData?.department || 'General';
                      phone = empData?.phone || '';
                      if (!adminId) {
                        adminId = empData?.adminId || '';
                      }
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
                  adminId,
                };

                dispatch(setUser(userProfile));
                getFcmToken(firebaseUser.uid);
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

  // Global Firestore real-time notifications listener
  // This triggers a local heads-up notification and in-app alert when a new notification doc is added,
  // resolving Spark-plan Cloud Functions limitations by doing local foreground delivery.
  useEffect(() => {
    if (!user) return;

    let isInitialLoad = true;
    const unsubscribe = firestore()
      .collection('notifications')
      .where('employeeId', '==', user.uid)
      .where('status', '==', 'unread')
      .onSnapshot((snapshot) => {
        if (!snapshot) return;

        snapshot.docChanges().forEach(async (change) => {
          if (change.type === 'added') {
            if (!isInitialLoad) {
              const data = change.doc.data();
              const title = data.title || 'Notification';
              const body = data.body || '';

              // 1. Show custom in-app alert dialog as is
              showAlert(title, body);

              // 2. Display a heads-up system notification banner with default sound
              try {
                await notifee.displayNotification({
                  title,
                  body,
                  android: {
                    channelId: 'high_importance_channel_v3',
                    importance: AndroidImportance.HIGH,
                    sound: 'default',
                    pressAction: {
                      id: 'default',
                    },
                  },
                });
              } catch (err) {
                console.warn('Failed to display listener notification:', err);
              }
            }
          }
        });

        isInitialLoad = false;
      }, (err) => {
        console.warn('Global Firestore notifications listener error:', err);
      });

    return () => unsubscribe();
  }, [user, showAlert]);

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
