import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import database from '@react-native-firebase/database';
import { useDispatch, useSelector } from 'react-redux';
import { logoutSuccess } from '../redux/slices/authSlice';
import { RootState } from '../redux/store';
import { COLORS, SPACING, SHADOWS } from '../constants/theme';
import { Card } from '../components/Card';
import { Header } from '../components/Header';
import { StatusBadge } from '../components/StatusBadge';
import { formatTime } from '../utils/helpers';
import Icon from 'react-native-vector-icons/Ionicons';
import { useRealTimeStatus } from '../hooks/useRealTimeStatus';

export const SuperAdminDashboard: React.FC<{ navigation: any }> = ({ navigation }) => {
  const superAdminUser = useSelector((state: RootState) => state.auth.user);
  const [stats, setStats] = useState({
    admins: 0,
    employees: 0,
    online: 0,
    present: 0,
    late: 0,
    absent: 0,
    pendingLeaves: 0,
    pendingDevices: 0,
  });
  const [activities, setActivities] = useState<any[]>([]);
  const [activeUsers, setActiveUsers] = useState<any[]>([]);

  const dispatch = useDispatch();
  const { updateActivity } = useRealTimeStatus();

  useEffect(() => {
    updateActivity('viewing_super_admin_dashboard');
  }, [updateActivity]);

  useEffect(() => {
    // 1. Fetch Users Counts
    const unsubscribeUsers = firestore()
      .collection('users')
      .onSnapshot((snapshot) => {
        if (!snapshot) return;
        let adminCount = 0;
        let empCount = 0;
        snapshot.docs.forEach((doc) => {
          const role = doc.data().role;
          if (role === 'ADMIN') adminCount++;
          if (role === 'EMPLOYEE') empCount++;
        });
        setStats((prev) => ({ ...prev, admins: adminCount, employees: empCount }));
      });

    // 2. Fetch Global Activity Logs (limit to 5)
    const unsubscribeLogs = firestore()
      .collection('activity_logs')
      .orderBy('timestamp', 'desc')
      .limit(5)
      .onSnapshot((snapshot) => {
        if (!snapshot) return;
        const logs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setActivities(logs);
      });

    // 3. Fetch RTDB Presence States
    const statusRef = database().ref('status/users');
    const handleStatusChange = (snapshot: any) => {
      const data = snapshot.val();
      if (data) {
        const userList = Object.keys(data).map((key) => ({
          uid: key,
          ...data[key],
        }));
        setActiveUsers(userList);

        // Update online count stat
        const onlineCount = userList.filter((u) => u.state === 'online').length;
        setStats((prev) => ({ ...prev, online: onlineCount }));
      } else {
        setActiveUsers([]);
        setStats((prev) => ({ ...prev, online: 0 }));
      }
    };
    statusRef.on('value', handleStatusChange);

    // 4. Fetch Global Today's Attendance Overview
    const utcDate = new Date();
    const istDate = new Date(utcDate.getTime() + 5.5 * 60 * 60 * 1000);
    const todayString = istDate.toISOString().split('T')[0];

    const unsubscribeAttendance = firestore()
      .collection('attendance')
      .where('date', '==', todayString)
      .onSnapshot((snapshot) => {
        if (!snapshot) return;
        let presentCount = 0;
        let lateCount = 0;
        let absentCount = 0;

        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          if (data.status === 'Present') presentCount++;
          if (data.status === 'Late') {
            presentCount++;
            lateCount++;
          }
          if (data.status === 'Absent') absentCount++;
        });

        setStats((prev) => ({
          ...prev,
          present: presentCount,
          late: lateCount,
          absent: absentCount,
        }));
      });

    // 5. Fetch Global Pending Leave Requests
    const unsubscribeLeaves = firestore()
      .collection('leave_requests')
      .where('status', '==', 'Pending')
      .onSnapshot((snapshot) => {
        if (!snapshot) return;
        setStats((prev) => ({ ...prev, pendingLeaves: snapshot.size }));
      });

    // 6. Fetch Global Pending Device Requests
    const unsubscribeDevices = firestore()
      .collection('device_requests')
      .where('status', '==', 'Pending')
      .onSnapshot((snapshot) => {
        if (!snapshot) return;
        setStats((prev) => ({ ...prev, pendingDevices: snapshot.size }));
      });

    return () => {
      unsubscribeUsers();
      unsubscribeLogs();
      statusRef.off('value', handleStatusChange);
      unsubscribeAttendance();
      unsubscribeLeaves();
      unsubscribeDevices();
    };
  }, []);

  const handleLogout = async () => {
    try {
      await auth().signOut();
      dispatch(logoutSuccess());
    } catch (err) {
      console.warn('Logout error:', err);
    }
  };

  return (
    <View style={styles.container}>
      <Header
        title={superAdminUser?.name || 'Super Admin'}
        subtitle="Global Enterprise Workspace"
        rightAction={handleLogout}
        rightIcon="log-out-outline"
      />

      <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        {/* Core System Metrics */}
        <Text style={styles.sectionTitle}>System Directory Stats</Text>
        <View style={styles.metricsRow}>
          <Card style={[styles.metricCard, styles.cardPremium, { borderColor: COLORS.primary }]}>
            <View style={[styles.iconWrapper, { backgroundColor: COLORS.primary + '10' }]}>
              <Icon name="shield-checkmark" size={20} color={COLORS.primary} />
            </View>
            <Text style={styles.metricNumber}>{stats.admins}</Text>
            <Text style={styles.metricLabel}>Total Admins</Text>
          </Card>

          <Card style={[styles.metricCard, styles.cardPremium, { borderColor: COLORS.secondary }]}>
            <View style={[styles.iconWrapper, { backgroundColor: COLORS.secondary + '10' }]}>
              <Icon name="people" size={20} color={COLORS.secondary} />
            </View>
            <Text style={styles.metricNumber}>{stats.employees}</Text>
            <Text style={styles.metricLabel}>Total Employees</Text>
          </Card>

          <Card style={[styles.metricCard, styles.cardPremium, { borderColor: COLORS.success }]}>
            <View style={[styles.iconWrapper, { backgroundColor: COLORS.success + '10' }]}>
              <Icon name="pulse" size={20} color={COLORS.success} />
            </View>
            <Text style={styles.metricNumber}>{stats.online}</Text>
            <Text style={styles.metricLabel}>Active Online</Text>
          </Card>
        </View>

        {/* Global Attendance Overview Card */}
        <Text style={styles.sectionTitle}>Today's Global Attendance</Text>
        <Card style={styles.overviewCard}>
          <View style={styles.overviewRow}>
            <View style={styles.overviewItem}>
              <Text style={[styles.overviewNumber, { color: COLORS.success }]}>{stats.present}</Text>
              <Text style={styles.overviewLabel}>Present</Text>
            </View>
            <View style={[styles.dividerVertical]} />
            <View style={styles.overviewItem}>
              <Text style={[styles.overviewNumber, { color: COLORS.warning }]}>{stats.late}</Text>
              <Text style={styles.overviewLabel}>Late Logins</Text>
            </View>
            <View style={[styles.dividerVertical]} />
            <View style={styles.overviewItem}>
              <Text style={[styles.overviewNumber, { color: COLORS.danger }]}>{stats.absent}</Text>
              <Text style={styles.overviewLabel}>Absent</Text>
            </View>
          </View>
        </Card>

        {/* Unified Management Console */}
        <Text style={styles.sectionTitle}>Global Management Console</Text>
        <Card style={styles.consoleCard}>
          {/* Admin Management Section */}
          <Text style={styles.consoleSubtitle}>Admin Management</Text>
          <View style={styles.menuGrid}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('CreateAdmin')}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: COLORS.primary + '10' }]}>
                <Icon name="person-add" size={22} color={COLORS.primary} />
              </View>
              <Text style={styles.menuLabel}>Create Admin</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('AdminsList')}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: COLORS.secondary + '10' }]}>
                <Icon name="shield-checkmark" size={22} color={COLORS.secondary} />
              </View>
              <Text style={styles.menuLabel}>Manage Admins</Text>
            </TouchableOpacity>

            <View style={[styles.menuItem, { opacity: 0 }]} />
          </View>

          <View style={styles.dividerHorizontal} />

          {/* Employee & Workspace Section */}
          <Text style={styles.consoleSubtitle}>Employee & Workspace Control</Text>
          <View style={styles.menuGrid}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('CreateEmployee')}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: COLORS.primary + '10' }]}>
                <Icon name="person-add-outline" size={22} color={COLORS.primary} />
              </View>
              <Text style={styles.menuLabel}>Add Employee</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('EmployeesList')}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(100, 116, 139, 0.1)' }]}>
                <Icon name="people-outline" size={22} color={COLORS.textSecondary} />
              </View>
              <Text style={styles.menuLabel}>View Employees</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('RealTimeStatus')}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: COLORS.success + '10' }]}>
                <Icon name="radio" size={22} color={COLORS.success} />
              </View>
              <Text style={styles.menuLabel}>Live Status</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('OfficeLocation')}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: COLORS.warning + '10' }]}>
                <Icon name="location-outline" size={22} color={COLORS.warning} />
              </View>
              <Text style={styles.menuLabel}>Set Geofence</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('LeaveApprovals')}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: COLORS.danger + '10' }]}>
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
              <View style={[styles.menuIconContainer, { backgroundColor: COLORS.success + '10' }]}>
                <Icon name="cash-outline" size={22} color={COLORS.success} />
              </View>
              <Text style={styles.menuLabel}>Payroll Overview</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => navigation.navigate('DeviceApprovals')}
            >
              <View style={[styles.menuIconContainer, { backgroundColor: COLORS.secondary + '10' }]}>
                <Icon name="hardware-chip-outline" size={22} color={COLORS.secondary} />
                {stats.pendingDevices > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{stats.pendingDevices}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.menuLabel}>Device Approvals</Text>
            </TouchableOpacity>
          </View>
        </Card>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContainer: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
    marginTop: SPACING.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  metricCard: {
    flex: 1,
    marginHorizontal: 4,
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderRadius: 16,
    borderWidth: 1.5,
    backgroundColor: COLORS.surface,
  },
  cardPremium: {
    ...SHADOWS.sm,
  },
  iconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  metricNumber: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.text,
    marginTop: 2,
  },
  metricLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  overviewCard: {
    paddingVertical: SPACING.md,
    borderRadius: 16,
    marginBottom: SPACING.xs,
    backgroundColor: COLORS.surface,
  },
  overviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  overviewItem: {
    flex: 1,
    alignItems: 'center',
  },
  overviewNumber: {
    fontSize: 24,
    fontWeight: '900',
  },
  overviewLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '700',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  dividerVertical: {
    width: 1,
    height: 36,
    backgroundColor: COLORS.border,
  },
  dividerHorizontal: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.md,
  },
  consoleCard: {
    padding: SPACING.md,
    borderRadius: 20,
    marginBottom: SPACING.xs,
    backgroundColor: COLORS.surface,
  },
  consoleSubtitle: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.md,
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
  directoryCard: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 14,
    marginBottom: SPACING.xs,
  },
  userRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  presenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  userName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  userSubText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  activitiesCard: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 14,
  },
  activityRow: {
    flexDirection: 'row',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  activityIcon: {
    marginTop: 2,
    marginRight: 8,
  },
  activityContent: {
    flex: 1,
  },
  activityText: {
    fontSize: 13,
    color: COLORS.text,
  },
  activityTime: {
    fontSize: 10,
    color: COLORS.textLight,
    marginTop: 2,
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingVertical: SPACING.lg,
    fontWeight: '600',
  },
});
