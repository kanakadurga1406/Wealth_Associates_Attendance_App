import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import database from '@react-native-firebase/database';
import { logoutSuccess } from '../redux/slices/authSlice';
import { RootState } from '../redux/store';
import { COLORS, SPACING, SHADOWS } from '../constants/theme';
import { Header } from '../components/Header';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { useLocation } from '../hooks/useLocation';
import Icon from 'react-native-vector-icons/Ionicons';
import { useRealTimeStatus } from '../hooks/useRealTimeStatus';
import { useCustomAlert } from '../context/CustomAlertContext';

export const AttendanceScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const user = useSelector((state: RootState) => state.auth.user);
  const todayRecord = useSelector((state: RootState) => state.attendance.todayRecord);
  const dispatch = useDispatch();
  
  const [currentCoords, setCurrentCoords] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  const [officeLoc, setOfficeLoc] = useState<{ latitude: number; longitude: number; radius: number } | null>(null);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [employeeSalary, setEmployeeSalary] = useState<number>(0);
  const [loadingOffice, setLoadingOffice] = useState(true);
  const [address, setAddress] = useState<string>('Resolving address...');
  const [loadingAddress, setLoadingAddress] = useState(false);

  const { startWatchingLocation, stopWatchingLocation, loading: loadingLocation, error: locationHookError } = useLocation();
  const { updateActivity } = useRealTimeStatus();
  const { showAlert } = useCustomAlert();

  const isCheckIn = !todayRecord;
  const hasTriggeredLogout = useRef(false);
  const [hasShownOutOfRangeAlert, setHasShownOutOfRangeAlert] = useState(false);

  const handleLocationError = (errMessage: string) => {
    setLocError((prev) => {
      if (prev !== errMessage) {
        showAlert('Location Services Error', `${errMessage}\n\nPlease check your device settings and try again.`);
      }
      return errMessage;
    });
  };

  useEffect(() => {
    updateActivity(isCheckIn ? 'marking_check_in' : 'marking_check_out');
  }, [updateActivity, isCheckIn]);

  const loadCoordinates = async () => {
    setLocError(null);
    setHasShownOutOfRangeAlert(false);
    stopWatchingLocation();
    setTimeout(() => {
      startWatchingLocation(
        (coords) => {
          setCurrentCoords(coords);
          setLocError(null);
        },
        (errMessage) => {
          handleLocationError(errMessage);
        }
      );
    }, 200);
  };

  useEffect(() => {
    let active = true;
    startWatchingLocation(
      (coords) => {
        if (active) {
          setCurrentCoords(coords);
          setLocError(null);
        }
      },
      (errMessage) => {
        if (active) {
          handleLocationError(errMessage);
        }
      }
    );

    return () => {
      active = false;
      stopWatchingLocation();
    };
  }, [startWatchingLocation, stopWatchingLocation]);

  // Fetch office location center and radius limit set by Admin
  useEffect(() => {
    const fetchOfficeLocation = async () => {
      if (!user) return;
      setLoadingOffice(true);
      try {
        const empSnap = await firestore().collection('employees').doc(user.uid).get();
        if (empSnap.exists()) {
          const aId = empSnap.data()?.adminId;
          const salary = empSnap.data()?.salary || 0;
          setAdminId(aId || null);
          setEmployeeSalary(salary);
          if (aId) {
            const officeSnap = await firestore()
              .collection('office_locations')
              .where('adminId', '==', aId)
              .limit(1)
              .get();

            if (!officeSnap.empty) {
              const data = officeSnap.docs[0].data();
              setOfficeLoc({
                latitude: data.latitude,
                longitude: data.longitude,
                radius: data.radius || 10,
              });
            }
          }
        }
      } catch (err) {
        console.warn('Error fetching office location:', err);
      } finally {
        setLoadingOffice(false);
      }
    };

    fetchOfficeLocation();
  }, [user]);

  // Reverse geocoding coords -> address
  useEffect(() => {
    if (currentCoords) {
      setLoadingAddress(true);
      setAddress('Resolving address...');
      
      const timer = setTimeout(() => {
        fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${currentCoords.latitude}&lon=${currentCoords.longitude}&format=json&accept-language=en&zoom=18`,
          {
            headers: {
              'User-Agent': 'WealthAttendanceApp/1.0',
            },
          }
        )
          .then((res) => res.json())
          .then((data: any) => {
            setAddress(data.display_name || 'Address Not Found');
            setLoadingAddress(false);
          })
          .catch((err) => {
            console.warn('Geocoding error:', err);
            setAddress(`${currentCoords.latitude.toFixed(6)}°, ${currentCoords.longitude.toFixed(6)}°`);
            setLoadingAddress(false);
          });
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [currentCoords]);

  // Distance calculation helper (Haversine formula)
  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Earth's radius in meters
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaPhi = (lat2 - lat1) * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  const distance = currentCoords && officeLoc
    ? getDistance(currentCoords.latitude, currentCoords.longitude, officeLoc.latitude, officeLoc.longitude)
    : null;

  const isWithinGeofence = distance !== null && officeLoc !== null && distance <= officeLoc.radius;

  const isButtonDisabled = !currentCoords || loadingLocation || loadingOffice || distance === null || officeLoc === null;

  // Out-of-range alert warning for check-in (only alerts once)
  useEffect(() => {
    if (isCheckIn && distance !== null && officeLoc !== null) {
      if (distance > officeLoc.radius) {
        if (!hasShownOutOfRangeAlert) {
          showAlert(
            'Out of Office Range',
            `You are currently outside the allowed office boundary (${Math.round(distance)}m away. Limit: ${officeLoc.radius}m). The check-in button will remain disabled until you are within the limit.`,
            [{ text: 'OK' }]
          );
          setHasShownOutOfRangeAlert(true);
        }
      } else {
        setHasShownOutOfRangeAlert(false);
      }
    }
  }, [isCheckIn, distance, officeLoc, hasShownOutOfRangeAlert]);

  // Out-of-range auto-logout flow
  useEffect(() => {
    if (hasTriggeredLogout.current) return;
    // Auto-logout only when the employee has already checked in (isCheckIn is false)
    if (!isCheckIn && currentCoords && officeLoc && distance !== null) {
      if (distance > officeLoc.radius) {
        hasTriggeredLogout.current = true;
        triggerOutOfRangeLogout(distance);
      }
    }
  }, [isCheckIn, currentCoords, officeLoc, distance]);

  const triggerOutOfRangeLogout = async (currentDistance: number) => {
    if (!user) return;

    try {
      const displayDistance = Math.round(currentDistance);
      const limit = officeLoc?.radius || 10;

      // 1. Log Activity
      await firestore().collection('activity_logs').add({
        employeeId: user.uid,
        activity: `Auto-logout triggered: Went out of geofence boundary (${displayDistance}m away, limit: ${limit}m)`,
        timestamp: firestore.FieldValue.serverTimestamp(),
      });

      // 2. Send notification to reporting Admin
      if (adminId) {
        await firestore().collection('notifications').add({
          employeeId: adminId,
          title: 'Geofence Breach',
          body: `${user.name || 'An employee'} was logged out automatically because they went out of range (${displayDistance}m from office, limit: ${limit}m).`,
          status: 'unread',
          createdAt: firestore.FieldValue.serverTimestamp(),
        });
      }

      // 3. Send notification to Employee
      await firestore().collection('notifications').add({
        employeeId: user.uid,
        title: 'Geofence Breach',
        body: `You were logged out automatically because you went outside the allowed office boundary (${displayDistance}m from office, limit: ${limit}m).`,
        status: 'unread',
        createdAt: firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.warn('Error during geofence auto-logout notification write:', e);
    }

    // 4. Alert user and sign out
    showAlert(
      'Out of Office Range',
      `You have been logged out because you are outside the allowed office boundary (${Math.round(currentDistance)}m away).`,
      [
        {
          text: 'OK',
          onPress: async () => {
            try {
              await auth().signOut();
              dispatch(logoutSuccess());
            } catch (err) {
              console.warn('Logout error:', err);
            }
          },
        },
      ]
    );
  };

  const handleMarkAttendance = async () => {
    if (!currentCoords || !officeLoc) {
      showAlert('Location Error', 'Wait until your coordinates are verified by GPS.');
      return;
    }

    if (!isWithinGeofence) {
      showAlert('Out of Boundary', 'You must be inside the allowed geofence to mark attendance.');
      return;
    }

    if (currentCoords.accuracy > 80) {
      showAlert(
        'Low GPS Accuracy',
        `Your current GPS accuracy is ±${Math.round(currentCoords.accuracy)}m. Proceed anyway?`,
        [
          { text: 'Wait for better lock', style: 'cancel' },
          { text: 'Proceed', onPress: () => submitAttendance() }
        ]
      );
    } else {
      submitAttendance();
    }
  };

  const submitAttendance = async () => {
    if (!currentCoords || !officeLoc || !user) return;

    setSubmitting(true);
    try {
      const type = isCheckIn ? 'checkIn' : 'checkOut';
      const uid = user.uid;

      // Double check geofence boundary before committing
      const distance = getDistance(currentCoords.latitude, currentCoords.longitude, officeLoc.latitude, officeLoc.longitude);

      if (distance > officeLoc.radius) {
        // Log failed attempt
        await firestore().collection('activity_logs').add({
          employeeId: uid,
          activity: `Attempted ${type === 'checkIn' ? 'Check-In' : 'Check-Out'} failed: Outside geofence (${Math.round(distance)}m from office)`,
          timestamp: firestore.FieldValue.serverTimestamp(),
        });

        showAlert(
          'Verification Failed',
          `Geofence failed. You are outside the allowed office boundary (${Math.round(distance)}m away).`,
          [{ text: 'Try Again', onPress: () => loadCoordinates() }]
        );
        return;
      }

      // Helper for IST Date
      const getISTDate = () => {
        const now = new Date();
        const dateFormatter = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Kolkata',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        });
        const dateString = dateFormatter.format(now);

        const timeFormatter = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Kolkata',
          hour: 'numeric',
          minute: 'numeric',
          hour12: false,
        });
        const timeParts = timeFormatter.formatToParts(now);
        const hoursPart = timeParts.find(p => p.type === 'hour')?.value;
        const minutesPart = timeParts.find(p => p.type === 'minute')?.value;
        const istHours = parseInt(hoursPart || '0', 10);
        const istMinutes = parseInt(minutesPart || '0', 10);

        return { dateString, currentTime: now, istHours, istMinutes };
      };

      const { dateString, currentTime, istHours, istMinutes } = getISTDate();

      // Check if attendance already exists
      const attendanceQuery = await firestore()
        .collection('attendance')
        .where('employeeId', '==', uid)
        .where('date', '==', dateString)
        .limit(1)
        .get();

      if (type === 'checkIn') {
        if (!attendanceQuery.empty) {
          showAlert('Error', 'You have already checked in for today.');
          return;
        }

        // Calculate if Late (past 9:15 AM IST)
        let status = 'Present';
        if (istHours > 9 || (istHours === 9 && istMinutes > 15)) {
          status = 'Late';
        }

        const newAttendance = {
          employeeId: uid,
          employeeName: user?.name || 'Employee',
          adminId: user?.adminId || '',
          checkIn: firestore.FieldValue.serverTimestamp(),
          checkOut: null,
          latitude: currentCoords.latitude,
          longitude: currentCoords.longitude,
          status,
          lateStatus: status === 'Late' ? 'Pending' : null,
          workingHours: 0,
          date: dateString,
          checkInAddress: address,
        };

        const docRef = await firestore().collection('attendance').add(newAttendance);

        // Log success
        await firestore().collection('activity_logs').add({
          employeeId: uid,
          activity: `Checked in successfully (Status: ${status})`,
          timestamp: firestore.FieldValue.serverTimestamp(),
        });

        // Update RTDB presence
        await database().ref(`status/users/${uid}`).update({
          checkInStatus: 'checked-in',
          lastCheckIn: database.ServerValue.TIMESTAMP,
          currentActivity: 'Checked-in',
          checkInAddress: address,
          checkInTime: database.ServerValue.TIMESTAMP,
        });

        // Notify Admin of Check-in
        if (adminId) {
          const estDeduction = employeeSalary ? (employeeSalary / 60) : 0;
          await firestore().collection('notifications').add({
            employeeId: adminId,
            title: status === 'Late' ? 'Late Login Request' : 'Employee Checked In',
            body: status === 'Late'
              ? `${user?.name || 'Employee'} logged in late today. Estimated Deduction: ₹${estDeduction.toFixed(2)}. Approval required.`
              : `${user?.name || 'Employee'} has checked in today with status: ${status}.`,
            status: 'unread',
            createdAt: firestore.FieldValue.serverTimestamp(),
            type: status === 'Late' ? 'late_pardon_request' : 'check_in',
            attendanceId: status === 'Late' ? docRef.id : null,
            senderName: user?.name || 'Employee',
            senderId: uid,
            estimatedDeduction: status === 'Late' ? estDeduction : 0,
          });
        }

        showAlert(
          'Success',
          `Check-in completed successfully. Status: ${status}`,
          [{ text: 'Return to Dashboard', onPress: () => navigation.goBack() }]
        );
      } else {
        // type === 'checkOut'
        if (attendanceQuery.empty) {
          showAlert('Error', 'No check-in record found for today. You must check in first.');
          return;
        }

        const attendanceDoc = attendanceQuery.docs[0];
        const attendanceData = attendanceDoc.data();

        if (attendanceData.checkOut) {
          showAlert('Error', 'You have already checked out for today.');
          return;
        }

        // Calculate working hours
        const checkInTime = attendanceData.checkIn.toDate();
        const checkOutTime = currentTime;
        const workingHours = (checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);

        await attendanceDoc.ref.update({
          checkOut: firestore.FieldValue.serverTimestamp(),
          workingHours: Number(workingHours.toFixed(2)),
          checkOutAddress: address,
        });

        // Log success
        await firestore().collection('activity_logs').add({
          employeeId: uid,
          activity: `Checked out successfully (Hours: ${workingHours.toFixed(2)})`,
          timestamp: firestore.FieldValue.serverTimestamp(),
        });

        // Update RTDB presence
        await database().ref(`status/users/${uid}`).update({
          checkInStatus: 'checked-out',
          lastCheckOut: database.ServerValue.TIMESTAMP,
          currentActivity: 'Checked-out',
          checkOutAddress: address,
          checkOutTime: database.ServerValue.TIMESTAMP,
        });

        // Notify Admin of Check-out
        if (adminId) {
          await firestore().collection('notifications').add({
            employeeId: adminId,
            title: 'Employee Checked Out',
            body: `${user?.name || 'Employee'} has checked out today. Total hours: ${workingHours.toFixed(2)}h.`,
            status: 'unread',
            createdAt: firestore.FieldValue.serverTimestamp(),
          });
        }

        showAlert(
          'Success',
          `Check-out completed successfully. Total hours: ${workingHours.toFixed(2)}h`,
          [{ text: 'Return to Dashboard', onPress: () => navigation.goBack() }]
        );
      }
    } catch (err: any) {
      console.error('Attendance submit error:', err);
      showAlert('Internal Error', err.message || 'Failed to submit attendance.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header title={isCheckIn ? 'Check-In Terminal' : 'Check-Out Terminal'} showBackButton />

      <View style={styles.content}>
        {/* Info card */}
        <Card style={styles.infoCard}>
          <View style={[styles.badge, { backgroundColor: isCheckIn ? COLORS.successLight : COLORS.infoLight }]}>
            <Icon
              name={isCheckIn ? 'log-in' : 'log-out'}
              size={24}
              color={isCheckIn ? COLORS.success : COLORS.info}
            />
          </View>
          <Text style={styles.cardTitle}>
            {isCheckIn ? 'Ready to Check-In' : 'Ready to Check-Out'}
          </Text>
          <Text style={styles.cardSub}>
            {isCheckIn 
              ? 'Marking attendance logs your check-in time and validates coordinates against the office boundary.'
              : 'Checking out completes your work session and calculates total active hours.'}
          </Text>
        </Card>

        {/* GPS Coordinates telemetry card */}
        <Card style={styles.gpsCard}>
          <Text style={styles.gpsTitle}>GPS Location & Geofence</Text>

          {loadingLocation || loadingOffice ? (
            <View style={styles.gpsLoading}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.gpsLoadingText}>
                {loadingLocation ? 'Querying orbital telemetry...' : 'Loading geofence configuration...'}
              </Text>
            </View>
          ) : currentCoords ? (
            <View style={styles.coordsGrid}>
              <View style={styles.coordsRowCol}>
                <Text style={styles.coordsLabel}>Current Address</Text>
                {loadingAddress ? (
                  <ActivityIndicator size="small" color={COLORS.primary} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
                ) : (
                  <Text style={styles.addressValue}>{address}</Text>
                )}
              </View>

              <View style={styles.coordsRow}>
                <Text style={styles.coordsLabel}>GPS Accuracy</Text>
                <Text style={styles.coordsValue}>±{Math.round(currentCoords.accuracy)} meters</Text>
              </View>

              {distance !== null && officeLoc !== null ? (
                <View style={styles.geofenceStatusContainer}>
                  <View style={[
                    styles.geofenceBanner, 
                    { 
                      backgroundColor: isWithinGeofence ? COLORS.success + '1A' : COLORS.danger + '1A',
                      borderColor: isWithinGeofence ? COLORS.success + '30' : COLORS.danger + '30' 
                    }
                  ]}>
                    <Icon 
                      name={isWithinGeofence ? 'checkmark-circle-outline' : 'close-circle-outline'} 
                      size={18} 
                      color={isWithinGeofence ? COLORS.success : COLORS.danger} 
                    />
                    <Text style={[styles.geofenceText, { color: isWithinGeofence ? COLORS.success : COLORS.danger }]}>
                      {isWithinGeofence 
                        ? `In Range: You are ${Math.round(distance)}m from the office.`
                        : `Out of Range: You are ${Math.round(distance)}m from the office (Limit: ${officeLoc.radius}m).`}
                    </Text>
                  </View>
                </View>
              ) : officeLoc === null && !loadingOffice ? (
                <View style={styles.geofenceStatusContainer}>
                  <View style={[
                    styles.geofenceBanner, 
                    { 
                      backgroundColor: COLORS.danger + '1A',
                      borderColor: COLORS.danger + '30' 
                    }
                  ]}>
                    <Icon 
                      name="close-circle-outline" 
                      size={18} 
                      color={COLORS.danger} 
                    />
                    <Text style={[styles.geofenceText, { color: COLORS.danger }]}>
                      Office location not configured by Admin.
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.gpsError}>
              <Icon name="warning" size={24} color={COLORS.danger} />
              <Text style={styles.errorText}>GPS signal is currently unavailable. Please verify location settings.</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.refreshButton}
            onPress={loadCoordinates}
            disabled={loadingLocation || submitting}
          >
            <Icon name="refresh" size={16} color={COLORS.primary} />
            <Text style={styles.refreshText}>Recalibrate GPS</Text>
          </TouchableOpacity>
        </Card>

        {/* Action Buttons */}
        <View style={styles.actionContainer}>
          <Button
            title={submitting ? 'Authenticating...' : isCheckIn ? 'Mark Check-In' : 'Mark Check-Out'}
            loading={submitting}
            onPress={handleMarkAttendance}
            disabled={isButtonDisabled}
            variant={isCheckIn ? 'primary' : 'secondary'}
            style={styles.submitBtn}
          />
        </View>
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
    padding: SPACING.md,
  },
  infoCard: {
    alignItems: 'center',
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  badge: {
    width: 60,
    height: 60,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.02)',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  cardSub: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    fontWeight: '600',
  },
  gpsCard: {
    padding: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  gpsTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    borderBottomWidth: 1.5,
    borderBottomColor: COLORS.border,
    paddingBottom: SPACING.sm,
    marginBottom: SPACING.md,
  },
  gpsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  gpsLoadingText: {
    marginLeft: 8,
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  coordsGrid: {
    paddingVertical: SPACING.xs,
  },
  coordsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  coordsRowCol: {
    flexDirection: 'column',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  coordsLabel: {
    fontSize: 12,
    color: COLORS.textLight,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  coordsValue: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.text,
    marginTop: 2,
  },
  addressValue: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    lineHeight: 18,
    marginTop: 4,
  },
  geofenceStatusContainer: {
    marginTop: SPACING.md,
  },
  geofenceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  geofenceText: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 8,
    lineHeight: 16,
    flex: 1,
  },
  gpsError: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  errorText: {
    marginLeft: 8,
    fontSize: 13,
    color: COLORS.danger,
    flex: 1,
    fontWeight: '600',
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: COLORS.primary + '30',
    borderRadius: 20,
    backgroundColor: COLORS.primary + '05',
  },
  refreshText: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
  },
  actionContainer: {
    marginTop: 'auto',
    marginBottom: SPACING.md,
  },
  submitBtn: {
    height: 52,
    borderRadius: 12,
  },
});
