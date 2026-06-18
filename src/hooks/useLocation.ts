import { useState, useCallback, useRef, useEffect } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';

interface LocationCoords {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export const useLocation = () => {
  const [loading, setLoading] = useState(false);
  const [coords, setCoords] = useState<LocationCoords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const requestLocationPermission = useCallback(async (): Promise<boolean> => {
    try {
      if (Platform.OS === 'android') {
        const hasFine = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        if (hasFine) {
          return true;
        }

        const statuses = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
        ]);

        return (
          statuses[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] ===
          PermissionsAndroid.RESULTS.GRANTED
        );
      } else {
        const permission = Platform.select({
          ios: PERMISSIONS.IOS.LOCATION_WHEN_IN_USE,
        });

        if (!permission) return false;

        const status = await check(permission);
        
        if (status === RESULTS.GRANTED) {
          return true;
        }

        const requestStatus = await request(permission);
        return requestStatus === RESULTS.GRANTED;
      }
    } catch (err) {
      console.warn('Permission request error:', err);
      return false;
    }
  }, []);

  const startWatchingLocation = useCallback(async (
    onSuccess: (coords: LocationCoords) => void,
    onError: (errMessage: string) => void
  ) => {
    setLoading(true);
    setError(null);

    const hasPermission = await requestLocationPermission();
    if (!hasPermission) {
      const errMsg = 'Location permission denied.';
      setError(errMsg);
      setLoading(false);
      onError(errMsg);
      return null;
    }

    if (watchIdRef.current !== null) {
      Geolocation.clearWatch(watchIdRef.current);
    }

    const watchId = Geolocation.watchPosition(
      (position) => {
        const loc = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
        setCoords(loc);
        setLoading(false);
        onSuccess(loc);
      },
      (err) => {
        console.warn('Geolocation watch error:', err);
        const errMsg = err.message || 'Unable to retrieve location.';
        setError(errMsg);
        setLoading(false);
        onError(errMsg);
      },
      {
        enableHighAccuracy: true,
        distanceFilter: 0,
        interval: 5000,
        fastestInterval: 2000,
        showLocationDialog: true,
        forceRequestLocation: true,
      }
    );

    watchIdRef.current = watchId;
    return watchId;
  }, [requestLocationPermission]);

  const stopWatchingLocation = useCallback(() => {
    if (watchIdRef.current !== null) {
      Geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const getCurrentLocation = useCallback(async (): Promise<LocationCoords | null> => {
    setLoading(true);
    setError(null);

    const hasPermission = await requestLocationPermission();
    if (!hasPermission) {
      setError('Location permission denied.');
      setLoading(false);
      return null;
    }

    return new Promise((resolve) => {
      Geolocation.getCurrentPosition(
        (position) => {
          const loc = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          };
          setCoords(loc);
          setLoading(false);
          resolve(loc);
        },
        (err) => {
          console.warn('Geolocation error:', err);
          setError(err.message || 'Unable to retrieve location.');
          setLoading(false);
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
          forceRequestLocation: true,
          showLocationDialog: true,
        }
      );
    });
  }, [requestLocationPermission]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        Geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return {
    loading,
    coords,
    error,
    getCurrentLocation,
    startWatchingLocation,
    stopWatchingLocation,
  };
};

