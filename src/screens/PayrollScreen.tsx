import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  Modal,
  Platform,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import { useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { RootState } from '../redux/store';
import { COLORS, SPACING } from '../constants/theme';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { BottomTabBar } from '../components/BottomTabBar';
import Icon from 'react-native-vector-icons/Ionicons';
import { useCustomAlert } from '../context/CustomAlertContext';

export const PayrollScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const adminUser = useSelector((state: RootState) => state.auth.user);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const { showAlert } = useCustomAlert();

  // Payment states
  const [payments, setPayments] = useState<{[empId: string]: any}>({});
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('UPI');

  const paymentMethods = ['UPI', 'Bank Transfer', 'Cash', 'Cheque'];

  // Listen to current month's payroll payments in real-time
  useEffect(() => {
    const utcDate = new Date();
    const istDate = new Date(utcDate.getTime() + (5.5 * 60 * 60 * 1000));
    const currentMonthPrefix = istDate.toISOString().split('T')[0].substring(0, 7); // 'YYYY-MM'

    const unsubscribe = firestore()
      .collection('payroll_payments')
      .where('month', '==', currentMonthPrefix)
      .onSnapshot((snapshot) => {
        if (snapshot) {
          const map: {[empId: string]: any} = {};
          snapshot.docs.forEach((doc) => {
            const data = doc.data();
            map[data.employeeId] = {
              id: doc.id,
              ...data,
            };
          });
          setPayments(map);
        }
      }, (err) => {
        console.warn('Error fetching payroll payments:', err);
      });

    return () => unsubscribe();
  }, []);

  const handleOpenPaymentModal = (employee: any) => {
    setSelectedEmployee(employee);
    setSelectedPaymentMethod('UPI');
    setPaymentModalVisible(true);
  };

  const handleUpdatePaymentStatus = async () => {
    if (!selectedEmployee) return;

    try {
      const utcDate = new Date();
      const istDate = new Date(utcDate.getTime() + (5.5 * 60 * 60 * 1000));
      const currentMonthPrefix = istDate.toISOString().split('T')[0].substring(0, 7); // 'YYYY-MM'
      const docId = `${selectedEmployee.uid}_${currentMonthPrefix}`;

      await firestore().collection('payroll_payments').doc(docId).set({
        employeeId: selectedEmployee.uid,
        month: currentMonthPrefix,
        status: 'Paid',
        paymentMethod: selectedPaymentMethod,
        amount: selectedEmployee.netPay,
        paidAt: firestore.FieldValue.serverTimestamp(),
        paidBy: adminUser?.uid || 'system',
      });

      // Send notification to employee
      await firestore().collection('notifications').add({
        employeeId: selectedEmployee.uid,
        title: 'Salary Disbursed',
        body: `Your salary of ₹${selectedEmployee.netPay} for the month of ${currentMonthPrefix} has been marked as Paid via ${selectedPaymentMethod}.`,
        status: 'unread',
        createdAt: firestore.FieldValue.serverTimestamp(),
      });

      setPaymentModalVisible(false);
      setSelectedEmployee(null);
      showAlert('Success', `Salary paid successfully via ${selectedPaymentMethod} to ${selectedEmployee.name}.`);
    } catch (err: any) {
      console.warn('Error marking salary as paid:', err);
      showAlert('Error', err.message || 'Failed to update payment status.');
    }
  };

  const handleResetPaymentStatus = (empId: string, empName: string) => {
    showAlert(
      'Reset Payment Status',
      `Are you sure you want to mark ${empName}'s salary as unpaid?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Unpaid',
          style: 'destructive',
          onPress: async () => {
            try {
              const utcDate = new Date();
              const istDate = new Date(utcDate.getTime() + (5.5 * 60 * 60 * 1000));
              const currentMonthPrefix = istDate.toISOString().split('T')[0].substring(0, 7);
              const docId = `${empId}_${currentMonthPrefix}`;

              await firestore().collection('payroll_payments').doc(docId).delete();
              showAlert('Success', `${empName}'s payment status has been reset to unpaid.`);
            } catch (err: any) {
              console.warn('Error resetting payment status:', err);
              showAlert('Error', err.message || 'Failed to reset payment status.');
            }
          }
        }
      ]
    );
  };

  useEffect(() => {
    if (!adminUser) return;

    let query = firestore().collection('users').where('role', '==', 'EMPLOYEE');
    if (adminUser.role !== 'SUPER_ADMIN') {
      query = query.where('adminId', '==', adminUser.uid);
    }

    const unsubscribe = query.onSnapshot(
      async (usersSnapshot) => {
        if (!usersSnapshot) {
          setLoading(false);
          return;
        }

        // Get current calendar month info in local IST
        const utcDate = new Date();
        const istDate = new Date(utcDate.getTime() + (5.5 * 60 * 60 * 1000));
        const currentMonthPrefix = istDate.toISOString().split('T')[0].substring(0, 7); // 'YYYY-MM'
        const currentYear = istDate.getFullYear();
        const currentMonth = istDate.getMonth();

        const list = await Promise.all(
          usersSnapshot.docs.map(async (doc) => {
            const userData = doc.data();
            const empId = doc.id;

            // Fetch employee profile details, attendance records, and leave requests in parallel
            const [empDoc, attendanceSnapshot, leavesSnapshot] = await Promise.all([
              firestore().collection('employees').doc(empId).get(),
              firestore().collection('attendance').where('employeeId', '==', empId).get(),
              firestore().collection('leave_requests').where('employeeId', '==', empId).where('status', '==', 'Approved').get(),
            ]);

            const empData = empDoc.data() || {};
            const salary = parseFloat(empData.salary) || 0;
            const allowedLeaves = parseInt(empData.allowedLeaves) || 0;

            let presentCount = 0;
            let lateCount = 0;
            let absentCount = 0;

            attendanceSnapshot.docs.forEach((aDoc) => {
              const aData = aDoc.data();
              if (aData.date && aData.date.startsWith(currentMonthPrefix)) {
                if (aData.status === 'Present') presentCount++;
                if (aData.status === 'Late') {
                  presentCount++;
                  lateCount++;
                }
                if (aData.status === 'Absent') absentCount++;
              }
            });

            let approvedDaysThisMonth = 0;
            let unpaidDaysThisMonth = 0;
            let legacyPaidDaysThisMonth = 0;
            let explicitPaidDaysThisMonth = 0;

            leavesSnapshot.docs.forEach((lDoc) => {
              const lData = lDoc.data();
              try {
                if (lData.startDate && lData.endDate) {
                  const reqStart = new Date(lData.startDate);
                  const reqEnd = new Date(lData.endDate);
                  const startOfMonth = new Date(currentYear, currentMonth, 1);
                  const endOfMonth = new Date(currentYear, currentMonth + 1, 0);

                  if (!(reqEnd < startOfMonth || reqStart > endOfMonth)) {
                    const overlapStart = new Date(Math.max(reqStart.getTime(), startOfMonth.getTime()));
                    const overlapEnd = new Date(Math.min(reqEnd.getTime(), endOfMonth.getTime()));
                    const diffTime = Math.abs(overlapEnd.getTime() - overlapStart.getTime());
                    const overlappingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
                    approvedDaysThisMonth += overlappingDays;

                    const totalTime = Math.abs(reqEnd.getTime() - reqStart.getTime());
                    const totalDays = Math.ceil(totalTime / (1000 * 60 * 60 * 24)) + 1;

                    if (lData.unpaidDaysCount !== undefined) {
                      unpaidDaysThisMonth += (overlappingDays / totalDays) * lData.unpaidDaysCount;
                      explicitPaidDaysThisMonth += (overlappingDays / totalDays) * (lData.paidDaysCount || 0);
                    } else if (lData.isPaid === false) {
                      unpaidDaysThisMonth += overlappingDays;
                    } else if (lData.isPaid === true) {
                      explicitPaidDaysThisMonth += overlappingDays;
                    } else {
                      legacyPaidDaysThisMonth += overlappingDays;
                    }
                  }
                }
              } catch (e) {
                console.warn('Error parsing leave date overlap:', e);
              }
            });

            // Calculate Salary Deductions
            const dailyWage = salary / 30;
            
            // Calculate net deducted leaves (unpaid days + legacy excess days)
            const remainingAllowed = Math.max(0, allowedLeaves - explicitPaidDaysThisMonth);
            const legacyExcess = Math.max(0, legacyPaidDaysThisMonth - remainingAllowed);
            const extraLeaves = unpaidDaysThisMonth + legacyExcess;
            const leavesDeduction = extraLeaves * dailyWage;

            // Late Logins Deduction
            const lateDeduction = lateCount * 0.5 * dailyWage;

            // Absent Days Deduction
            const absentDeduction = absentCount * dailyWage;

            // Totals
            const totalDeductions = leavesDeduction + lateDeduction + absentDeduction;
            const netPay = Math.max(0, salary - totalDeductions);

            return {
              uid: empId,
              name: userData.name || 'Unnamed Employee',
              email: userData.email || '',
              department: empData.department || userData.department || 'General',
              salary,
              allowedLeaves,
              approvedLeaveDays: approvedDaysThisMonth,
              extraLeaves,
              leavesDeduction,
              lateCount,
              lateDeduction,
              absentCount,
              absentDeduction,
              totalDeductions,
              netPay,
            };
          })
        );

        setEmployees(list);
        setLoading(false);
      },
      (error) => {
        console.warn('Payroll query error:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [adminUser]);

  const getFilteredEmployees = () => {
    return employees.filter((item) => {
      const name = item.name ? item.name.toLowerCase() : '';
      const dept = item.department ? item.department.toLowerCase() : '';
      const query = searchQuery.toLowerCase();
      return name.includes(query) || dept.includes(query);
    });
  };

  const renderItem = ({ item }: { item: any }) => {
    const payment = payments[item.uid];
    return (
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.headerLeft}>
            <View style={styles.iconBox}>
              <Icon name="cash-outline" size={20} color={COLORS.success} />
            </View>
            <View>
              <Text style={styles.nameText}>{item.name}</Text>
              <Text style={styles.deptText}>{item.department}</Text>
            </View>
          </View>
          <Text style={styles.netPayValue}>₹{item.netPay.toFixed(2)}</Text>
        </View>

        <View style={styles.payrollDetails}>
          <View style={styles.payrollRow}>
            <Text style={styles.payrollLabel}>Base Salary</Text>
            <Text style={styles.payrollValue}>₹{item.salary.toFixed(2)}</Text>
          </View>

          <View style={styles.payrollRow}>
            <Text style={styles.payrollLabel}>
              Leaves Cut ({Number(item.extraLeaves.toFixed(2))}d deducted • {item.approvedLeaveDays}d taken)
            </Text>
            <Text style={item.leavesDeduction > 0 ? styles.cutText : styles.payrollValue}>
              {item.leavesDeduction > 0 ? `-₹${item.leavesDeduction.toFixed(2)}` : '₹0.00'}
            </Text>
          </View>

          <View style={styles.payrollRow}>
            <Text style={styles.payrollLabel}>Late Cut ({item.lateCount} times • 0.5d penalty)</Text>
            <Text style={item.lateDeduction > 0 ? styles.cutText : styles.payrollValue}>
              {item.lateDeduction > 0 ? `-₹${item.lateDeduction.toFixed(2)}` : '₹0.00'}
            </Text>
          </View>

          <View style={styles.payrollRow}>
            <Text style={styles.payrollLabel}>Absent Cut ({item.absentCount}d absent • 1.0d penalty)</Text>
            <Text style={item.absentDeduction > 0 ? styles.cutText : styles.payrollValue}>
              {item.absentDeduction > 0 ? `-₹${item.absentDeduction.toFixed(2)}` : '₹0.00'}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.netPayRow}>
            <Text style={styles.netPayLabel}>Total Monthly Deductions</Text>
            <Text style={item.totalDeductions > 0 ? styles.cutText : styles.payrollValue}>
              {item.totalDeductions > 0 ? `-₹${item.totalDeductions.toFixed(2)}` : '₹0.00'}
            </Text>
          </View>

          <View style={[styles.netPayRow, { marginTop: 6 }]}>
            <Text style={[styles.netPayLabel, { fontSize: 15 }]}>Net Salary Payable</Text>
            <Text style={[styles.netPayValue, { fontSize: 18 }]}>₹{item.netPay.toFixed(2)}</Text>
          </View>

          <View style={styles.paymentSection}>
            <View style={styles.divider} />
            <View style={styles.paymentRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.paymentStatusLabel}>PAYMENT STATUS</Text>
                {payment?.status === 'Paid' ? (
                  <Text style={styles.paymentStatusPaid}>
                    Paid via {payment.paymentMethod}
                  </Text>
                ) : (
                  <Text style={styles.paymentStatusUnpaid}>Unpaid</Text>
                )}
              </View>
              {payment?.status === 'Paid' ? (
                <TouchableOpacity
                  style={styles.unpayBtn}
                  activeOpacity={0.7}
                  onPress={() => handleResetPaymentStatus(item.uid, item.name)}
                >
                  <Text style={styles.unpayBtnText}>Mark Unpaid</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.payBtn}
                  activeOpacity={0.7}
                  onPress={() => handleOpenPaymentModal(item)}
                >
                  <Text style={styles.payBtnText}>Mark as Paid</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Employee Payroll" showBackButton />

      <View style={styles.searchBarContainer}>
        <Icon name="search-outline" size={18} color={COLORS.textSecondary} style={styles.searchIcon} />
        <TextInput
          placeholder="Search by Employee Name or Department..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={styles.searchInput}
          autoCorrect={false}
        />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Calculating monthly salary figures...</Text>
        </View>
      ) : (
        <FlatList
          data={getFilteredEmployees()}
          renderItem={renderItem}
          keyExtractor={(item) => item.uid}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No employee payroll records found.</Text>
          }
        />
      )}

      {/* Payment Selection Modal */}
      <Modal
        visible={paymentModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setPaymentModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Mark Salary as Paid</Text>
              <TouchableOpacity onPress={() => setPaymentModalVisible(false)}>
                <Icon name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalDescription}>
              Select the payment method used to pay {selectedEmployee?.name || 'employee'}.
            </Text>

            <View style={styles.methodsList}>
              {paymentMethods.map((method) => {
                const isSelected = method === selectedPaymentMethod;
                return (
                  <TouchableOpacity
                    key={method}
                    style={[styles.methodItem, isSelected && styles.methodItemSelected]}
                    onPress={() => setSelectedPaymentMethod(method)}
                  >
                    <Text style={[styles.methodText, isSelected && styles.methodTextSelected]}>
                      {method}
                    </Text>
                    {isSelected ? (
                      <Icon name="checkmark-circle" size={20} color={COLORS.success} />
                    ) : (
                      <Icon name="ellipse-outline" size={20} color={COLORS.border} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setPaymentModalVisible(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={handleUpdatePaymentStatus}
              >
                <Text style={styles.confirmBtnText}>Confirm Paid</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {adminUser && (
        <BottomTabBar role={adminUser.role} activeTab="Payroll" navigation={navigation} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: SPACING.sm,
    height: 44,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    paddingVertical: 0,
  },
  listContainer: {
    padding: SPACING.md,
    paddingBottom: 110,
  },
  card: {
    marginBottom: SPACING.md,
    padding: SPACING.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.success + '1A',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  nameText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
  },
  deptText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  payrollDetails: {
    marginTop: SPACING.xs,
  },
  payrollRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  payrollLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  payrollValue: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '600',
  },
  cutText: {
    fontSize: 13,
    color: COLORS.danger,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.sm,
  },
  netPayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  netPayLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
  },
  netPayValue: {
    fontSize: 15,
    fontWeight: '900',
    color: COLORS.success,
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
  emptyText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    fontSize: 14,
    marginTop: SPACING.xxl,
  },
  // Payment Section Styles
  paymentSection: {
    marginTop: SPACING.xs,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  paymentStatusLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '700',
  },
  paymentStatusPaid: {
    fontSize: 13,
    color: COLORS.success,
    fontWeight: '700',
    marginTop: 2,
  },
  paymentStatusUnpaid: {
    fontSize: 13,
    color: COLORS.textLight,
    fontWeight: '700',
    marginTop: 2,
  },
  payBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  payBtnText: {
    color: COLORS.surface,
    fontSize: 12,
    fontWeight: '800',
  },
  unpayBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  unpayBtnText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '800',
  },
  // Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: SPACING.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: SPACING.sm,
    marginBottom: SPACING.md,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.text,
  },
  modalDescription: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: SPACING.md,
    lineHeight: 18,
  },
  methodsList: {
    marginBottom: SPACING.lg,
  },
  methodItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    marginBottom: SPACING.sm,
    backgroundColor: '#FAFAFA',
  },
  methodItemSelected: {
    borderColor: COLORS.success,
    backgroundColor: COLORS.success + '0A',
  },
  methodText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600',
  },
  methodTextSelected: {
    color: COLORS.success,
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
    backgroundColor: COLORS.surface,
  },
  cancelBtnText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  confirmBtn: {
    flex: 1,
    height: 44,
    backgroundColor: COLORS.success,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: SPACING.sm,
  },
  confirmBtnText: {
    color: COLORS.surface,
    fontSize: 14,
    fontWeight: '700',
  },
});
