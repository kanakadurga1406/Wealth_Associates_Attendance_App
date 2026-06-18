import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { useDispatch, useSelector } from 'react-redux';
import { logoutSuccess, setUser } from '../redux/slices/authSlice';
import { RootState } from '../redux/store';
import { COLORS, SPACING, SHADOWS } from '../constants/theme';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { formatTime } from '../utils/helpers';
import Icon from 'react-native-vector-icons/Ionicons';
import { useRealTimeStatus } from '../hooks/useRealTimeStatus';
import { useCustomAlert } from '../context/CustomAlertContext';
import { BottomTabBar } from '../components/BottomTabBar';

export const AdminDashboard: React.FC<{ navigation: any }> = ({ navigation }) => {
  const adminUser = useSelector((state: RootState) => state.auth.user);
  const [stats, setStats] = useState({ present: 0, late: 0, absent: 0, totalEmployees: 0, pendingLeaves: 0, pendingDevices: 0, pendingLates: 0 });
  const [notifications, setNotifications] = useState<any[]>([]);

  // Ticking clock state
  const [currentTime, setCurrentTime] = useState(new Date());

  // Modal states
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [notificationsModalVisible, setNotificationsModalVisible] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [nameVal, setNameVal] = useState('');
  const [emailVal, setEmailVal] = useState('');
  const [phoneVal, setPhoneVal] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [loadingProfileDetails, setLoadingProfileDetails] = useState(false);
  const [extraDetails, setExtraDetails] = useState<any>(null);

  const dispatch = useDispatch();
  const { updateActivity } = useRealTimeStatus();
  const { showAlert } = useCustomAlert();

  // Tick the clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    updateActivity('viewing_admin_dashboard');
  }, [updateActivity]);

  useEffect(() => {
    if (!adminUser) return;

    // Get today's local date string (IST format)
    const utcDate = new Date();
    const istDate = new Date(utcDate.getTime() + (5.5 * 60 * 60 * 1000));
    const todayString = istDate.toISOString().split('T')[0];

    // 1. Fetch employees belonging to this Admin
    const unsubscribeEmployees = firestore()
      .collection('users')
      .where('role', '==', 'EMPLOYEE')
      .where('adminId', '==', adminUser.uid)
      .onSnapshot((empSnapshot) => {
        if (!empSnapshot) return;
        const totalEmp = empSnapshot.size;
        const employeeIds = empSnapshot.docs.map(doc => doc.id);

        setStats(prev => ({ ...prev, totalEmployees: totalEmp }));

        if (employeeIds.length === 0) {
          setStats(prev => ({ ...prev, present: 0, late: 0, absent: 0 }));
          return;
        }

        // 2. Fetch today's attendance for these employees
        const unsubscribeAttendance = firestore()
          .collection('attendance')
          .where('date', '==', todayString)
          .onSnapshot((attSnapshot) => {
            if (!attSnapshot) return;
            let presentCount = 0;
            let lateCount = 0;
            let absentCount = 0;

            attSnapshot.docs.forEach((doc) => {
              const data = doc.data();
              if (employeeIds.includes(data.employeeId)) {
                if (data.status === 'Present') presentCount++;
                if (data.status === 'Late') {
                  presentCount++;
                  lateCount++;
                }
                if (data.status === 'Absent') absentCount++;
              }
            });

            setStats(prev => ({
              ...prev,
              present: presentCount,
              late: lateCount,
              absent: absentCount,
            }));
          });

        // 3. Fetch pending leave requests
        const unsubscribeLeaves = firestore()
          .collection('leave_requests')
          .where('status', '==', 'Pending')
          .onSnapshot((leaveSnapshot) => {
            if (!leaveSnapshot) return;
            const leaves = leaveSnapshot.docs
              .map(doc => doc.data())
              .filter(leave => employeeIds.includes(leave.employeeId));
            setStats(prev => ({ ...prev, pendingLeaves: leaves.length }));
          });

        // 4. Fetch pending device requests
        const unsubscribeDevices = firestore()
          .collection('device_requests')
          .where('status', '==', 'Pending')
          .where('adminId', '==', adminUser.uid)
          .onSnapshot((deviceSnapshot) => {
            if (!deviceSnapshot) return;
            setStats(prev => ({ ...prev, pendingDevices: deviceSnapshot.size }));
          });

        // 5. Fetch pending late login requests
        const unsubscribeLates = firestore()
          .collection('attendance')
          .where('status', '==', 'Late')
          .where('lateStatus', '==', 'Pending')
          .where('adminId', '==', adminUser.uid)
          .onSnapshot((lateSnapshot) => {
            if (!lateSnapshot) return;
            setStats(prev => ({ ...prev, pendingLates: lateSnapshot.size }));
          }, (err) => {
            console.warn('Error fetching late approvals count:', err);
          });

        return () => {
          unsubscribeAttendance();
          unsubscribeLeaves();
          unsubscribeDevices();
          unsubscribeLates();
        };
      });

    // 5. Subscribe to Admin's unread notifications
    const unsubscribeNotifications = firestore()
      .collection('notifications')
      .where('employeeId', '==', adminUser.uid)
      .where('status', '==', 'unread')
      .onSnapshot((snapshot) => {
        if (!snapshot) return;
        const list = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setNotifications(list);
      }, (err) => {
        console.warn('Notifications subscription error:', err);
      });

    return () => {
      unsubscribeEmployees();
      unsubscribeNotifications();
    };
  }, [adminUser]);

  const handleLogout = async () => {
    showAlert(
      'Confirm Log Out',
      'Do you want to log out of the Admin Portal?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: async () => {
            try {
              await auth().signOut();
              dispatch(logoutSuccess());
            } catch (err) {
              console.warn('Logout error:', err);
            }
          }
        }
      ]
    );
  };

  const handleAvatarPress = async () => {
    if (!adminUser) return;
    setNameVal(adminUser.name || '');
    setEmailVal(adminUser.email || '');
    setProfileModalVisible(true);
    setIsEditingProfile(false);

    try {
      setLoadingProfileDetails(true);
      const adminSnap = await firestore().collection('users').doc(adminUser.uid).get();
      if (adminSnap.exists()) {
        const adminData = adminSnap.data();
        setExtraDetails(adminData);
        setPhoneVal(adminData?.phone || '');
      }
    } catch (err) {
      console.warn('Error fetching admin profile details:', err);
    } finally {
      setLoadingProfileDetails(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!adminUser) return;

    if (!nameVal.trim()) {
      showAlert('Validation Error', 'Name is required.');
      return;
    }

    if (!emailVal.trim()) {
      showAlert('Validation Error', 'Email address is required.');
      return;
    }

    setSavingProfile(true);
    try {
      const isEmailChanged = emailVal.trim().toLowerCase() !== adminUser.email.toLowerCase();
      
      if (isEmailChanged) {
        const currentUser = auth().currentUser;
        if (currentUser) {
          try {
            await currentUser.updateEmail(emailVal.trim().toLowerCase());
          } catch (authErr: any) {
            if (authErr.code === 'auth/requires-recent-login') {
              showAlert(
                'Re-authentication Required',
                'Updating your email is a sensitive security operation that requires a fresh login. Please log out and log back in to perform this.',
                [{ text: 'OK' }]
              );
              setSavingProfile(false);
              return;
            }
            throw authErr;
          }
        }
      }

      await firestore().collection('users').doc(adminUser.uid).update({
        name: nameVal.trim(),
        email: emailVal.trim().toLowerCase(),
        phone: phoneVal.trim()
      });

      dispatch(setUser({
        ...adminUser,
        name: nameVal.trim(),
        email: emailVal.trim().toLowerCase()
      }));

      showAlert('Success', 'Profile updated successfully.');
      setIsEditingProfile(false);
    } catch (err: any) {
      console.warn('Profile save error:', err);
      showAlert('Error', err.message || 'Unable to update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const dismissNotification = async (notificationId: string) => {
    try {
      await firestore().collection('notifications').doc(notificationId).update({
        status: 'read',
      });
    } catch (err) {
      console.warn('Error dismissing notification:', err);
    }
  };

  const handleNotifLateAction = async (notif: any, action: 'approve' | 'reject') => {
    if (!notif.attendanceId) {
      showAlert('Error', 'Invalid check-in request data.');
      return;
    }

    try {
      const attDoc = await firestore().collection('attendance').doc(notif.attendanceId).get();
      if (!attDoc.exists) {
        showAlert('Error', 'Attendance record not found.');
        return;
      }

      const attData = attDoc.data();
      if (!attData) return;

      if (attData.lateStatus !== 'Pending') {
        showAlert('Info', `This request has already been ${attData.lateStatus.toLowerCase()}.`);
        await firestore().collection('notifications').doc(notif.id).update({ status: 'read' });
        return;
      }

      const employeeId = attData.employeeId;
      const employeeName = attData.employeeName || notif.senderName || 'Employee';
      const dateString = attData.date || 'today';

      const batch = firestore().batch();
      const attRef = firestore().collection('attendance').doc(notif.attendanceId);
      const currentNotifRef = firestore().collection('notifications').doc(notif.id);

      if (action === 'approve') {
        batch.update(attRef, {
          lateStatus: 'Approved',
          lateApprovedAt: firestore.FieldValue.serverTimestamp(),
          lateApprovedBy: adminUser?.uid || 'system',
        });

        const newNotifRef = firestore().collection('notifications').doc();
        batch.set(newNotifRef, {
          employeeId: employeeId,
          title: 'Late Login Pardoned',
          body: `Your late login request on ${dateString} was approved. No salary deduction will be applied.`,
          status: 'unread',
          createdAt: firestore.FieldValue.serverTimestamp(),
        });

        const logRef = firestore().collection('activity_logs').doc();
        batch.set(logRef, {
          employeeId: adminUser?.uid || 'system',
          activity: `Approved (Pardoned) late login for employee: ${employeeName} on ${dateString}`,
          timestamp: firestore.FieldValue.serverTimestamp(),
        });
      } else {
        batch.update(attRef, {
          lateStatus: 'Rejected',
          lateRejectedAt: firestore.FieldValue.serverTimestamp(),
          lateRejectedBy: adminUser?.uid || 'system',
        });

        const newNotifRef = firestore().collection('notifications').doc();
        batch.set(newNotifRef, {
          employeeId: employeeId,
          title: 'Late Login Deduction Applied',
          body: `Your late login request on ${dateString} was rejected by Admin. Salary deduction has been applied.`,
          status: 'unread',
          createdAt: firestore.FieldValue.serverTimestamp(),
        });

        const logRef = firestore().collection('activity_logs').doc();
        batch.set(logRef, {
          employeeId: adminUser?.uid || 'system',
          activity: `Rejected late login pardon for employee: ${employeeName} on ${dateString}`,
          timestamp: firestore.FieldValue.serverTimestamp(),
        });
      }

      batch.update(currentNotifRef, {
        status: 'read',
      });

      await batch.commit();
      showAlert('Success', `Late login request for ${employeeName} has been ${action === 'approve' ? 'approved' : 'rejected'}.`);
    } catch (err: any) {
      console.error('Error processing late login request from notification:', err);
      showAlert('Error', err.message || 'Failed to process request.');
    }
  };

  // Clock formatters
  const formatLiveTime = () => {
    let hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const minsStr = minutes < 10 ? '0' + minutes : minutes;
    return { timeStr: `${hours}:${minsStr}`, ampm };
  };

  const formatLiveDate = () => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${days[currentTime.getDay()]}, ${months[currentTime.getMonth()]} ${currentTime.getDate()}`;
  };

  const liveTime = formatLiveTime();
  const liveDate = formatLiveDate();

  const getGreetingMessage = () => {
    const hr = currentTime.getHours();
    if (hr < 12) return 'Good Morning';
    if (hr < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const getInitials = (name: string) => {
    if (!name) return 'AD';
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <View style={styles.container}>
      {/* Dynamic Header */}
      <View style={styles.greetingHeader}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={handleAvatarPress} activeOpacity={0.8} style={styles.avatarWrapper}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{getInitials(adminUser?.name || '')}</Text>
            </View>
            <View style={[styles.avatarStatusIndicator, { backgroundColor: COLORS.success }]} />
          </TouchableOpacity>
          <View style={styles.greetingTextContainer}>
            <Text style={styles.greetingLabel}>{getGreetingMessage()}, {adminUser?.name?.split(' ')[0] || 'Manager'} 👋</Text>
            <Text style={styles.greetingSubtitle}>Department Manager Portal</Text>
          </View>
        </View>
        <TouchableOpacity 
          onPress={() => setNotificationsModalVisible(true)} 
          style={styles.notificationBellCircle}
          activeOpacity={0.8}
        >
          <Icon name="notifications-outline" size={22} color={COLORS.primary} />
          {notifications.length > 0 && (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>{notifications.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {/* Top Purple Gradient Card */}
        <View style={styles.gradientCard}>
          <View style={styles.gradientCardHeader}>
            <View style={styles.cardStatusBadge}>
              <View style={[styles.cardStatusDot, { backgroundColor: '#34D399' }]} />
              <Text style={styles.cardStatusText}>Management Active</Text>
            </View>
          </View>

          {/* Time & Goal Row */}
          <View style={styles.cardTimeGoalRow}>
            <View style={styles.cardTimeSection}>
              <View style={styles.clockIconTimeRow}>
                <Icon name="time-outline" size={24} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.cardTimeValue}>{liveTime.timeStr}</Text>
                <Text style={styles.cardTimeAmpm}>{liveTime.ampm}</Text>
              </View>
              <Text style={styles.cardDateValue}>{liveDate}</Text>
            </View>

            <View style={styles.goalCircularTracker}>
              <Text style={styles.goalLabelText}>Total</Text>
              <Text style={styles.goalValueText}>{stats.totalEmployees}</Text>
            </View>
          </View>

          <View style={styles.cardInnerDivider} />

          {/* Today's Overview Stats Row */}
          <View style={styles.cardStatsRow}>
            <View style={styles.cardStatColumn}>
              <Text style={styles.cardStatLabel}>Present</Text>
              <Text style={styles.cardStatValue}>{stats.present}</Text>
            </View>
            <View style={styles.cardVerticalDivider} />
            <View style={styles.cardStatColumn}>
              <Text style={styles.cardStatLabel}>Late Logins</Text>
              <Text style={styles.cardStatValue}>{stats.late}</Text>
            </View>
            <View style={styles.cardVerticalDivider} />
            <View style={styles.cardStatColumn}>
              <Text style={styles.cardStatLabel}>Absent</Text>
              <Text style={styles.cardStatValue}>{stats.absent}</Text>
            </View>
          </View>
        </View>

        {/* Management Console circular icons grid */}
        <Text style={styles.sectionTitle}>Management Console</Text>
        <Card style={styles.consoleCard}>
          <View style={styles.menuGrid}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('CreateEmployee')}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(92, 70, 232, 0.08)' }]}>
                <Icon name="person-add-outline" size={22} color={COLORS.primary} />
              </View>
              <Text style={styles.menuLabel}>Add Employee</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('EmployeesList')}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(92, 70, 232, 0.08)' }]}>
                <Icon name="people-outline" size={22} color={COLORS.primary} />
              </View>
              <Text style={styles.menuLabel}>View Directory</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('RealTimeStatus')}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(16, 185, 129, 0.08)' }]}>
                <Icon name="pulse-outline" size={22} color={COLORS.success} />
              </View>
              <Text style={styles.menuLabel}>Live Status</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('OfficeLocation')}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(245, 158, 11, 0.08)' }]}>
                <Icon name="location-outline" size={22} color={COLORS.warning} />
              </View>
              <Text style={styles.menuLabel}>Set Geofence</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('LeaveApprovals')}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(239, 68, 68, 0.08)' }]}>
                <Icon name="mail-unread-outline" size={22} color={COLORS.danger} />
                {stats.pendingLeaves > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{stats.pendingLeaves}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.menuLabel}>Leave Approvals</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('Payroll')}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(16, 185, 129, 0.08)' }]}>
                <Icon name="cash-outline" size={22} color={COLORS.success} />
              </View>
              <Text style={styles.menuLabel}>Payroll Overview</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('DeviceApprovals')}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(79, 70, 229, 0.08)' }]}>
                <Icon name="hardware-chip-outline" size={22} color={COLORS.secondary} />
                {stats.pendingDevices > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{stats.pendingDevices}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.menuLabel}>Device Approvals</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('LateApprovals')}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(245, 158, 11, 0.08)' }]}>
                <Icon name="time-outline" size={22} color={COLORS.warning} />
                {stats.pendingLates > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{stats.pendingLates}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.menuLabel}>Late Approvals</Text>
            </TouchableOpacity>

            {/* Empty grid spacers */}
            <View style={[styles.menuItem, { opacity: 0 }]} />
          </View>
        </Card>
        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Admin Profile Modal */}
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

                {loadingProfileDetails ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  </View>
                ) : (
                  <ScrollView 
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                  >
                    <View style={styles.avatarSection}>
                      <View style={styles.modalAvatarCircle}>
                        <Text style={styles.modalAvatarText}>{getInitials(adminUser?.name || '')}</Text>
                      </View>
                      <Text style={styles.userName}>{adminUser?.name}</Text>
                      <Text style={styles.userRole}>Department Manager</Text>
                    </View>

                    <View style={styles.formSection}>
                      {isEditingProfile ? (
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

                          <Input
                            label="Phone Number"
                            value={phoneVal}
                            onChangeText={setPhoneVal}
                            keyboardType="phone-pad"
                            autoCorrect={false}
                          />
                        </>
                      ) : (
                        <>
                          <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Email Address</Text>
                            <Text style={styles.infoValue}>{adminUser?.email}</Text>
                          </View>

                          <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>Phone Number</Text>
                            <Text style={styles.infoValue}>{phoneVal || 'Not Configured'}</Text>
                          </View>
                        </>
                      )}
                    </View>
                  </ScrollView>
                )}

                <View style={styles.modalActions}>
                  {isEditingProfile ? (
                    <>
                      <Button
                        title="Cancel"
                        variant="outline"
                        onPress={() => setIsEditingProfile(false)}
                        style={[styles.actionBtn, { marginRight: SPACING.sm }]}
                      />
                      <Button
                        title="Save Details"
                        loading={savingProfile}
                        onPress={handleSaveProfile}
                        style={styles.actionBtn}
                      />
                    </>
                  ) : (
                    <>
                      <Button
                        title="Edit Profile"
                        variant="outline"
                        onPress={() => setIsEditingProfile(true)}
                        style={[styles.actionBtn, { marginRight: SPACING.sm }]}
                      />
                      <Button
                        title="Log Out"
                        variant="danger"
                        onPress={handleLogout}
                        style={styles.actionBtn}
                      />
                    </>
                  )}
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      {/* Admin Notifications Modal */}
      <Modal
        visible={notificationsModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setNotificationsModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.profileCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Notifications</Text>
              <TouchableOpacity onPress={() => setNotificationsModalVisible(false)}>
                <Icon name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.scrollContent}>
              {notifications.length === 0 ? (
                <Text style={styles.emptyNotificationsText}>No unread notifications.</Text>
              ) : (
                notifications.map((notif) => (
                  <View key={notif.id} style={[styles.notifModalCard, notif.type === 'late_pardon_request' && styles.notifModalCardColumn]}>
                    <View style={styles.notifRowHeader}>
                      <View style={styles.notifTextCol}>
                        <Text style={styles.notifTitle}>{notif.title}</Text>
                        <Text style={styles.notifBody}>{notif.body}</Text>
                      </View>
                      <TouchableOpacity onPress={() => dismissNotification(notif.id)} style={styles.notifDismissCircle}>
                        <Icon name="checkmark" size={16} color={COLORS.success} />
                      </TouchableOpacity>
                    </View>
                    {notif.type === 'late_pardon_request' && (
                      <View style={styles.notifActionRow}>
                        <TouchableOpacity 
                          style={[styles.notifActionBtn, styles.notifRejectBtn]} 
                          onPress={() => handleNotifLateAction(notif, 'reject')}
                        >
                          <Text style={styles.notifActionBtnTextReject}>Reject</Text>
                        </TouchableOpacity>
                        <TouchableOpacity 
                          style={[styles.notifActionBtn, styles.notifApproveBtn]} 
                          onPress={() => handleNotifLateAction(notif, 'approve')}
                        >
                          <Text style={styles.notifActionBtnTextApprove}>Accept</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Admin Bottom Navigation Tab Bar */}
      <BottomTabBar role="ADMIN" activeTab="Home" navigation={navigation} />
    </View>
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
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  scrollContainer: {
    padding: SPACING.md,
    paddingBottom: 110, // space for bottom tab bar
  },

  // Header Styles
  greetingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingTop: Platform.OS === 'ios' ? 50 : 36,
    paddingBottom: SPACING.sm,
    backgroundColor: COLORS.background,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: 12,
  },
  avatarCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.primary,
  },
  avatarStatusIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  greetingTextContainer: {
    justifyContent: 'center',
  },
  greetingLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  greetingSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    fontWeight: '500',
  },
  notificationBellCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.sm,
    borderWidth: 1,
    borderColor: '#EBE7F2',
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: COLORS.danger,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  notificationBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },

  // Purple Gradient Card Styles
  gradientCard: {
    backgroundColor: COLORS.primaryDark,
    borderRadius: 24,
    padding: SPACING.md,
    marginTop: SPACING.xs,
    marginBottom: SPACING.lg,
    ...SHADOWS.md,
  },
  gradientCardHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 12,
  },
  cardStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  cardStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },
  cardStatusText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  cardTimeGoalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTimeSection: {
    flex: 1,
  },
  clockIconTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardTimeValue: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  cardTimeAmpm: {
    fontSize: 15,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.8)',
    marginLeft: 6,
    marginTop: 6,
  },
  cardDateValue: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 2,
    fontWeight: '600',
  },
  goalCircularTracker: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  goalLabelText: {
    fontSize: 9,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.7)',
    textTransform: 'uppercase',
  },
  goalValueText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 1,
  },
  cardInnerDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    marginVertical: 14,
  },
  cardStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardStatColumn: {
    flex: 1,
    alignItems: 'center',
  },
  cardStatLabel: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.65)',
    fontWeight: '700',
  },
  cardStatValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 4,
  },
  cardVerticalDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },

  // Management Console
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  consoleCard: {
    padding: SPACING.md,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  menuItem: {
    width: '30%',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  menuIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xs,
    position: 'relative',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.02)',
  },
  menuLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 14,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: COLORS.danger,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.surface,
  },
  badgeText: {
    color: COLORS.surface,
    fontSize: 9,
    fontWeight: '900',
  },

  // Profile Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
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
    borderRadius: 24,
    width: '92%',
    maxHeight: '80%',
    padding: SPACING.lg,
    elevation: 8,
    shadowColor: '#1D1737',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: SPACING.md,
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
    marginVertical: SPACING.md,
  },
  modalAvatarCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  modalAvatarText: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.primary,
  },
  userName: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  userRole: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 4,
    fontWeight: '700',
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 20,
  },
  formSection: {
    marginTop: SPACING.md,
    width: '100%',
  },
  infoRow: {
    marginBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: SPACING.sm,
  },
  infoLabel: {
    fontSize: 10,
    color: COLORS.textLight,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 4,
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
    height: 48,
  },

  // Modal Notifications
  emptyNotificationsText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    paddingVertical: SPACING.lg,
    fontSize: 13,
  },
  notifModalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  notifTextCol: {
    flex: 1,
    paddingRight: SPACING.sm,
  },
  notifTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.text,
  },
  notifBody: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 3,
    lineHeight: 16,
  },
  notifDismissCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.successLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifModalCardColumn: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  notifRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  notifActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    width: '100%',
  },
  notifActionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 6,
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifRejectBtn: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  notifApproveBtn: {
    backgroundColor: COLORS.primary,
  },
  notifActionBtnTextReject: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  notifActionBtnTextApprove: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // Bottom Tab Bar
  bottomTabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 72,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: Platform.OS === 'ios' ? 12 : 0,
    ...SHADOWS.lg,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  tabItemActive: {
    marginTop: -20,
  },
  homeTabBadge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.md,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  tabLabel: {
    fontSize: 10,
    color: COLORS.textLight,
    fontWeight: '600',
    marginTop: 4,
  },
  tabLabelActive: {
    color: COLORS.primary,
    fontWeight: '800',
    marginTop: 2,
  },
});
