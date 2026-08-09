import { createSlice } from '@reduxjs/toolkit';
import type { Participant } from '@/lib/types';
import { snapshotReceived } from '../actions';

export interface ParticipantsState {
  list: Participant[];
}

const initialState: ParticipantsState = {
  list: [],
};

const byJoined = (a: Participant, b: Participant) => a.joinedAt - b.joinedAt;

const participantsSlice = createSlice({
  name: 'participants',
  initialState,
  reducers: {
    resetParticipants: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(snapshotReceived, (_state, action) => {
      return { list: [...action.payload.participants].sort(byJoined) };
    });
  },
});

export const { resetParticipants } = participantsSlice.actions;
export default participantsSlice.reducer;
