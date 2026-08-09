import { createSlice } from '@reduxjs/toolkit';
import type { RoomPhase, Stats } from '@/lib/types';
import { deckValues } from '@/lib/decks';
import { snapshotReceived } from '../actions';

export interface VotingState {
  /** waiting → voting → ended → revealed. One round per room. */
  phase: RoomPhase;
  deckValues: string[];
  votedIds: string[];
  /** True when every participant has voted — the host may then reveal. */
  everyoneHasVoted: boolean;
  /** Vote values — only populated when the round is revealed. */
  votes: Record<string, string>;
  stats: Stats | null;
  /** The vote I have committed (optimistic, for the locked card animation). */
  myVote: string | null;
}

const initialState: VotingState = {
  phase: 'waiting',
  deckValues: [],
  votedIds: [],
  everyoneHasVoted: false,
  votes: {},
  stats: null,
  myVote: null,
};

const votingSlice = createSlice({
  name: 'voting',
  initialState,
  reducers: {
    /** Optimistic: my card locks the moment I commit, before the round-trip. */
    setMyVote: (state, action: { payload: string }) => {
      state.myVote = action.payload;
    },
    /** Only used to roll back a rejected submission (rare — the server owns the lock). */
    clearMyVote: (state) => {
      state.myVote = null;
    },
    resetVoting: () => initialState,
  },
  extraReducers: (builder) => {
    builder.addCase(snapshotReceived, (state, action) => {
      const s = action.payload;
      state.phase = s.status;
      state.deckValues = deckValues(s.settings);
      state.votedIds = s.votedIds;
      state.everyoneHasVoted = s.everyoneHasVoted;
      state.votes = s.votes;
      state.stats = s.stats;
    });
  },
});

export const { setMyVote, clearMyVote, resetVoting } = votingSlice.actions;
export default votingSlice.reducer;
