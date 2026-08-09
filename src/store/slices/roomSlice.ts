import { createSlice } from '@reduxjs/toolkit';
import type { Settings } from '@/lib/types';
import { DEFAULT_DECK_ID } from '@/lib/decks';
import { snapshotReceived } from '../actions';

export interface RoomState {
  code: string | null;
  hostId: string | null;
  teamName: string;
  createdAt: number;
  settings: Settings;
}

const defaultSettings: Settings = {
  deckId: DEFAULT_DECK_ID,
  timerSec: null,
};

const initialState: RoomState = {
  code: null,
  hostId: null,
  teamName: '',
  createdAt: 0,
  settings: defaultSettings,
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
        createdAt: s.createdAt,
        settings: { ...s.settings },
      };
    });
  },
});

export const { resetRoom } = roomSlice.actions;
export default roomSlice.reducer;
