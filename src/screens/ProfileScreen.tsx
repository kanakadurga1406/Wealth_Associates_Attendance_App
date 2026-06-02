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
import firestore from '@react-native-firebase/firestore';
import { RootState } from '../redux/store';
import { COLORS, SPACING, SHADOWS } from '../constants/theme';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import Icon from 'react-native-vector-icons/Ionicons';
import { formatTime, formatDate, formatHours } from '../utils/helpers';
import { useRealTimeStatus } from '../hooks/useRealTimeStatus';

interface AttendanceHistoryItem {
  id: string;
  checkIn: any;
  checkOut: any;
  status: 'Present' | 'Late' | 'Absent';
  workingHours: number;
  date: string;
  latitude?: number;
  longitude?: number;
}

export const ProfileScreen: React.FC = () => {
  const user = useSelector((state: RootState) => state.auth.user);
  
  const [profileDetails, setProfileDetails] = useState<any>(null);
  const [history, setHistory] = useState<AttendanceHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const { updateActivity } = useRealTimeStatus();

  useEffect(() => {
    updateActivity('viewing_profile');
  }, [updateActivity]);

  useEffect(() => {
    if (!user) return;

    // 1. Fetch details from employees collection
    const fetchEmployeeProfile = async () => {
      try {
        const empSnap = await firestore().collection('employees').doc(user.uid).get();
        if (empSnap.exists()) {
          const empData = empSnap.data();
          
          // Get linked manager's name
          let managerName = 'Admin';
          if (empData?.adminId) {
            const managerSnap = await firestore().collection('users').doc(empData.adminId).get();
            if (managerSnap.exists()) {
              managerName = managerSnap.data()?.name || 'Admin';
            }
          }

          setProfileDetails({
            ...empData,
            managerName,
          });
        }
      } catch (err) {
        console.warn('Error fetching employee sub-profile:', err);
      }
    };

    // 2. Fetch attendance history
    const unsubscribeHistory = firestore()
      .collection('attendance')
      .where('employeeId', '==', user.uid)
      .onSnapshot((snapshot) => {
        if (!snapshot) return;

        const records: AttendanceHistoryItem[] = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            checkIn: data.checkIn,
            checkOut: data.checkOut,
            status: data.status,
            workingHours: data.workingHours || 0,
            date: data.date,
            latitude: data.latitude,
            longitude: data.longitude,
          };
        });

        // Sort by date descending
        records.sort((a, b) => b.date.localeCompare(a.date));

        setHistory(records);
        setLoading(false);
      }, (err) => {
        console.warn('Error fetching history:', err);
        setLoading(false);
      });

    fetchEmployeeProfile();

    return () => unsubscribeHistory();
  }, [user]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };



  const renderHistoryItem = ({ item }: { item: AttendanceHistoryItem }) => {
    const checkInString = item.checkIn ? formatTime(item.checkIn) : 'No In Log';
    const checkOutString = item.checkOut ? formatTime(item.checkOut) : 'No Out Log';
    
    // Convert YYYY-MM-DD to readable date
    const parsedDate = new Date(item.date);
    const dayLabel = parsedDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    const weekdayLabel = parsedDate.toLocaleDateString('en-IN', { weekday: 'short' });

    return (
      <Card style={styles.historyCard}>
        <View style={styles.historyRow}>
          <View style={styles.dateBadgeContainer}>
            <Text style={styles.dateDay}>{dayLabel}</Text>
            <Text style={styles.dateWeek}>{weekdayLabel}</Text>
          </View>

          <View style={styles.timeInfo}>
            <View style={styles.timeRow}>
              <Icon name="log-in-outline" size={14} color={COLORS.success} />
              <Text style={styles.timeText}>{checkInString}</Text>
            </View>
            <View style={styles.timeRow}>
              <Icon name="log-out-outline" size={14} color={COLORS.danger} />
              <Text style={styles.timeText}>{checkOutString}</Text>
            </View>
            {item.workingHours > 0 && (
              <Text style={styles.hoursText}>Worked: {formatHours(item.workingHours)}</Text>
            )}
          </View>

          <View style={styles.statusCol}>
            <StatusBadge status={item.status} />
            {item.latitude && item.longitude && (
              <View style={styles.gpsBadge}>
                <Icon name="navigate-outline" size={10} color={COLORS.textSecondary} />
                <Text style={styles.gpsLabel}>GPS Verified</Text>
              </View>
            )}
          </View>
        </View>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      <Header title="My Profile & History" showBackButton />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Fetching profile records...</Text>
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item.id}
          renderItem={renderHistoryItem}
          contentContainerStyle={styles.listContainer}
          ListHeaderComponent={
            <View>
              {/* Profile Card */}
              <Card style={styles.profileCard}>
                <View style={styles.avatarSection}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{getInitials(user?.name || '')}</Text>
                  </View>
                  <Text style={styles.profileName}>{user?.name}</Text>
                  <Text style={styles.profileRole}>Employee ID: {user?.uid.substring(0, 8).toUpperCase()}</Text>
                </View>

                <View style={styles.divider} />

                <View style={styles.detailsSection}>
                  <View style={styles.detailsRow}>
                    <Icon name="mail-outline" size={18} color={COLORS.textSecondary} style={styles.detailIcon} />
                    <View>
                      <Text style={styles.detailTitle}>Email Address</Text>
                      <Text style={styles.detailValue}>{user?.email}</Text>
                    </View>
                  </View>

                  <View style={styles.detailsRow}>
                    <Icon name="business-outline" size={18} color={COLORS.textSecondary} style={styles.detailIcon} />
                    <View>
                      <Text style={styles.detailTitle}>Department</Text>
                      <Text style={styles.detailValue}>{profileDetails?.department || 'General'}</Text>
                    </View>
                  </View>

                  <View style={styles.detailsRow}>
                    <Icon name="call-outline" size={18} color={COLORS.textSecondary} style={styles.detailIcon} />
                    <View>
                      <Text style={styles.detailTitle}>Phone Number</Text>
                      <Text style={styles.detailValue}>{profileDetails?.phone || 'Not Configured'}</Text>
                    </View>
                  </View>

                  <View style={styles.detailsRow}>
                    <Icon name="shield-checkmark-outline" size={18} color={COLORS.textSecondary} style={styles.detailIcon} />
                    <View>
                      <Text style={styles.detailTitle}>Reporting Manager</Text>
                      <Text style={styles.detailValue}>{profileDetails?.managerName || 'Admin'}</Text>
                    </View>
                  </View>
                </View>
              </Card>

              {/* Section Header */}
              <Text style={styles.historyHeader}>Attendance History Log</Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon name="calendar-outline" size={48} color={COLORS.textLight} />
              <Text style={styles.emptyText}>No attendance history recorded yet.</Text>
            </View>
          }
        />
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
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: 12,
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  listContainer: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  profileCard: {
    padding: SPACING.md,
    alignItems: 'center',
    marginBottom: SPACING.lg,
    backgroundColor: COLORS.surface,
  },
  avatarSection: {
    alignItems: 'center',
    marginVertical: SPACING.sm,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: COLORS.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    borderWidth: 2,
    borderColor: COLORS.primary + '30',
  },
  avatarText: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.primary,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  profileRole: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
    fontWeight: '700',
    backgroundColor: COLORS.primary + '10',
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 20,
    overflow: 'hidden',
  },
  divider: {
    height: 1.5,
    backgroundColor: COLORS.border,
    width: '100%',
    marginVertical: SPACING.md,
  },
  detailsSection: {
    width: '100%',
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  detailIcon: {
    marginRight: SPACING.md,
  },
  detailTitle: {
    fontSize: 11,
    color: COLORS.textLight,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 4,
  },
  historyHeader: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
  },
  historyCard: {
    marginBottom: SPACING.sm,
    padding: SPACING.sm,
    backgroundColor: COLORS.surface,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateBadgeContainer: {
    backgroundColor: 'rgba(100, 116, 139, 0.08)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
  },
  dateDay: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.text,
  },
  dateWeek: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '700',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  timeInfo: {
    flex: 1,
    paddingHorizontal: SPACING.md,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 3,
  },
  timeText: {
    fontSize: 12,
    color: COLORS.text,
    marginLeft: 6,
    fontWeight: '600',
  },
  hoursText: {
    fontSize: 10,
    color: COLORS.textLight,
    fontWeight: '700',
    marginTop: 4,
  },
  statusCol: {
    alignItems: 'flex-end',
  },
  gpsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  gpsLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: COLORS.textLight,
    marginLeft: 3,
    textTransform: 'uppercase',
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
    fontWeight: '600',
  },
});
