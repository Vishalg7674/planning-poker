import { createSlice } from '@reduxjs/toolkit';
import type { RoomPhase, Stats, Story } from '@/lib/types';
import { deckValues } from '@/lib/decks';
import { snapshotReceived } from '../actions';

export interface VotingState {
  /** waiting → voting → ended → revealed, cycling per story in the room. */
  phase: RoomPhase;
  /** Server-assigned identity of the current round — increments per story. */
  roundId: number;
  /** The story being estimated this round (null while waiting). */
  story: Story | null;
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
  roundId: 0,
  story: null,
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
      // A new round (roundId increments on every startVoting) or a fresh
      // waiting room (the host started a new story) must never carry my old
      // optimistic vote into the next round — votes are per-round.
      if (state.roundId !== s.roundId || s.status === 'waiting') {
        state.myVote = null;
      }
      state.phase = s.status;
      state.roundId = s.roundId ?? state.roundId;
      state.story = s.story ?? null;
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
