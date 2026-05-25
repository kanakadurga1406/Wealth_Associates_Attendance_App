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
import database from '@react-native-firebase/database';
import { RootState } from '../redux/store';
import { COLORS, SPACING, SHADOWS } from '../constants/theme';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
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
}

export const RealTimeStatusScreen: React.FC = () => {
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
    let employeeDataMap: { [key: string]: any } = {};

    // 1. Listen to Firestore employees
    let query = firestore().collection('users').where('role', '==', 'EMPLOYEE');
    if (adminUser.role !== 'SUPER_ADMIN') {
      query = query.where('adminId', '==', adminUser.uid);
    }

    const unsubscribeFirestore = query.onSnapshot(
        async (snapshot) => {
          if (!snapshot) {
            console.log('RealTimeStatusScreen: received null snapshot');
            return;
          }

          console.log('--- REALTIME STATUS SCREEN: FIRESTORE EMPLOYEES FETCH ---');
          console.log('Logged-in Admin UID:', adminUser.uid);
          console.log('Number of matched employees:', snapshot.size);

          // Fetch more employee details from employees collection if department info is stored there
          const empDetailsPromises = snapshot.docs.map(doc =>
            firestore().collection('employees').doc(doc.id).get()
          );
          const empDetailsSnapshots = await Promise.all(empDetailsPromises);
          
          const detailsMap: { [key: string]: any } = {};
          empDetailsSnapshots.forEach(docSnap => {
            if (docSnap.exists()) {
              detailsMap[docSnap.id] = docSnap.data();
            }
          });

          employeeDataMap = {};
          snapshot.docs.forEach((doc) => {
            const data = doc.data();
            console.log(`Employee Doc ID: ${doc.id}, Name: ${data.name}, adminId in DB: ${data.adminId}`);
            employeeDataMap[doc.id] = {
              uid: doc.id,
              name: data.name,
              email: data.email,
              department: detailsMap[doc.id]?.department || 'General',
            };
          });

          // 2. Subscribe to RTDB Status updates
          const rtdbRef = database().ref('/status/users');
          
          if (rtdbListener) {
            rtdbRef.off('value', rtdbListener);
          }

          console.log('Subscribing to Realtime Database path /status/users...');
          rtdbListener = rtdbRef.on(
            'value',
            (rtdbSnapshot) => {
              console.log('RTDB onValue callback fired!');
              const val = rtdbSnapshot.val() || {};
              console.log('RTDB status/users data payload size:', Object.keys(val).length);
              
              const mergedEmployees: EmployeePresence[] = Object.keys(employeeDataMap).map((uid) => {
                const rtdbData = val[uid] || {};
                return {
                  ...employeeDataMap[uid],
                  state: rtdbData.state || 'offline',
                  currentActivity: rtdbData.currentActivity || 'Away',
                  lastSeen: rtdbData.lastSeen || 0,
                  checkInStatus: rtdbData.checkInStatus || 'unknown',
                };
              });

              // Sort by state (online first), then name
              mergedEmployees.sort((a, b) => {
                if (a.state === 'online' && b.state !== 'online') return -1;
                if (a.state !== 'online' && b.state === 'online') return 1;
                return a.name.localeCompare(b.name);
              });

              console.log('Merged employee status list size:', mergedEmployees.length);
              setEmployees(mergedEmployees);
              setLoading(false);
            },
            (rtdbError) => {
              console.error('RTDB Status listener error:', rtdbError);
              setLoading(false);
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

    const getBadgeType = () => {
      if (item.checkInStatus === 'checked-in') return 'success';
      if (item.checkInStatus === 'checked-out') return 'info';
      return 'danger';
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
});
