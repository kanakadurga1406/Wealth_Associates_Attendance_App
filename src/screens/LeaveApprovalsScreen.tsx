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
import { Button } from '../components/Button';
import Icon from 'react-native-vector-icons/Ionicons';
import { formatDate } from '../utils/helpers';
import { useRealTimeStatus } from '../hooks/useRealTimeStatus';
import { useCustomAlert } from '../context/CustomAlertContext';

interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  allowedLeaves: number;
  startDate: string;
  endDate: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  createdAt: any;
}

interface LeaveRequestCardProps {
  item: LeaveRequest;
  onApprove: (paidDaysCount: number, unpaidDaysCount: number) => void;
  onReject: () => void;
  isWorking: boolean;
}

const LeaveRequestCard: React.FC<LeaveRequestCardProps> = ({ item, onApprove, onReject, isWorking }) => {
  const [approvedPaidDays, setApprovedPaidDays] = useState<number | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // Calculate duration of the requested leave
  const reqStart = new Date(item.startDate);
  const reqEnd = new Date(item.endDate);
  const diffTime = Math.abs(reqEnd.getTime() - reqStart.getTime());
  const requestedDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

  const [paidCount, setPaidCount] = useState(requestedDays);

  useEffect(() => {
    // Fetch approved leaves for this employee in the month of item.startDate
    const reqMonthPrefix = item.startDate.substring(0, 7); // 'YYYY-MM'
    const startYear = reqStart.getFullYear();
    const startMonth = reqStart.getMonth();

    const unsubscribe = firestore()
      .collection('leave_requests')
      .where('employeeId', '==', item.employeeId)
      .where('status', '==', 'Approved')
      .onSnapshot((snapshot) => {
        if (!snapshot) {
          setApprovedPaidDays(0);
          setLoadingStats(false);
          return;
        }

        let paidDays = 0;
        const startOfMonth = new Date(startYear, startMonth, 1);
        const endOfMonth = new Date(startYear, startMonth + 1, 0);

        snapshot.docs.forEach((doc) => {
          const data = doc.data();
          if (data.startDate && data.endDate) {
            try {
              const start = new Date(data.startDate);
              const end = new Date(data.endDate);

              if (!(end < startOfMonth || start > endOfMonth)) {
                const overlapStart = new Date(Math.max(start.getTime(), startOfMonth.getTime()));
                const overlapEnd = new Date(Math.min(end.getTime(), endOfMonth.getTime()));
                const diff = Math.abs(overlapEnd.getTime() - overlapStart.getTime());
                const totalOverlap = Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;

                const totalDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                
                if (data.paidDaysCount !== undefined) {
                  paidDays += (totalOverlap / totalDays) * data.paidDaysCount;
                } else {
                  // Legacy logic: if unpaidDaysCount is specified, subtract it. Otherwise all is paid
                  const unpaid = data.unpaidDaysCount || 0;
                  const paidPortion = Math.max(0, totalDays - unpaid);
                  paidDays += (totalOverlap / totalDays) * paidPortion;
                }
              }
            } catch (e) {
              console.warn('Error parsing leave dates:', e);
            }
          }
        });

        // Round to nearest 0.5 to avoid floating point precision issues
        setApprovedPaidDays(Math.round(paidDays * 2) / 2);
        setLoadingStats(false);
      }, (err) => {
        console.warn('Error fetching approved leaves for request card:', err);
        setApprovedPaidDays(0);
        setLoadingStats(false);
      });

    return () => unsubscribe();
  }, [item.employeeId, item.startDate]);

  // Sync initial paidCount with remaining allowed leaves
  useEffect(() => {
    if (approvedPaidDays !== null) {
      const remainingAllowed = Math.max(0, item.allowedLeaves - approvedPaidDays);
      const defaultPaid = Math.min(requestedDays, remainingAllowed);
      setPaidCount(defaultPaid);
    }
  }, [approvedPaidDays, item.allowedLeaves, requestedDays]);

  const exceedsLimit = approvedPaidDays !== null && (approvedPaidDays + requestedDays) > item.allowedLeaves;

  return (
    <Card style={styles.requestCard}>
      <View style={styles.cardHeader}>
        <View style={styles.employeeInfo}>
          <Text style={styles.employeeName}>{item.employeeName}</Text>
          <Text style={styles.employeeDept}>{item.department}</Text>
        </View>
        <View style={styles.dateBadge}>
          <Icon name="calendar-outline" size={14} color={COLORS.primary} />
          <Text style={styles.dateBadgeText}>Pending Review</Text>
        </View>
      </View>

      <View style={styles.durationContainer}>
        <View style={styles.dateCol}>
          <Text style={styles.dateLabel}>FROM</Text>
          <Text style={styles.dateValue}>{formatDate(item.startDate)}</Text>
        </View>
        <Icon name="arrow-forward-outline" size={18} color={COLORS.textLight} style={styles.arrowIcon} />
        <View style={styles.dateCol}>
          <Text style={styles.dateLabel}>TO</Text>
          <Text style={styles.dateValue}>{formatDate(item.endDate)}</Text>
        </View>
      </View>

      <View style={styles.reasonContainer}>
        <Text style={styles.reasonLabel}>Reason ({requestedDays} {requestedDays === 1 ? 'day' : 'days'}):</Text>
        <Text style={styles.reasonText}>{item.reason}</Text>
      </View>

      {loadingStats ? (
        <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: SPACING.md }} />
      ) : (
        <>
          {exceedsLimit && (
            <View style={styles.warningBanner}>
              <Icon name="warning-outline" size={18} color={COLORS.warning} />
              <View style={styles.warningTextContainer}>
                <Text style={styles.warningText}>
                  Exceeds Allowed Limit: {item.allowedLeaves}d/mo.
                </Text>
                <Text style={styles.warningSubText}>
                  Taken: {approvedPaidDays}d. Remaining: {Math.max(0, item.allowedLeaves - approvedPaidDays)}d.
                </Text>
              </View>
            </View>
          )}

          {exceedsLimit && (
            <View style={styles.stepperContainer}>
              <Text style={styles.stepperLabel}>Configure Leave Days Split:</Text>
              <View style={styles.stepperRow}>
                <View style={styles.stepperCol}>
                  <Text style={styles.stepperSubLabel}>Paid Days</Text>
                  <View style={styles.stepperControls}>
                    <TouchableOpacity 
                      style={styles.stepperBtn} 
                      onPress={() => setPaidCount(prev => Math.max(0, prev - 1))}
                      disabled={paidCount === 0 || isWorking}
                    >
                      <Icon name="remove-outline" size={16} color={paidCount === 0 ? COLORS.textLight : COLORS.text} />
                    </TouchableOpacity>
                    <Text style={styles.stepperValue}>{paidCount}</Text>
                    <TouchableOpacity 
                      style={styles.stepperBtn} 
                      onPress={() => setPaidCount(prev => Math.min(requestedDays, prev + 1))}
                      disabled={paidCount === requestedDays || isWorking}
                    >
                      <Icon name="add-outline" size={16} color={paidCount === requestedDays ? COLORS.textLight : COLORS.text} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.stepperCol}>
                  <Text style={styles.stepperSubLabel}>Unpaid Days</Text>
                  <View style={styles.stepperControls}>
                    <TouchableOpacity 
                      style={styles.stepperBtn} 
                      onPress={() => setPaidCount(prev => Math.min(requestedDays, prev + 1))}
                      disabled={paidCount === requestedDays || isWorking}
                    >
                      <Icon name="remove-outline" size={16} color={paidCount === requestedDays ? COLORS.textLight : COLORS.text} />
                    </TouchableOpacity>
                    <Text style={styles.stepperValue}>{requestedDays - paidCount}</Text>
                    <TouchableOpacity 
                      style={styles.stepperBtn} 
                      onPress={() => setPaidCount(prev => Math.max(0, prev - 1))}
                      disabled={paidCount === 0 || isWorking}
                    >
                      <Icon name="add-outline" size={16} color={paidCount === 0 ? COLORS.textLight : COLORS.text} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          )}

          <View style={exceedsLimit ? styles.actionsContainerCol : styles.actionsContainer}>
            {exceedsLimit ? (
              <>
                <Button
                  title={`Approve (${paidCount} Paid / ${requestedDays - paidCount} Unpaid)`}
                  onPress={() => onApprove(paidCount, requestedDays - paidCount)}
                  disabled={isWorking}
                  style={[styles.actionBtnFull, { backgroundColor: COLORS.success }]}
                />
                <Button
                  title="Reject Request"
                  onPress={onReject}
                  variant="danger"
                  disabled={isWorking}
                  style={[styles.actionBtnFull, { marginTop: SPACING.sm }]}
                />
              </>
            ) : (
              <>
                <Button
                  title="Reject"
                  onPress={onReject}
                  variant="danger"
                  disabled={isWorking}
                  style={styles.actionBtn}
                />
                <Button
                  title="Approve"
                  onPress={() => onApprove(requestedDays, 0)}
                  variant="primary"
                  disabled={isWorking}
                  style={[styles.actionBtn, styles.approveBtn]}
                />
              </>
            )}
          </View>
        </>
      )}

      {isWorking && (
        <View style={styles.overlay}>
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      )}
    </Card>
  );
};

