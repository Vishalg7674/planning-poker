import { createSlice } from '@reduxjs/toolkit';
import type { Settings } from '@/lib/types';
import { DEFAULT_DECK_ID } from '@/lib/decks';
import { snapshotReceived } from '../actions';

export interface RoomState {
  code: string | null;
  hostId: string | null;
  teamName: string;
  /** Optional room title set by the host at creation. */
  roomTitle: string;
  createdAt: number;
  settings: Settings;
  /** Host-only: while locked, brand-new participants cannot join. */
  locked: boolean;
}

const defaultSettings: Settings = {
  deckId: DEFAULT_DECK_ID,
  timerSec: null,
  accent: 'gold',
  revealMode: 'staggered',
};

const initialState: RoomState = {
  code: null,
  hostId: null,
  teamName: '',
  roomTitle: '',
  createdAt: 0,
  settings: defaultSettings,
  locked: false,
};

const roomSlice = createSlice({
  name: 'room',
  initialState,
  reducers: {
    resetRoom: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(snapshotReceived, (_state, action) => {
      const s = action.payload;
      return {
        code: s.code,
        hostId: s.hostId,
        teamName: s.teamName,
        roomTitle: s.roomTitle ?? '',
        createdAt: s.createdAt,
        settings: { ...s.settings },
        locked: !!s.locked,
      };
    });
  },
});

export const { resetRoom } = roomSlice.actions;
export default roomSlice.reducer;
