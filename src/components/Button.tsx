import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  TouchableOpacityProps,
} from 'react-native';
import { COLORS, SPACING } from '../constants/theme';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'warning';
}

export const Button: React.FC<ButtonProps> = ({
  title,
  loading = false,
  variant = 'primary',
  disabled,
  style,
  ...props
}) => {
  const getButtonStyles = () => {
    switch (variant) {
      case 'secondary':
        return [styles.button, styles.btnSecondary, style];
      case 'danger':
        return [styles.button, styles.btnDanger, style];
      case 'warning':
        return [styles.button, styles.btnWarning, style];
      case 'outline':
        return [styles.button, styles.btnOutline, style];
      default:
        return [styles.button, styles.btnPrimary, style];
    }
  };

  const getTextStyles = () => {
    switch (variant) {
      case 'outline':
        return [styles.text, styles.textOutline];
      default:
        return [styles.text, styles.textPrimary];
    }
  };

  return (
    <TouchableOpacity
      style={getButtonStyles()}
      disabled={disabled || loading}
      activeOpacity={0.8}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'outline' ? COLORS.primary : COLORS.surface}
          size="small"
        />
      ) : (
        <Text style={getTextStyles()}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: SPACING.md,
    flexDirection: 'row',
  },
  btnPrimary: {
    backgroundColor: COLORS.primary,
  },
  btnSecondary: {
    backgroundColor: COLORS.secondary,
  },
  btnDanger: {
    backgroundColor: COLORS.danger,
  },
  btnWarning: {
    backgroundColor: COLORS.warning,
  },
  btnOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
  },
  textPrimary: {
    color: COLORS.surface,
  },
  textOutline: {
    color: COLORS.primary,
  },
});
