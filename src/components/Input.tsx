import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View, TextInputProps, TouchableOpacity } from 'react-native';
import { COLORS, SPACING } from '../constants/theme';
import Icon from 'react-native-vector-icons/Ionicons';

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
  secureTextEntry,
  ...props
}) => {
  const hasError = touched && error;
  const [passwordVisible, setPasswordVisible] = useState(false);
  
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputContainer}>
        <TextInput
          style={[
            styles.input,
            hasError && styles.inputError,
            secureTextEntry && { paddingRight: 48 }, // Add padding to avoid overlapping text with the eye icon
            style
          ]}
          placeholderTextColor={placeholderTextColor || COLORS.textLight}
          secureTextEntry={secureTextEntry ? !passwordVisible : false}
          {...props}
        />
        {secureTextEntry && (
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setPasswordVisible(!passwordVisible)}
            activeOpacity={0.7}
          >
            <Icon
              name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={COLORS.textSecondary}
            />
          </TouchableOpacity>
        )}
      </View>
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
  inputContainer: {
    position: 'relative',
    justifyContent: 'center',
    width: '100%',
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
    width: '100%',
  },
  inputError: {
    borderColor: COLORS.danger,
  },
  eyeButton: {
    position: 'absolute',
    right: 0,
    height: 48,
    width: 48,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  errorText: {
    fontSize: 12,
    color: COLORS.danger,
    marginTop: 4,
  },
});

