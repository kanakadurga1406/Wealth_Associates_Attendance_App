import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useSelector } from 'react-redux';
import { RootState } from '../redux/store';

// Auth Screen
import { LoginScreen } from '../screens/LoginScreen';

// Super Admin Screens
import { SuperAdminDashboard } from '../screens/SuperAdminDashboard';
import { CreateAdminScreen } from '../screens/CreateAdminScreen';
import { AdminsListScreen } from '../screens/AdminsListScreen';
import { PayrollScreen } from '../screens/PayrollScreen';

// Admin Screens
import { AdminDashboard } from '../screens/AdminDashboard';
import { CreateEmployeeScreen } from '../screens/CreateEmployeeScreen';
import { EmployeesListScreen } from '../screens/EmployeesListScreen';
import { OfficeLocationScreen } from '../screens/OfficeLocationScreen';
import { RealTimeStatusScreen } from '../screens/RealTimeStatusScreen';
import { LeaveApprovalsScreen } from '../screens/LeaveApprovalsScreen';
import { DeviceApprovalsScreen } from '../screens/DeviceApprovalsScreen';

// Employee Screens
import { EmployeeDashboard } from '../screens/EmployeeDashboard';
import { AttendanceScreen } from '../screens/AttendanceScreen';
import { LeaveRequestScreen } from '../screens/LeaveRequestScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { MyApplicationsScreen } from '../screens/MyApplicationsScreen';

const Stack = createStackNavigator();

export const AppNavigator: React.FC = () => {
  const { user, isAuthenticated } = useSelector((state: RootState) => state.auth);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'none' }}>
      {!isAuthenticated ? (
        // Unauthenticated Stack
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : user?.role === 'SUPER_ADMIN' ? (
        // Super Admin Stack
        <>
          <Stack.Screen name="SuperAdminDashboard" component={SuperAdminDashboard} />
          <Stack.Screen name="CreateAdmin" component={CreateAdminScreen} />
          <Stack.Screen name="AdminsList" component={AdminsListScreen} />
          <Stack.Screen name="CreateEmployee" component={CreateEmployeeScreen} />
          <Stack.Screen name="EmployeesList" component={EmployeesListScreen} />
          <Stack.Screen name="OfficeLocation" component={OfficeLocationScreen} />
          <Stack.Screen name="RealTimeStatus" component={RealTimeStatusScreen} />
          <Stack.Screen name="LeaveApprovals" component={LeaveApprovalsScreen} />
          <Stack.Screen name="DeviceApprovals" component={DeviceApprovalsScreen} />
          <Stack.Screen name="Payroll" component={PayrollScreen} />
        </>
      ) : user?.role === 'ADMIN' ? (
        // Admin Stack
        <>
          <Stack.Screen name="AdminDashboard" component={AdminDashboard} />
          <Stack.Screen name="CreateEmployee" component={CreateEmployeeScreen} />
          <Stack.Screen name="EmployeesList" component={EmployeesListScreen} />
          <Stack.Screen name="OfficeLocation" component={OfficeLocationScreen} />
          <Stack.Screen name="RealTimeStatus" component={RealTimeStatusScreen} />
          <Stack.Screen name="LeaveApprovals" component={LeaveApprovalsScreen} />
          <Stack.Screen name="DeviceApprovals" component={DeviceApprovalsScreen} />
          <Stack.Screen name="Payroll" component={PayrollScreen} />
        </>
      ) : (
        // Employee Stack
        <>
          <Stack.Screen name="EmployeeDashboard" component={EmployeeDashboard} />
          <Stack.Screen name="Attendance" component={AttendanceScreen} />
          <Stack.Screen name="LeaveRequest" component={LeaveRequestScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="History" component={HistoryScreen} />
          <Stack.Screen name="MyApplications" component={MyApplicationsScreen} />
        </>
      )}
    </Stack.Navigator>
  );
};
