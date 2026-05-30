import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import firebase from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import { COLORS, SPACING } from '../constants/theme';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Header } from '../components/Header';
import { TimePickerModal } from '../components/TimePickerModal';
import googleServices from '../../android/app/google-services.json';
import Icon from 'react-native-vector-icons/Ionicons';
import { useCustomAlert } from '../context/CustomAlertContext';

interface AdminItem {
  uid: string;
  name: string;
  email: string;
}

export const CreateEmployeeScreen: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [department, setDepartment] = useState('');
  const [phone, setPhone] = useState('');
  const [salary, setSalary] = useState('');
  const [allowedLeaves, setAllowedLeaves] = useState('2');
  const [workTimings, setWorkTimings] = useState('09:00 AM - 06:00 PM');
  const [weekOffs, setWeekOffs] = useState<string[]>(['Sunday']);
  const [loading, setLoading] = useState(false);

  // Time Picker States
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [timePickerTarget, setTimePickerTarget] = useState<'start' | 'end'>('start');

  // Dropdown States
  const [currentUserRole, setCurrentUserRole] = useState<'SUPER_ADMIN' | 'ADMIN' | null>(null);
  const [admins, setAdmins] = useState<AdminItem[]>([]);
  const [selectedAdmin, setSelectedAdmin] = useState<AdminItem | null>(null);
  
  const [adminModalVisible, setAdminModalVisible] = useState(false);
  const [weekOffModalVisible, setWeekOffModalVisible] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingAdmins, setLoadingAdmins] = useState(false);

  // Department Selection States
  const [departments, setDepartments] = useState<string[]>([]);
  const [departmentModalVisible, setDepartmentModalVisible] = useState(false);
  const [newDepartmentName, setNewDepartmentName] = useState('');

  const { showAlert } = useCustomAlert();

  const parts = workTimings.split(' - ');
  const startTime = parts[0] || '09:00 AM';
  const endTime = parts[1] || '06:00 PM';

  const [startTimeVal, startTimePeriod] = startTime.split(' ');
  const [endTimeVal, endTimePeriod] = endTime.split(' ');

  const [startHour, startMin] = (startTimeVal || '09:00').split(':');
  const [endHour, endMin] = (endTimeVal || '06:00').split(':');

  const startPeriod = startTimePeriod || 'AM';
  const endPeriod = endTimePeriod || 'PM';

  const handleTimeConfirm = (hour: string, minute: string, period: string) => {
    if (timePickerTarget === 'start') {
      setWorkTimings(`${hour}:${minute} ${period} - ${endTime}`);
    } else {
      setWorkTimings(`${startTime} - ${hour}:${minute} ${period}`);
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

  // Fetch current user role and list of Admins on mount
  useEffect(() => {
    const fetchRoleAndAdmins = async () => {
      try {
        const uid = auth().currentUser?.uid;
        if (uid) {
          const userDoc = await firestore().collection('users').doc(uid).get();
          const role = userDoc.data()?.role;
          setCurrentUserRole(role);

          if (role === 'SUPER_ADMIN') {
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
          }
        }
      } catch (err) {
        console.warn('Error fetching role/admins:', err);
        setLoadingAdmins(false);
      }
    };
    fetchRoleAndAdmins();
  }, []);

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

  const handleCreateEmployee = async () => {
    if (!name || !email || !password || !department || !phone || !salary || !allowedLeaves || !workTimings || weekOffs.length === 0) {
      showAlert('Validation Error', 'All fields are required.');
      return;
    }

    if (password.length < 6) {
      showAlert('Validation Error', 'Password must be at least 6 characters.');
      return;
    }

    if (currentUserRole === 'SUPER_ADMIN' && !selectedAdmin) {
      showAlert('Validation Error', 'Please select an Admin Manager for the employee.');
      return;
    }

    setLoading(true);

    try {
      // 1. Initialize secondary app dynamically to prevent signing out the current Admin
      const secondaryAppName = `secondaryApp_${Date.now()}`;
      const clientInfo = googleServices.client[0].client_info;
      const apiKeyInfo = googleServices.client[0].api_key[0];
      const firebaseConfig = {
        apiKey: apiKeyInfo.current_key,
        appId: clientInfo.mobilesdk_app_id,
        projectId: googleServices.project_info.project_id,
        storageBucket: googleServices.project_info.storage_bucket,
        databaseURL: googleServices.project_info.firebase_url,
        messagingSenderId: googleServices.project_info.project_number,
      };

      const secondaryApp = await firebase.initializeApp(firebaseConfig, secondaryAppName);

      // 2. Create in Firebase Auth (using secondary app)
      const userCredential = await auth(secondaryApp).createUserWithEmailAndPassword(email.trim(), password);
      const newUid = userCredential.user.uid;

      // 3. Resolve caller adminId
      const callerUid = auth().currentUser?.uid || 'system';
      const adminId = currentUserRole === 'SUPER_ADMIN' ? selectedAdmin?.uid : callerUid;

      // 4. Write profile to Firestore
      const newUser = {
        uid: newUid,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role: 'EMPLOYEE',
        status: 'active',
        createdAt: firestore.FieldValue.serverTimestamp(),
        adminId,
      };
      
      // Write user document
      await firestore().collection('users').doc(newUid).set(newUser);

      // Write employee document
      await firestore().collection('employees').doc(newUid).set({
        uid: newUid,
        adminId,
        department: department.trim(),
        phone: phone.trim(),
        salary: parseFloat(salary) || 0,
        allowedLeaves: parseInt(allowedLeaves) || 0,
        workTimings: workTimings.trim(),
        weekOff: weekOffs.join(', '),
        createdAt: firestore.FieldValue.serverTimestamp(),
      });

      // 5. Log activity
      await firestore().collection('activity_logs').add({
        employeeId: callerUid,
        activity: `Created user account: ${name.trim()} (EMPLOYEE) assigned to Admin manager: ${selectedAdmin ? selectedAdmin.name : 'self'}`,
        timestamp: firestore.FieldValue.serverTimestamp(),
      });

      // 6. Clean up secondary app
      await secondaryApp.delete();

      showAlert('Success', `Employee ${name} added successfully!`);
      setName('');
      setEmail('');
      setPassword('');
      setDepartment('');
      setPhone('');
      setSalary('');
      setAllowedLeaves('2');
      setWorkTimings('09:00 AM - 06:00 PM');
      setWeekOffs(['Sunday']);
      setSelectedAdmin(null);
    } catch (err: any) {
      console.error('Create Employee error:', err);
      showAlert('Add Employee Failed', err.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const getFilteredAdmins = () => {
    return admins.filter(item => {
      const adminName = item.name ? item.name.toLowerCase() : '';
      const adminEmail = item.email ? item.email.toLowerCase() : '';
      const query = searchQuery ? searchQuery.toLowerCase() : '';
      return adminName.includes(query) || adminEmail.includes(query);
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ flex: 1 }}>
          <Header title="Add Employee" showBackButton />
          
          <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.formCard}>
          <Text style={styles.description}>
            Register a new employee. Once registered, they can check in and out when inside the office radius.
          </Text>

          <Input
            label="Employee Name"
            placeholder="Jane Doe"
            value={name}
            onChangeText={setName}
            autoCorrect={false}
          />

          <Input
            label="Email Address"
            placeholder="janedoe@wealthapp.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Input
            label="Password"
            placeholder="Minimum 6 characters"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* Department Selector */}
          <View style={styles.selectorContainer}>
            <Text style={styles.selectorLabel}>Department</Text>
            <TouchableOpacity 
              style={styles.selectorField} 
              activeOpacity={0.7}
              onPress={() => {
                Keyboard.dismiss();
                setDepartmentModalVisible(true);
              }}
            >
              <Text style={department ? styles.selectorValueText : styles.selectorPlaceholderText}>
                {department || 'Select Department'}
              </Text>
              <Icon name="chevron-down" size={16} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <Input
            label="Phone Number"
            placeholder="e.g. +91 9876543210"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoCorrect={false}
          />

          <Input
            label="Monthly Base Salary (INR)"
            placeholder="e.g. 10000"
            value={salary}
            onChangeText={setSalary}
            keyboardType="numeric"
            autoCorrect={false}
          />

          <Input
            label="Allowed Leaves per Month"
            placeholder="e.g. 2"
            value={allowedLeaves}
            onChangeText={setAllowedLeaves}
            keyboardType="numeric"
            autoCorrect={false}
          />

          {/* Work Timings Selector */}
          <View style={styles.selectorContainer}>
            <Text style={styles.selectorLabel}>Work Timings</Text>
            <View style={styles.timePickerRow}>
              <TouchableOpacity 
                style={[styles.selectorField, { flex: 1, marginRight: SPACING.xs }]} 
                activeOpacity={0.7}
                onPress={() => {
                  Keyboard.dismiss();
                  setTimePickerTarget('start');
                  setTimePickerVisible(true);
                }}
              >
                <View>
                  <Text style={styles.timeLabelTitle}>Start Time</Text>
                  <Text style={styles.selectorValueText}>{startTime}</Text>
                </View>
                <Icon name="time-outline" size={16} color={COLORS.textSecondary} />
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.selectorField, { flex: 1, marginLeft: SPACING.xs }]} 
                activeOpacity={0.7}
                onPress={() => {
                  Keyboard.dismiss();
                  setTimePickerTarget('end');
                  setTimePickerVisible(true);
                }}
              >
                <View>
                  <Text style={styles.timeLabelTitle}>End Time</Text>
                  <Text style={styles.selectorValueText}>{endTime}</Text>
                </View>
                <Icon name="time-outline" size={16} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Week Off Selector */}
          <View style={styles.selectorContainer}>
            <Text style={styles.selectorLabel}>Week Off Day</Text>
            <TouchableOpacity 
              style={styles.selectorField} 
              activeOpacity={0.7}
              onPress={() => {
                console.log('Opening week off selector modal...');
                Keyboard.dismiss();
                setWeekOffModalVisible(true);
              }}
            >
              <Text style={weekOffs.length > 0 ? styles.selectorValueText : styles.selectorPlaceholderText}>
                {weekOffs.length > 0 ? weekOffs.join(', ') : 'Select Week Off Days'}
              </Text>
              <Icon name="chevron-down" size={16} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Admin Manager selector (visible only for SUPER_ADMIN) */}
          {currentUserRole === 'SUPER_ADMIN' && (
            <View style={styles.selectorContainer}>
              <Text style={styles.selectorLabel}>Assign Admin Manager</Text>
              <TouchableOpacity 
                style={styles.selectorField} 
                activeOpacity={0.7}
                onPress={() => {
                  console.log('Opening admins selector modal...');
                  Keyboard.dismiss();
                  setAdminModalVisible(true);
                }}
              >
                <Text style={selectedAdmin ? styles.selectorValueText : styles.selectorPlaceholderText}>
                  {selectedAdmin 
                    ? `${selectedAdmin.name} (${selectedAdmin.email})` 
                    : 'Select Admin Manager'}
                </Text>
                <Icon name="chevron-down" size={16} color={COLORS.textSecondary} />
              </TouchableOpacity>
            </View>
          )}

          <Button
            title="Create Employee Profile"
            loading={loading}
            onPress={handleCreateEmployee}
            style={styles.button}
          />
        </View>
          </ScrollView>

          {/* Custom Bottom Sheet Dropdown Overlay for Admin Selection */}
          {adminModalVisible && (
        <View style={styles.absoluteModalContainer}>
          <TouchableOpacity 
            style={styles.backdrop} 
            activeOpacity={1} 
            onPress={() => setAdminModalVisible(false)} 
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Admin Manager</Text>
              <TouchableOpacity onPress={() => setAdminModalVisible(false)}>
                <Icon name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            
            <View style={styles.searchBarContainer}>
              <Icon name="search-outline" size={18} color={COLORS.textSecondary} style={styles.searchIcon} />
              <TextInput
                placeholder="Search Admin Name or Email..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={styles.searchInput}
                autoCorrect={false}
              />
            </View>

            <FlatList
              data={getFilteredAdmins()}
              keyExtractor={(item) => item.uid}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.adminItem} 
                  onPress={() => {
                    setSelectedAdmin(item);
                    setAdminModalVisible(false);
                    setSearchQuery('');
                  }}
                >
                  <View>
                    <Text style={styles.adminNameText}>{item.name}</Text>
                    <Text style={styles.adminEmailText}>{item.email}</Text>
                  </View>
                  <Icon name="chevron-forward" size={16} color={COLORS.border} />
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  {loadingAdmins ? (
                    <ActivityIndicator size="small" color={COLORS.primary} style={{ marginBottom: 12 }} />
                  ) : (
                    <Text style={styles.emptyText}>No Admins configured yet.</Text>
                  )}
                </View>
              }
            />
          </View>
        </View>
      )}

      {/* Custom Bottom Sheet Dropdown Overlay for Week Off Selection */}
      {weekOffModalVisible && (
        <View style={styles.absoluteModalContainer}>
          <TouchableOpacity 
            style={styles.backdrop} 
            activeOpacity={1} 
            onPress={() => setWeekOffModalVisible(false)} 
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Week Off Days</Text>
              <TouchableOpacity onPress={() => setWeekOffModalVisible(false)}>
                <Icon name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            
            <FlatList
              data={weekDays}
              keyExtractor={(item) => item}
              renderItem={({ item }) => {
                const isSelected = weekOffs.includes(item);
                return (
                  <TouchableOpacity 
                    style={styles.adminItem} 
                    activeOpacity={0.7}
                    onPress={() => {
                      if (isSelected) {
                        setWeekOffs(weekOffs.filter(day => day !== item));
                      } else {
                        setWeekOffs([...weekOffs, item]);
                      }
                    }}
                  >
                    <Text style={styles.adminNameText}>{item}</Text>
                    <Icon 
                      name={isSelected ? 'checkbox-outline' : 'square-outline'} 
                      size={20} 
                      color={isSelected ? COLORS.primary : COLORS.border} 
                    />
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
            />
            <Button
              title="Done"
              onPress={() => setWeekOffModalVisible(false)}
              style={{ marginTop: SPACING.md }}
            />
          </View>
        </View>
        )}

      {/* Custom Bottom Sheet Dropdown Overlay for Department Selection */}
      {departmentModalVisible && (
        <View style={styles.absoluteModalContainer}>
          <TouchableOpacity 
            style={styles.backdrop} 
            activeOpacity={1} 
            onPress={() => setDepartmentModalVisible(false)} 
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Department</Text>
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
                const isSelected = item === department;
                return (
                  <TouchableOpacity 
                    style={styles.adminItem} 
                    onPress={() => {
                      setDepartment(item);
                      setDepartmentModalVisible(false);
                    }}
                  >
                    <Text style={[styles.adminNameText, isSelected && { color: COLORS.primary }]}>
                      {item}
                    </Text>
                    {isSelected && <Icon name="checkmark" size={18} color={COLORS.primary} />}
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No departments configured yet.</Text>
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
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.lg,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  description: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: SPACING.lg,
    lineHeight: 20,
  },
  button: {
    marginTop: SPACING.md,
  },
  // Selector Styles
  selectorContainer: {
    marginBottom: SPACING.md,
  },
  selectorLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  selectorField: {
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
  selectorValueText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600',
  },
  selectorPlaceholderText: {
    fontSize: 14,
    color: COLORS.textLight,
  },
  // Modal Styles
  absoluteModalContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: '75%',
    padding: SPACING.md,
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
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  searchBarContainer: {
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
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    paddingVertical: 0,
  },
  adminItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xs,
  },
  adminNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  adminEmailText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  itemSeparator: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
  },
  emptyText: {
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
