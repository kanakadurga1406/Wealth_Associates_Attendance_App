import React from 'react';
import { StyleSheet, Text, TextInput, View, TextInputProps } from 'react-native';
import { COLORS, SPACING } from '../constants/theme';

interface InputProps extends TextInputProps {
  label: string;
  error?: string;
  touched?: boolean;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  touched,
  style,
  placeholderTextColor,
  ...props
}) => {
  const hasError = touched && error;
  
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          hasError && styles.inputError,
          style
        ]}
        placeholderTextColor={placeholderTextColor || COLORS.textLight}
        {...props}
      />
      {hasError ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.md,
    width: '100%',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    color: COLORS.text,
    fontSize: 16,
    backgroundColor: COLORS.surface,
  },
  inputError: {
    borderColor: COLORS.danger,
  },
  errorText: {
    fontSize: 12,
    color: COLORS.danger,
    marginTop: 4,
  },
});