export const LeaveApprovalsScreen: React.FC = () => {
  const adminUser = useSelector((state: RootState) => state.auth.user);
  
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const { updateActivity } = useRealTimeStatus();
  const { showAlert } = useCustomAlert();

  useEffect(() => {
    updateActivity('reviewing_leaves');
  }, [updateActivity]);

  useEffect(() => {
    if (!adminUser) return;

    let unsubscribeLeaves: () => void;

    // 1. Fetch Employees first to filter requests (or all if Super Admin)
    let employeesQuery = firestore().collection('users').where('role', '==', 'EMPLOYEE');
    if (adminUser.role !== 'SUPER_ADMIN') {
      employeesQuery = employeesQuery.where('adminId', '==', adminUser.uid);
    }

    const unsubscribeEmployees = employeesQuery.onSnapshot(async (empSnapshot) => {
        if (!empSnapshot) return;

        const employeeIds = empSnapshot.docs.map(doc => doc.id);
        const employeeNames: { [key: string]: string } = {};
        empSnapshot.docs.forEach(doc => {
          employeeNames[doc.id] = doc.data().name || 'Unknown Employee';
        });

        if (employeeIds.length === 0) {
          setRequests([]);
          setLoading(false);
          return;
        }

        // Fetch employee departments and allowed leaves
        const empDetailsPromises = employeeIds.map(id =>
          firestore().collection('employees').doc(id).get()
        );
        const empDetailsSnaps = await Promise.all(empDetailsPromises);
        const employeeDepts: { [key: string]: string } = {};
        const employeeAllowedLeaves: { [key: string]: number } = {};
        empDetailsSnaps.forEach(snap => {
          if (snap.exists()) {
            const data = snap.data() || {};
            employeeDepts[snap.id] = data.department || 'General';
            employeeAllowedLeaves[snap.id] = parseInt(data.allowedLeaves) || 0;
          }
        });

        // 2. Fetch Pending Leave Requests
        unsubscribeLeaves = firestore()
          .collection('leave_requests')
          .where('status', '==', 'Pending')
          .onSnapshot((leaveSnapshot) => {
            if (!leaveSnapshot) return;

            const pendingRequests: LeaveRequest[] = [];
            leaveSnapshot.docs.forEach((doc) => {
              const data = doc.data();
              if (employeeIds.includes(data.employeeId)) {
                pendingRequests.push({
                  id: doc.id,
                  employeeId: data.employeeId,
                  employeeName: employeeNames[data.employeeId] || 'Unknown Employee',
                  department: employeeDepts[data.employeeId] || 'General',
                  allowedLeaves: employeeAllowedLeaves[data.employeeId] || 2,
                  startDate: data.startDate,
                  endDate: data.endDate,
                  reason: data.reason || 'No reason provided',
                  status: data.status,
                  createdAt: data.createdAt,
                });
              }
            });

            // Sort by createdAt descending
            pendingRequests.sort((a, b) => {
              const timeA = a.createdAt?.seconds || 0;
              const timeB = b.createdAt?.seconds || 0;
              return timeB - timeA;
            });

            setRequests(pendingRequests);
            setLoading(false);
          }, (err) => {
            console.warn('Error fetching leave requests:', err);
            setLoading(false);
          });
      }, (err) => {
        console.warn('Error fetching employees:', err);
        setLoading(false);
      });

    return () => {
      unsubscribeEmployees();
      if (unsubscribeLeaves) unsubscribeLeaves();
    };
  }, [adminUser]);

  const handleDecision = async (
    requestId: string,
    employeeId: string,
    employeeName: string,
    startDate: string,
    endDate: string,
    decision: 'Approved' | 'Rejected',
    paidDaysCount?: number,
    unpaidDaysCount?: number
  ) => {
    if (!adminUser) return;

    setActionLoadingId(requestId);
    try {
      const updateData: any = {
        status: decision,
        reviewedBy: adminUser.uid,
        reviewedAt: firestore.FieldValue.serverTimestamp(),
      };

      if (decision === 'Approved') {
        updateData.paidDaysCount = paidDaysCount !== undefined ? paidDaysCount : 0;
        updateData.unpaidDaysCount = unpaidDaysCount !== undefined ? unpaidDaysCount : 0;
      }

      // 1. Update leave request document
      await firestore().collection('leave_requests').doc(requestId).update(updateData);

      // 2. Log activity
      const activityLabel = decision === 'Approved' 
        ? `Leave request for ${employeeName} was approved (${paidDaysCount} paid, ${unpaidDaysCount} unpaid) by Admin`
        : `Leave request for ${employeeName} was rejected by Admin`;

      await firestore().collection('activity_logs').add({
        employeeId: employeeId,
        activity: activityLabel,
        timestamp: firestore.FieldValue.serverTimestamp(),
      });

      // 3. Add unread notification for employee
      const notificationBody = decision === 'Approved'
        ? `Your leave request from ${startDate} to ${endDate} was approved (${paidDaysCount} Paid, ${unpaidDaysCount} Unpaid).`
        : `Your leave request from ${startDate} to ${endDate} was rejected.`;

      await firestore().collection('notifications').add({
        employeeId: employeeId,
        title: decision === 'Approved' ? 'Leave Approved' : 'Leave Rejected',
        body: notificationBody,
        status: 'unread',
        createdAt: firestore.FieldValue.serverTimestamp(),
      });

      showAlert('Success', `Leave request successfully ${decision.toLowerCase()}.`);
    } catch (err: any) {
      console.error('Error updating leave request:', err);
      showAlert('Action Failed', err.message || 'Failed to update leave request status.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const renderRequestItem = ({ item }: { item: LeaveRequest }) => {
    const isWorking = actionLoadingId === item.id;

    return (
      <LeaveRequestCard
        item={item}
        isWorking={isWorking}
        onApprove={(paid, unpaid) => handleDecision(item.id, item.employeeId, item.employeeName, item.startDate, item.endDate, 'Approved', paid, unpaid)}
        onReject={() => handleDecision(item.id, item.employeeId, item.employeeName, item.startDate, item.endDate, 'Rejected')}
      />
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Leave Requests" showBackButton />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading leave requests...</Text>
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          renderItem={renderRequestItem}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Icon name="mail-open-outline" size={48} color={COLORS.textLight} />
              <Text style={styles.emptyText}>No pending leave requests found.</Text>
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
  listContainer: {
    padding: SPACING.md,
  },
  requestCard: {
    marginBottom: SPACING.md,
    padding: SPACING.md,
    position: 'relative',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: SPACING.sm,
    marginBottom: SPACING.md,
  },
  employeeInfo: {
    flex: 1,
  },
  employeeName: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  employeeDept: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.infoLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  dateBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.info,
    marginLeft: 4,
  },
  durationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: SPACING.sm,
    borderRadius: 8,
    marginBottom: SPACING.md,
  },
  dateCol: {
    flex: 1,
  },
  dateLabel: {
    fontSize: 9,
    color: COLORS.textLight,
    fontWeight: '700',
    marginBottom: 2,
  },
  dateValue: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.text,
  },
  arrowIcon: {
    paddingHorizontal: SPACING.sm,
  },
  reasonContainer: {
    marginBottom: SPACING.lg,
  },
  reasonLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  reasonText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionBtn: {
    flex: 1,
    height: 44,
    marginRight: SPACING.sm,
  },
  approveBtn: {
    marginRight: 0,
    marginLeft: SPACING.sm,
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
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.warning + '1A',
    padding: SPACING.sm,
    borderRadius: 8,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.warning + '33',
  },
  warningTextContainer: {
    marginLeft: SPACING.xs,
    flex: 1,
  },
  warningText: {
    color: COLORS.warning,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  warningSubText: {
    color: COLORS.warning,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
  },
  stepperContainer: {
    marginBottom: SPACING.md,
    padding: SPACING.sm,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  stepperLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  stepperRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stepperCol: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: SPACING.xs,
  },
  stepperSubLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 6,
    fontWeight: '600',
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  stepperBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  stepperValue: {
    width: 40,
    textAlign: 'center',
    fontWeight: '800',
    color: COLORS.text,
    fontSize: 14,
  },
  actionsContainerCol: {
    flexDirection: 'column',
  },
  actionBtnFull: {
    width: '100%',
    height: 48,
  },
});
