import { createSlice } from '@reduxjs/toolkit';
import type { ConnectionStatus, Role } from '@/lib/types';
import { connectionChanged, roomEnded, roomGone, snapshotReceived, timerUp, youRemoved } from '../actions';

export type Theme = 'light' | 'dark' | 'system';
export type ToastKind = 'info' | 'success' | 'warning' | 'error' | 'celebrate';

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
}

export type ModalId = 'endSession' | 'removeParticipant';

export interface UiState {
  theme: Theme;
  connection: ConnectionStatus;
  /** My identity in the current room (from sessionStorage + join ack). */
  myParticipantId: string | null;
  myName: string;
  myRole: Role;
  /** True once I've successfully joined/rejoined the current room. */
  joined: boolean;
  roomGoneMessage: string | null;
  modals: Record<ModalId, boolean>;
  toasts: Toast[];
  /** Increment to replay the celebration animation. */
  celebrationTick: number;
  /** Host-only big-screen view — a simplified, large layout of the same state. */
  presentation: boolean;
}

const initialState: UiState = {
  theme: 'system',
  connection: 'connecting',
  myParticipantId: null,
  myName: '',
  myRole: 'voter',
  joined: false,
  roomGoneMessage: null,
  modals: {
    endSession: false,
    removeParticipant: false,
  },
  toasts: [],
  celebrationTick: 0,
  presentation: false,
};

let toastSeq = 0;

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setTheme: (state, action: { payload: Theme }) => {
      state.theme = action.payload;
    },
    setMyIdentity: (state, action: { payload: { participantId: string; name: string; role: Role } }) => {
      state.myParticipantId = action.payload.participantId;
      state.myName = action.payload.name;
      state.myRole = action.payload.role;
      state.joined = true;
      state.roomGoneMessage = null;
    },
    clearMyIdentity: (state) => {
      state.myParticipantId = null;
      state.myName = '';
      state.myRole = 'voter';
      state.joined = false;
    },
    openModal: (state, action: { payload: ModalId }) => {
      state.modals[action.payload] = true;
    },
    closeModal: (state, action: { payload: ModalId }) => {
      state.modals[action.payload] = false;
    },
    pushToast: (state, action: { payload: Omit<Toast, 'id'> }) => {
      const id = `toast-${++toastSeq}-${Date.now()}`;
      state.toasts.push({ ...action.payload, id });
      if (state.toasts.length > 4) state.toasts.shift();
    },
    dismissToast: (state, action: { payload: string }) => {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
    triggerCelebration: (state) => {
      state.celebrationTick += 1;
    },
    setPresentation: (state, action: { payload: boolean }) => {
      state.presentation = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(connectionChanged, (state, action) => {
      state.connection = action.payload;
    });
    builder.addCase(timerUp, (state) => {
      state.toasts.push({
        id: `toast-${++toastSeq}-${Date.now()}`,
        kind: 'warning',
        title: "Time's up!",
        message: 'Voting is closed — the host will reveal the cards.',
      });
    });
    builder.addCase(roomGone, (state, action) => {
      state.roomGoneMessage = action.payload.message;
      state.joined = false;
    });
    builder.addCase(roomEnded, (state) => {
      state.toasts.push({ id: `toast-${++toastSeq}-${Date.now()}`, kind: 'success', title: 'Session ended', message: 'The room has been cleared from memory.' });
    });
    builder.addCase(youRemoved, (state) => {
      state.joined = false;
      state.myParticipantId = null;
    });
    builder.addCase(snapshotReceived, (state, action) => {
      const s = action.payload;
      const me = s.participants.find((p) => p.id === state.myParticipantId);
      if (me) {
        state.myRole = me.role;
        state.myName = me.name;
      }
      if (state.connection === 'reconnecting' || state.connection === 'connecting') {
        state.connection = 'connected';
      }
      // We're in a live room again — clear any stale "room gone" notice.
      state.roomGoneMessage = null;
    });
  },
});

export const {
  setTheme,
  setMyIdentity,
  clearMyIdentity,
  openModal,
  closeModal,
  pushToast,
  dismissToast,
  triggerCelebration,
  setPresentation,
} = uiSlice.actions;
export default uiSlice.reducer;
