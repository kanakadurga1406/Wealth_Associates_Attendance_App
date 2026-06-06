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
import { useNavigation } from '@react-navigation/native';
import { COLORS, SPACING } from '../constants/theme';
import { Header } from '../components/Header';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { TimePickerModal } from '../components/TimePickerModal';
import Icon from 'react-native-vector-icons/Ionicons';
import { useCustomAlert } from '../context/CustomAlertContext';
import { BottomTabBar } from '../components/BottomTabBar';

interface AdminItem {
  uid: string;
  name: string;
  email: string;
}

export const EmployeesListScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const adminUser = useSelector((state: RootState) => state.auth.user);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const { showAlert } = useCustomAlert();

  // Refs for tracking latest states in onEndReached callback to avoid stale closures
  const loadingRef = React.useRef(loading);
  const loadingMoreRef = React.useRef(loadingMore);
  const hasMoreRef = React.useRef(hasMore);
  const lastDocRef = React.useRef(lastDoc);

  React.useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  React.useEffect(() => {
    loadingMoreRef.current = loadingMore;
  }, [loadingMore]);

  React.useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  React.useEffect(() => {
    lastDocRef.current = lastDoc;
  }, [lastDoc]);

  // Edit Employee States
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<any>(null);
  
  // Edit Form Fields
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editSalary, setEditSalary] = useState('');
  const [editAllowedLeaves, setEditAllowedLeaves] = useState('');
  const [editWorkTimings, setEditWorkTimings] = useState('');
  const [editWeekOffs, setEditWeekOffs] = useState<string[]>([]);
  const [editSelectedAdmin, setEditSelectedAdmin] = useState<AdminItem | null>(null);

  // Time Picker States
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [timePickerTarget, setTimePickerTarget] = useState<'start' | 'end'>('start');

  // Selector visibility and search
  const [admins, setAdmins] = useState<AdminItem[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [editWeekOffModalVisible, setEditWeekOffModalVisible] = useState(false);
  const [editAdminModalVisible, setEditAdminModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  // Department Selection States
  const [departments, setDepartments] = useState<string[]>([]);
  const [departmentModalVisible, setDepartmentModalVisible] = useState(false);
  const [newDepartmentName, setNewDepartmentName] = useState('');

  const parts = editWorkTimings.split(' - ');
  let startTime = parts[0] || '09:00 AM';
  let endTime = parts[1] || '06:00 PM';

  // Parse legacy 24-hour time format to 12-hour format with AM/PM
  if (startTime && !startTime.includes('AM') && !startTime.includes('PM')) {
    const [h, m] = startTime.split(':');
    const hr = parseInt(h) || 9;
    const period = hr >= 12 ? 'PM' : 'AM';
    const displayHr = hr % 12 === 0 ? 12 : hr % 12;
    startTime = `${String(displayHr).padStart(2, '0')}:${m || '00'} ${period}`;
  }
  if (endTime && !endTime.includes('AM') && !endTime.includes('PM')) {
    const [h, m] = endTime.split(':');
    const hr = parseInt(h) || 18;
    const period = hr >= 12 ? 'PM' : 'AM';
    const displayHr = hr % 12 === 0 ? 12 : hr % 12;
    endTime = `${String(displayHr).padStart(2, '0')}:${m || '00'} ${period}`;
  }

  const [startTimeVal, startTimePeriod] = startTime.split(' ');
  const [endTimeVal, endTimePeriod] = endTime.split(' ');

  const [startHour, startMin] = (startTimeVal || '09:00').split(':');
  const [endHour, endMin] = (endTimeVal || '06:00').split(':');

  const startPeriod = startTimePeriod || 'AM';
  const endPeriod = endTimePeriod || 'PM';

  const handleTimeConfirm = (hour: string, minute: string, period: string) => {
    if (timePickerTarget === 'start') {
      setEditWorkTimings(`${hour}:${minute} ${period} - ${endTime}`);
    } else {
      setEditWorkTimings(`${startTime} - ${hour}:${minute} ${period}`);
    }
  };

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

  // Load departments with auto-seeding defaults if collection is empty
  useEffect(() => {
    const unsubscribe = firestore()
      .collection('departments')
      .orderBy('name', 'asc')
      .onSnapshot((snapshot) => {
        if (snapshot) {
          if (snapshot.empty) {
            const defaults = ['Engineering', 'Sales', 'HR', 'Marketing', 'Finance', 'General'];
            defaults.forEach(async (name) => {
              await firestore().collection('departments').add({
                name,
                createdAt: firestore.FieldValue.serverTimestamp()
              });
            });
          } else {
            const list = snapshot.docs.map(doc => doc.data().name as string);
            setDepartments(list);
          }
        }
      }, (err) => {
        console.warn('Error fetching departments:', err);
      });

    return () => unsubscribe();
  }, []);

  const handleAddDepartment = async () => {
    const trimmed = newDepartmentName.trim();
    if (!trimmed) {
      showAlert('Validation Error', 'Department name cannot be empty.');
      return;
    }

    if (departments.some(d => d.toLowerCase() === trimmed.toLowerCase())) {
      showAlert('Validation Error', 'Department already exists.');
      return;
    }

    try {
      await firestore().collection('departments').add({
        name: trimmed,
        createdAt: firestore.FieldValue.serverTimestamp()
      });
      setNewDepartmentName('');
      showAlert('Success', `Department "${trimmed}" added successfully.`);
    } catch (err: any) {
      console.warn('Error adding department:', err);
      showAlert('Error', err.message || 'Failed to add department.');
    }
  };

  const hydrateEmployees = async (docs: any[]) => {
    return Promise.all(
      docs.map(async (doc) => {
        const userData = doc.data();
        const employeeId = doc.id;

        // Fetch employee data and admin data in parallel
        const [empDoc, adminDoc] = await Promise.all([
          firestore().collection('employees').doc(employeeId).get(),
          userData.adminId
            ? firestore().collection('users').doc(userData.adminId).get()
            : Promise.resolve(null)
        ]);

        const empData = empDoc && empDoc.exists() ? empDoc.data() || {} : {};
        let adminName = '';
        
        if (adminDoc && adminDoc.exists()) {
          adminName = adminDoc.data()?.name || 'Unnamed Admin';
        } else if (empData.adminId) {
          // Fallback if adminId is only present in employee sub-profile
          const fallbackAdminDoc = await firestore().collection('users').doc(empData.adminId).get();
          adminName = fallbackAdminDoc.exists() ? fallbackAdminDoc.data()?.name || 'Unnamed Admin' : '';
        }

        return {
          uid: employeeId,
          ...userData,
          ...empData,
          adminName,
        };
      })
    );
  };

  const fetchEmployees = async (isRefresh = false, currentLastDoc: any = null) => {
    if (!adminUser) return;

    try {
      if (isRefresh) {
        setLoading(true);
        loadingRef.current = true;
      } else {
        setLoadingMore(true);
        loadingMoreRef.current = true;
      }

      let query = firestore()
        .collection('users')
        .where('role', '==', 'EMPLOYEE');

      if (adminUser.role !== 'SUPER_ADMIN') {
        query = query.where('adminId', '==', adminUser.uid);
      }

      if (!isRefresh && currentLastDoc) {
        query = query.startAfter(currentLastDoc);
      }

      query = query.limit(5);

      const snapshot = await query.get();

      if (snapshot.empty) {
        if (isRefresh) {
          setEmployees([]);
        }
        setHasMore(false);
        hasMoreRef.current = false;
        setLastDoc(null);
        lastDocRef.current = null;
      } else {
        const hydrated = await hydrateEmployees(snapshot.docs);
        if (isRefresh) {
          setEmployees(hydrated);
        } else {
          setEmployees((prev) => [...prev, ...hydrated]);
        }
        const last = snapshot.docs[snapshot.docs.length - 1];
        setLastDoc(last);
        lastDocRef.current = last;
        const more = snapshot.docs.length === 5;
        setHasMore(more);
        hasMoreRef.current = more;
      }
    } catch (err) {
      console.warn('Error fetching employees:', err);
    } finally {
      setLoading(false);
      loadingRef.current = false;
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  };

  useEffect(() => {
    fetchEmployees(true);
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

              // Update local state directly
              setEmployees((prev) => prev.filter((e) => e.uid !== uid));
              setLoading(false);
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
    setEditEmail(employee.email || '');
    setEditDepartment(employee.department || '');
    setEditPhone(employee.phone || '');
    setEditSalary(String(employee.salary || ''));
    setEditAllowedLeaves(String(employee.allowedLeaves || ''));
    setEditWorkTimings(employee.workTimings || '09:00 AM - 06:00 PM');
    if (employee.weekOff) {
      setEditWeekOffs(employee.weekOff.split(', ').filter(Boolean));
    } else {
      setEditWeekOffs(['Sunday']);
    }
    
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

    if (!editName || !editEmail || !editDepartment || !editPhone || !editSalary || !editAllowedLeaves || !editWorkTimings || editWeekOffs.length === 0) {
      showAlert('Validation Error', 'All fields are required.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(editEmail.trim())) {
      showAlert('Validation Error', 'Please enter a valid email address.');
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
        email: editEmail.trim().toLowerCase(),
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
        weekOff: editWeekOffs.join(', '),
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

      // Update local state directly
      setEmployees((prev) =>
        prev.map((e) => {
          if (e.uid === uid) {
            return {
              ...e,
              name: editName.trim(),
              email: editEmail.trim().toLowerCase(),
              department: editDepartment.trim(),
              phone: editPhone.trim(),
              salary: parseFloat(editSalary) || 0,
              allowedLeaves: parseInt(editAllowedLeaves) || 0,
              workTimings: editWorkTimings.trim(),
              weekOff: editWeekOffs.join(', '),
              adminId,
              adminName: editSelectedAdmin ? editSelectedAdmin.name : e.adminName,
            };
          }
          return e;
        })
      );

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
          onEndReached={() => {
            if (!loadingRef.current && !loadingMoreRef.current && hasMoreRef.current && lastDocRef.current) {
              fetchEmployees(false, lastDocRef.current);
            }
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={() => {
            if (loadingMore) {
              return (
                <View style={{ paddingVertical: SPACING.md, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                </View>
              );
            }
            return null;
          }}
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
                    label="Email Address"
                    placeholder="janedoe@wealthapp.com"
                    value={editEmail}
                    onChangeText={setEditEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />

                  {/* Department Selector */}
                  <View style={styles.editSelectorContainer}>
                    <Text style={styles.editSelectorLabel}>Department</Text>
                    <TouchableOpacity 
                      style={styles.editSelectorField} 
                      activeOpacity={0.7}
                      onPress={() => {
                        Keyboard.dismiss();
                        setDepartmentModalVisible(true);
                      }}
                    >
                      <Text style={editDepartment ? styles.editSelectorValueText : styles.editSelectorPlaceholderText}>
                        {editDepartment || 'Select Department'}
                      </Text>
                      <Icon name="chevron-down" size={16} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                  </View>

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

                  {/* Work Timings Selector */}
                  <View style={styles.editSelectorContainer}>
                    <Text style={styles.editSelectorLabel}>Work Timings</Text>
                    <View style={styles.timePickerRow}>
                      <TouchableOpacity 
                        style={[styles.editSelectorField, { flex: 1, marginRight: SPACING.xs }]} 
                        activeOpacity={0.7}
                        onPress={() => {
                          Keyboard.dismiss();
                          setTimePickerTarget('start');
                          setTimePickerVisible(true);
                        }}
                      >
                        <View>
                          <Text style={styles.timeLabelTitle}>Start Time</Text>
                          <Text style={styles.editSelectorValueText}>{startTime}</Text>
                        </View>
                        <Icon name="time-outline" size={16} color={COLORS.textSecondary} />
                      </TouchableOpacity>

                      <TouchableOpacity 
                        style={[styles.editSelectorField, { flex: 1, marginLeft: SPACING.xs }]} 
                        activeOpacity={0.7}
                        onPress={() => {
                          Keyboard.dismiss();
                          setTimePickerTarget('end');
                          setTimePickerVisible(true);
                        }}
                      >
                        <View>
                          <Text style={styles.timeLabelTitle}>End Time</Text>
                          <Text style={styles.editSelectorValueText}>{endTime}</Text>
                        </View>
                        <Icon name="time-outline" size={16} color={COLORS.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  </View>

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
                      <Text style={editWeekOffs.length > 0 ? styles.editSelectorValueText : styles.editSelectorPlaceholderText}>
                        {editWeekOffs.length > 0 ? editWeekOffs.join(', ') : 'Select Week Off Days'}
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
                      <Text style={styles.nestedModalTitle}>Select Week Off Days</Text>
                      <TouchableOpacity onPress={() => setEditWeekOffModalVisible(false)}>
                        <Icon name="close" size={24} color={COLORS.text} />
                      </TouchableOpacity>
                    </View>
                    
                    <FlatList
                      data={weekDays}
                      keyExtractor={(item) => item}
                      renderItem={({ item }) => {
                        const isSelected = editWeekOffs.includes(item);
                        return (
                          <TouchableOpacity 
                            style={styles.nestedItem} 
                            activeOpacity={0.7}
                            onPress={() => {
                              if (isSelected) {
                                setEditWeekOffs(editWeekOffs.filter(day => day !== item));
                              } else {
                                setEditWeekOffs([...editWeekOffs, item]);
                              }
                            }}
                          >
                            <Text style={styles.nestedItemNameText}>{item}</Text>
                            <Icon 
                              name={isSelected ? 'checkbox-outline' : 'square-outline'} 
                              size={20} 
                              color={isSelected ? COLORS.primary : COLORS.border} 
                            />
                          </TouchableOpacity>
                        );
                      }}
                      ItemSeparatorComponent={() => <View style={styles.nestedItemSeparator} />}
                    />
                    <Button
                      title="Done"
                      onPress={() => setEditWeekOffModalVisible(false)}
                      style={{ marginTop: SPACING.md }}
                    />
                  </View>
                </View>
              )}
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
      {/* Custom Bottom Sheet Dropdown Overlay for Department Selection */}
      {departmentModalVisible && (
        <View style={styles.nestedModalContainer}>
          <TouchableOpacity 
            style={styles.nestedBackdrop} 
            activeOpacity={1} 
            onPress={() => setDepartmentModalVisible(false)} 
          />
          <View style={styles.nestedModalContent}>
            <View style={styles.nestedModalHeader}>
              <Text style={styles.nestedModalTitle}>Select Department</Text>
              <TouchableOpacity onPress={() => setDepartmentModalVisible(false)}>
                <Icon name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            {/* Option to Add New Department */}
            <View style={styles.addDepartmentRow}>
              <TextInput
                placeholder="Add new department..."
                value={newDepartmentName}
                onChangeText={setNewDepartmentName}
                style={styles.addDepartmentInput}
                autoCorrect={false}
              />
              <TouchableOpacity 
                style={styles.addDepartmentBtn}
                onPress={handleAddDepartment}
              >
                <Text style={styles.addDepartmentBtnText}>Add</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={departments}
              keyExtractor={(item) => item}
              renderItem={({ item }) => {
                const isSelected = item === editDepartment;
                return (
                  <TouchableOpacity 
                    style={styles.nestedItem} 
                    onPress={() => {
                      setEditDepartment(item);
                      setDepartmentModalVisible(false);
                    }}
                  >
                    <Text style={[styles.nestedItemNameText, isSelected && { color: COLORS.primary }]}>
                      {item}
                    </Text>
                    {isSelected && <Icon name="checkmark" size={18} color={COLORS.primary} />}
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => <View style={styles.nestedItemSeparator} />}
              ListEmptyComponent={
                <View style={styles.nestedEmptyContainer}>
                  <Text style={styles.nestedEmptyText}>No departments configured yet.</Text>
                </View>
              }
            />
          </View>
        </View>
      )}

      <TimePickerModal
        visible={timePickerVisible}
        title={timePickerTarget === 'start' ? 'Select Start Time' : 'Select End Time'}
        initialHour={timePickerTarget === 'start' ? (startHour || '09') : (endHour || '06')}
        initialMinute={timePickerTarget === 'start' ? (startMin || '00') : (endMin || '00')}
        initialPeriod={timePickerTarget === 'start' ? (startPeriod || 'AM') : (endPeriod || 'PM')}
        onClose={() => setTimePickerVisible(false)}
        onConfirm={handleTimeConfirm}
      />
      {adminUser && (
        <BottomTabBar role={adminUser.role} activeTab="Directory" navigation={navigation} />
      )}
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
    paddingBottom: 110,
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
  timePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeLabelTitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '700',
    marginBottom: 2,
  },
  addDepartmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: '#F9F9F9',
    paddingHorizontal: SPACING.sm,
    height: 48,
  },
  addDepartmentInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    paddingVertical: 0,
  },
  addDepartmentBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
  },
  addDepartmentBtnText: {
    color: COLORS.surface,
    fontSize: 12,
    fontWeight: '800',
  },
});

