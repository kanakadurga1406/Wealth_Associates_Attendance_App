import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { COLORS, SHADOWS } from '../constants/theme';
import { useCustomAlert } from '../context/CustomAlertContext';

interface BottomTabBarProps {
  role: 'EMPLOYEE' | 'ADMIN' | 'SUPER_ADMIN';
  activeTab: string;
  navigation: any;
}

export const BottomTabBar: React.FC<BottomTabBarProps> = ({ role, activeTab, navigation }) => {
  const { showAlert } = useCustomAlert();

  if (role === 'EMPLOYEE') {
    return (
      <View style={styles.bottomTabBar}>
        <TouchableOpacity 
          style={styles.tabItem} 
          onPress={() => navigation.navigate('History')}
        >
          <Icon 
            name={activeTab === 'History' ? 'receipt' : 'receipt-outline'} 
            size={22} 
            color={activeTab === 'History' ? COLORS.primary : COLORS.textLight} 
          />
          <Text style={[styles.tabLabel, activeTab === 'History' && styles.tabLabelActive]}>History</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.tabItem} 
          onPress={() => navigation.navigate('LeaveRequest')}
        >
          <Icon 
            name={activeTab === 'Requests' ? 'add-circle' : 'add-circle-outline'} 
            size={22} 
            color={activeTab === 'Requests' ? COLORS.primary : COLORS.textLight} 
          />
          <Text style={[styles.tabLabel, activeTab === 'Requests' && styles.tabLabelActive]}>Requests</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.tabItem, activeTab === 'Home' && styles.tabItemActive]} 
          onPress={() => navigation.navigate('EmployeeDashboard')}
        >
          <View style={[styles.homeTabBadge, activeTab === 'Home' ? styles.homeBadgeActive : styles.homeBadgeInactive]}>
            <Icon name={activeTab === 'Home' ? 'home' : 'home-outline'} size={20} color="#FFFFFF" />
          </View>
          <Text style={[styles.tabLabel, activeTab === 'Home' && styles.tabLabelActive]}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.tabItem} 
          onPress={() => navigation.navigate('MyApplications')}
        >
          <Icon 
            name={activeTab === 'Applications' ? 'document-text' : 'document-text-outline'} 
            size={22} 
            color={activeTab === 'Applications' ? COLORS.primary : COLORS.textLight} 
          />
          <Text style={[styles.tabLabel, activeTab === 'Applications' && styles.tabLabelActive]}>Applications</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.tabItem} 
          onPress={() => navigation.navigate('Profile')}
        >
          <Icon 
            name={activeTab === 'Profile' ? 'person' : 'person-outline'} 
            size={22} 
            color={activeTab === 'Profile' ? COLORS.primary : COLORS.textLight} 
          />
          <Text style={[styles.tabLabel, activeTab === 'Profile' && styles.tabLabelActive]}>Profile</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (role === 'ADMIN') {
    return (
      <View style={styles.bottomTabBar}>
        <TouchableOpacity 
          style={styles.tabItem} 
          onPress={() => navigation.navigate('AdminDashboard')}
        >
          <Icon 
            name={activeTab === 'Home' ? 'home' : 'home-outline'} 
            size={22} 
            color={activeTab === 'Home' ? COLORS.primary : COLORS.textLight} 
          />
          <Text style={[styles.tabLabel, activeTab === 'Home' && styles.tabLabelActive]}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.tabItem} 
          onPress={() => navigation.navigate('EmployeesList')}
        >
          <Icon 
            name={activeTab === 'Directory' ? 'people' : 'people-outline'} 
            size={22} 
            color={activeTab === 'Directory' ? COLORS.primary : COLORS.textLight} 
          />
          <Text style={[styles.tabLabel, activeTab === 'Directory' && styles.tabLabelActive]}>Directory</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.tabItem} 
          onPress={() => navigation.navigate('RealTimeStatus')}
        >
          <Icon 
            name={activeTab === 'Live Status' ? 'pulse' : 'pulse-outline'} 
            size={22} 
            color={activeTab === 'Live Status' ? COLORS.primary : COLORS.textLight} 
          />
          <Text style={[styles.tabLabel, activeTab === 'Live Status' && styles.tabLabelActive]}>Live Status</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.tabItem} 
          onPress={() => navigation.navigate('LeaveApprovals')}
        >
          <Icon 
            name={activeTab === 'Approvals' ? 'mail-unread' : 'mail-unread-outline'} 
            size={22} 
            color={activeTab === 'Approvals' ? COLORS.primary : COLORS.textLight} 
          />
          <Text style={[styles.tabLabel, activeTab === 'Approvals' && styles.tabLabelActive]}>Approvals</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.tabItem} 
          onPress={() => navigation.navigate('Payroll')}
        >
          <Icon 
            name={activeTab === 'Payroll' ? 'cash' : 'cash-outline'} 
            size={22} 
            color={activeTab === 'Payroll' ? COLORS.primary : COLORS.textLight} 
          />
          <Text style={[styles.tabLabel, activeTab === 'Payroll' && styles.tabLabelActive]}>Payroll</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (role === 'SUPER_ADMIN') {
    return (
      <View style={styles.bottomTabBar}>
        <TouchableOpacity 
          style={styles.tabItem} 
          onPress={() => navigation.navigate('SuperAdminDashboard')}
        >
          <Icon 
            name={activeTab === 'Home' ? 'home' : 'home-outline'} 
            size={22} 
            color={activeTab === 'Home' ? COLORS.primary : COLORS.textLight} 
          />
          <Text style={[styles.tabLabel, activeTab === 'Home' && styles.tabLabelActive]}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.tabItem} 
          onPress={() => navigation.navigate('AdminsList')}
        >
          <Icon 
            name={activeTab === 'Admins' ? 'shield-checkmark' : 'shield-checkmark-outline'} 
            size={22} 
            color={activeTab === 'Admins' ? COLORS.primary : COLORS.textLight} 
          />
          <Text style={[styles.tabLabel, activeTab === 'Admins' && styles.tabLabelActive]}>Admins</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.tabItem} 
          onPress={() => navigation.navigate('RealTimeStatus')}
        >
          <Icon 
            name={activeTab === 'Live Status' ? 'pulse' : 'pulse-outline'} 
            size={22} 
            color={activeTab === 'Live Status' ? COLORS.primary : COLORS.textLight} 
          />
          <Text style={[styles.tabLabel, activeTab === 'Live Status' && styles.tabLabelActive]}>Live Status</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.tabItem} 
          onPress={() => navigation.navigate('LeaveApprovals')}
        >
          <Icon 
            name={activeTab === 'Approvals' ? 'mail-unread' : 'mail-unread-outline'} 
            size={22} 
            color={activeTab === 'Approvals' ? COLORS.primary : COLORS.textLight} 
          />
          <Text style={[styles.tabLabel, activeTab === 'Approvals' && styles.tabLabelActive]}>Approvals</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.tabItem} 
          onPress={() => navigation.navigate('Payroll')}
        >
          <Icon 
            name={activeTab === 'Payroll' ? 'cash' : 'cash-outline'} 
            size={22} 
            color={activeTab === 'Payroll' ? COLORS.primary : COLORS.textLight} 
          />
          <Text style={[styles.tabLabel, activeTab === 'Payroll' && styles.tabLabelActive]}>Payroll</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
};

const styles = StyleSheet.create({
  bottomTabBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 72,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#EBE7F2',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: Platform.OS === 'ios' ? 12 : 0,
    ...SHADOWS.lg,
    zIndex: 9999,
    elevation: 15,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  tabItemActive: {
    marginTop: -20,
  },
  homeTabBadge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.md,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  homeBadgeActive: {
    backgroundColor: COLORS.primary,
  },
  homeBadgeInactive: {
    backgroundColor: COLORS.textLight,
  },
  tabLabel: {
    fontSize: 10,
    color: COLORS.textLight,
    fontWeight: '600',
    marginTop: 4,
  },
  tabLabelActive: {
    color: COLORS.primary,
    fontWeight: '800',
  },
});
