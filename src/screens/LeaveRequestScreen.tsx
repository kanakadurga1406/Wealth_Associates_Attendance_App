import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { useSelector } from 'react-redux';
import firestore from '@react-native-firebase/firestore';
import { RootState } from '../redux/store';
import { COLORS, SPACING, SHADOWS } from '../constants/theme';
import { Header } from '../components/Header';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { useRealTimeStatus } from '../hooks/useRealTimeStatus';
import { useCustomAlert } from '../context/CustomAlertContext';
import { CalendarModal } from '../components/CalendarModal';
import { TouchableOpacity } from 'react-native';

export const LeaveRequestScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const user = useSelector((state: RootState) => state.auth.user);
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  
  const [startDateModalVisible, setStartDateModalVisible] = useState(false);
  const [endDateModalVisible, setEndDateModalVisible] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [myLeaves, setMyLeaves] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  
  const { updateActivity } = useRealTimeStatus();
  const { showAlert } = useCustomAlert();

  useEffect(() => {
    updateActivity('requesting_leave');
  }, [updateActivity]);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = firestore()
      .collection('leave_requests')
      .where('employeeId', '==', user.uid)
      .onSnapshot((snapshot) => {
        if (!snapshot) {
          setMyLeaves([]);
          setLoadingHistory(false);
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

        // Sort by startDate descending (latest first)
        list.sort((a, b) => b.startDate.localeCompare(a.startDate));

        setMyLeaves(list);
        setLoadingHistory(false);
      }, (err) => {
        console.warn('Error fetching leave history:', err);
        setLoadingHistory(false);
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

  // Set default placeholder dates based on current day + 1 for convenience
  useEffect(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date();
    dayAfter.setDate(dayAfter.getDate() + 2);

    const pad = (n: number) => n.toString().padStart(2, '0');
    
    const formatDateStr = (date: Date) => {
      const year = date.getFullYear();
      const month = pad(date.getMonth() + 1);
      const day = pad(date.getDate());
      return `${year}-${month}-${day}`;
    };

    setStartDate(formatDateStr(tomorrow));
    setEndDate(formatDateStr(dayAfter));
  }, []);

  const validateDateStr = (dateStr: string): boolean => {
    // Regex for YYYY-MM-DD
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateStr)) return false;

    const parts = dateStr.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);

    const date = new Date(year, month, day);
    return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day;
  };

  const handleSubmit = async () => {
    if (!user) return;

    const cleanStart = startDate.trim();
    const cleanEnd = endDate.trim();
    const cleanReason = reason.trim();

    if (!validateDateStr(cleanStart)) {
      showAlert('Validation Error', 'Start Date must be in YYYY-MM-DD format (e.g. 2026-05-23).');
      return;
    }

    if (!validateDateStr(cleanEnd)) {
      showAlert('Validation Error', 'End Date must be in YYYY-MM-DD format (e.g. 2026-05-24).');
      return;
    }

    const startVal = new Date(cleanStart).getTime();
    const endVal = new Date(cleanEnd).getTime();

    if (endVal < startVal) {
      showAlert('Validation Error', 'End Date cannot be chronologically before the Start Date.');
      return;
    }

    if (cleanReason.length < 5) {
      showAlert('Validation Error', 'Please describe the reason for your leave (minimum 5 characters).');
      return;
    }

    setLoading(true);
    try {
      // 1. Write leave request document to Firestore
      await firestore().collection('leave_requests').add({
        employeeId: user.uid,
        startDate: cleanStart,
        endDate: cleanEnd,
        reason: cleanReason,
        status: 'Pending',
        createdAt: firestore.FieldValue.serverTimestamp(),
      });

      // 2. Log employee action to audit trail
      await firestore().collection('activity_logs').add({
        employeeId: user.uid,
        activity: `Requested leave from ${cleanStart} to ${cleanEnd}`,
        timestamp: firestore.FieldValue.serverTimestamp(),
      });

      // 3. Notify Admin manager about the new leave request
      if (user.adminId) {
        await firestore().collection('notifications').add({
          employeeId: user.adminId,
          title: 'New Leave Request',
          body: `${user.name} has submitted a leave request from ${cleanStart} to ${cleanEnd}.`,
          status: 'unread',
          createdAt: firestore.FieldValue.serverTimestamp(),
        });
      } else {
        // Query and notify all Super Admins
        const superAdminsSnap = await firestore()
          .collection('users')
          .where('role', '==', 'SUPER_ADMIN')
          .get();

        const promises = superAdminsSnap.docs.map(doc =>
          firestore().collection('notifications').add({
            employeeId: doc.id,
            title: 'New Leave Request',
            body: `${user.name || 'An employee'} has submitted a leave request from ${cleanStart} to ${cleanEnd}.`,
            status: 'unread',
            createdAt: firestore.FieldValue.serverTimestamp(),
          })
        );
        await Promise.all(promises);
      }

      showAlert('Request Submitted', 'Your leave request has been submitted to your Admin for approval.', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (err: any) {
      console.error('Error submitting leave:', err);
      showAlert('Submission Failed', err.message || 'An error occurred while submitting your leave request.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ flex: 1 }}>
          <Header title="Apply for Leave" showBackButton />

          <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <Card style={styles.formCard}>
          <Text style={styles.title}>New Leave Application</Text>
          <Text style={styles.subtitle}>
            Enter dates and specify details. Your manager will be notified of your request.
          </Text>

          <View style={styles.form}>
            <TouchableOpacity onPress={() => setStartDateModalVisible(true)} activeOpacity={0.7}>
              <View pointerEvents="none">
                <Input
                  label="Start Date (YYYY-MM-DD)"
                  placeholder="Select Start Date"
                  value={startDate}
                  editable={false}
                />
              </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setEndDateModalVisible(true)} activeOpacity={0.7}>
              <View pointerEvents="none">
                <Input
                  label="End Date (YYYY-MM-DD)"
                  placeholder="Select End Date"
                  value={endDate}
                  editable={false}
                />
              </View>
            </TouchableOpacity>

            <Input
              label="Reason / Details"
              placeholder="Specify reason (e.g. Medical, personal vacation, family function)"
              multiline
              numberOfLines={4}
              value={reason}
              onChangeText={setReason}
              style={styles.textArea}
            />

            <Button
              title={loading ? 'Submitting request...' : 'Submit Application'}
              onPress={handleSubmit}
              loading={loading}
              style={styles.submitBtn}
            />
          </View>
        </Card>

        {/* My Applications Card */}
        <Card style={styles.historyCard}>
          <Text style={styles.historyTitle}>My Applications</Text>
          {loadingHistory ? (
            <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: SPACING.md }} />
          ) : myLeaves.length === 0 ? (
            <Text style={styles.emptyText}>You haven't applied for any leaves yet.</Text>
          ) : (
            myLeaves.map((item) => {
              const start = new Date(item.startDate);
              const end = new Date(item.endDate);
              const totalDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

              return (
                <View key={item.id} style={styles.historyItem}>
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
                </View>
              );
            })
          )}
        </Card>
          </ScrollView>

          <CalendarModal
            visible={startDateModalVisible}
            onClose={() => setStartDateModalVisible(false)}
            onSelectDate={(date) => {
              setStartDate(date);
              // Auto-reset or advance end date if it is before the new start date
              if (endDate && date > endDate) {
                setEndDate(date);
              }
            }}
            selectedDate={startDate}
            minDate={new Date().toISOString().split('T')[0]}
            title="Select Start Date"
          />

          <CalendarModal
            visible={endDateModalVisible}
            onClose={() => setEndDateModalVisible(false)}
            onSelectDate={setEndDate}
            selectedDate={endDate}
            minDate={startDate || new Date().toISOString().split('T')[0]}
            title="Select End Date"
          />
        </View>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContainer: {
    padding: SPACING.md,
  },
  formCard: {
    padding: SPACING.lg,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
    lineHeight: 18,
  },
  form: {
    width: '100%',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
    paddingVertical: SPACING.sm,
  },
  submitBtn: {
    marginTop: SPACING.md,
  },
  historyCard: {
    padding: SPACING.md,
    marginTop: SPACING.md,
    marginBottom: SPACING.lg,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.md,
  },
  historyItem: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: SPACING.sm,
  },
  historyItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  historyItemDates: {
    fontSize: 14,
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
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  historyItemReason: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingVertical: SPACING.md,
  },
});
