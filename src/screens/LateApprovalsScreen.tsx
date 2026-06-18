import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useSelector } from 'react-redux';
import firestore from '@react-native-firebase/firestore';
import { RootState } from '../redux/store';
import { COLORS, SPACING, SHADOWS } from '../constants/theme';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import Icon from 'react-native-vector-icons/Ionicons';
import { formatDate, formatTime } from '../utils/helpers';
import { useRealTimeStatus } from '../hooks/useRealTimeStatus';
import { useCustomAlert } from '../context/CustomAlertContext';

interface LateRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  adminId: string;
  status: string;
  lateStatus: 'Pending' | 'Approved' | 'Rejected';
  checkIn: any;
  checkInAddress?: string;
  latitude?: number;
  longitude?: number;
  date: string;
  salary?: number;
}

export const LateApprovalsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const [requests, setRequests] = useState<LateRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const { updateActivity } = useRealTimeStatus();
  const { showAlert } = useCustomAlert();

  useEffect(() => {
    updateActivity('reviewing_late_approvals');
  }, [updateActivity]);

  useEffect(() => {
    if (!currentUser) return;

    let query = firestore()
      .collection('attendance')
      .where('status', '==', 'Late')
      .where('lateStatus', '==', 'Pending');

    // If regular ADMIN, filter requests assigned to this Admin manager
    if (currentUser.role === 'ADMIN') {
      query = query.where('adminId', '==', currentUser.uid);
    }

    const unsubscribe = query.onSnapshot(
      async (snapshot) => {
        if (!snapshot) {
          setRequests([]);
          setLoading(false);
          return;
        }

        const list = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as any),
        })) as LateRequest[];

        try {
          const promises = list.map(async (req) => {
            const empSnap = await firestore().collection('employees').doc(req.employeeId).get();
            let salary = 0;
            if (empSnap.exists()) {
              salary = empSnap.data()?.salary || 0;
            }
            return {
              ...req,
              salary,
            };
          });

          const resolvedList = await Promise.all(promises);

          resolvedList.sort((a, b) => {
            const t1 = a.checkIn?.toDate?.()?.getTime() || 0;
            const t2 = b.checkIn?.toDate?.()?.getTime() || 0;
            return t2 - t1;
          });

          setRequests(resolvedList);
        } catch (e) {
          console.warn('Error fetching employee profiles for late requests:', e);
          list.sort((a, b) => {
            const t1 = a.checkIn?.toDate?.()?.getTime() || 0;
            const t2 = b.checkIn?.toDate?.()?.getTime() || 0;
            return t2 - t1;
          });
          setRequests(list);
        }
        setLoading(false);
      },
      (err) => {
        console.warn('Error fetching late requests:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  const handleApprove = async (request: LateRequest) => {
    const deduction = request.salary ? (request.salary / 60) : 0;
    const msg = deduction > 0 
      ? `Are you sure you want to approve/pardon this late login for ${request.employeeName} on ${request.date}? This will save them ₹${deduction.toFixed(2)} in salary deduction.`
      : `Are you sure you want to approve/pardon this late login for ${request.employeeName} on ${request.date}? No salary will be cut for this late login.`;
    showAlert(
      'Approve (Pardon) Late Login',
      msg,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve & Pardon',
          onPress: () => executeApproval(request),
        },
      ]
    );
  };

  const executeApproval = async (request: LateRequest) => {
    setProcessingId(request.id);
    try {
      const batch = firestore().batch();

      // 1. Update lateStatus to 'Approved' in attendance record
      const attRef = firestore().collection('attendance').doc(request.id);
      batch.update(attRef, {
        lateStatus: 'Approved',
        lateApprovedAt: firestore.FieldValue.serverTimestamp(),
        lateApprovedBy: currentUser?.uid || 'system',
      });

      // 2. Create Notification for employee
      const notifRef = firestore().collection('notifications').doc();
      batch.set(notifRef, {
        employeeId: request.employeeId,
        title: 'Late Login Pardoned',
        body: `Your late login request on ${request.date} was approved. No salary deduction will be applied.`,
        status: 'unread',
        createdAt: firestore.FieldValue.serverTimestamp(),
      });

      // 3. Log activity
      const logRef = firestore().collection('activity_logs').doc();
      batch.set(logRef, {
        employeeId: currentUser?.uid || 'system',
        activity: `Approved (Pardoned) late login for employee: ${request.employeeName} on ${request.date}`,
        timestamp: firestore.FieldValue.serverTimestamp(),
      });

      await batch.commit();
      showAlert('Success', `Late login request for ${request.employeeName} approved.`);
    } catch (err: any) {
      console.error('Error approving late login request:', err);
      showAlert('Error', err.message || 'Failed to approve request.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (request: LateRequest) => {
    const deduction = request.salary ? (request.salary / 60) : 0;
    const msg = deduction > 0 
      ? `Are you sure you want to reject the late login pardon for ${request.employeeName} on ${request.date}? A salary deduction of ₹${deduction.toFixed(2)} will be cut.`
      : `Are you sure you want to reject the late login pardon for ${request.employeeName} on ${request.date}? Salary deduction will be cut as normal.`;
    showAlert(
      'Reject Request',
      msg,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: () => executeRejection(request),
        },
      ]
    );
  };

  const executeRejection = async (request: LateRequest) => {
    setProcessingId(request.id);
    try {
      const batch = firestore().batch();

      // 1. Update lateStatus to 'Rejected' in attendance record
      const attRef = firestore().collection('attendance').doc(request.id);
      batch.update(attRef, {
        lateStatus: 'Rejected',
        lateRejectedAt: firestore.FieldValue.serverTimestamp(),
        lateRejectedBy: currentUser?.uid || 'system',
      });

      // 2. Create Notification for employee
      const notifRef = firestore().collection('notifications').doc();
      batch.set(notifRef, {
        employeeId: request.employeeId,
        title: 'Late Login Deduction Applied',
        body: `Your late login request on ${request.date} was rejected by Admin. Salary deduction has been applied.`,
        status: 'unread',
        createdAt: firestore.FieldValue.serverTimestamp(),
      });

      // 3. Log activity
      const logRef = firestore().collection('activity_logs').doc();
      batch.set(logRef, {
        employeeId: currentUser?.uid || 'system',
        activity: `Rejected late login pardon for employee: ${request.employeeName} on ${request.date}`,
        timestamp: firestore.FieldValue.serverTimestamp(),
      });

      await batch.commit();
      showAlert('Rejected', `Late login pardon request for ${request.employeeName} rejected.`);
    } catch (err: any) {
      console.error('Error rejecting late login request:', err);
      showAlert('Error', err.message || 'Failed to reject request.');
    } finally {
      setProcessingId(null);
    }
  };

  const renderRequestItem = ({ item }: { item: LateRequest }) => {
    const isWorking = processingId === item.id;
    const checkInTime = item.checkIn ? formatTime(item.checkIn) : 'Recently';
    const deduction = item.salary ? (item.salary / 60) : 0;

    return (
      <Card style={styles.requestCard}>
        <View style={styles.cardHeader}>
          <View style={styles.employeeInfo}>
            <Text style={styles.employeeName}>{item.employeeName}</Text>
            <Text style={styles.dateText}>Date: {item.date}</Text>
          </View>
          <View style={styles.pendingBadge}>
            <Icon name="time-outline" size={14} color={COLORS.warning} />
            <Text style={styles.pendingText}>Pending Approval</Text>
          </View>
        </View>

        <View style={styles.telemetryContainer}>
          <View style={styles.infoBox}>
            <Text style={styles.label}>CHECK-IN TIME</Text>
            <Text style={styles.value}>{checkInTime}</Text>
          </View>
          
          <View style={[styles.infoBox, { marginTop: 8 }]}>
            <Text style={styles.label}>GPS COORDINATES</Text>
            <Text style={styles.value} numberOfLines={1}>
              {item.latitude ? `${item.latitude.toFixed(6)}°, ${item.longitude?.toFixed(6)}°` : 'N/A'}
            </Text>
          </View>

          {item.checkInAddress && (
            <View style={[styles.infoBox, { marginTop: 8 }]}>
              <Text style={styles.label}>VERIFIED ADDRESS</Text>
              <Text style={styles.addressValue} numberOfLines={2}>
                {item.checkInAddress}
              </Text>
            </View>
          )}

          {deduction > 0 && (
            <View style={[styles.infoBox, { marginTop: 8, borderTopWidth: 1, borderTopColor: '#EBE7F2', paddingTop: 8 }]}>
              <Text style={[styles.label, { color: COLORS.danger }]}>ESTIMATED SALARY DEDUCTION (0.5 DAY)</Text>
              <Text style={[styles.value, { color: COLORS.danger, fontSize: 16, marginTop: 4 }]}>₹{deduction.toFixed(2)}</Text>
            </View>
          )}
        </View>

        <View style={styles.btnRow}>
          <Button
            title="Reject Pardon"
            variant="danger"
            style={[styles.btn, styles.rejectBtn]}
            onPress={() => handleReject(item)}
            disabled={isWorking}
          />
          <Button
            title="Approve (Pardon)"
            variant="primary"
            style={[styles.btn, styles.approveBtn]}
            onPress={() => handleApprove(item)}
            loading={isWorking}
            disabled={isWorking}
          />
        </View>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Late Login Approvals" showBackButton />

      <View style={styles.content}>
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Fetching pending late requests...</Text>
          </View>
        ) : (
          <FlatList
            data={requests}
            keyExtractor={(item) => item.id}
            renderItem={renderRequestItem}
            contentContainerStyle={styles.listContainer}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.centerContainer}>
                <View style={styles.emptyIconWrapper}>
                  <Icon name="checkmark-done-circle-outline" size={48} color={COLORS.success} />
                </View>
                <Text style={styles.emptyTitle}>All Clear!</Text>
                <Text style={styles.emptySubtitle}>
                  No employees are currently waiting for late login approval.
                </Text>
              </View>
            }
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
  },
  listContainer: {
    padding: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  requestCard: {
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  employeeInfo: {
    flex: 1,
    marginRight: SPACING.xs,
  },
  employeeName: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  dateText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
    fontWeight: '600',
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warning + '10',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.warning + '20',
  },
  pendingText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.warning,
    marginLeft: 4,
  },
  telemetryContainer: {
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
  },
  infoBox: {
    paddingVertical: 2,
  },
  label: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textLight,
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '700',
    marginTop: 2,
  },
  addressValue: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginTop: 2,
    lineHeight: 16,
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  btn: {
    flex: 1,
    height: 40,
    borderRadius: 8,
  },
  rejectBtn: {
    marginRight: SPACING.sm,
  },
  approveBtn: {
    backgroundColor: COLORS.primary,
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xxl * 1.5,
    paddingHorizontal: SPACING.lg,
  },
  loadingText: {
    marginTop: SPACING.sm,
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  emptyIconWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.success + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  emptySubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
