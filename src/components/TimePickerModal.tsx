import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { COLORS, SPACING } from '../constants/theme';
import { Button } from './Button';
import Icon from 'react-native-vector-icons/Ionicons';

interface TimePickerModalProps {
  visible: boolean;
  title: string;
  initialHour: string; // "01"-"12"
  initialMinute: string; // "00"-"59"
  initialPeriod: string; // "AM" | "PM"
  onClose: () => void;
  onConfirm: (hour: string, minute: string, period: string) => void;
}

export const TimePickerModal: React.FC<TimePickerModalProps> = ({
  visible,
  title,
  initialHour,
  initialMinute,
  initialPeriod,
  onClose,
  onConfirm,
}) => {
  const [selectedHour, setSelectedHour] = useState('09');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [selectedPeriod, setSelectedPeriod] = useState('AM');

  useEffect(() => {
    if (visible) {
      setSelectedHour(initialHour || '09');
      setSelectedMinute(initialMinute || '00');
      setSelectedPeriod(initialPeriod || 'AM');
    }
  }, [visible, initialHour, initialMinute, initialPeriod]);

  const hours = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
  const periods = ['AM', 'PM'];

  const handleConfirm = () => {
    onConfirm(selectedHour, selectedMinute, selectedPeriod);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Icon name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {/* Time Display */}
          <View style={styles.timeDisplay}>
            <Text style={styles.timeText}>
              {selectedHour} : {selectedMinute} {selectedPeriod}
            </Text>
          </View>

          {/* Selector Columns */}
          <View style={styles.selectorContainer}>
            {/* Hours Column */}
            <View style={styles.column}>
              <Text style={styles.columnTitle}>Hour</Text>
              <ScrollView 
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
              >
                {hours.map((h) => {
                  const isSelected = h === selectedHour;
                  return (
                    <TouchableOpacity
                      key={h}
                      style={[styles.item, isSelected && styles.selectedItem]}
                      onPress={() => setSelectedHour(h)}
                    >
                      <Text style={[styles.itemText, isSelected && styles.selectedItemText]}>
                        {h}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Divider */}
            <View style={styles.verticalDivider} />

            {/* Minutes Column */}
            <View style={styles.column}>
              <Text style={styles.columnTitle}>Minute</Text>
              <ScrollView 
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
              >
                {minutes.map((m) => {
                  const isSelected = m === selectedMinute;
                  return (
                    <TouchableOpacity
                      key={m}
                      style={[styles.item, isSelected && styles.selectedItem]}
                      onPress={() => setSelectedMinute(m)}
                    >
                      <Text style={[styles.itemText, isSelected && styles.selectedItemText]}>
                        {m}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Divider */}
            <View style={styles.verticalDivider} />

            {/* Period Column */}
            <View style={styles.column}>
              <Text style={styles.columnTitle}>AM/PM</Text>
              <ScrollView 
                scrollEnabled={false}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
              >
                {periods.map((p) => {
                  const isSelected = p === selectedPeriod;
                  return (
                    <TouchableOpacity
                      key={p}
                      style={[styles.item, isSelected && styles.selectedItem]}
                      onPress={() => setSelectedPeriod(p)}
                    >
                      <Text style={[styles.itemText, isSelected && styles.selectedItemText]}>
                        {p}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>

          {/* Confirm Button */}
          <Button
            title="Confirm Time"
            onPress={handleConfirm}
            style={styles.confirmBtn}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContainer: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    width: '100%',
    maxHeight: 450,
    padding: SPACING.md,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: SPACING.sm,
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  timeDisplay: {
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.md,
  },
  timeText: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: 2,
  },
  selectorContainer: {
    flexDirection: 'row',
    height: 220,
    marginBottom: SPACING.md,
  },
  column: {
    flex: 1,
    alignItems: 'stretch',
  },
  columnTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xs,
    textTransform: 'uppercase',
  },
  scrollContent: {
    paddingVertical: SPACING.xs,
  },
  item: {
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    marginVertical: 2,
    marginHorizontal: SPACING.sm,
  },
  selectedItem: {
    backgroundColor: COLORS.primary,
  },
  itemText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  selectedItemText: {
    color: COLORS.surface,
    fontWeight: '800',
  },
  verticalDivider: {
    width: 1,
    backgroundColor: COLORS.border,
    height: '100%',
  },
  confirmBtn: {
    marginTop: SPACING.xs,
  },
});
