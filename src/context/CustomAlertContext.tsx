import React, { createContext, useContext, useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { COLORS, SPACING } from '../constants/theme';
import Icon from 'react-native-vector-icons/Ionicons';

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface AlertOptions {
  cancelable?: boolean;
}

interface CustomAlertContextType {
  showAlert: (
    title: string,
    message: string,
    buttons?: AlertButton[],
    options?: AlertOptions
  ) => void;
}

const CustomAlertContext = createContext<CustomAlertContextType | undefined>(undefined);

export const CustomAlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [visible, setVisible] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [buttons, setButtons] = useState<AlertButton[]>([]);
  const [options, setOptions] = useState<AlertOptions>({});

  const showAlert = useCallback(
    (
      alertTitle: string,
      alertMessage: string,
      alertButtons?: AlertButton[],
      alertOptions?: AlertOptions
    ) => {
      setTitle(alertTitle);
      setMessage(alertMessage);
      setButtons(alertButtons || [{ text: 'OK' }]);
      setOptions(alertOptions || {});
      setVisible(true);
    },
    []
  );

  const handleButtonPress = (btn: AlertButton) => {
    setVisible(false);
    if (btn.onPress) {
      // Trigger execution slightly after closing modal to prevent navigation/focus conflicts on iOS/Android
      setTimeout(() => {
        btn.onPress?.();
      }, 100);
    }
  };

  const getAlertIcon = () => {
    const lowerTitle = title.toLowerCase();
    const lowerMsg = message.toLowerCase();
    
    if (
      lowerTitle.includes('error') || 
      lowerTitle.includes('failed') || 
      lowerTitle.includes('blocked') || 
      lowerTitle.includes('deactivated') || 
      lowerTitle.includes('denied') || 
      lowerTitle.includes('breach') || 
      lowerTitle.includes('out of') ||
      lowerTitle.includes('invalid') ||
      lowerTitle.includes('limit')
    ) {
      return { name: 'close-circle', color: COLORS.danger };
    }
    
    if (
      lowerTitle.includes('success') || 
      lowerTitle.includes('present') || 
      lowerTitle.includes('approved') ||
      lowerTitle.includes('registered') ||
      lowerTitle.includes('saved') ||
      lowerTitle.includes('updated')
    ) {
      return { name: 'checkmark-circle', color: COLORS.success };
    }
    
    if (
      lowerTitle.includes('confirm') || 
      lowerTitle.includes('warning') || 
      lowerTitle.includes('sure') || 
      lowerTitle.includes('caution') ||
      lowerTitle.includes('attention')
    ) {
      return { name: 'alert-circle', color: COLORS.warning };
    }
    
    return { name: 'information-circle', color: COLORS.primary };
  };

  const alertIcon = getAlertIcon();

  return (
    <CustomAlertContext.Provider value={{ showAlert }}>
      {children}
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (options.cancelable) {
            setVisible(false);
          }
        }}
      >
        <View style={styles.overlay}>
          <TouchableOpacity
            style={styles.backdrop}
            activeOpacity={1}
            onPress={() => {
              if (options.cancelable) {
                setVisible(false);
              }
            }}
          />
          <View style={styles.alertCard}>
            <View style={styles.iconContainer}>
              <Icon name={alertIcon.name} size={44} color={alertIcon.color} />
            </View>
            
            <Text style={styles.titleText}>{title}</Text>
            
            {message ? (
              <ScrollView 
                style={styles.messageContainer} 
                contentContainerStyle={styles.messageContent}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.messageText}>{message}</Text>
              </ScrollView>
            ) : null}

            <View style={[
              styles.buttonContainer,
              buttons.length > 2 ? styles.buttonContainerVertical : styles.buttonContainerHorizontal
            ]}>
              {buttons.map((btn, index) => {
                const isDestructive = btn.style === 'destructive';
                const isCancel = btn.style === 'cancel';
                
                let btnStyle = styles.buttonDefault;
                let textStyle = styles.buttonTextDefault;

                if (isDestructive) {
                  btnStyle = styles.buttonDestructive;
                  textStyle = styles.buttonTextDestructive;
                } else if (isCancel) {
                  btnStyle = styles.buttonCancel;
                  textStyle = styles.buttonTextCancel;
                } else if (buttons.length === 1 || index === buttons.length - 1) {
                  btnStyle = styles.buttonPrimary;
                  textStyle = styles.buttonTextPrimary;
                }

                return (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.button,
                      btnStyle,
                      buttons.length > 2 ? styles.buttonVertical : styles.buttonHorizontal
                    ]}
                    onPress={() => handleButtonPress(btn)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.buttonText, textStyle]}>{btn.text}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </CustomAlertContext.Provider>
  );
};

export const useCustomAlert = () => {
  const context = useContext(CustomAlertContext);
  if (!context) {
    throw new Error('useCustomAlert must be used within a CustomAlertProvider');
  }
  return context;
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  alertCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: SPACING.lg,
    width: '90%',
    maxWidth: 340,
    alignItems: 'center',
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  iconContainer: {
    marginBottom: SPACING.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleText: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  messageContainer: {
    maxHeight: 180,
    width: '100%',
    marginBottom: SPACING.md,
  },
  messageContent: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xs,
  },
  messageText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '500',
  },
  buttonContainer: {
    width: '100%',
    marginTop: SPACING.xs,
  },
  buttonContainerHorizontal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  buttonContainerVertical: {
    flexDirection: 'column',
  },
  button: {
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonHorizontal: {
    flex: 1,
    marginHorizontal: 4,
  },
  buttonVertical: {
    width: '100%',
    marginVertical: 4,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  buttonPrimary: {
    backgroundColor: COLORS.primary,
  },
  buttonTextPrimary: {
    color: COLORS.surface,
  },
  buttonDefault: {
    backgroundColor: '#F3F4F6',
  },
  buttonTextDefault: {
    color: COLORS.text,
  },
  buttonCancel: {
    backgroundColor: '#FAFAFA',
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  buttonTextCancel: {
    color: COLORS.textSecondary,
  },
  buttonDestructive: {
    backgroundColor: COLORS.danger,
  },
  buttonTextDestructive: {
    color: COLORS.surface,
  },
});
