import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { COLORS, SHADOWS, SPACING } from '../constants/theme';

interface CardProps extends ViewProps {
  elevated?: boolean;
}

export const Card: React.FC<CardProps> = ({ children, style, elevated = true, ...props }) => {
  return (
    <View
      style={[
        styles.card,
        elevated ? styles.elevated : styles.border,
        style
      ]}
      {...props}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  elevated: {
    ...SHADOWS.sm,
  },
  border: {
    // Border is handled by default card style for consistent corporate theme
  },
});
