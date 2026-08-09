import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { render } from '@testing-library/react';
import type { RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { Provider } from 'react-redux';
import type { RootState } from '@/store';
import roomReducer from '@/store/slices/roomSlice';
import participantsReducer from '@/store/slices/participantsSlice';
import votingReducer from '@/store/slices/votingSlice';
import timerReducer from '@/store/slices/timerSlice';
import uiReducer from '@/store/slices/uiSlice';

/** Mirrors the slice wiring in src/store/index.ts. */
export const rootReducer = combineReducers({
  room: roomReducer,
  participants: participantsReducer,
  voting: votingReducer,
  timer: timerReducer,
  ui: uiReducer,
});

export type TestStore = ReturnType<typeof makeStore>;

/** The initial value of each slice — used to merge partial preloads below. */
const sliceDefaults = {
  room: roomReducer(undefined, { type: '@@init' }),
  participants: participantsReducer(undefined, { type: '@@init' }),
  voting: votingReducer(undefined, { type: '@@init' }),
  timer: timerReducer(undefined, { type: '@@init' }),
  ui: uiReducer(undefined, { type: '@@init' }),
};

/**
 * A fresh, isolated store per test. `preloaded` is a *partial* state: each
 * slice is merged over its real initial state, so tests only need to set the
 * fields they care about.
 */
export function makeStore(preloaded?: Partial<RootState>) {
  const preloadedState = {
    room: { ...sliceDefaults.room, ...(preloaded?.room ?? {}) },
    participants: { ...sliceDefaults.participants, ...(preloaded?.participants ?? {}) },
    voting: { ...sliceDefaults.voting, ...(preloaded?.voting ?? {}) },
    timer: { ...sliceDefaults.timer, ...(preloaded?.timer ?? {}) },
    ui: { ...sliceDefaults.ui, ...(preloaded?.ui ?? {}) },
  } as never;
  return configureStore({ reducer: rootReducer, preloadedState });
}

interface RenderWithStoreOptions extends Omit<RenderOptions, 'wrapper'> {
  preloaded?: Partial<RootState>;
}

/** Render a component inside a real Redux Provider + a fresh store. */
export function renderWithStore(ui: ReactElement, { preloaded, ...options }: RenderWithStoreOptions = {}) {
  const store = makeStore(preloaded);
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  return { ...render(ui, { wrapper, ...options }), store };
}
