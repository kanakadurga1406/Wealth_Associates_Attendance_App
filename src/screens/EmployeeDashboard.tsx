import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Modal,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { RootState } from '../redux/store';
import { logoutSuccess, setUser } from '../redux/slices/authSlice';
import { setTodayRecord, fetchRecordsSuccess, AttendanceRecord } from '../redux/slices/attendanceSlice';
import { COLORS, SPACING, SHADOWS } from '../constants/theme';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { BottomTabBar } from '../components/BottomTabBar';
import Icon from 'react-native-vector-icons/Ionicons';
import { formatTime, formatHours } from '../utils/helpers';
import { useRealTimeStatus } from '../hooks/useRealTimeStatus';
import { useCustomAlert } from '../context/CustomAlertContext';

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
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [paymentDetails, setPaymentDetails] = useState<any>(null);
  
  // Custom design states
  const [currentTime, setCurrentTime] = useState(new Date());
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [notificationsModalVisible, setNotificationsModalVisible] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [nameVal, setNameVal] = useState('');
  const [emailVal, setEmailVal] = useState('');
  const [phoneVal, setPhoneVal] = useState('');
  const [departmentVal, setDepartmentVal] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [extraDetails, setExtraDetails] = useState<any>(null);
  const [loadingProfileDetails, setLoadingProfileDetails] = useState(false);

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
        setLoading(false);
      }, (err) => {
        console.warn('Month attendance subscription error:', err);
        setLoading(false);
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
      }, (err) => {
        console.warn('Leaves subscription error:', err);
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

    // 6. Subscribe to current month's payroll payment status
    const unsubscribePayment = firestore()
      .collection('payroll_payments')
      .doc(`${user.uid}_${currentMonthPrefix}`)
      .onSnapshot((doc) => {
        if (doc.exists()) {
          setPaymentDetails(doc.data());
        } else {
          setPaymentDetails(null);
        }
      }, (err) => {
        console.warn('Error fetching payroll payment status:', err);
      });

    return () => {
      unsubscribeEmp();
      unsubscribeToday();
      unsubscribeMonth();
      unsubscribeLeaves();
      unsubscribeNotifications();
      unsubscribePayment();
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
    showAlert(
      'Confirm Log Out',
      'Do you want to log out of Wealth Attendance?',
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
    if (!user) return;
    setNameVal(user.name || '');
    setEmailVal(user.email || '');
    setProfileModalVisible(true);
    setIsEditingProfile(false);

    try {
      setLoadingProfileDetails(true);
      const empSnap = await firestore().collection('employees').doc(user.uid).get();
      if (empSnap.exists()) {
        const empData = empSnap.data();
        setExtraDetails(empData);
        setPhoneVal(empData?.phone || '');
        setDepartmentVal(empData?.department || '');
      }
    } catch (err) {
      console.warn('Error fetching employee profile details:', err);
    } finally {
      setLoadingProfileDetails(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;

    if (!nameVal.trim()) {
      showAlert('Validation Error', 'Name is required.');
      return;
    }

    if (!phoneVal.trim()) {
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

    setSavingProfile(true);
    try {
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
                'Updating your email is a sensitive security operation that requires a fresh login. Please log out and log back in to perform this.',
                [{ text: 'OK' }]
              );
              setSavingProfile(false);
              return;
            } else if (authErr.code === 'auth/email-already-in-use') {
              showAlert('Update Failed', 'This email address is already in use.');
              setSavingProfile(false);
              return;
            }
            throw authErr;
          }
        }
      }

      await firestore().collection('users').doc(user.uid).update({
        name: nameVal.trim(),
        email: emailVal.trim().toLowerCase()
      });

      await firestore().collection('employees').doc(user.uid).update({
        phone: phoneVal.trim()
      });

      dispatch(setUser({
        ...user,
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

  const getAttendanceState = () => {
    if (!todayRecord) {
      return {
        label: 'Absent',
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

    const remainingAllowed = Math.max(0, allowed - stats.explicitPaidLeaveDays);
    const legacyExcess = Math.max(0, stats.legacyPaidLeaveDays - remainingAllowed);
    const extraLeaves = stats.unpaidLeaveDays + legacyExcess;
    const leavesDeduction = extraLeaves * dailyWage;

    const lateDeduction = lateCount * 0.5 * dailyWage;
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

  const salaryData = getSalaryDeductions();

  // Format dynamic time elements
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

  // Calculate Worked Hours Live Display
  const getLiveWorkedHrsDisplay = () => {
    if (!todayRecord) return '00:00h';
    if (!todayRecord.checkOut) {
      const checkInTime = todayRecord.checkIn?.toDate ? todayRecord.checkIn.toDate() : new Date(todayRecord.checkIn);
      const diffMs = currentTime.getTime() - checkInTime.getTime();
      const diffHrs = diffMs / (1000 * 60 * 60);
      const hh = Math.floor(diffHrs);
      const mm = Math.floor((diffHrs - hh) * 60);
      return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}h`;
    }
    const duration = todayRecord.workingHours || 0;
    const hh = Math.floor(duration);
    const mm = Math.round((duration - hh) * 60);
    return `${hh.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}h`;
  };

  const getCheckInTimeDisplay = () => {
    if (!todayRecord || !todayRecord.checkIn) return '00:00 PM';
    const checkInTime = todayRecord.checkIn?.toDate ? todayRecord.checkIn.toDate() : new Date(todayRecord.checkIn);
    let hours = checkInTime.getHours();
    const minutes = checkInTime.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const minsStr = minutes < 10 ? '0' + minutes : minutes;
    return `${hours}:${minsStr} ${ampm}`;
  };

  const getGreetingMessage = () => {
    const hr = currentTime.getHours();
    if (hr < 12) return 'Good Morning';
    if (hr < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const getInitials = (name: string) => {
    if (!name) return 'EE';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Synchronizing your workspace...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Dynamic Polished Greeting Header */}
      <View style={styles.greetingHeader}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={handleAvatarPress} activeOpacity={0.8} style={styles.avatarWrapper}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{getInitials(user?.name || '')}</Text>
            </View>
            <View style={[styles.avatarStatusIndicator, { backgroundColor: todayRecord ? (todayRecord.checkOut ? COLORS.info : COLORS.success) : COLORS.danger }]} />
          </TouchableOpacity>
          <View style={styles.greetingTextContainer}>
            <Text style={styles.greetingLabel}>{getGreetingMessage()}, {user?.name?.split(' ')[0] || 'Member'} 👋</Text>
            <Text style={styles.greetingSubtitle}>Have a productive day</Text>
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
          {/* Status Badge */}
          <View style={styles.gradientCardHeader}>
            <View style={styles.cardStatusBadge}>
              <View style={[styles.cardStatusDot, { backgroundColor: todayRecord ? (todayRecord.checkOut ? '#60A5FA' : '#34D399') : '#94A3B8' }]} />
              <Text style={styles.cardStatusText}>{currentStatus.label}</Text>
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
              <Text style={styles.goalLabelText}>Goal</Text>
              <Text style={styles.goalValueText}>8h</Text>
            </View>
          </View>

          {/* Spacing / Divider */}
          <View style={styles.cardInnerDivider} />

          {/* Worked Hours Stats Row */}
          <View style={styles.cardStatsRow}>
            <View style={styles.cardStatColumn}>
              <Text style={styles.cardStatLabel}>Worked Hrs</Text>
              <Text style={styles.cardStatValue}>{getLiveWorkedHrsDisplay()}</Text>
            </View>
            <View style={styles.cardVerticalDivider} />
            <View style={styles.cardStatColumn}>
              <Text style={styles.cardStatLabel}>Check In</Text>
              <Text style={styles.cardStatValue}>{getCheckInTimeDisplay()}</Text>
            </View>
            <View style={styles.cardVerticalDivider} />
            <View style={styles.cardStatColumn}>
              <Text style={styles.cardStatLabel}>Lunch Break</Text>
              <Text style={styles.cardStatValue}>00:00h</Text>
            </View>
          </View>

          {/* Emergency Leave shortcut */}
          <TouchableOpacity 
            style={styles.cardLeaveShortcutBtn}
            onPress={() => navigation.navigate('LeaveRequest')}
            activeOpacity={0.9}
          >
            <Text style={styles.cardLeaveShortcutText}>Emergency Leave</Text>
            <Icon name="caret-forward" size={14} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Concentric rings trigger button container */}
        <View style={styles.concentricRingsContainer}>
          {/* Ring 3 (Outer) */}
          <View style={styles.ringOuter}>
            {/* Ring 2 (Middle) */}
            <View style={styles.ringMiddle}>
              {/* Ring 1 (Inner) */}
              <View style={styles.ringInner}>
                <TouchableOpacity
                  style={[
                    styles.centerActionButton,
                    todayRecord?.checkOut && { backgroundColor: '#94A3B8' }
                  ]}
                  activeOpacity={0.8}
                  disabled={!!todayRecord?.checkOut}
                  onPress={() => navigation.navigate('Attendance')}
                >
                  <Text style={styles.centerActionText}>
                    {!todayRecord ? 'Check In' : todayRecord.checkOut ? 'Finished' : 'Check Out'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* Salary Estimation Card */}
        {salaryData && (
          <Card style={styles.salaryCard}>
            <View style={styles.salaryHeader}>
              <View style={[styles.salaryIconContainer, { backgroundColor: COLORS.primary + '1A' }]}>
                <Icon name="cash-outline" size={24} color={COLORS.primary} />
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

              <View style={styles.dividerHorizontalLine} />

              <View style={[styles.salaryRow, { marginTop: 4, alignItems: 'center' }]}>
                <Text style={styles.paymentStatusLabel}>Payment Status</Text>
                {paymentDetails?.status === 'Paid' ? (
                  <View style={styles.paidBadge}>
                    <Text style={styles.paidBadgeText}>
                      Paid via {paymentDetails.paymentMethod}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.unpaidBadge}>
                    <Text style={styles.unpaidBadgeText}>Unpaid</Text>
                  </View>
                )}
              </View>
            </View>
          </Card>
        )}

        {/* Dashboard Grid */}
        <Text style={styles.sectionTitle}>Monthly Metrics (IST)</Text>
        <View style={styles.statsContainer}>
          <Card style={[styles.statItem, { borderTopColor: COLORS.success, borderTopWidth: 4 }]}>
            <Text style={[styles.statNum, { color: COLORS.success }]}>{stats.present}</Text>
            <Text style={styles.statLabel}>Present</Text>
          </Card>
          <Card style={[styles.statItem, { borderTopColor: COLORS.warning, borderTopWidth: 4 }]}>
            <Text style={[styles.statNum, { color: COLORS.warning }]}>{stats.late}</Text>
            <Text style={styles.statLabel}>Late Logins</Text>
          </Card>
          <Card style={[styles.statItem, { borderTopColor: COLORS.danger, borderTopWidth: 4 }]}>
            <Text style={[styles.statNum, { color: COLORS.danger }]}>{stats.absent}</Text>
            <Text style={styles.statLabel}>Absent</Text>
          </Card>
        </View>

        {/* Leaves Counter */}
        <View style={styles.leaveStatsContainer}>
          <Card style={styles.leaveStatItem}>
            <View style={styles.leaveRow}>
              <View style={styles.leaveIconBox}>
                <Icon name="calendar-outline" size={20} color={COLORS.primary} />
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
                <Icon name="checkmark-done-outline" size={20} color={COLORS.success} />
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
            <View style={[styles.menuIcon, { backgroundColor: COLORS.primaryLight }]}>
              <Icon name="airplane-outline" size={20} color={COLORS.primary} />
            </View>
            <Text style={styles.menuText}>Request Leave</Text>
            <Icon name="chevron-forward" size={16} color={COLORS.textLight} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate('Profile')}
          >
            <View style={[styles.menuIcon, { backgroundColor: COLORS.successLight }]}>
              <Icon name="receipt-outline" size={20} color={COLORS.success} />
            </View>
            <Text style={styles.menuText}>View Attendance Logs</Text>
            <Icon name="chevron-forward" size={16} color={COLORS.textLight} />
          </TouchableOpacity>
        </View>
        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Profile Modal */}
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
                        <Text style={styles.modalAvatarText}>{getInitials(user?.name || '')}</Text>
                      </View>
                      <Text style={styles.userName}>{user?.name}</Text>
                      <Text style={styles.userRole}>
                        {user?.role === 'SUPER_ADMIN' ? 'Super Admin' : user?.role === 'ADMIN' ? 'Admin Manager' : 'Employee'}
                      </Text>
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
                            <Text style={styles.infoValue}>{user?.email}</Text>
                          </View>

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

      {/* Notifications Modal */}
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
                  <View key={notif.id} style={styles.notifModalCard}>
                    <View style={styles.notifTextCol}>
                      <Text style={styles.notifTitle}>{notif.title}</Text>
                      <Text style={styles.notifBody}>{notif.body}</Text>
                    </View>
                    <TouchableOpacity onPress={() => dismissNotification(notif.id)} style={styles.notifDismissCircle}>
                      <Icon name="checkmark" size={16} color={COLORS.success} />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Sleek Bottom Navigation Tab Bar */}
      <BottomTabBar role="EMPLOYEE" activeTab="Home" navigation={navigation} />
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
    paddingBottom: 110, // leave space for bottom tab bar
  },
  
  // Greeting Header Styles
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

  // Purple Premium Gradient Card Styles
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
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 4,
  },
  cardVerticalDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  cardLeaveShortcutBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    height: 42,
    borderRadius: 21,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  cardLeaveShortcutText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
    marginRight: 6,
  },

  // Concentric Rings Action Button
  concentricRingsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: SPACING.md,
  },
  ringOuter: {
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(92, 70, 232, 0.03)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringMiddle: {
    width: 196,
    height: 196,
    borderRadius: 98,
    backgroundColor: 'rgba(92, 70, 232, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ringInner: {
    width: 142,
    height: 142,
    borderRadius: 71,
    backgroundColor: 'rgba(92, 70, 232, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerActionButton: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.md,
  },
  centerActionText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
    textAlign: 'center',
  },

  // Default layout section titles
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    borderRadius: 16,
    backgroundColor: COLORS.surface,
  },
  statNum: {
    fontSize: 22,
    fontWeight: '900',
  },
  statLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '700',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  leaveStatsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  leaveStatItem: {
    width: '48%',
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  leaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leaveIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(92, 70, 232, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  leaveNum: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  leaveLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '700',
    marginTop: 2,
  },
  menuContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
    overflow: 'hidden',
    ...SHADOWS.sm,
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

  // Salary Estimation Card
  salaryCard: {
    padding: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  salaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
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
    fontWeight: '600',
  },
  salaryDetails: {
    marginTop: SPACING.xs,
  },
  salaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  salaryLabel: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '700',
  },
  salaryValue: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '800',
  },
  deductionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  deductionLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  deductionValue: {
    fontSize: 11,
    color: COLORS.danger,
    fontWeight: '800',
  },
  remainingSalaryLabel: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '800',
  },
  remainingSalaryValue: {
    fontSize: 16,
    color: COLORS.success,
    fontWeight: '900',
  },
  dividerHorizontalLine: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 10,
  },
  paymentStatusLabel: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '700',
  },
  paidBadge: {
    backgroundColor: COLORS.successLight,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  paidBadgeText: {
    color: COLORS.success,
    fontSize: 11,
    fontWeight: '800',
  },
  unpaidBadge: {
    backgroundColor: 'rgba(100, 116, 139, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  unpaidBadgeText: {
    color: COLORS.textSecondary,
    fontSize: 11,
    fontWeight: '800',
  },

  // Modal Profile Details
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

  // Sleek Bottom Tab Bar Styles
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
    marginTop: -20, // pop out active item slightly
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
