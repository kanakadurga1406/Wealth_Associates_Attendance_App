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
import { COLORS, SPACING } from '../constants/theme';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { BottomTabBar } from '../components/BottomTabBar';
import Icon from 'react-native-vector-icons/Ionicons';
import { useRealTimeStatus } from '../hooks/useRealTimeStatus';

export const MyApplicationsScreen: React.FC = () => {
  const user = useSelector((state: RootState) => state.auth.user);
  const navigation = useNavigation<any>();
  const [myLeaves, setMyLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const { updateActivity } = useRealTimeStatus();

  useEffect(() => {
    updateActivity('viewing_applications');
  }, [updateActivity]);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = firestore()
      .collection('leave_requests')
      .where('employeeId', '==', user.uid)
      .onSnapshot((snapshot) => {
        if (!snapshot) {
          setMyLeaves([]);
          setLoading(false);
          return;
        }

        const list = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            startDate: data.startDate || '',
            endDate: data.endDate || '',
            status: data.status || 'Pending',
            reason: data.reason || '',
            paidDaysCount: data.paidDaysCount,
            unpaidDaysCount: data.unpaidDaysCount,
          };
        });

        list.sort((a, b) => b.startDate.localeCompare(a.startDate));
        setMyLeaves(list);
        setLoading(false);
      }, (err) => {
        console.warn('Error fetching leave history:', err);
        setLoading(false);
      });

    return () => unsubscribe();
  }, [user]);

  const renderStatusBadge = (status: string) => {
    let bgColor = COLORS.infoLight;
    let textColor = COLORS.info;

    if (status === 'Approved') {
      bgColor = COLORS.successLight;
      textColor = COLORS.success;
    } else if (status === 'Rejected') {
      bgColor = COLORS.dangerLight;
      textColor = COLORS.danger;
    } else if (status === 'Pending') {
      bgColor = COLORS.warningLight;
      textColor = COLORS.warning;
    }

    return (
      <View style={[styles.statusBadge, { backgroundColor: bgColor }]}>
        <Text style={[styles.statusBadgeText, { color: textColor }]}>{status}</Text>
      </View>
    );
  };

  const renderItem = ({ item }: { item: any }) => {
    const start = new Date(item.startDate);
    const end = new Date(item.endDate);
    const totalDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    return (
      <Card style={styles.historyCard}>
        <View style={styles.historyItemHeader}>
          <View style={{ flex: 1, paddingRight: SPACING.sm }}>
            <Text style={styles.historyItemDates}>
              {item.startDate} to {item.endDate}
            </Text>
            <Text style={styles.historyItemDuration}>
              {totalDays} {totalDays === 1 ? 'day' : 'days'}
              {item.status === 'Approved' && item.paidDaysCount !== undefined && (
                <Text style={styles.splitDetails}>
                  {' '}({item.paidDaysCount} Paid / {item.unpaidDaysCount} Unpaid)
                </Text>
              )}
            </Text>
          </View>
          {renderStatusBadge(item.status)}
        </View>
        <Text style={styles.historyItemReason} numberOfLines={2}>
          Reason: {item.reason}
        </Text>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      <Header title="My Applications" showBackButton />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading applications...</Text>
        </View>
      ) : (
        <FlatList
          data={myLeaves}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon name="document-text-outline" size={48} color={COLORS.textLight} />
              <Text style={styles.emptyText}>You haven't submitted any leave applications yet.</Text>
            </View>
          }
        />
      )}

      <BottomTabBar role="EMPLOYEE" activeTab="Applications" navigation={navigation} />
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
    padding: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  historyItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  historyItemDates: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  historyItemDuration: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
    fontWeight: '600',
  },
  splitDetails: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  historyItemReason: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
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
    textAlign: 'center',
  },
});
