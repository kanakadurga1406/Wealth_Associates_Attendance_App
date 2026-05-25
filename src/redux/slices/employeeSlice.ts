import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { UserProfile } from './authSlice';

interface EmployeeState {
  employees: UserProfile[];
  loading: boolean;
  error: string | null;
}

const initialState: EmployeeState = {
  employees: [],
  loading: false,
  error: null,
};

const employeeSlice = createSlice({
  name: 'employee',
  initialState,
  reducers: {
    fetchEmployeesStart(state) {
      state.loading = true;
      state.error = null;
    },
    fetchEmployeesSuccess(state, action: PayloadAction<UserProfile[]>) {
      state.employees = action.payload;
      state.loading = false;
    },
    fetchEmployeesFailure(state, action: PayloadAction<string>) {
      state.error = action.payload;
      state.loading = false;
    },
    addEmployeeSuccess(state, action: PayloadAction<UserProfile>) {
      state.employees.push(action.payload);
    },
    deleteEmployeeSuccess(state, action: PayloadAction<string>) {
      state.employees = state.employees.filter(emp => emp.uid !== action.payload);
    },
  },
});

export const {
  fetchEmployeesStart,
  fetchEmployeesSuccess,
  fetchEmployeesFailure,
  addEmployeeSuccess,
  deleteEmployeeSuccess,
} = employeeSlice.actions;
export default employeeSlice.reducer;
