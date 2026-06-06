import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import firestore from '@react-native-firebase/firestore';
import { RootState } from '../redux/store';
import { COLORS, SPACING, SHADOWS } from '../constants/theme';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { BottomTabBar } from '../components/BottomTabBar';
import Icon from 'react-native-vector-icons/Ionicons';
import { formatTime, formatHours } from '../utils/helpers';
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

export const HistoryScreen: React.FC = () => {
  const user = useSelector((state: RootState) => state.auth.user);
  const navigation = useNavigation<any>();
  const [history, setHistory] = useState<AttendanceHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const { updateActivity } = useRealTimeStatus();

  useEffect(() => {
    updateActivity('viewing_history');
  }, [updateActivity]);

  useEffect(() => {
    if (!user) return;

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

        records.sort((a, b) => b.date.localeCompare(a.date));
        setHistory(records);
        setLoading(false);
      }, (err) => {
        console.warn('Error fetching history:', err);
        setLoading(false);
      });

    return () => unsubscribeHistory();
  }, [user]);

  const renderHistoryItem = ({ item }: { item: AttendanceHistoryItem }) => {
    const checkInString = item.checkIn ? formatTime(item.checkIn) : 'No In Log';
    const checkOutString = item.checkOut ? formatTime(item.checkOut) : 'No Out Log';
    
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
                <Icon name="navigate-outline" size={10} color={COLORS.textLight} />
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
      <Header title="Attendance History" showBackButton />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading history logs...</Text>
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={(item) => item.id}
          renderItem={renderHistoryItem}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon name="calendar-outline" size={48} color={COLORS.textLight} />
              <Text style={styles.emptyText}>No attendance history recorded yet.</Text>
            </View>
          }
        />
      )}

      <BottomTabBar role="EMPLOYEE" activeTab="History" navigation={navigation} />
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
    paddingBottom: 110,
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
    backgroundColor: 'rgba(92, 70, 232, 0.08)',
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
    color: COLORS.primary,
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
