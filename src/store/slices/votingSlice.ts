import { createSlice } from '@reduxjs/toolkit';
import type { MltRoundResult, RoomPhase, Stats, WyrQuestion } from '@/lib/types';
import { deckValues } from '@/lib/decks';
import { snapshotReceived } from '../actions';

export interface VotingState {
  /** waiting → voting → ended → revealed. One round per room (per question for WYR). */
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
  /** Active Would You Rather prompt (null for Planning Poker / while waiting). */
  question: WyrQuestion | null;
  /** 0-based index of the active question. */
  questionIndex: number;
  /** Total questions in this WYR session. */
  questionCount: number;
  /** Active Most Likely To prompt (null for other games / while waiting). */
  prompt: string | null;
  /** 0-based index of the active MLT prompt. */
  promptIndex: number;
  /** Total prompts in this MLT session. */
  promptCount: number;
  /** MLT round result — populated once the round is revealed. */
  mltResult: MltRoundResult | null;
  /** MLT session totals (survive Play Again). */
  mltScores: Record<string, number>;
  /** True once the MLT session is over — drives the WinnerModal. */
  sessionOver: boolean;
}

const initialState: VotingState = {
  phase: 'waiting',
  deckValues: [],
  votedIds: [],
  everyoneHasVoted: false,
  votes: {},
  stats: null,
  myVote: null,
  question: null,
  questionIndex: 0,
  questionCount: 0,
  prompt: null,
  promptIndex: 0,
  promptCount: 0,
  mltResult: null,
  mltScores: {},
  sessionOver: false,
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
      state.question = s.question ?? null;
      state.questionIndex = s.questionIndex ?? 0;
      state.questionCount = s.questionCount ?? 0;
      state.prompt = s.prompt ?? null;
      state.promptIndex = s.promptIndex ?? 0;
      state.promptCount = s.promptCount ?? 0;
      state.mltResult = s.mltResult ?? null;
      state.mltScores = s.mltScores ?? {};
      state.sessionOver = !!s.sessionOver;
    });
  },
});

export const { setMyVote, clearMyVote, resetVoting } = votingSlice.actions;
export default votingSlice.reducer;
