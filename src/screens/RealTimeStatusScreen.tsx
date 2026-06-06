import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';
import database from '@react-native-firebase/database';
import { RootState } from '../redux/store';
import { COLORS, SPACING, SHADOWS } from '../constants/theme';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { BottomTabBar } from '../components/BottomTabBar';
import Icon from 'react-native-vector-icons/Ionicons';
import { formatTime, formatDate } from '../utils/helpers';
import { useRealTimeStatus } from '../hooks/useRealTimeStatus';

interface EmployeePresence {
  uid: string;
  name: string;
  email: string;
  department?: string;
  state?: 'online' | 'offline';
  currentActivity?: string;
  lastSeen?: number;
  checkInStatus?: 'checked-in' | 'checked-out' | 'unknown';
  checkInTime?: number;
  checkOutTime?: number;
  checkInAddress?: string;
  checkOutAddress?: string;
}

export const RealTimeStatusScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const adminUser = useSelector((state: RootState) => state.auth.user);
  
  const [employees, setEmployees] = useState<EmployeePresence[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'online' | 'offline'>('all');
  
  const { updateActivity } = useRealTimeStatus();

  useEffect(() => {
    updateActivity('viewing_live_presence');
  }, [updateActivity]);

  useEffect(() => {
    if (!adminUser) return;

    let rtdbListener: any = null;
    let unsubscribeAttendance: () => void = () => {};
    let employeeDataMap: { [key: string]: any } = {};
    let attendanceDataMap: { [key: string]: any } = {};
    let rtdbDataVal: any = {};

    const utcDate = new Date();
    const istDate = new Date(utcDate.getTime() + (5.5 * 60 * 60 * 1000));
    const todayString = istDate.toISOString().split('T')[0];

    const mergeAndSet = () => {
      const mergedEmployees: EmployeePresence[] = Object.keys(employeeDataMap).map((uid) => {
        const empData = employeeDataMap[uid];
        const rtdbData = rtdbDataVal[uid] || {};
        const attData = attendanceDataMap[uid] || null;

        let checkInStatus: 'checked-in' | 'checked-out' | 'unknown' = 'unknown';
        if (attData) {
          if (attData.checkOut) {
            checkInStatus = 'checked-out';
          } else if (attData.checkIn) {
            checkInStatus = 'checked-in';
          }
        }

        return {
          ...empData,
          state: rtdbData.state || 'offline',
          currentActivity: rtdbData.currentActivity || 'Away',
          lastSeen: rtdbData.lastSeen || 0,
          checkInStatus,
          checkInTime: attData?.checkIn ? attData.checkIn.getTime() : (rtdbData.checkInTime || 0),
          checkOutTime: attData?.checkOut ? attData.checkOut.getTime() : (rtdbData.checkOutTime || 0),
          checkInAddress: attData?.checkInAddress || rtdbData.checkInAddress || '',
          checkOutAddress: attData?.checkOutAddress || rtdbData.checkOutAddress || '',
        };
      });

      // Sort by state (online first), then name
      mergedEmployees.sort((a, b) => {
        if (a.state === 'online' && b.state !== 'online') return -1;
        if (a.state !== 'online' && b.state === 'online') return 1;
        return a.name.localeCompare(b.name);
      });

      setEmployees(mergedEmployees);
      setLoading(false);
    };

    // 1. Listen to Firestore employees
    let query = firestore().collection('users').where('role', '==', 'EMPLOYEE');
    if (adminUser.role !== 'SUPER_ADMIN') {
      query = query.where('adminId', '==', adminUser.uid);
    }

    const unsubscribeFirestore = query.onSnapshot(
      async (snapshot) => {
        if (!snapshot) {
          setLoading(false);
          return;
        }

        const employeeIds = snapshot.docs.map(doc => doc.id);
        if (employeeIds.length === 0) {
          setEmployees([]);
          setLoading(false);
          return;
        }

        // Fetch all employee details in ONE query instead of N parallel queries
        let empDetailsQuery: FirebaseFirestoreTypes.Query = firestore().collection('employees');
        if (adminUser.role !== 'SUPER_ADMIN') {
          empDetailsQuery = empDetailsQuery.where('adminId', '==', adminUser.uid);
        }
        const empDetailsSnapshot = await empDetailsQuery.get();
        const detailsMap: { [key: string]: any } = {};
        empDetailsSnapshot.docs.forEach(docSnap => {
          detailsMap[docSnap.id] = docSnap.data();
        });

        employeeDataMap = {};
        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          employeeDataMap[doc.id] = {
            uid: doc.id,
            name: data.name,
            email: data.email,
            department: detailsMap[doc.id]?.department || 'General',
          };
        });

        // 2. Setup today's attendance snapshot listener
        unsubscribeAttendance();
        unsubscribeAttendance = firestore()
          .collection('attendance')
          .where('date', '==', todayString)
          .onSnapshot((attSnapshot) => {
            if (!attSnapshot) return;
            attendanceDataMap = {};
            attSnapshot.docs.forEach((doc) => {
              const data = doc.data();
              if (employeeIds.includes(data.employeeId)) {
                attendanceDataMap[data.employeeId] = {
                  checkIn: data.checkIn && typeof data.checkIn.toDate === 'function' ? data.checkIn.toDate() : null,
                  checkOut: data.checkOut && typeof data.checkOut.toDate === 'function' ? data.checkOut.toDate() : null,
                  checkInAddress: data.checkInAddress || '',
                  checkOutAddress: data.checkOutAddress || '',
                  status: data.status,
                };
              }
            });
            mergeAndSet();
          }, (err) => {
            console.warn('Attendance query snapshot error:', err);
          });

        // 3. Subscribe to RTDB Status updates
        const rtdbRef = database().ref('/status/users');
        if (rtdbListener) {
          rtdbRef.off('value', rtdbListener);
        }

        rtdbListener = rtdbRef.on(
          'value',
          (rtdbSnapshot) => {
            rtdbDataVal = rtdbSnapshot.val() || {};
            mergeAndSet();
          },
          (rtdbError) => {
            console.error('RTDB Status listener error:', rtdbError);
          }
        );
      },
      (error) => {
        console.error('Firestore users query error:', error);
        setLoading(false);
      }
    );

    return () => {
      unsubscribeFirestore();
      unsubscribeAttendance();
      if (rtdbListener) {
        database().ref('/status/users').off('value', rtdbListener);
      }
    };
  }, [adminUser]);

  const getFilteredEmployees = () => {
    if (filter === 'online') {
      return employees.filter(e => e.state === 'online');
    }
    if (filter === 'offline') {
      return employees.filter(e => e.state !== 'online');
    }
    return employees;
  };

  const renderPresenceItem = ({ item }: { item: EmployeePresence }) => {
    const isOnline = item.state === 'online';
    const formattedLastSeen = item.lastSeen
      ? `Last active: ${formatTime(item.lastSeen)}`
      : 'No recent activity';

    const getStatusText = () => {
      if (item.checkInStatus === 'checked-in') return 'Checked In';
      if (item.checkInStatus === 'checked-out') return 'Checked Out';
      return 'Not Logged In';
    };

    const getInitials = (name: string) => {
      return name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    };

    return (
      <Card style={styles.employeeCard}>
        <View style={styles.cardHeader}>
          <View style={styles.avatarContainer}>
            <View style={[styles.avatar, { backgroundColor: isOnline ? '#E8F5E9' : '#F3F4F6' }]}>
              <Text style={[styles.avatarText, { color: isOnline ? COLORS.success : COLORS.textSecondary }]}>
                {getInitials(item.name)}
              </Text>
            </View>
            <View style={[styles.statusDot, { backgroundColor: isOnline ? COLORS.success : COLORS.textLight }]} />
          </View>

          <View style={styles.detailsContainer}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.subText}>{item.department} • {item.email}</Text>
            <Text style={styles.activityText}>
              {isOnline ? `Current action: ${item.currentActivity}` : formattedLastSeen}
            </Text>
          </View>
        </View>

        {(item.checkInTime || item.checkOutTime) ? (
          <View style={styles.attendanceDetailsContainer}>
            {item.checkInTime ? (
              <View style={styles.attendanceRow}>
                <View style={styles.timeLabelContainer}>
                  <Icon name="log-in-outline" size={14} color={COLORS.success} />
                  <Text style={styles.timeLabel}>Checked In: {formatTime(item.checkInTime)}</Text>
                </View>
                {item.checkInAddress ? (
                  <Text style={styles.addressText} numberOfLines={2}>
                    {item.checkInAddress}
                  </Text>
                ) : (
                  <Text style={styles.addressText}>Address not logged</Text>
                )}
              </View>
            ) : null}

            {item.checkOutTime ? (
              <View style={[styles.attendanceRow, { marginTop: 6, borderTopWidth: 1, borderTopColor: COLORS.border + '30', paddingTop: 6 }]}>
                <View style={styles.timeLabelContainer}>
                  <Icon name="log-out-outline" size={14} color={COLORS.info} />
                  <Text style={styles.timeLabel}>Checked Out: {formatTime(item.checkOutTime)}</Text>
                </View>
                {item.checkOutAddress ? (
                  <Text style={styles.addressText} numberOfLines={2}>
                    {item.checkOutAddress}
                  </Text>
                ) : (
                  <Text style={styles.addressText}>Address not logged</Text>
                )}
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.cardFooter}>
          <View style={styles.footerItem}>
            <Icon name="compass-outline" size={14} color={COLORS.textSecondary} />
            <Text style={styles.footerLabel}>Connection State: </Text>
            <Text style={[styles.footerVal, { color: isOnline ? COLORS.success : COLORS.textSecondary }]}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>
          </View>
          <StatusBadge status={getStatusText()} />
        </View>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Live Presence Tracker" showBackButton />

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'all' && styles.filterButtonActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
            All ({employees.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'online' && styles.filterButtonActive]}
          onPress={() => setFilter('online')}
        >
          <Text style={[styles.filterText, filter === 'online' && styles.filterTextActive]}>
            Online ({employees.filter(e => e.state === 'online').length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, filter === 'offline' && styles.filterButtonActive]}
          onPress={() => setFilter('offline')}
        >
          <Text style={[styles.filterText, filter === 'offline' && styles.filterTextActive]}>
            Offline ({employees.filter(e => e.state !== 'online').length})
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Connecting to real-time status database...</Text>
        </View>
      ) : (
        <FlatList
          data={getFilteredEmployees()}
          keyExtractor={(item) => item.uid}
          renderItem={renderPresenceItem}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon name="radio-outline" size={48} color={COLORS.textLight} />
              <Text style={styles.emptyText}>No matching employees found.</Text>
            </View>
          }
        />
      )}
      {adminUser && (
        <BottomTabBar role={adminUser.role} activeTab="Live Status" navigation={navigation} />
      )}
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
  filterContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    padding: 6,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  filterButtonActive: {
    backgroundColor: COLORS.primary,
  },
  filterText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '700',
  },
  filterTextActive: {
    color: COLORS.surface,
  },
  listContainer: {
    padding: SPACING.md,
    paddingBottom: 110,
  },
  employeeCard: {
    marginBottom: SPACING.md,
    padding: SPACING.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: SPACING.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '800',
  },
  statusDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.surface,
  },
  detailsContainer: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
  },
  subText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  activityText: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 4,
    fontStyle: 'italic',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginLeft: 4,
  },
  footerVal: {
    fontSize: 11,
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xl * 2,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 8,
  },
  attendanceDetailsContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  attendanceRow: {
    flexDirection: 'column',
  },
  timeLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  timeLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.text,
    marginLeft: 4,
  },
  addressText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginLeft: 18,
    lineHeight: 15,
  },
});
