'use client';

import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, useStore } from 'react-redux';
import type { TypedUseSelectorHook } from 'react-redux';
import roomReducer from './slices/roomSlice';
import participantsReducer from './slices/participantsSlice';
import votingReducer from './slices/votingSlice';
import timerReducer from './slices/timerSlice';
import uiReducer from './slices/uiSlice';

export const store = configureStore({
  reducer: {
    room: roomReducer,
    participants: participantsReducer,
    voting: votingReducer,
    timer: timerReducer,
    ui: uiReducer,
  },
  middleware: (getDefault) => getDefault({ serializableCheck: false }),
  devTools: process.env.NODE_ENV !== 'production',
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
export const useAppStore: () => typeof store = useStore;
