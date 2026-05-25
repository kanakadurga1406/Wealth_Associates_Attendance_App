import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { useDispatch, useSelector } from 'react-redux';
import { logoutSuccess } from '../redux/slices/authSlice';
import { RootState } from '../redux/store';
import { COLORS, SPACING } from '../constants/theme';
import { Card } from '../components/Card';
import { Header } from '../components/Header';
import { formatTime } from '../utils/helpers';
import Icon from 'react-native-vector-icons/Ionicons';
import { useRealTimeStatus } from '../hooks/useRealTimeStatus';

export const AdminDashboard: React.FC<{ navigation: any }> = ({ navigation }) => {
  const adminUser = useSelector((state: RootState) => state.auth.user);
  const [stats, setStats] = useState({ present: 0, late: 0, absent: 0, totalEmployees: 0, pendingLeaves: 0, pendingDevices: 0 });
  const [recentActivities, setRecentActivities] = useState<any[]>([]);

  const dispatch = useDispatch();
  const { updateActivity } = useRealTimeStatus();

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

        // 3. Fetch recent activity logs for these employees
        const unsubscribeActivities = firestore()
          .collection('activity_logs')
          .orderBy('timestamp', 'desc')
          .limit(5)
          .onSnapshot((logsSnapshot) => {
            if (!logsSnapshot) return;
            const logs = logsSnapshot.docs
              .map(doc => ({ id: doc.id, ...(doc.data() as any) }))
              .filter((log: any) => employeeIds.includes(log.employeeId));
            setRecentActivities(logs);
          });

        // 4. Fetch pending leave requests
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

        // 5. Fetch pending device requests
        const unsubscribeDevices = firestore()
          .collection('device_requests')
          .where('status', '==', 'Pending')
          .where('adminId', '==', adminUser.uid)
          .onSnapshot((deviceSnapshot) => {
            if (!deviceSnapshot) return;
            setStats(prev => ({ ...prev, pendingDevices: deviceSnapshot.size }));
          });

        return () => {
          unsubscribeAttendance();
          unsubscribeActivities();
          unsubscribeLeaves();
          unsubscribeDevices();
        };
      });

    return () => unsubscribeEmployees();
  }, [adminUser]);

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
        title={adminUser?.name || 'Admin'}
        subtitle="Department Manager Portal"
        rightAction={handleLogout}
        rightIcon="log-out-outline"
      />

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Statistics Grid */}
        <Text style={styles.sectionTitle}>Today's Overview</Text>
        <View style={styles.statsContainer}>
          <Card style={styles.statCard}>
            <Text style={[styles.statNumber, { color: COLORS.success }]}>{stats.present}</Text>
            <Text style={styles.statLabel}>Present</Text>
          </Card>
          
          <Card style={styles.statCard}>
            <Text style={[styles.statNumber, { color: COLORS.warning }]}>{stats.late}</Text>
            <Text style={styles.statLabel}>Late Logins</Text>
          </Card>

          <Card style={styles.statCard}>
            <Text style={[styles.statNumber, { color: COLORS.danger }]}>{stats.absent}</Text>
            <Text style={styles.statLabel}>Absent</Text>
          </Card>
        </View>

        {/* Quick Menu */}
        <Text style={styles.sectionTitle}>Management Console</Text>
        <View style={styles.menuGrid}>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate('CreateEmployee')}
          >
            <View style={[styles.menuIconContainer, { backgroundColor: '#EEF2F6' }]}>
              <Icon name="person-add" size={24} color={COLORS.primary} />
            </View>
            <Text style={styles.menuLabel}>Add Employee</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate('EmployeesList')}
          >
            <View style={[styles.menuIconContainer, { backgroundColor: '#EEF2F6' }]}>
              <Icon name="people" size={24} color={COLORS.primary} />
            </View>
            <Text style={styles.menuLabel}>View Directory</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate('RealTimeStatus')}
          >
            <View style={[styles.menuIconContainer, { backgroundColor: '#E8F5E9' }]}>
              <Icon name="radio" size={24} color={COLORS.success} />
            </View>
            <Text style={styles.menuLabel}>Live Status</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate('OfficeLocation')}
          >
            <View style={[styles.menuIconContainer, { backgroundColor: '#FFF9C4' }]}>
              <Icon name="location" size={24} color={COLORS.warning} />
            </View>
            <Text style={styles.menuLabel}>Set Geofence</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate('LeaveApprovals')}
          >
            <View style={[styles.menuIconContainer, { backgroundColor: '#E3F2FD' }]}>
              <Icon name="mail-unread" size={24} color={COLORS.info} />
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
            <View style={[styles.menuIconContainer, { backgroundColor: '#E8F5E9' }]}>
              <Icon name="cash" size={24} color={COLORS.success} />
            </View>
            <Text style={styles.menuLabel}>Payroll Overview</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate('DeviceApprovals')}
          >
            <View style={[styles.menuIconContainer, { backgroundColor: '#F5E6FE' }]}>
              <Icon name="hardware-chip" size={24} color={COLORS.secondary} />
              {stats.pendingDevices > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{stats.pendingDevices}</Text>
                </View>
              )}
            </View>
            <Text style={styles.menuLabel}>Device Approvals</Text>
          </TouchableOpacity>
        </View>

        {/* Recent Activities */}
        <Text style={styles.sectionTitle}>Employee Activity Stream</Text>
        <Card>
          {recentActivities.length === 0 ? (
            <Text style={styles.emptyText}>No recent activities recorded today.</Text>
          ) : (
            recentActivities.map((item) => (
              <View key={item.id} style={styles.activityRow}>
                <Icon name="pulse-outline" size={16} color={COLORS.textSecondary} style={styles.activityIcon} />
                <View style={styles.activityContent}>
                  <Text style={styles.activityText}>{item.activity}</Text>
                  <Text style={styles.activityTime}>{formatTime(item.timestamp)}</Text>
                </View>
              </View>
            ))
          )}
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
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statCard: {
    flex: 1,
    marginHorizontal: 4,
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '900',
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginTop: SPACING.xs,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  menuItem: {
    width: '31%',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: 'center',
    marginBottom: SPACING.md,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  menuIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.xs,
    position: 'relative',
  },
  menuLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: COLORS.danger,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: COLORS.surface,
    fontSize: 10,
    fontWeight: '900',
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
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingVertical: SPACING.md,
  },
});
