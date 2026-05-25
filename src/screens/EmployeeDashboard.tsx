import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { RootState } from '../redux/store';
import { logoutSuccess } from '../redux/slices/authSlice';
import { setTodayRecord, fetchRecordsSuccess, AttendanceRecord } from '../redux/slices/attendanceSlice';
import { COLORS, SPACING, SHADOWS } from '../constants/theme';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import Icon from 'react-native-vector-icons/Ionicons';
import { formatTime, formatHours, getStatusColor } from '../utils/helpers';
import { useRealTimeStatus } from '../hooks/useRealTimeStatus';

export const EmployeeDashboard: React.FC<{ navigation: any }> = ({ navigation }) => {
  const user = useSelector((state: RootState) => state.auth.user);
  const todayRecord = useSelector((state: RootState) => state.attendance.todayRecord);
  
  const [stats, setStats] = useState({
    present: 0,
    late: 0,
    absent: 0,
    pendingLeave: 0,
    approvedLeave: 0,
    approvedLeaveDays: 0,
    unpaidLeaveDays: 0,
    explicitPaidLeaveDays: 0,
    legacyPaidLeaveDays: 0,
  });
  const [employeeProfile, setEmployeeProfile] = useState<any>(null);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<any[]>([]);

  const dispatch = useDispatch();
  const { updateActivity } = useRealTimeStatus();

  useEffect(() => {
    updateActivity('viewing_employee_dashboard');
  }, [updateActivity]);

  useEffect(() => {
    if (!user) return;

    // Get today's local date string (IST format)
    const utcDate = new Date();
    const istDate = new Date(utcDate.getTime() + (5.5 * 60 * 60 * 1000));
    const todayString = istDate.toISOString().split('T')[0];
    const currentMonthPrefix = todayString.substring(0, 7); // 'YYYY-MM'
    const currentYear = istDate.getFullYear();
    const currentMonth = istDate.getMonth(); // 0-indexed

    // 0. Subscribe to employee profile (salary, weekOff, allowedLeaves, workTimings)
    const unsubscribeEmp = firestore()
      .collection('employees')
      .doc(user.uid)
      .onSnapshot((doc) => {
        if (doc.exists()) {
          setEmployeeProfile(doc.data());
        }
      });

    // 1. Subscribe to today's attendance record
    const unsubscribeToday = firestore()
      .collection('attendance')
      .where('employeeId', '==', user.uid)
      .where('date', '==', todayString)
      .limit(1)
      .onSnapshot((snapshot) => {
        if (snapshot && !snapshot.empty) {
          const doc = snapshot.docs[0];
          dispatch(setTodayRecord({ id: doc.id, ...doc.data() } as AttendanceRecord));
        } else {
          dispatch(setTodayRecord(null));
        }
      });

    // 2. Subscribe to current month's attendance records for stats
    const unsubscribeMonth = firestore()
      .collection('attendance')
      .where('employeeId', '==', user.uid)
      .onSnapshot((snapshot) => {
        if (!snapshot) return;
        
        let presentCount = 0;
        let lateCount = 0;
        let absentCount = 0;
        const allRecords: AttendanceRecord[] = [];

        snapshot.docs.forEach((doc) => {
          const data = doc.data() as any;
          const record = { id: doc.id, ...data } as AttendanceRecord;
          
          // Filter records in current month
          if (data.date && data.date.startsWith(currentMonthPrefix)) {
            allRecords.push(record);
            if (data.status === 'Present') presentCount++;
            if (data.status === 'Late') {
              presentCount++;
              lateCount++;
            }
            if (data.status === 'Absent') absentCount++;
          }
        });

        dispatch(fetchRecordsSuccess(allRecords));
        setStats(prev => ({
          ...prev,
          present: presentCount,
          late: lateCount,
          absent: absentCount,
        }));
      });

    // 3. Subscribe to leave requests for stats
    const unsubscribeLeaves = firestore()
      .collection('leave_requests')
      .where('employeeId', '==', user.uid)
      .onSnapshot((snapshot) => {
        if (!snapshot) return;

        let pendingCount = 0;
        let approvedCount = 0;
        let approvedDaysThisMonth = 0;
        let unpaidDaysThisMonth = 0;
        let explicitPaidDaysThisMonth = 0;
        let legacyPaidDaysThisMonth = 0;

        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          if (data.status === 'Pending') pendingCount++;
          if (data.status === 'Approved') {
            approvedCount++;
            
            // Calculate days overlapping with current calendar month
            try {
              if (data.startDate && data.endDate) {
                const reqStart = new Date(data.startDate);
                const reqEnd = new Date(data.endDate);
                const startOfMonth = new Date(currentYear, currentMonth, 1);
                const endOfMonth = new Date(currentYear, currentMonth + 1, 0);

                if (!(reqEnd < startOfMonth || reqStart > endOfMonth)) {
                  const overlapStart = new Date(Math.max(reqStart.getTime(), startOfMonth.getTime()));
                  const overlapEnd = new Date(Math.min(reqEnd.getTime(), endOfMonth.getTime()));
                  const diffTime = Math.abs(overlapEnd.getTime() - overlapStart.getTime());
                  const overlappingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                  approvedDaysThisMonth += overlappingDays;

                  const totalTime = Math.abs(reqEnd.getTime() - reqStart.getTime());
                  const totalDays = Math.ceil(totalTime / (1000 * 60 * 60 * 24)) + 1;

                  if (data.unpaidDaysCount !== undefined) {
                    unpaidDaysThisMonth += (overlappingDays / totalDays) * data.unpaidDaysCount;
                    explicitPaidDaysThisMonth += (overlappingDays / totalDays) * (data.paidDaysCount || 0);
                  } else if (data.isPaid === false) {
                    unpaidDaysThisMonth += overlappingDays;
                  } else if (data.isPaid === true) {
                    explicitPaidDaysThisMonth += overlappingDays;
                  } else {
                    legacyPaidDaysThisMonth += overlappingDays;
                  }
                }
              }
            } catch (e) {
              console.warn('Error parsing leave dates:', e);
            }
          }
        });

        setStats(prev => ({
          ...prev,
          pendingLeave: pendingCount,
          approvedLeave: approvedCount,
          approvedLeaveDays: approvedDaysThisMonth,
          unpaidLeaveDays: unpaidDaysThisMonth,
          explicitPaidLeaveDays: explicitPaidDaysThisMonth,
          legacyPaidLeaveDays: legacyPaidDaysThisMonth,
        }));
      });

    // 4. Subscribe to recent activity logs
    const unsubscribeLogs = firestore()
      .collection('activity_logs')
      .where('employeeId', '==', user.uid)
      .orderBy('timestamp', 'desc')
      .limit(5)
      .onSnapshot((snapshot) => {
        if (!snapshot) return;

        const logs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setRecentLogs(logs);
        setLoading(false);
      }, (err) => {
        console.warn('Logs subscription error:', err);
        setLoading(false);
      });

    // 5. Subscribe to unread notifications
    const unsubscribeNotifications = firestore()
      .collection('notifications')
      .where('employeeId', '==', user.uid)
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
      unsubscribeEmp();
      unsubscribeToday();
      unsubscribeMonth();
      unsubscribeLeaves();
      unsubscribeLogs();
      unsubscribeNotifications();
    };
  }, [user, dispatch]);

  const dismissNotification = async (notificationId: string) => {
    try {
      await firestore().collection('notifications').doc(notificationId).update({
        status: 'read',
      });
    } catch (err) {
      console.warn('Error dismissing notification:', err);
    }
  };

  const handleLogout = async () => {
    try {
      await auth().signOut();
      dispatch(logoutSuccess());
    } catch (err) {
      console.warn('Logout error:', err);
    }
  };

  const getAttendanceState = () => {
    if (!todayRecord) {
      return {
        label: 'Not Checked In',
        sub: 'Ready to start your workday',
        badge: 'danger',
        icon: 'time-outline',
        color: COLORS.danger,
      };
    }
    if (!todayRecord.checkOut) {
      return {
        label: 'Checked In',
        sub: `Since ${formatTime(todayRecord.checkIn)}`,
        badge: todayRecord.status === 'Late' ? 'warning' : 'success',
        icon: 'hourglass-outline',
        color: todayRecord.status === 'Late' ? COLORS.warning : COLORS.success,
      };
    }
    return {
      label: 'Checked Out',
      sub: `Worked ${formatHours(todayRecord.workingHours)}`,
      badge: 'info',
      icon: 'checkmark-circle-outline',
      color: COLORS.info,
    };
  };

  const currentStatus = getAttendanceState();

  const getSalaryDeductions = () => {
    const salary = parseFloat(employeeProfile?.salary) || 0;
    if (salary === 0) return null;

    const allowed = parseInt(employeeProfile?.allowedLeaves) || 0;
    const taken = stats.approvedLeaveDays || 0;
    const lateCount = stats.late || 0;
    const absentCount = stats.absent || 0;

    const dailyWage = salary / 30;

    // Deductions:
    // 1. Extra Leaves (Approved leaves taken above the allowed limit / unpaid leaves)
    const remainingAllowed = Math.max(0, allowed - stats.explicitPaidLeaveDays);
    const legacyExcess = Math.max(0, stats.legacyPaidLeaveDays - remainingAllowed);
    const extraLeaves = stats.unpaidLeaveDays + legacyExcess;
    const leavesDeduction = extraLeaves * dailyWage;

    // 2. Late logins: e.g., 0.5 day's wage deduction per late check-in
    const lateDeduction = lateCount * 0.5 * dailyWage;

    // 3. Absent: 1 day's wage deduction per absent day
    const absentDeduction = absentCount * dailyWage;

    const totalDeductions = leavesDeduction + lateDeduction + absentDeduction;
    const remainingSalary = Math.max(0, salary - totalDeductions);

    return {
      baseSalary: salary,
      allowedLeaves: allowed,
      approvedLeaveDays: taken,
      extraLeaves,
      leavesDeduction,
      lateCount,
      lateDeduction,
      absentCount,
      absentDeduction,
      totalDeductions,
      remainingSalary,
    };
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Synchronizing your workspace...</Text>
      </View>
    );
  }

  const salaryData = getSalaryDeductions();

  return (
    <View style={styles.container}>
      <Header
        title={user?.name || 'Employee Portal'}
        subtitle={user?.department || 'Department Member'}
        rightAction={handleLogout}
        rightIcon="log-out-outline"
      />

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Notifications */}
        {notifications.map((notif) => (
          <Card 
            key={notif.id} 
            style={[
              styles.notificationCard, 
              { borderLeftColor: notif.title?.includes('Approved') ? COLORS.success : COLORS.danger }
            ]}
          >
            <View style={styles.notificationHeader}>
              <View style={styles.notificationTitleRow}>
                <Icon 
                  name={notif.title?.includes('Approved') ? 'checkmark-circle-outline' : 'close-circle-outline'} 
                  size={20} 
                  color={notif.title?.includes('Approved') ? COLORS.success : COLORS.danger} 
                />
                <Text style={styles.notificationTitle}>{notif.title}</Text>
              </View>
              <TouchableOpacity onPress={() => dismissNotification(notif.id)} style={styles.dismissBtn}>
                <Icon name="close" size={16} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.notificationBody}>{notif.body}</Text>
          </Card>
        ))}

        {/* Real-time Status Card */}
        <Card style={styles.statusCard}>
          <View style={styles.statusHeader}>
            <View style={[styles.statusIconContainer, { backgroundColor: currentStatus.color + '1A' }]}>
              <Icon name={currentStatus.icon} size={28} color={currentStatus.color} />
            </View>
            <View style={styles.statusDetails}>
              <Text style={styles.statusLabel}>{currentStatus.label}</Text>
              <Text style={styles.statusSub}>{currentStatus.sub}</Text>
            </View>
            <StatusBadge status={currentStatus.label} />
          </View>
          
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: todayRecord?.checkOut ? COLORS.border : COLORS.primary }]}
            disabled={!!todayRecord?.checkOut}
            onPress={() => navigation.navigate('Attendance')}
          >
            <Icon name="scan-outline" size={20} color={COLORS.surface} style={styles.btnIcon} />
            <Text style={styles.actionBtnText}>
              {!todayRecord ? 'Proceed to Check-In' : todayRecord.checkOut ? 'Day Finished' : 'Proceed to Check-Out'}
            </Text>
          </TouchableOpacity>
        </Card>

        {/* Salary Estimation Card */}
        {salaryData && (
          <Card style={styles.salaryCard}>
            <View style={styles.salaryHeader}>
              <View style={[styles.salaryIconContainer, { backgroundColor: COLORS.success + '1A' }]}>
                <Icon name="cash-outline" size={26} color={COLORS.success} />
              </View>
              <View style={styles.salaryTitleContainer}>
                <Text style={styles.salaryTitle}>Monthly Salary Overview</Text>
                <Text style={styles.salarySub}>Calculated for current calendar month</Text>
              </View>
            </View>

            <View style={styles.salaryDetails}>
              <View style={styles.salaryRow}>
                <Text style={styles.salaryLabel}>Base Monthly Salary</Text>
                <Text style={styles.salaryValue}>₹{salaryData.baseSalary.toFixed(2)}</Text>
              </View>
              
              <View style={styles.dividerHorizontalLine} />

              <View style={styles.deductionRow}>
                <Text style={styles.deductionLabel}>
                  Extra Leaves ({Number(salaryData.extraLeaves.toFixed(2))}d deducted • {salaryData.approvedLeaveDays}d taken)
                </Text>
                <Text style={styles.deductionValue}>
                  -₹{salaryData.leavesDeduction.toFixed(2)}
                </Text>
              </View>

              <View style={styles.deductionRow}>
                <Text style={styles.deductionLabel}>
                  Late Logins ({salaryData.lateCount} times • 0.5 day penalty)
                </Text>
                <Text style={styles.deductionValue}>
                  -₹{salaryData.lateDeduction.toFixed(2)}
                </Text>
              </View>

              <View style={styles.deductionRow}>
                <Text style={styles.deductionLabel}>
                  Absent Days ({salaryData.absentCount} times • 1.0 day penalty)
                </Text>
                <Text style={styles.deductionValue}>
                  -₹{salaryData.absentDeduction.toFixed(2)}
                </Text>
              </View>

              <View style={styles.dividerHorizontalLine} />

              <View style={[styles.salaryRow, { marginTop: 4 }]}>
                <Text style={styles.remainingSalaryLabel}>Remaining Net Salary</Text>
                <Text style={styles.remainingSalaryValue}>₹{salaryData.remainingSalary.toFixed(2)}</Text>
              </View>
            </View>
          </Card>
        )}

        {/* Dashboard Grid */}
        <Text style={styles.sectionTitle}>Monthly Metrics (IST)</Text>
        <View style={styles.statsContainer}>
          <Card style={styles.statItem}>
            <Text style={[styles.statNum, { color: COLORS.success }]}>{stats.present}</Text>
            <Text style={styles.statLabel}>Present</Text>
          </Card>
          <Card style={styles.statItem}>
            <Text style={[styles.statNum, { color: COLORS.warning }]}>{stats.late}</Text>
            <Text style={styles.statLabel}>Late Logins</Text>
          </Card>
          <Card style={styles.statItem}>
            <Text style={[styles.statNum, { color: COLORS.danger }]}>{stats.absent}</Text>
            <Text style={styles.statLabel}>Absent</Text>
          </Card>
        </View>

        {/* Leaves Counter */}
        <View style={styles.leaveStatsContainer}>
          <Card style={styles.leaveStatItem}>
            <View style={styles.leaveRow}>
              <View style={styles.leaveIconBox}>
                <Icon name="calendar" size={20} color={COLORS.info} />
              </View>
              <View>
                <Text style={styles.leaveNum}>{stats.pendingLeave}</Text>
                <Text style={styles.leaveLabel}>Leaves Pending</Text>
              </View>
            </View>
          </Card>

          <Card style={styles.leaveStatItem}>
            <View style={styles.leaveRow}>
              <View style={[styles.leaveIconBox, { backgroundColor: COLORS.successLight }]}>
                <Icon name="checkmark-done" size={20} color={COLORS.success} />
              </View>
              <View>
                <Text style={styles.leaveNum}>{stats.approvedLeave}</Text>
                <Text style={styles.leaveLabel}>Leaves Approved</Text>
              </View>
            </View>
          </Card>
        </View>

        {/* Menu Navigation */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.menuContainer}>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate('LeaveRequest')}
          >
            <View style={[styles.menuIcon, { backgroundColor: COLORS.infoLight }]}>
              <Icon name="airplane" size={22} color={COLORS.info} />
            </View>
            <Text style={styles.menuText}>Request Leave</Text>
            <Icon name="chevron-forward" size={16} color={COLORS.textLight} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate('Profile')}
          >
            <View style={[styles.menuIcon, { backgroundColor: COLORS.primaryLight + '22' }]}>
              <Icon name="person" size={22} color={COLORS.primary} />
            </View>
            <Text style={styles.menuText}>View Attendance Logs</Text>
            <Icon name="chevron-forward" size={16} color={COLORS.textLight} />
          </TouchableOpacity>
        </View>

        {/* Activity Stream */}
        <Text style={styles.sectionTitle}>Your Activity Feed</Text>
        <Card style={styles.logsCard}>
          {recentLogs.length === 0 ? (
            <Text style={styles.emptyLogs}>No actions logged today.</Text>
          ) : (
            recentLogs.map((log) => (
              <View key={log.id} style={styles.logRow}>
                <Icon name="footsteps-outline" size={14} color={COLORS.textSecondary} style={styles.logIcon} />
                <View style={styles.logContent}>
                  <Text style={styles.logText}>{log.activity}</Text>
                  <Text style={styles.logTime}>{formatTime(log.timestamp)}</Text>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  scrollContainer: {
    padding: SPACING.md,
  },
  statusCard: {
    padding: SPACING.md,
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  statusIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusDetails: {
    flex: 1,
    marginLeft: SPACING.sm,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  statusSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  actionButton: {
    height: 44,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnIcon: {
    marginRight: 6,
  },
  actionButtonDisabled: {
    backgroundColor: COLORS.border,
  },
  actionBtnText: {
    color: COLORS.surface,
    fontSize: 14,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  statItem: {
    flex: 1,
    marginHorizontal: 4,
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  statNum: {
    fontSize: 22,
    fontWeight: '900',
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginTop: 4,
  },
  leaveStatsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  leaveStatItem: {
    width: '48%',
    padding: SPACING.sm,
  },
  leaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leaveIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.infoLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  leaveNum: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  leaveLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  menuContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  menuText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  logsCard: {
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  logRow: {
    flexDirection: 'row',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  logIcon: {
    marginTop: 2,
    marginRight: 8,
  },
  logContent: {
    flex: 1,
  },
  logText: {
    fontSize: 13,
    color: COLORS.text,
  },
  logTime: {
    fontSize: 10,
    color: COLORS.textLight,
    marginTop: 2,
  },
  emptyLogs: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingVertical: SPACING.md,
  },
  salaryCard: {
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  salaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  salaryIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  salaryTitleContainer: {
    flex: 1,
  },
  salaryTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
  },
  salarySub: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  salaryDetails: {
    marginTop: SPACING.xs,
  },
  salaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  salaryLabel: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600',
  },
  salaryValue: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '800',
  },
  deductionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  deductionLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  deductionValue: {
    fontSize: 12,
    color: COLORS.danger,
    fontWeight: '700',
  },
  remainingSalaryLabel: {
    fontSize: 15,
    color: COLORS.text,
    fontWeight: '800',
  },
  remainingSalaryValue: {
    fontSize: 18,
    color: COLORS.success,
    fontWeight: '900',
  },
  dividerHorizontalLine: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 8,
  },
  notificationCard: {
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    marginBottom: SPACING.md,
    marginTop: SPACING.xs,
  },
  notificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  notificationTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  notificationTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.text,
    marginLeft: 6,
  },
  dismissBtn: {
    padding: 2,
  },
  notificationBody: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 18,
    paddingLeft: 26,
  },
});
