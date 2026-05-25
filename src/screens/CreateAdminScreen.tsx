import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  Text,
  Modal,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import firebase from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import axios from 'axios';
import { COLORS, SPACING } from '../constants/theme';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { Header } from '../components/Header';
import googleServices from '../../android/app/google-services.json';
import Icon from 'react-native-vector-icons/Ionicons';
import { useCustomAlert } from '../context/CustomAlertContext';

interface AssemblyItem {
  id: string;
  assemblyName: string;
  assemblyCode: string;
  parliamentName: string;
  parliamentCode: string;
}

export const CreateAdminScreen: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Location States
  const [locations, setLocations] = useState<AssemblyItem[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<AssemblyItem | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [errorLocations, setErrorLocations] = useState<string | null>(null);

  const { showAlert } = useCustomAlert();

  // Fetch locations from the API
  const fetchLocations = async () => {
    setLoadingLocations(true);
    setErrorLocations(null);
    try {
      const response = await axios.get('https://api.wealthassociate.in/alldiscons/alldiscons');
      const data = response.data;
      if (Array.isArray(data)) {
        const flatList: AssemblyItem[] = [];
        data.forEach((pItem: any) => {
          if (pItem && pItem.assemblies && Array.isArray(pItem.assemblies)) {
            pItem.assemblies.forEach((aItem: any) => {
              if (aItem && aItem.name) {
                flatList.push({
                  id: aItem._id || Math.random().toString(),
                  assemblyName: aItem.name || '',
                  assemblyCode: aItem.code || '',
                  parliamentName: pItem.parliament || '',
                  parliamentCode: pItem.parliamentCode || '',
                });
              }
            });
          }
        });
        // Sort locations alphabetically by Assembly name
        flatList.sort((a, b) => a.assemblyName.localeCompare(b.assemblyName));
        setLocations(flatList);
      }
    } catch (err: any) {
      console.warn('Error fetching locations:', err);
      setErrorLocations('Failed to load locations. Tap here to retry.');
    } finally {
      setLoadingLocations(false);
    }
  };

  useEffect(() => {
    fetchLocations();
  }, []);

  const handleCreateAdmin = async () => {
    if (!name || !email || !password) {
      showAlert('Validation Error', 'All fields are required.');
      return;
    }

    if (password.length < 6) {
      showAlert('Validation Error', 'Password must be at least 6 characters.');
      return;
    }

    if (!selectedLocation) {
      showAlert('Validation Error', 'Please select a location for the Admin.');
      return;
    }

    setLoading(true);

    try {
      // 1. Initialize secondary app dynamically to prevent signing out the current Super Admin
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

      // Location details payload
      const locationData = {
        assemblyName: selectedLocation.assemblyName,
        assemblyCode: selectedLocation.assemblyCode,
        parliamentName: selectedLocation.parliamentName,
        parliamentCode: selectedLocation.parliamentCode,
      };

      // 3. Write profile to Firestore
      const newUser = {
        uid: newUid,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role: 'ADMIN',
        status: 'active',
        createdAt: firestore.FieldValue.serverTimestamp(),
        location: locationData,
      };

      // Write user document
      await firestore().collection('users').doc(newUid).set(newUser);

      // Write admin document
      await firestore().collection('admins').doc(newUid).set({
        uid: newUid,
        createdBy: auth().currentUser?.uid || 'system',
        createdAt: firestore.FieldValue.serverTimestamp(),
        location: locationData,
      });

      // 4. Log activity
      await firestore().collection('activity_logs').add({
        employeeId: auth().currentUser?.uid || 'system',
        activity: `Created user account: ${name.trim()} (ADMIN) for ${selectedLocation.assemblyName}`,
        timestamp: firestore.FieldValue.serverTimestamp(),
      });

      // 5. Clean up secondary app
      await secondaryApp.delete();

      showAlert('Success', `Admin ${name} created successfully!`);
      setName('');
      setEmail('');
      setPassword('');
      setSelectedLocation(null);
    } catch (err: any) {
      console.error('Create Admin error:', err);
      showAlert('Provisioning Failed', err.message || 'An error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const getFilteredLocations = () => {
    return locations.filter(item => {
      const assembly = item.assemblyName ? item.assemblyName.toLowerCase() : '';
      const parliament = item.parliamentName ? item.parliamentName.toLowerCase() : '';
      const query = searchQuery ? searchQuery.toLowerCase() : '';
      return assembly.includes(query) || parliament.includes(query);
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
          <Header title="Create Admin" showBackButton />

          <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.formCard}>
          <Text style={styles.description}>
            Create a new Admin account. Admins can manage employees, track attendance, and configure office locations.
          </Text>

          <Input
            label="Full Name"
            placeholder="John Doe"
            value={name}
            onChangeText={setName}
            autoCorrect={false}
          />

          <Input
            label="Email Address"
            placeholder="johndoe@wealthapp.com"
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

          {/* Location Selector Button */}
          <View style={styles.selectorContainer}>
            <Text style={styles.selectorLabel}>Admin Location</Text>
            <TouchableOpacity
              style={styles.selectorField}
              activeOpacity={0.7}
              onPress={() => {
                console.log('Opening location selector modal...');
                Keyboard.dismiss();
                setModalVisible(true);
              }}
            >
              <Text style={selectedLocation ? styles.selectorValueText : styles.selectorPlaceholderText}>
                {selectedLocation
                  ? `${selectedLocation.assemblyName} (${selectedLocation.parliamentName})`
                  : 'Select Location'}
              </Text>
              <Icon name="chevron-down" size={16} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>

          <Button
            title="Create Admin Account"
            loading={loading}
            onPress={handleCreateAdmin}
            style={styles.button}
          />
        </View>
          </ScrollView>

          {/* Bottom Sheet Locations Dropdown Custom Overlay */}
          {modalVisible && (
        <View style={styles.absoluteModalContainer}>
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={() => setModalVisible(false)}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Admin Location</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Icon name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchBarContainer}>
              <Icon name="search-outline" size={18} color={COLORS.textSecondary} style={styles.searchIcon} />
              <TextInput
                placeholder="Search Assembly or Parliament..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={styles.searchInput}
                autoCorrect={false}
              />
            </View>

            <FlatList
              data={getFilteredLocations()}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.locationItem}
                  onPress={() => {
                    setSelectedLocation(item);
                    setModalVisible(false);
                    setSearchQuery('');
                  }}
                >
                  <View>
                    <Text style={styles.assemblyText}>{item.assemblyName}</Text>
                    <Text style={styles.parliamentText}>Parliament: {item.parliamentName} (Code: {item.parliamentCode})</Text>
                  </View>
                  <Icon name="chevron-forward" size={16} color={COLORS.border} />
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  {loadingLocations ? (
                    <ActivityIndicator size="small" color={COLORS.primary} style={{ marginBottom: 12 }} />
                  ) : errorLocations ? (
                    <TouchableOpacity onPress={fetchLocations}>
                      <Text style={[styles.emptyText, { color: COLORS.danger, textDecorationLine: 'underline' }]}>
                        {errorLocations}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.emptyText}>No matching locations found.</Text>
                  )}
                </View>
              }
            />
          </View>
        </View>
        )}
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
  locationItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xs,
  },
  assemblyText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  parliamentText: {
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
});
