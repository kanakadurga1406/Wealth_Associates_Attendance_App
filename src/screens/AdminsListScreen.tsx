import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, FlatList, ActivityIndicator } from 'react-native';
import firestore from '@react-native-firebase/firestore';
import { COLORS, SPACING } from '../constants/theme';
import { Header } from '../components/Header';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { useCustomAlert } from '../context/CustomAlertContext';

export const AdminsListScreen: React.FC = () => {
  const [admins, setAdmins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { showAlert } = useCustomAlert();

  useEffect(() => {
    // Listen to all Admin users in Firestore users collection
    const unsubscribe = firestore()
      .collection('users')
      .where('role', '==', 'ADMIN')
      .onSnapshot(
        (snapshot) => {
          setLoading(true);
          if (!snapshot) return;
          const list = snapshot.docs.map((doc) => ({
            uid: doc.id,
            ...doc.data(),
          }));
          setAdmins(list);
          setLoading(false);
        },
        (error) => {
          console.warn('Admins fetch error:', error);
          setLoading(false);
        }
      );

    return () => unsubscribe();
  }, []);

  const toggleAdminBlockStatus = async (uid: string, currentStatus: string, name: string) => {
    const nextStatus = currentStatus === 'blocked' ? 'active' : 'blocked';
    const actionText = nextStatus === 'blocked' ? 'Block' : 'Unblock';

    showAlert(
      `${actionText} Admin`,
      `Are you sure you want to ${actionText.toLowerCase()} ${name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: actionText,
          style: nextStatus === 'blocked' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              setLoading(true);
              // Update user status in users collection
              await firestore().collection('users').doc(uid).update({
                status: nextStatus,
              });
              
              // Log administrative activity
              await firestore().collection('activity_logs').add({
                employeeId: firestore.FieldValue.delete(), // Super Admin self-action placeholder or omit
                activity: `${actionText}ed Admin account: ${name}`,
                timestamp: firestore.FieldValue.serverTimestamp(),
              });

              showAlert('Success', `Admin ${name} has been ${nextStatus}d.`);
            } catch (err: any) {
              console.warn('Status toggle error:', err);
              setLoading(false);
              showAlert('Error', err.message || 'Unable to update status.');
            }
          },
        },
      ]
    );
  };

  const handleDeleteAdmin = (uid: string, name: string) => {
    showAlert(
      'Delete Admin Account',
      `Are you sure you want to permanently delete Admin ${name}? This will remove their account and profiles from the workspace.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              // 1. Delete from users collection
              await firestore().collection('users').doc(uid).delete();
              
              // 2. Delete from admins collection
              await firestore().collection('admins').doc(uid).delete();
              
              // 3. Log activity
              await firestore().collection('activity_logs').add({
                employeeId: firestore.FieldValue.delete(),
                activity: `Deleted Admin account: ${name}`,
                timestamp: firestore.FieldValue.serverTimestamp(),
              });

              showAlert('Success', `Admin ${name} deleted successfully.`);
            } catch (err: any) {
              console.warn('Admin delete error:', err);
              setLoading(false);
              showAlert('Error', err.message || 'Unable to delete Admin.');
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: any }) => {
    const isBlocked = item.status === 'blocked';
    
    return (
      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1, paddingRight: 8 }}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.email}>{item.email}</Text>
            {item.location && (
              <Text style={styles.locationText}>
                📍 {item.location.assemblyName} ({item.location.parliamentName})
              </Text>
            )}
          </View>
          <StatusBadge status={item.status || 'active'} />
        </View>

        <View style={styles.actionsContainer}>
          <Button
            title={isBlocked ? 'Unblock' : 'Block'}
            variant={isBlocked ? 'primary' : 'warning'}
            onPress={() => toggleAdminBlockStatus(item.uid, item.status || 'active', item.name)}
            style={[styles.actionBtn, { marginRight: 8 }]}
          />
          <Button
            title="Delete Admin"
            variant="danger"
            onPress={() => handleDeleteAdmin(item.uid, item.name)}
            style={styles.actionBtn}
          />
        </View>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Manage Admins" showBackButton />
      
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Fetching Admin accounts...</Text>
        </View>
      ) : (
        <FlatList
          data={admins}
          renderItem={renderItem}
          keyExtractor={(item) => item.uid}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No Admin accounts configured yet.</Text>
          }
        />
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
  },
  card: {
    marginBottom: SPACING.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: SPACING.sm,
  },
  name: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  email: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  locationText: {
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
    width: 120,
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
});
