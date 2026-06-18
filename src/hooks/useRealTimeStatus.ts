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



  return { updateActivity };
};
