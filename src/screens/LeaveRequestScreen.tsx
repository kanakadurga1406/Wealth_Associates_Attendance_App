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
  TouchableOpacity,
} from 'react-native';
import { useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
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
import { BottomTabBar } from '../components/BottomTabBar';
import Icon from 'react-native-vector-icons/Ionicons';

export const LeaveRequestScreen: React.FC = () => {
  const user = useSelector((state: RootState) => state.auth.user);
  const navigation = useNavigation<any>();
  const { showAlert } = useCustomAlert();
  
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  
  const [startDateModalVisible, setStartDateModalVisible] = useState(false);
  const [endDateModalVisible, setEndDateModalVisible] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const { updateActivity } = useRealTimeStatus();

  useEffect(() => {
    updateActivity('requesting_leave');
  }, [updateActivity]);

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
      showAlert('Validation Error', 'Start Date must be in YYYY-MM-DD format.');
      return;
    }

    if (!validateDateStr(cleanEnd)) {
      showAlert('Validation Error', 'End Date must be in YYYY-MM-DD format.');
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
      await firestore().collection('leave_requests').add({
        employeeId: user.uid,
        startDate: cleanStart,
        endDate: cleanEnd,
        reason: cleanReason,
        status: 'Pending',
        createdAt: firestore.FieldValue.serverTimestamp(),
      });

      await firestore().collection('activity_logs').add({
        employeeId: user.uid,
        activity: `Requested leave from ${cleanStart} to ${cleanEnd}`,
        timestamp: firestore.FieldValue.serverTimestamp(),
      });

      if (user.adminId) {
        await firestore().collection('notifications').add({
          employeeId: user.adminId,
          title: 'New Leave Request',
          body: `${user.name} has submitted a leave request from ${cleanStart} to ${cleanEnd}.`,
          status: 'unread',
          createdAt: firestore.FieldValue.serverTimestamp(),
        });
      } else {
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

          <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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
          </ScrollView>

          <CalendarModal
            visible={startDateModalVisible}
            onClose={() => setStartDateModalVisible(false)}
            onSelectDate={(date) => {
              setStartDate(date);
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

          {/* Sleek Bottom Navigation Tab Bar */}
          <BottomTabBar role="EMPLOYEE" activeTab="Requests" navigation={navigation} />
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
    paddingBottom: 110, // leave space for bottom tab bar
  },
  formCard: {
    padding: SPACING.lg,
  },
  title: {
    fontSize: 16,
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
    fontSize: 15,
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
  emptyText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingVertical: SPACING.md,
  },

  // Bottom Tab Bar
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
    marginTop: -20,
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
  },
});
