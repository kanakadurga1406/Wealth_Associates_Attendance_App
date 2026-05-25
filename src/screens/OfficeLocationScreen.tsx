import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
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
import { useLocation } from '../hooks/useLocation';
import Icon from 'react-native-vector-icons/Ionicons';
import { useRealTimeStatus } from '../hooks/useRealTimeStatus';
import { useCustomAlert } from '../context/CustomAlertContext';

export const OfficeLocationScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const adminUser = useSelector((state: RootState) => state.auth.user);
  
  const [docId, setDocId] = useState<string | null>(null);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [radius, setRadius] = useState('10'); // default 10 meters
  
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const { getCurrentLocation, loading: detectingLocation } = useLocation();
  const { updateActivity } = useRealTimeStatus();
  const { showAlert } = useCustomAlert();

  useEffect(() => {
    updateActivity('setting_office_location');
  }, [updateActivity]);

  useEffect(() => {
    if (!adminUser) return;

    const fetchOfficeLocation = async () => {
      try {
        const query = await firestore()
          .collection('office_locations')
          .where('adminId', '==', adminUser.uid)
          .limit(1)
          .get();

        if (!query.empty) {
          const doc = query.docs[0];
          const data = doc.data();
          setDocId(doc.id);
          setLatitude(data.latitude.toString());
          setLongitude(data.longitude.toString());
          setRadius((data.radius || 10).toString());
        }
      } catch (err) {
        console.warn('Error fetching office location:', err);
        showAlert('Error', 'Failed to load existing office location.');
      } finally {
        setFetching(false);
      }
    };

    fetchOfficeLocation();
  }, [adminUser]);

  const handleDetectLocation = async () => {
    const coords = await getCurrentLocation();
    if (coords) {
      setLatitude(coords.latitude.toString());
      setLongitude(coords.longitude.toString());
      showAlert('Success', 'Office coordinates updated using your current physical location.');
    } else {
      showAlert('Error', 'Unable to capture current location. Please verify location services and permissions.');
    }
  };

  const handleSave = async () => {
    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);
    const radNum = parseFloat(radius);

    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      showAlert('Validation Error', 'Please enter a valid latitude (-90 to 90).');
      return;
    }

    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      showAlert('Validation Error', 'Please enter a valid longitude (-180 to 180).');
      return;
    }

    if (isNaN(radNum) || radNum <= 0) {
      showAlert('Validation Error', 'Please enter a valid geofencing radius (greater than 0 meters).');
      return;
    }

    if (!adminUser) return;

    setLoading(true);
    setSaveSuccess(false);

    try {
      const payload = {
        adminId: adminUser.uid,
        latitude: latNum,
        longitude: lngNum,
        radius: radNum,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      };

      if (docId) {
        await firestore().collection('office_locations').doc(docId).update(payload);
      } else {
        const newDoc = await firestore().collection('office_locations').add(payload);
        setDocId(newDoc.id);
      }

      setSaveSuccess(true);
      showAlert('Success', 'Office location & geofence parameters saved successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (err: any) {
      console.error('Error saving office location:', err);
      showAlert('Save Failed', err.message || 'An error occurred while saving the location.');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading office profile...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={{ flex: 1 }}>
          <Header title="Set Geofence Boundary" showBackButton />

          <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <View style={styles.iconWrapper}>
            <Icon name="location-sharp" size={32} color={COLORS.primary} />
          </View>
          <Text style={styles.cardTitle}>Configure Office Location</Text>
          <Text style={styles.cardSubtitle}>
            Employees will only be allowed to check in and check out if they are physically within the radius set below.
          </Text>

          <Button
            title={detectingLocation ? "Detecting Position..." : "Use My Current Location"}
            onPress={handleDetectLocation}
            loading={detectingLocation}
            variant="outline"
            style={styles.detectBtn}
          />

          <View style={styles.form}>
            <Input
              label="Latitude"
              placeholder="e.g. 12.9716"
              keyboardType="numeric"
              value={latitude}
              onChangeText={setLatitude}
            />

            <Input
              label="Longitude"
              placeholder="e.g. 77.5946"
              keyboardType="numeric"
              value={longitude}
              onChangeText={setLongitude}
            />

            <Input
              label="Geofence Radius (Meters)"
              placeholder="e.g. 10"
              keyboardType="numeric"
              value={radius}
              onChangeText={setRadius}
            />

            <Button
              title="Save Geofence Configuration"
              onPress={handleSave}
              loading={loading}
              style={styles.saveBtn}
            />
          </View>
        </Card>
          </ScrollView>
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
  },
  scrollContainer: {
    padding: SPACING.md,
  },
  card: {
    padding: SPACING.lg,
    alignItems: 'center',
  },
  iconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EEF2F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  cardSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
    lineHeight: 18,
  },
  detectBtn: {
    marginBottom: SPACING.lg,
  },
  form: {
    width: '100%',
  },
  saveBtn: {
    marginTop: SPACING.md,
  },
});
