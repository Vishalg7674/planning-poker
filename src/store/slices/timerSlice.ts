import { createSlice } from '@reduxjs/toolkit';
import type { TimerInfo } from '@/lib/types';
import { snapshotReceived, timerUp } from '../actions';

export interface TimerState {
  timer: TimerInfo | null;
  /** Seconds remaining (ticked client-side from the shared endsAt). */
  remaining: number;
  timesUp: boolean;
}

const initialState: TimerState = {
  timer: null,
  remaining: 0,
  timesUp: false,
};

const timerSlice = createSlice({
  name: 'timer',
  initialState,
  reducers: {
    /** Local tick — every client derives remaining from the same endsAt. */
    tick: (state, action: { payload: number }) => {
      state.remaining = Math.max(0, action.payload);
    },
    resetTimer: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(snapshotReceived, (state, action) => {
      const t = action.payload.timer;
      state.timer = t;
      if (t) {
        state.remaining = Math.max(0, Math.ceil((t.endsAt - Date.now()) / 1000));
        state.timesUp = false;
      } else {
        state.remaining = 0;
        state.timesUp = false;
      }
    });
    builder.addCase(timerUp, (state) => {
      state.timesUp = true;
      state.remaining = 0;
    });
  },
});

export const { tick, resetTimer } = timerSlice.actions;
export default timerSlice.reducer;
