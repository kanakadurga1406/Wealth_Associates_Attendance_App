import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, StatusBar, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { COLORS, SPACING } from '../constants/theme';
import { useSelector } from 'react-redux';
import { RootState } from '../redux/store';
import { useCustomAlert } from '../context/CustomAlertContext';

interface HeaderProps {
  title: string;
  showBackButton?: boolean;
  rightAction?: () => void;
  rightIcon?: string;
  subtitle?: string;
}

const logoImg = require('../assets/attendance_icon.png');

export const Header: React.FC<HeaderProps> = ({
  title,
  showBackButton = false,
  rightAction,
  rightIcon,
  subtitle
}) => {
  const navigation = useNavigation();
  const { user } = useSelector((state: RootState) => state.auth);
  const { showAlert } = useCustomAlert();

  const getRoleIcon = () => {
    if (user?.role === 'SUPER_ADMIN') return 'shield-checkmark-outline';
    if (user?.role === 'ADMIN') return 'people-circle-outline';
    return 'person-circle-outline';
  };

  const handleProfilePress = () => {
    if (!user) return;

    if (rightAction) {
      showAlert(
        'Confirm Log Out',
        'Do you want to log out of Wealth Attendance?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Log Out', style: 'destructive', onPress: rightAction }
        ]
      );
    } else if (user.role === 'EMPLOYEE') {
      navigation.navigate('Profile' as never);
    } else {
      showAlert(
        'Profile Information',
        `Name: ${user.name}\nEmail: ${user.email}\nRole: ${user.role}`
      );
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />
      <View style={styles.headerRow}>
        
        {/* Left Side: Back button + Logo + Title */}
        <View style={styles.leftContainer}>
          {showBackButton && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
            >
              <Icon name="arrow-back" size={24} color={COLORS.text} />
            </TouchableOpacity>
          )}
          
          <Image source={logoImg} style={styles.logo} />
          
          <View style={styles.titleContainer}>
            <Text style={styles.title} numberOfLines={1}>
              {showBackButton ? title : 'Wealth Attendance'}
            </Text>
            {subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
          </View>
        </View>

        {/* Right Side: Profile Icon + Role Label below it */}
        {user && (
          <TouchableOpacity 
            style={styles.profileSection} 
            onPress={handleProfilePress}
            activeOpacity={0.7}
          >
            <Icon name={getRoleIcon()} size={26} color={COLORS.primary} />
            <Text style={styles.profileRoleText}>
              {user.role === 'SUPER_ADMIN' ? 'Super Admin' : user.role === 'ADMIN' ? 'Admin' : 'Employee'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.md,
    paddingTop: 36, // Increased top padding for status bar clearance
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  leftContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: SPACING.xs,
  },
  titleContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  backButton: {
    marginRight: SPACING.sm,
    padding: SPACING.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 36, // Increased logo size from 28
    height: 36, // Increased logo size from 28
    marginRight: SPACING.sm,
    resizeMode: 'contain',
  },
  profileSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },
  profileRoleText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: COLORS.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
});
