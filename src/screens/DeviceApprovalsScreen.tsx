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
import { formatDate } from '../utils/helpers';
import { useRealTimeStatus } from '../hooks/useRealTimeStatus';
import { useCustomAlert } from '../context/CustomAlertContext';

interface DeviceRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  adminId: string;
  oldDeviceId: string;
  newDeviceId: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  requestedAt: any;
}

export const DeviceApprovalsScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const [requests, setRequests] = useState<DeviceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const { updateActivity } = useRealTimeStatus();
  const { showAlert } = useCustomAlert();

  useEffect(() => {
    updateActivity('reviewing_device_approvals');
  }, [updateActivity]);

  useEffect(() => {
    if (!currentUser) return;

    let query = firestore()
      .collection('device_requests')
      .where('status', '==', 'Pending');

    // If regular ADMIN, filter requests assigned to this Admin manager
    if (currentUser.role === 'ADMIN') {
      query = query.where('adminId', '==', currentUser.uid);
    }

    const unsubscribe = query.onSnapshot(
      (snapshot) => {
        if (!snapshot) {
          setRequests([]);
          setLoading(false);
          return;
        }

        const list = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as any),
        })) as DeviceRequest[];

        // Sort by requestedAt descending
        list.sort((a, b) => {
          const t1 = a.requestedAt?.toDate?.()?.getTime() || 0;
          const t2 = b.requestedAt?.toDate?.()?.getTime() || 0;
          return t2 - t1;
        });

        setRequests(list);
        setLoading(false);
      },
      (err) => {
        console.warn('Error fetching device requests:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  const handleApprove = async (request: DeviceRequest) => {
    showAlert(
      'Approve Request',
      `Are you sure you want to approve the device change for ${request.employeeName}? This will bind their account to the new device ID.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: () => executeApproval(request),
        },
      ]
    );
  };

  const executeApproval = async (request: DeviceRequest) => {
    setProcessingId(request.id);
    try {
      const batch = firestore().batch();

      // 1. Approve request in device_requests
      const reqRef = firestore().collection('device_requests').doc(request.id);
      batch.update(reqRef, {
        status: 'Approved',
        approvedAt: firestore.FieldValue.serverTimestamp(),
        approvedBy: currentUser?.uid || 'system',
      });

      // 2. Bind new device ID in users doc
      const userRef = firestore().collection('users').doc(request.employeeId);
      batch.update(userRef, {
        deviceId: request.newDeviceId,
      });

      // 3. Create Notification for employee
      const notifRef = firestore().collection('notifications').doc();
      batch.set(notifRef, {
        employeeId: request.employeeId,
        title: 'Device Request Approved',
        body: `Your request to log in from a new device was approved by the Admin. You can now log in.`,
        status: 'unread',
        createdAt: firestore.FieldValue.serverTimestamp(),
      });

      // 4. Log activity
      const logRef = firestore().collection('activity_logs').doc();
      batch.set(logRef, {
        employeeId: currentUser?.uid || 'system',
        activity: `Approved device change for employee: ${request.employeeName} (New Device: ${request.newDeviceId})`,
        timestamp: firestore.FieldValue.serverTimestamp(),
      });

      await batch.commit();
      showAlert('Success', `Device request for ${request.employeeName} approved.`);
    } catch (err: any) {
      console.error('Error approving device request:', err);
      showAlert('Error', err.message || 'Failed to approve request.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (request: DeviceRequest) => {
    showAlert(
      'Reject Request',
      `Are you sure you want to reject the device change for ${request.employeeName}? They will remain blocked on the new device.`,
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

  const executeRejection = async (request: DeviceRequest) => {
    setProcessingId(request.id);
    try {
      const batch = firestore().batch();

      // 1. Reject request in device_requests
      const reqRef = firestore().collection('device_requests').doc(request.id);
      batch.update(reqRef, {
        status: 'Rejected',
        rejectedAt: firestore.FieldValue.serverTimestamp(),
        rejectedBy: currentUser?.uid || 'system',
      });

      // 2. Create Notification for employee
      const notifRef = firestore().collection('notifications').doc();
      batch.set(notifRef, {
        employeeId: request.employeeId,
        title: 'Device Request Rejected',
        body: `Your request to log in from a new device was rejected by the Admin.`,
        status: 'unread',
        createdAt: firestore.FieldValue.serverTimestamp(),
      });

      // 3. Log activity
      const logRef = firestore().collection('activity_logs').doc();
      batch.set(logRef, {
        employeeId: currentUser?.uid || 'system',
        activity: `Rejected device change for employee: ${request.employeeName}`,
        timestamp: firestore.FieldValue.serverTimestamp(),
      });

      await batch.commit();
      showAlert('Rejected', `Device request for ${request.employeeName} rejected.`);
    } catch (err: any) {
      console.error('Error rejecting device request:', err);
      showAlert('Error', err.message || 'Failed to reject request.');
    } finally {
      setProcessingId(null);
    }
  };

  const renderRequestItem = ({ item }: { item: DeviceRequest }) => {
    const isWorking = processingId === item.id;
    const requestDate = item.requestedAt ? formatDate(item.requestedAt.toDate?.() || new Date()) : 'Recently';

    return (
      <Card style={styles.requestCard}>
        <View style={styles.cardHeader}>
          <View style={styles.employeeInfo}>
            <Text style={styles.employeeName}>{item.employeeName}</Text>
            <Text style={styles.employeeEmail}>{item.employeeEmail}</Text>
          </View>
          <View style={styles.pendingBadge}>
            <Icon name="hardware-chip-outline" size={14} color={COLORS.info} />
            <Text style={styles.pendingText}>Pending Approval</Text>
          </View>
        </View>

        <View style={styles.deviceDetailsContainer}>
          <View style={styles.deviceIdBox}>
            <Text style={styles.deviceIdLabel}>OLD BOUND DEVICE ID</Text>
            <Text style={styles.deviceIdValue} numberOfLines={1} ellipsizeMode="middle">
              {item.oldDeviceId || 'None (Unbound)'}
            </Text>
          </View>
          
          <Icon name="arrow-down" size={16} color={COLORS.textLight} style={styles.arrowIcon} />
          
          <View style={[styles.deviceIdBox, styles.newDeviceBox]}>
            <Text style={[styles.deviceIdLabel, { color: COLORS.info }]}>NEW REQUESTED DEVICE ID</Text>
            <Text style={[styles.deviceIdValue, { color: COLORS.text }]} numberOfLines={1} ellipsizeMode="middle">
              {item.newDeviceId}
            </Text>
          </View>
        </View>

        <Text style={styles.timeText}>Requested on {requestDate}</Text>

        <View style={styles.btnRow}>
          <Button
            title="Reject Request"
            variant="danger"
            style={[styles.btn, styles.rejectBtn]}
            onPress={() => handleReject(item)}
            disabled={isWorking}
          />
          <Button
            title="Approve & Bind"
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
      <Header title="Device Approvals" showBackButton />

      <View style={styles.content}>
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Fetching pending device requests...</Text>
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
                  No employees are currently waiting for device binding approval.
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
  employeeEmail: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.info + '10',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.info + '20',
  },
  pendingText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.info,
    marginLeft: 4,
  },
  deviceDetailsContainer: {
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  deviceIdBox: {
    paddingVertical: 4,
  },
  newDeviceBox: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
    marginTop: 4,
  },
  deviceIdLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: COLORS.textLight,
    letterSpacing: 0.5,
  },
  deviceIdValue: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginTop: 2,
  },
  arrowIcon: {
    alignSelf: 'center',
    marginVertical: 4,
  },
  timeText: {
    fontSize: 11,
    color: COLORS.textLight,
    fontWeight: '600',
    marginBottom: SPACING.md,
    marginTop: 4,
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
