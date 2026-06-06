import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import firestore from '@react-native-firebase/firestore';
import { RootState } from '../redux/store';
import { COLORS, SPACING, SHADOWS } from '../constants/theme';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { BottomTabBar } from '../components/BottomTabBar';
import Icon from 'react-native-vector-icons/Ionicons';
import { useRealTimeStatus } from '../hooks/useRealTimeStatus';

export const ProfileScreen: React.FC = () => {
  const user = useSelector((state: RootState) => state.auth.user);
  const navigation = useNavigation<any>();
  
  const [profileDetails, setProfileDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const { updateActivity } = useRealTimeStatus();

  useEffect(() => {
    updateActivity('viewing_profile');
  }, [updateActivity]);

  useEffect(() => {
    if (!user) return;

    const fetchEmployeeProfile = async () => {
      try {
        const empSnap = await firestore().collection('employees').doc(user.uid).get();
        if (empSnap.exists()) {
          const empData = empSnap.data();
          
          let managerName = 'Admin';
          if (empData?.adminId) {
            const managerSnap = await firestore().collection('users').doc(empData.adminId).get();
            if (managerSnap.exists()) {
              managerName = managerSnap.data()?.name || 'Admin';
            }
          }

          setProfileDetails({
            ...empData,
            managerName,
          });
        }
      } catch (err) {
        console.warn('Error fetching employee sub-profile:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchEmployeeProfile();
  }, [user]);

  const getInitials = (name: string) => {
    if (!name) return 'EE';
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <View style={styles.container}>
      <Header title="My Profile" showBackButton />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Fetching profile records...</Text>
        </View>
      ) : (
        <ScrollView 
          contentContainerStyle={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
        >
          {/* Profile Card */}
          <Card style={styles.profileCard}>
            <View style={styles.avatarSection}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{getInitials(user?.name || '')}</Text>
              </View>
              <Text style={styles.profileName}>{user?.name}</Text>
              <Text style={styles.profileRole}>Employee ID: {user?.uid.substring(0, 8).toUpperCase()}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.detailsSection}>
              <View style={styles.detailsRow}>
                <Icon name="mail-outline" size={18} color={COLORS.primary} style={styles.detailIcon} />
                <View>
                  <Text style={styles.detailTitle}>Email Address</Text>
                  <Text style={styles.detailValue}>{user?.email}</Text>
                </View>
              </View>

              <View style={styles.detailsRow}>
                <Icon name="business-outline" size={18} color={COLORS.primary} style={styles.detailIcon} />
                <View>
                  <Text style={styles.detailTitle}>Department</Text>
                  <Text style={styles.detailValue}>{profileDetails?.department || 'General'}</Text>
                </View>
              </View>

              <View style={styles.detailsRow}>
                <Icon name="call-outline" size={18} color={COLORS.primary} style={styles.detailIcon} />
                <View>
                  <Text style={styles.detailTitle}>Phone Number</Text>
                  <Text style={styles.detailValue}>{profileDetails?.phone || 'Not Configured'}</Text>
                </View>
              </View>

              <View style={styles.detailsRow}>
                <Icon name="shield-checkmark-outline" size={18} color={COLORS.primary} style={styles.detailIcon} />
                <View>
                  <Text style={styles.detailTitle}>Reporting Manager</Text>
                  <Text style={styles.detailValue}>{profileDetails?.managerName || 'Admin'}</Text>
                </View>
              </View>
            </View>
          </Card>
        </ScrollView>
      )}

      <BottomTabBar role="EMPLOYEE" activeTab="Profile" navigation={navigation} />
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
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: 12,
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  scrollContainer: {
    padding: SPACING.md,
    paddingBottom: 110,
  },
  profileCard: {
    padding: SPACING.md,
    alignItems: 'center',
    marginBottom: SPACING.lg,
    backgroundColor: COLORS.surface,
  },
  avatarSection: {
    alignItems: 'center',
    marginVertical: SPACING.sm,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: COLORS.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    ...SHADOWS.sm,
  },
  avatarText: {
    fontSize: 26,
    fontWeight: '800',
    color: COLORS.primary,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  profileRole: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 4,
    fontWeight: '700',
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 20,
  },
  divider: {
    height: 1.5,
    backgroundColor: COLORS.border,
    width: '100%',
    marginVertical: SPACING.md,
  },
  detailsSection: {
    width: '100%',
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  detailIcon: {
    marginRight: SPACING.md,
  },
  detailTitle: {
    fontSize: 10,
    color: COLORS.textLight,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 4,
  },
});
