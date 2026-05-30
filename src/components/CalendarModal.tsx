import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  FlatList,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { COLORS, SPACING } from '../constants/theme';

interface CalendarModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectDate: (dateString: string) => void;
  selectedDate: string; // Format: YYYY-MM-DD
  minDate?: string;      // Format: YYYY-MM-DD (dates before this are disabled)
  title?: string;
}

export const CalendarModal: React.FC<CalendarModalProps> = ({
  visible,
  onClose,
  onSelectDate,
  selectedDate,
  minDate,
  title = 'Select Date',
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  // Update calendar view when selected date changes or modal becomes visible
  useEffect(() => {
    if (visible) {
      if (selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
        setCurrentDate(new Date(selectedDate));
      } else {
        setCurrentDate(new Date());
      }
    }
  }, [visible, selectedDate]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const getDaysInMonth = (y: number, m: number) => {
    const date = new Date(y, m, 1);
    const days = [];
    const firstDayIndex = date.getDay();
    const totalDays = new Date(y, m + 1, 0).getDate();

    // Padding for previous month's days
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }

    // Days in current month
    for (let i = 1; i <= totalDays; i++) {
      days.push(new Date(y, m, i));
    }

    return days;
  };

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const padZero = (num: number) => num.toString().padStart(2, '0');

  const formatDateString = (date: Date) => {
    const y = date.getFullYear();
    const m = padZero(date.getMonth() + 1);
    const d = padZero(date.getDate());
    return `${y}-${m}-${d}`;
  };

  const handleSelectDay = (date: Date | null) => {
    if (!date) return;
    const formatted = formatDateString(date);
    
    // Check if before minDate
    if (minDate && formatted < minDate) {
      return;
    }
    
    onSelectDate(formatted);
    onClose();
  };

  const daysList = getDaysInMonth(year, month);

  const renderDay = ({ item }: { item: Date | null }) => {
    if (!item) {
      return <View style={styles.dayCellEmpty} />;
    }

    const formattedString = formatDateString(item);
    const isSelected = selectedDate === formattedString;
    const isDisabled = minDate ? formattedString < minDate : false;
    const isToday = formatDateString(new Date()) === formattedString;

    return (
      <TouchableOpacity
        style={[
          styles.dayCell,
          isSelected && styles.dayCellSelected,
          isToday && !isSelected && styles.dayCellToday,
        ]}
        onPress={() => handleSelectDay(item)}
        disabled={isDisabled}
        activeOpacity={0.7}
      >
        <Text
          style={[
            styles.dayText,
            isSelected && styles.dayTextSelected,
            isDisabled && styles.dayTextDisabled,
            isToday && !isSelected && styles.dayTextToday,
          ]}
        >
          {item.getDate()}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <TouchableOpacity
          style={styles.backdropPressable}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.modalContent}>
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Icon name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {/* Month Navigator */}
          <View style={styles.monthNavigator}>
            <TouchableOpacity onPress={handlePrevMonth} style={styles.navButton}>
              <Icon name="chevron-back" size={20} color={COLORS.primary} />
            </TouchableOpacity>
            <Text style={styles.monthText}>{monthNames[month]} {year}</Text>
            <TouchableOpacity onPress={handleNextMonth} style={styles.navButton}>
              <Icon name="chevron-forward" size={20} color={COLORS.primary} />
            </TouchableOpacity>
          </View>

          {/* Week Days Headers */}
          <View style={styles.weekHeaders}>
            {daysOfWeek.map((day) => (
              <Text key={day} style={styles.weekHeaderText}>{day}</Text>
            ))}
          </View>

          {/* Days Grid */}
          <FlatList
            data={daysList}
            renderItem={renderDay}
            keyExtractor={(item, index) => item ? item.toISOString() : `empty-${index}`}
            numColumns={7}
            scrollEnabled={false}
            contentContainerStyle={styles.daysGrid}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdropPressable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContent: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    width: Dimensions.get('window').width * 0.88,
    padding: SPACING.md,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: SPACING.sm,
    marginBottom: SPACING.md,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.text,
  },
  closeButton: {
    padding: 2,
  },
  monthNavigator: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  navButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  monthText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
  },
  weekHeaders: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: SPACING.xs,
  },
  weekHeaderText: {
    width: '13%',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  daysGrid: {
    paddingBottom: SPACING.xs,
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 2,
    borderRadius: 20,
  },
  dayCellEmpty: {
    width: '14.28%',
    aspectRatio: 1,
  },
  dayCellSelected: {
    backgroundColor: COLORS.primary,
  },
  dayCellToday: {
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  dayText: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600',
  },
  dayTextSelected: {
    color: COLORS.surface,
    fontWeight: '800',
  },
  dayTextToday: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  dayTextDisabled: {
    color: COLORS.textLight,
    textDecorationLine: 'line-through',
  },
});
