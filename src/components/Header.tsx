import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  StatusBar,
  Image,
  Modal,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { COLORS, SPACING } from '../constants/theme';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../redux/store';
import { useCustomAlert } from '../context/CustomAlertContext';
import { setUser } from '../redux/slices/authSlice';
import { Input } from './Input';
import { Button } from './Button';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

interface HeaderProps {
  title: string;
  showBackButton?: boolean;
  rightAction?: () => void;
  rightIcon?: string;
  subtitle?: string;
}

const logoImg = require('../assets/attendance_icon.png');

export const Header: React.FC<HeaderProps> = ({
  title,
  showBackButton = false,
  rightAction,
  rightIcon,
  subtitle
}) => {
  const navigation = useNavigation();
  const dispatch = useDispatch();
  const { user } = useSelector((state: RootState) => state.auth);
  const { showAlert } = useCustomAlert();

  // Profile Modal States
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [nameVal, setNameVal] = useState('');
  const [emailVal, setEmailVal] = useState('');
  const [phoneVal, setPhoneVal] = useState('');
  const [departmentVal, setDepartmentVal] = useState('');
  const [saving, setSaving] = useState(false);
  const [extraDetails, setExtraDetails] = useState<any>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const getRoleIcon = () => {
    return 'person-circle-outline';
  };

  const handleProfilePress = async () => {
    if (!user) return;

    setNameVal(user.name || '');
    setEmailVal(user.email || '');
    setProfileModalVisible(true);
    setIsEditing(false);

    if (user.role === 'EMPLOYEE') {
      try {
        setLoadingDetails(true);
        const empSnap = await firestore().collection('employees').doc(user.uid).get();
        if (empSnap.exists()) {
          const empData = empSnap.data();
          setExtraDetails(empData);
          setPhoneVal(empData?.phone || '');
          setDepartmentVal(empData?.department || '');
        }
      } catch (err) {
        console.warn('Error fetching employee sub-profile:', err);
      } finally {
        setLoadingDetails(false);
      }
    } else if (user.role === 'ADMIN') {
      try {
        setLoadingDetails(true);
        const adminSnap = await firestore().collection('users').doc(user.uid).get();
        if (adminSnap.exists()) {
          const adminData = adminSnap.data();
          setExtraDetails(adminData);
        }
      } catch (err) {
        console.warn('Error fetching admin sub-profile:', err);
      } finally {
        setLoadingDetails(false);
      }
    } else {
      setExtraDetails(null);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;

    if (!nameVal.trim()) {
      showAlert('Validation Error', 'Name is required.');
      return;
    }

    if (user.role === 'EMPLOYEE' && !phoneVal.trim()) {
      showAlert('Validation Error', 'Phone number is required.');
      return;
    }

    if (!emailVal.trim()) {
      showAlert('Validation Error', 'Email address is required.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailVal.trim())) {
      showAlert('Validation Error', 'Please enter a valid email address.');
      return;
    }

    setSaving(true);
    try {
      // 1. If email changed, update Firebase Auth email
      const isEmailChanged = emailVal.trim().toLowerCase() !== user.email.toLowerCase();
      
      if (isEmailChanged) {
        const currentUser = auth().currentUser;
        if (currentUser) {
          try {
            await currentUser.updateEmail(emailVal.trim().toLowerCase());
          } catch (authErr: any) {
            if (authErr.code === 'auth/requires-recent-login') {
              showAlert(
                'Re-authentication Required',
                'Updating your email is a sensitive security operation that requires a fresh login. Would you like to log out now to re-authenticate?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Log Out',
                    style: 'destructive',
                    onPress: () => {
                      setProfileModalVisible(false);
                      if (rightAction) {
                        rightAction();
                      }
                    }
                  }
                ]
              );
              setSaving(false);
              return;
            } else if (authErr.code === 'auth/email-already-in-use') {
              showAlert('Update Failed', 'This email address is already in use by another account.');
              setSaving(false);
              return;
            } else if (authErr.code === 'auth/invalid-email') {
              showAlert('Update Failed', 'The email address is invalid or badly formatted.');
              setSaving(false);
              return;
            }
            throw authErr;
          }
        }
      }

      // 2. Update users collection
      const userUpdates: any = {
        name: nameVal.trim()
      };
      if (isEmailChanged) {
        userUpdates.email = emailVal.trim().toLowerCase();
      }
      await firestore().collection('users').doc(user.uid).update(userUpdates);

      // 3. If Employee, update employees collection
      if (user.role === 'EMPLOYEE') {
        await firestore().collection('employees').doc(user.uid).update({
          phone: phoneVal.trim()
        });
      }

      // 4. Update Redux store
      const updatedProfile = {
        ...user,
        name: nameVal.trim(),
        email: isEmailChanged ? emailVal.trim().toLowerCase() : user.email,
        phone: user.role === 'EMPLOYEE' ? phoneVal.trim() : undefined
      };
      dispatch(setUser(updatedProfile));

      showAlert('Success', 'Profile updated successfully.');
      setIsEditing(false);
    } catch (err: any) {
      console.warn('Profile save error:', err);
      showAlert('Error', err.message || 'Unable to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoutPress = () => {
    setProfileModalVisible(false);
    if (rightAction) {
      showAlert(
        'Confirm Log Out',
        'Do you want to log out of Wealth Attendance?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Log Out',
            style: 'destructive',
            onPress: () => {
              rightAction();
            }
          }
        ]
      );
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <View style={styles.headerRow}>
        
        {/* Left Side: Back button + Logo + Title */}
        <View style={styles.leftContainer}>
          {showBackButton && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
            >
              <Icon name="arrow-back" size={24} color={COLORS.text} />
            </TouchableOpacity>
          )}
          
          <Image source={logoImg} style={styles.logo} />
          
          <View style={styles.titleContainer}>
            <Text style={styles.title} numberOfLines={1}>
              {showBackButton ? title : 'Wealth Attendance'}
            </Text>
            {subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
          </View>
        </View>

        {/* Right Side: Profile Icon + Role Label below it */}
        {user && (
          <TouchableOpacity 
            style={styles.profileSection} 
            onPress={handleProfilePress}
            activeOpacity={0.7}
          >
            <Icon name={getRoleIcon()} size={26} color={COLORS.primary} />
            <Text style={styles.profileRoleText}>
              {user.role === 'SUPER_ADMIN' ? 'Super Admin' : user.role === 'ADMIN' ? 'Admin' : 'Employee'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Profile Details & Settings Modal */}
      <Modal
        visible={profileModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setProfileModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalWrapper}>
              <View style={styles.profileCard}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>My Profile Details</Text>
                  <TouchableOpacity onPress={() => setProfileModalVisible(false)}>
                    <Icon name="close" size={24} color={COLORS.text} />
                  </TouchableOpacity>
                </View>

                {loadingDetails ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  </View>
                ) : (
                  <ScrollView 
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                  >
                    <View style={styles.avatarSection}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                          {user?.name ? user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) : 'U'}
                        </Text>
                      </View>
                      <Text style={styles.userName}>{user?.name}</Text>
                      <Text style={styles.userRole}>
                        {user?.role === 'SUPER_ADMIN' ? 'Super Admin' : user?.role === 'ADMIN' ? 'Admin Manager' : 'Employee'}
                      </Text>
                    </View>

                    <View style={styles.formSection}>
                      {isEditing ? (
                        <>
                          <Input
                            label="Name"
                            value={nameVal}
                            onChangeText={setNameVal}
                            autoCorrect={false}
                          />

                          <Input
                            label="Email Address"
                            value={emailVal}
                            onChangeText={setEmailVal}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoCorrect={false}
                          />

                          {user?.role === 'EMPLOYEE' && (
                            <Input
                              label="Phone Number"
                              value={phoneVal}
                              onChangeText={setPhoneVal}
                              keyboardType="phone-pad"
                              autoCorrect={false}
                            />
                          )}
                        </>
                      ) : (
                        <>
                          <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Email Address</Text>
                            <Text style={styles.infoValue}>{user?.email}</Text>
                          </View>

                          {user?.role === 'EMPLOYEE' && (
                            <>
                              <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Phone Number</Text>
                                <Text style={styles.infoValue}>{phoneVal || 'Not Configured'}</Text>
                              </View>

                              <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>Department</Text>
                                <Text style={styles.infoValue}>{departmentVal || 'General'}</Text>
                              </View>
                            </>
                          )}

                          {user?.role === 'ADMIN' && extraDetails?.location && (
                            <View style={styles.infoRow}>
                              <Text style={styles.infoLabel}>Assigned Location</Text>
                              <Text style={styles.infoValue}>
                                {typeof extraDetails.location === 'object' 
                                  ? (extraDetails.location.assemblyName || 'General') 
                                  : extraDetails.location}
                              </Text>
                            </View>
                          )}
                        </>
                      )}
                    </View>
                  </ScrollView>
                )}

                <View style={styles.modalActions}>
                  {isEditing ? (
                    <>
                      <Button
                        title="Cancel"
                        variant="outline"
                        onPress={() => setIsEditing(false)}
                        style={[styles.actionBtn, { marginRight: SPACING.sm }]}
                      />
                      <Button
                        title="Save Details"
                        loading={saving}
                        onPress={handleSaveProfile}
                        style={styles.actionBtn}
                      />
                    </>
                  ) : (
                    <>
                      <Button
                        title="Edit Profile"
                        variant="outline"
                        onPress={() => setIsEditing(true)}
                        style={[styles.actionBtn, { marginRight: SPACING.sm }]}
                      />
                      {rightAction && (
                        <Button
                          title="Log Out"
                          variant="danger"
                          onPress={handleLogoutPress}
                          style={styles.actionBtn}
                        />
                      )}
                    </>
                  )}
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.md,
    paddingTop: 36, // Increased top padding for status bar clearance
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  leftContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: SPACING.xs,
  },
  titleContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  backButton: {
    marginRight: SPACING.sm,
    padding: SPACING.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 36, // Increased logo size from 28
    height: 36, // Increased logo size from 28
    marginRight: SPACING.sm,
    resizeMode: 'contain',
  },
  profileSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  profileRoleText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: COLORS.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  // Modal Backdrop and Wrapper
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalWrapper: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    width: '92%',
    maxHeight: '80%',
    padding: SPACING.md,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: SPACING.sm,
    marginBottom: SPACING.md,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  scrollContent: {
    paddingBottom: SPACING.md,
  },
  avatarSection: {
    alignItems: 'center',
    marginVertical: SPACING.sm,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.primaryLight + '22',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.primary,
  },
  userName: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  userRole: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    fontWeight: '600',
  },
  formSection: {
    marginTop: SPACING.md,
    width: '100%',
  },
  infoRow: {
    marginBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: SPACING.xs,
  },
  infoLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 2,
  },
  modalActions: {
    flexDirection: 'row',
    marginTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.md,
  },
  actionBtn: {
    flex: 1,
    height: 44,
  },
  loadingContainer: {
    paddingVertical: SPACING.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
