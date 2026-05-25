import 'react-native-gesture-handler/jestSetup';

// Mock react-native-reanimated if needed, but we don't use it.
// Mock react-native-permissions
jest.mock('react-native-permissions', () => {
  const mockPermissions = {
    ANDROID: {
      ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
      ACCESS_COARSE_LOCATION: 'android.permission.ACCESS_COARSE_LOCATION',
    },
    IOS: {
      LOCATION_WHEN_IN_USE: 'ios.permission.LOCATION_WHEN_IN_USE',
      LOCATION_ALWAYS: 'ios.permission.LOCATION_ALWAYS',
    },
  };
  const mockResults = {
    GRANTED: 'granted',
    DENIED: 'denied',
    BLOCKED: 'blocked',
    UNAVAILABLE: 'unavailable',
  };
  return {
    PERMISSIONS: mockPermissions,
    RESULTS: mockResults,
    request: jest.fn(() => Promise.resolve(mockResults.GRANTED)),
    check: jest.fn(() => Promise.resolve(mockResults.GRANTED)),
    requestMultiple: jest.fn(() => Promise.resolve({ [mockPermissions.ANDROID.ACCESS_FINE_LOCATION]: mockResults.GRANTED })),
    checkMultiple: jest.fn(() => Promise.resolve({ [mockPermissions.ANDROID.ACCESS_FINE_LOCATION]: mockResults.GRANTED })),
  };
});

// Mock react-native-geolocation-service
jest.mock('react-native-geolocation-service', () => ({
  getCurrentPosition: jest.fn((success, error, options) => {
    success({
      coords: {
        latitude: 12.9716,
        longitude: 77.5946,
        accuracy: 10,
      },
      timestamp: Date.now(),
    });
  }),
  watchPosition: jest.fn(),
  clearWatch: jest.fn(),
  stopObserving: jest.fn(),
}));

// Mock react-native-vector-icons
jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');

// Mock @react-native-firebase
const mockFirestoreCollection = jest.fn(() => ({
  doc: jest.fn(() => ({
    get: jest.fn(() => Promise.resolve({
      exists: () => true,
      data: () => ({ role: 'EMPLOYEE', name: 'Test User' }),
    })),
    set: jest.fn(() => Promise.resolve()),
    update: jest.fn(() => Promise.resolve()),
    onSnapshot: jest.fn((callback) => {
      callback({
        exists: () => true,
        data: () => ({ role: 'EMPLOYEE', name: 'Test User' }),
      });
      return jest.fn();
    }),
  })),
  where: jest.fn(() => ({
    limit: jest.fn(() => ({
      onSnapshot: jest.fn((callback) => {
        callback({
          empty: false,
          docs: [{
            id: 'test-doc-id',
            exists: () => true,
            data: () => ({ role: 'EMPLOYEE', name: 'Test User' }),
          }],
        });
        return jest.fn();
      }),
      get: jest.fn(() => Promise.resolve({
        empty: false,
        docs: [{
          id: 'test-doc-id',
          exists: () => true,
          data: () => ({ role: 'EMPLOYEE', name: 'Test User' }),
        }],
      })),
    })),
    onSnapshot: jest.fn((callback) => {
      callback({
        docs: [{
          id: 'test-doc',
          data: () => ({ date: '2026-05-22', status: 'Present' }),
        }],
      });
      return jest.fn();
    }),
  })),
}));

jest.mock('@react-native-firebase/app', () => ({}));
jest.mock('@react-native-firebase/auth', () => {
  const authInstance = {
    currentUser: { uid: 'test-uid', email: 'test@wealthapp.com' },
    onAuthStateChanged: jest.fn((callback) => {
      callback({ uid: 'test-uid', email: 'test@wealthapp.com' });
      return jest.fn();
    }),
    signInWithEmailAndPassword: jest.fn(() => Promise.resolve({ user: { uid: 'test-uid' } })),
    signOut: jest.fn(() => Promise.resolve()),
  };
  const authModule = () => authInstance;
  return authModule;
});

jest.mock('@react-native-firebase/firestore', () => {
  const firestoreModule = () => ({
    collection: mockFirestoreCollection,
  });
  firestoreModule.FieldValue = {
    serverTimestamp: jest.fn(() => 'mock-timestamp'),
    delete: jest.fn(() => 'mock-delete'),
  };
  return firestoreModule;
});

jest.mock('@react-native-firebase/database', () => {
  const databaseInstance = {
    ref: jest.fn(() => ({
      on: jest.fn((event, callback) => {
        callback({
          val: () => ({
            'test-uid': { state: 'online', currentActivity: 'Active', lastSeen: Date.now() },
          }),
        });
        return jest.fn();
      }),
      off: jest.fn(),
      set: jest.fn(() => Promise.resolve()),
      onDisconnect: jest.fn(() => ({
        set: jest.fn(() => Promise.resolve()),
      })),
    })),
  };
  const databaseModule = () => databaseInstance;
  return databaseModule;
});

jest.mock('@react-native-firebase/functions', () => {
  const functionsInstance = {
    httpsCallable: jest.fn(() => () => Promise.resolve({ data: { success: true, message: 'Success' } })),
  };
  const functionsModule = () => functionsInstance;
  return functionsModule;
});

jest.mock('@react-native-firebase/messaging', () => {
  const messagingInstance = {
    requestPermission: jest.fn(() => Promise.resolve(1)),
    getToken: jest.fn(() => Promise.resolve('mock-fcm-token')),
    onMessage: jest.fn(() => jest.fn()),
    setBackgroundMessageHandler: jest.fn(),
  };
  const messagingModule = () => messagingInstance;
  return messagingModule;
});

jest.mock('@react-native-firebase/storage', () => ({}));
