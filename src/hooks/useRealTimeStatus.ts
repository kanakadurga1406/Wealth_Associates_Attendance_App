import { useEffect, useCallback } from 'react';
import database from '@react-native-firebase/database';
import { useSelector } from 'react-redux';
import { RootState } from '../redux/store';

export const useRealTimeStatus = () => {
  const user = useSelector((state: RootState) => state.auth.user);
  
  const updateActivity = useCallback(async (activity: string) => {
    if (!user) return;
    try {
      const statusRef = database().ref(`/status/users/${user.uid}`);
      await statusRef.update({
        currentActivity: activity,
        lastSeen: database.ServerValue.TIMESTAMP,
        state: 'online',
      });
    } catch (err) {
      console.warn('Realtime Database status update error:', err);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const statusRef = database().ref(`/status/users/${user.uid}`);
    const connectedRef = database().ref('.info/connected');

    const handleConnectionChange = (snapshot: any) => {
      const isConnected = snapshot.val();
      if (isConnected) {
        // Setup onDisconnect hook to mark offline without erasing details
        statusRef.onDisconnect().update({
          state: 'offline',
          lastSeen: database.ServerValue.TIMESTAMP,
        }).then(() => {
          // Mark online initially
          statusRef.update({
            state: 'online',
            lastSeen: database.ServerValue.TIMESTAMP,
            email: user.email,
            name: user.name,
            role: user.role,
            currentActivity: 'dashboard',
          });
        });
      }
    };

    // Listen to connection state
    const listener = connectedRef.on('value', handleConnectionChange);

    // Return cleanup
    return () => {
      connectedRef.off('value', listener);
      // Mark offline on unmount/logout
      statusRef.update({
        state: 'offline',
        lastSeen: database.ServerValue.TIMESTAMP,
      });
    };
  }, [user]);

  return { updateActivity };
};
