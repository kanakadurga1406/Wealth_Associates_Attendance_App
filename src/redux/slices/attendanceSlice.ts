import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  checkIn: any; // Timestamp
  checkOut: any; // Timestamp | null
  latitude: number;
  longitude: number;
  status: 'Present' | 'Late' | 'Absent';
  workingHours: number;
  date: string; // YYYY-MM-DD
}

interface AttendanceState {
  records: AttendanceRecord[];
  todayRecord: AttendanceRecord | null;
  loading: boolean;
  error: string | null;
}

const initialState: AttendanceState = {
  records: [],
  todayRecord: null,
  loading: false,
  error: null,
};

const attendanceSlice = createSlice({
  name: 'attendance',
  initialState,
  reducers: {
    fetchRecordsStart(state) {
      state.loading = true;
      state.error = null;
    },
    fetchRecordsSuccess(state, action: PayloadAction<AttendanceRecord[]>) {
      state.records = action.payload;
      state.loading = false;
    },
    fetchRecordsFailure(state, action: PayloadAction<string>) {
      state.error = action.payload;
      state.loading = false;
    },
    setTodayRecord(state, action: PayloadAction<AttendanceRecord | null>) {
      state.todayRecord = action.payload;
    },
  },
});

export const {
  fetchRecordsStart,
  fetchRecordsSuccess,
  fetchRecordsFailure,
  setTodayRecord,
} = attendanceSlice.actions;
export default attendanceSlice.reducer;
