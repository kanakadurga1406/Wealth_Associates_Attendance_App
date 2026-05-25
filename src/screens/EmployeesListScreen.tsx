import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import firestore from '@react-native-firebase/firestore';
import { useSelector } from 'react-redux';
import { RootState } from '../redux/store';
import { COLORS, SPACING } from '../constants/theme';
import { Header } from '../components/Header';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import Icon from 'react-native-vector-icons/Ionicons';
import { useCustomAlert } from '../context/CustomAlertContext';

interface AdminItem {
  uid: string;
  name: string;
  email: string;
}

export const EmployeesListScreen: React.FC = () => {
  const adminUser = useSelector((state: RootState) => state.auth.user);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { showAlert } = useCustomAlert();

  // Edit Employee States
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<any>(null);
  
  // Edit Form Fields
  const [editName, setEditName] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editSalary, setEditSalary] = useState('');
  const [editAllowedLeaves, setEditAllowedLeaves] = useState('');
  const [editWorkTimings, setEditWorkTimings] = useState('');
  const [editWeekOff, setEditWeekOff] = useState('');
  const [editSelectedAdmin, setEditSelectedAdmin] = useState<AdminItem | null>(null);

  // Selector visibility and search
  const [admins, setAdmins] = useState<AdminItem[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editWeekOffModalVisible, setEditWeekOffModalVisible] = useState(false);
  const [editAdminModalVisible, setEditAdminModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  const weekDays = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];

  // Fetch Admins list for SUPER_ADMIN on mount/user role update
  useEffect(() => {
    if (adminUser?.role === 'SUPER_ADMIN') {
      const fetchAdmins = async () => {
        try {
          setLoadingAdmins(true);
          const snapshot = await firestore()
            .collection('users')
            .where('role', '==', 'ADMIN')
            .get();
          const list = snapshot.docs.map((doc) => ({
            uid: doc.id,
            name: doc.data().name || 'Unnamed Admin',
            email: doc.data().email || '',
          }));
          list.sort((a, b) => a.name.localeCompare(b.name));
          setAdmins(list);
          setLoadingAdmins(false);
        } catch (err) {
          console.warn('Error fetching admins:', err);
          setLoadingAdmins(false);
        }
      };
      fetchAdmins();
    }
  }, [adminUser]);

  useEffect(() => {
    if (!adminUser) return;

    let query = firestore().collection('users').where('role', '==', 'EMPLOYEE');
    if (adminUser.role !== 'SUPER_ADMIN') {
      query = query.where('adminId', '==', adminUser.uid);
    }

    const unsubscribe = query.onSnapshot(
      async (usersSnapshot) => {
        setLoading(true);
        if (!usersSnapshot) {
          console.log('EmployeesListScreen: received null usersSnapshot');
          return;
        }

        console.log('--- EMPLOYEES DIRECTORY FETCH ---');
        console.log('Logged-in Admin UID:', adminUser.uid);
        console.log('Number of raw employees matched in query:', usersSnapshot.size);

        // Hydrate with employee collection (department, phone) and admin manager name
        const hydratedList = [];
        for (const doc of usersSnapshot.docs) {
          const userData = doc.data();

          const empDoc = await firestore().collection('employees').doc(doc.id).get();
          const empData = empDoc.data() || {};

          let adminName = '';
          const adminId = userData.adminId || empDoc.data()?.adminId;
          if (adminId) {
            const adminDoc = await firestore().collection('users').doc(adminId).get();
            if (adminDoc.exists()) {
              adminName = adminDoc.data()?.name || 'Unnamed Admin';
            }
          }

          hydratedList.push({
            uid: doc.id,
            ...userData,
            ...empData,
            adminName
          });
        }

        console.log('Hydrated List Size:', hydratedList.length);
        console.log('---------------------------------');

        setEmployees(hydratedList);
        setLoading(false);
      },
      (error) => {
        console.warn('Employees fetch error:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [adminUser]);

  const handleDeleteEmployee = (uid: string, name: string) => {
    showAlert(
      'Remove Employee',
      `Are you sure you want to remove ${name}? This will delete their profiles from the directory.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              // Delete from users collection
              await firestore().collection('users').doc(uid).delete();
              // Delete from employees collection
              await firestore().collection('employees').doc(uid).delete();

              // Note: Auth account deletion requires admin API. Since user is removed from database,
              // they will be blocked from logging in (LoginScreen checks for user doc existence).

              showAlert('Success', `Employee ${name} removed.`);
            } catch (err: any) {
              console.warn('Employee delete error:', err);
              setLoading(false);
              showAlert('Error', err.message || 'Unable to remove employee.');
            }
          },
        },
      ]
    );
  };

  const handleOpenEditModal = (employee: any) => {
    setEditingEmployee(employee);
    setEditName(employee.name || '');
    setEditDepartment(employee.department || '');
    setEditPhone(employee.phone || '');
    setEditSalary(String(employee.salary || ''));
    setEditAllowedLeaves(String(employee.allowedLeaves || ''));
    setEditWorkTimings(employee.workTimings || '09:00 - 18:00');
    setEditWeekOff(employee.weekOff || 'Sunday');
    
    if (adminUser?.role === 'SUPER_ADMIN' && employee.adminId) {
      const currentAdmin = admins.find(a => a.uid === employee.adminId);
      if (currentAdmin) {
        setEditSelectedAdmin(currentAdmin);
      } else {
        setEditSelectedAdmin({
          uid: employee.adminId,
          name: employee.adminName || 'Unnamed Admin',
          email: ''
        });
      }
    } else {
      setEditSelectedAdmin(null);
    }
    
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!editingEmployee) return;

    if (!editName || !editDepartment || !editPhone || !editSalary || !editAllowedLeaves || !editWorkTimings || !editWeekOff) {
      showAlert('Validation Error', 'All fields are required.');
      return;
    }

    if (adminUser?.role === 'SUPER_ADMIN' && !editSelectedAdmin) {
      showAlert('Validation Error', 'Please select an Admin Manager.');
      return;
    }

    setSaving(true);
    try {
      const uid = editingEmployee.uid;
      const adminId = adminUser?.role === 'SUPER_ADMIN' ? editSelectedAdmin!.uid : (editingEmployee.adminId || adminUser?.uid);

      // 1. Update users collection
      const userUpdates: any = {
        name: editName.trim(),
      };
      if (adminUser?.role === 'SUPER_ADMIN') {
        userUpdates.adminId = adminId;
      }
      await firestore().collection('users').doc(uid).update(userUpdates);

      // 2. Update employees collection
      const employeeUpdates: any = {
        department: editDepartment.trim(),
        phone: editPhone.trim(),
        salary: parseFloat(editSalary) || 0,
        allowedLeaves: parseInt(editAllowedLeaves) || 0,
        workTimings: editWorkTimings.trim(),
        weekOff: editWeekOff,
      };
      if (adminUser?.role === 'SUPER_ADMIN') {
        employeeUpdates.adminId = adminId;
      }
      
      await firestore().collection('employees').doc(uid).update(employeeUpdates);

      // 3. Log activity
      const callerUid = adminUser?.uid || 'system';
      await firestore().collection('activity_logs').add({
        employeeId: callerUid,
        activity: `Updated employee profile for ${editName.trim()} (${uid}). Manager: ${editSelectedAdmin ? editSelectedAdmin.name : 'self'}`,
        timestamp: firestore.FieldValue.serverTimestamp(),
      });

      showAlert('Success', `Employee details updated successfully.`);
      setEditModalVisible(false);
    } catch (err: any) {
      console.error('Update Employee error:', err);
      showAlert('Error', err.message || 'Unable to update employee details.');
    } finally {
      setSaving(false);
    }
  };

  const getFilteredAdmins = () => {
    return admins.filter(item => {
      const name = item.name ? item.name.toLowerCase() : '';
      const email = item.email ? item.email.toLowerCase() : '';
      const query = searchQuery ? searchQuery.toLowerCase() : '';
      return name.includes(query) || email.includes(query);
    });
  };

  const renderItem = ({ item }: { item: any }) => {
    return (
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.detailText}>{item.email}</Text>
            <Text style={styles.detailText}>Dept: {item.department || 'General'} • Phone: {item.phone || '-'}</Text>
            <Text style={styles.detailText}>
              Salary: ₹{item.salary || '0'} • Week Off: {item.weekOff || 'Sunday'}
            </Text>
            <Text style={styles.detailText}>
              Allowed Leaves: {item.allowedLeaves || '2'} • Timings: {item.workTimings || '09:00 - 18:00'}
            </Text>
            {adminUser?.role === 'SUPER_ADMIN' && item.adminName ? (
              <Text style={styles.adminText}>Manager: {item.adminName}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.actionsContainer}>
          <Button
            title="Edit Details"
            variant="outline"
            onPress={() => handleOpenEditModal(item)}
            style={[styles.actionBtn, { marginRight: SPACING.sm }]}
          />
          <Button
            title="Remove Employee"
            variant="danger"
            onPress={() => handleDeleteEmployee(item.uid, item.name)}
            style={styles.actionBtn}
          />
        </View>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Employees Directory" showBackButton />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Fetching employee records...</Text>
        </View>
      ) : (
        <FlatList
          data={employees}
          renderItem={renderItem}
          keyExtractor={(item) => item.uid}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No employees registered yet.</Text>
          }
        />
      )}

      {/* Edit Employee Modal */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalWrapper}>
              <View style={styles.editCard}>
                <View style={styles.editHeader}>
                  <Text style={styles.editTitle}>Edit Employee Details</Text>
                  <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                    <Icon name="close" size={24} color={COLORS.text} />
                  </TouchableOpacity>
                </View>

                <ScrollView 
                  contentContainerStyle={styles.editScrollContent} 
                  keyboardShouldPersistTaps="handled"
                >
                  <Input
                    label="Employee Name"
                    placeholder="Jane Doe"
                    value={editName}
                    onChangeText={setEditName}
                    autoCorrect={false}
                  />

                  <Input
                    label="Department"
                    placeholder="e.g. Engineering, Sales"
                    value={editDepartment}
                    onChangeText={setEditDepartment}
                    autoCorrect={false}
                  />

                  <Input
                    label="Phone Number"
                    placeholder="e.g. +91 9876543210"
                    value={editPhone}
                    onChangeText={setEditPhone}
                    keyboardType="phone-pad"
                    autoCorrect={false}
                  />

                  <Input
                    label="Monthly Base Salary (INR)"
                    placeholder="e.g. 10000"
                    value={editSalary}
                    onChangeText={setEditSalary}
                    keyboardType="numeric"
                    autoCorrect={false}
                  />

                  <Input
                    label="Allowed Leaves per Month"
                    placeholder="e.g. 2"
                    value={editAllowedLeaves}
                    onChangeText={setEditAllowedLeaves}
                    keyboardType="numeric"
                    autoCorrect={false}
                  />

                  <Input
                    label="Work Timings"
                    placeholder="e.g. 09:00 - 18:00"
                    value={editWorkTimings}
                    onChangeText={setEditWorkTimings}
                    autoCorrect={false}
                  />

                  {/* Week Off Selector */}
                  <View style={styles.editSelectorContainer}>
                    <Text style={styles.editSelectorLabel}>Week Off Day</Text>
                    <TouchableOpacity 
                      style={styles.editSelectorField} 
                      activeOpacity={0.7}
                      onPress={() => {
                        Keyboard.dismiss();
                        setEditWeekOffModalVisible(true);
                      }}
                    >
                      <Text style={editWeekOff ? styles.editSelectorValueText : styles.editSelectorPlaceholderText}>
                        {editWeekOff || 'Select Week Off Day'}
                      </Text>
                      <Icon name="chevron-down" size={16} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  {/* Admin Manager selector (visible only for SUPER_ADMIN) */}
                  {adminUser?.role === 'SUPER_ADMIN' && (
                    <View style={styles.editSelectorContainer}>
                      <Text style={styles.editSelectorLabel}>Assign Admin Manager</Text>
                      <TouchableOpacity 
                        style={styles.editSelectorField} 
                        activeOpacity={0.7}
                        onPress={() => {
                          Keyboard.dismiss();
                          setEditAdminModalVisible(true);
                        }}
                      >
                        <Text style={editSelectedAdmin ? styles.editSelectorValueText : styles.editSelectorPlaceholderText}>
                          {editSelectedAdmin 
                            ? `${editSelectedAdmin.name} (${editSelectedAdmin.email})` 
                            : 'Select Admin Manager'}
                        </Text>
                        <Icon name="chevron-down" size={16} color={COLORS.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  )}
                </ScrollView>

                <View style={styles.editActions}>
                  <Button
                    title="Cancel"
                    variant="outline"
                    onPress={() => setEditModalVisible(false)}
                    style={[styles.editActionBtn, { marginRight: SPACING.sm }]}
                  />
                  <Button
                    title="Save Changes"
                    loading={saving}
                    onPress={handleSaveEdit}
                    style={styles.editActionBtn}
                  />
                </View>
              </View>

              {/* Nested Selector Overlay: Admin Selection */}
              {editAdminModalVisible && (
                <View style={styles.nestedModalContainer}>
                  <TouchableOpacity 
                    style={styles.nestedBackdrop} 
                    activeOpacity={1} 
                    onPress={() => setEditAdminModalVisible(false)} 
                  />
                  <View style={styles.nestedModalContent}>
                    <View style={styles.nestedModalHeader}>
                      <Text style={styles.nestedModalTitle}>Select Admin Manager</Text>
                      <TouchableOpacity onPress={() => setEditAdminModalVisible(false)}>
                        <Icon name="close" size={24} color={COLORS.text} />
                      </TouchableOpacity>
                    </View>
                    
                    <View style={styles.nestedSearchBarContainer}>
                      <Icon name="search-outline" size={18} color={COLORS.textSecondary} style={styles.nestedSearchIcon} />
                      <TextInput
                        placeholder="Search Admin Name or Email..."
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        style={styles.nestedSearchInput}
                        placeholderTextColor={COLORS.textLight}
                        autoCorrect={false}
                      />
                    </View>

                    <FlatList
                      data={getFilteredAdmins()}
                      keyExtractor={(item) => item.uid}
                      renderItem={({ item }) => (
                        <TouchableOpacity 
                          style={styles.nestedItem} 
                          onPress={() => {
                            setEditSelectedAdmin(item);
                            setEditAdminModalVisible(false);
                            setSearchQuery('');
                          }}
                        >
                          <View>
                            <Text style={styles.nestedItemNameText}>{item.name}</Text>
                            <Text style={styles.nestedItemEmailText}>{item.email}</Text>
                          </View>
                          <Icon name="chevron-forward" size={16} color={COLORS.border} />
                        </TouchableOpacity>
                      )}
                      ItemSeparatorComponent={() => <View style={styles.nestedItemSeparator} />}
                      ListEmptyComponent={
                        <View style={styles.nestedEmptyContainer}>
                          {loadingAdmins ? (
                            <ActivityIndicator size="small" color={COLORS.primary} style={{ marginBottom: 12 }} />
                          ) : (
                            <Text style={styles.nestedEmptyText}>No Admins configured yet.</Text>
                          )}
                        </View>
                      }
                    />
                  </View>
                </View>
              )}

              {/* Nested Selector Overlay: Week Off Selection */}
              {editWeekOffModalVisible && (
                <View style={styles.nestedModalContainer}>
                  <TouchableOpacity 
                    style={styles.nestedBackdrop} 
                    activeOpacity={1} 
                    onPress={() => setEditWeekOffModalVisible(false)} 
                  />
                  <View style={styles.nestedModalContent}>
                    <View style={styles.nestedModalHeader}>
                      <Text style={styles.nestedModalTitle}>Select Week Off Day</Text>
                      <TouchableOpacity onPress={() => setEditWeekOffModalVisible(false)}>
                        <Icon name="close" size={24} color={COLORS.text} />
                      </TouchableOpacity>
                    </View>
                    
                    <FlatList
                      data={weekDays}
                      keyExtractor={(item) => item}
                      renderItem={({ item }) => (
                        <TouchableOpacity 
                          style={styles.nestedItem} 
                          onPress={() => {
                            setEditWeekOff(item);
                            setEditWeekOffModalVisible(false);
                          }}
                        >
                          <Text style={styles.nestedItemNameText}>{item}</Text>
                          <Icon name="chevron-forward" size={16} color={COLORS.border} />
                        </TouchableOpacity>
                      )}
                      ItemSeparatorComponent={() => <View style={styles.nestedItemSeparator} />}
                    />
                  </View>
                </View>
              )}
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  listContainer: {
    padding: SPACING.md,
  },
  card: {
    marginBottom: SPACING.md,
  },
  cardHeader: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: SPACING.sm,
  },
  name: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  detailText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  adminText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '700',
    marginTop: 4,
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: SPACING.md,
  },
  actionBtn: {
    height: 36,
    flex: 1,
    borderRadius: 6,
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    fontSize: 14,
    marginTop: SPACING.xxl,
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
  // Modal Backdrops and Wrappers
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalWrapper: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    width: '92%',
    maxHeight: '80%',
    padding: SPACING.md,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  editHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: SPACING.sm,
    marginBottom: SPACING.md,
  },
  editTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  editScrollContent: {
    paddingBottom: SPACING.md,
  },
  editSelectorContainer: {
    marginBottom: SPACING.md,
  },
  editSelectorLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  editSelectorField: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    height: 48,
    backgroundColor: '#FAFAFA',
  },
  editSelectorValueText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600',
  },
  editSelectorPlaceholderText: {
    fontSize: 14,
    color: COLORS.textLight,
  },
  editActions: {
    flexDirection: 'row',
    marginTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.md,
  },
  editActionBtn: {
    flex: 1,
    height: 44,
  },
  // Nested Overlay Styles (mimics bottom sheets overlaying the modal)
  nestedModalContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10000,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  nestedBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  nestedModalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '75%',
    padding: SPACING.md,
  },
  nestedModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: SPACING.sm,
    marginBottom: SPACING.md,
  },
  nestedModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  nestedSearchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: SPACING.sm,
    height: 44,
    marginBottom: SPACING.md,
    backgroundColor: '#F9F9F9',
  },
  nestedSearchIcon: {
    marginRight: 6,
  },
  nestedSearchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    paddingVertical: 0,
  },
  nestedItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xs,
  },
  nestedItemNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  nestedItemEmailText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  nestedItemSeparator: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  nestedEmptyContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  nestedEmptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
});

