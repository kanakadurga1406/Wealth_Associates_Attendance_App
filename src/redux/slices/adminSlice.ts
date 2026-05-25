import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { UserProfile } from './authSlice';

interface AdminState {
  admins: UserProfile[];
  loading: boolean;
  error: string | null;
}

const initialState: AdminState = {
  admins: [],
  loading: false,
  error: null,
};

const adminSlice = createSlice({
  name: 'admin',
  initialState,
  reducers: {
    fetchAdminsStart(state) {
      state.loading = true;
      state.error = null;
    },
    fetchAdminsSuccess(state, action: PayloadAction<UserProfile[]>) {
      state.admins = action.payload;
      state.loading = false;
    },
    fetchAdminsFailure(state, action: PayloadAction<string>) {
      state.error = action.payload;
      state.loading = false;
    },
    addAdminSuccess(state, action: PayloadAction<UserProfile>) {
      state.admins.push(action.payload);
    },
    updateAdminStatusSuccess(state, action: PayloadAction<{ uid: string; status: 'active' | 'blocked' }>) {
      const idx = state.admins.findIndex(adm => adm.uid === action.payload.uid);
      if (idx !== -1) {
        state.admins[idx].status = action.payload.status;
      }
    },
  },
});

export const {
  fetchAdminsStart,
  fetchAdminsSuccess,
  fetchAdminsFailure,
  addAdminSuccess,
  updateAdminStatusSuccess,
} = adminSlice.actions;
export default adminSlice.reducer;
