'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAppDispatch, useAppStore } from '@/store';
import { getSocket } from '@/lib/socket';
import { loadIdentity, clearIdentity } from '@/lib/identity';
import { snapshotReceived, roomEnded, roomGone, youRemoved, connectionChanged, timerUp } from '@/store/actions';
import { tick, resetTimer } from '@/store/slices/timerSlice';
import { resetVoting } from '@/store/slices/votingSlice';
import { resetParticipants } from '@/store/slices/participantsSlice';
import { resetRoom } from '@/store/slices/roomSlice';
import { clearMyIdentity, setMyIdentity } from '@/store/slices/uiSlice';

/**
 * Socket → Redux bridge. Subscribes to every realtime event and dispatches the
 * matching RTK action. Components never touch the socket directly.
 */
export default function RealtimeBridge() {
  const dispatch = useAppDispatch();
  const storeRef = useAppStore();
  const pathname = usePathname();
  const activeTimerKey = useRef<string | null>(null);
  const firedTimerKey = useRef<string | null>(null);
  const wasConnected = useRef(false);

  useEffect(() => {
    const socket = getSocket();

    const onSnapshot = (payload: any) => {
      dispatch(snapshotReceived(payload));
      const state = storeRef.getState();
      if (!payload.timer) {
        activeTimerKey.current = null;
        firedTimerKey.current = null;
      } else {
        // Arm the "time's up" trigger only when this is a *new* countdown.
        const key = `${payload.timer.durationSec}:${payload.timer.endsAt}`;
        if (activeTimerKey.current !== key) {
          activeTimerKey.current = key;
          firedTimerKey.current = null;
        }
      }
    };

    const onRoomEnded = () => {
      dispatch(roomEnded());
      resetAll();
      clearIdentity();
    };

    const onYouRemoved = () => {
      dispatch(youRemoved());
      dispatch(roomGone({ message: 'You were removed from the table by the facilitator.' }));
      clearIdentity();
    };

    const resetAll = () => {
      dispatch(resetRoom());
      dispatch(resetParticipants());
      dispatch(resetVoting());
      dispatch(resetTimer());
      dispatch(clearMyIdentity());
    };

    const tryRejoin = () => {
      const m = window.location.pathname.match(/^\/r\/([A-Za-z0-9]+)/);
      if (!m) return;
      const identity = loadIdentity();
      if (!identity?.participantId) return;
      socket.emit(
        'room:rejoin',
        { code: m[1].toUpperCase(), participantId: identity.participantId, name: identity.name },
        (res: any) => {
          if (res?.ok) {
            const me = res.snapshot.participants.find((p: any) => p.id === identity.participantId);
            dispatch(
              setMyIdentity({ participantId: identity.participantId, name: me?.name || identity.name, role: me?.role || identity.role }),
            );
            dispatch(snapshotReceived(res.snapshot));
          } else if (res?.error === 'not_found') {
            dispatch(roomGone({ message: 'This room no longer exists — it lived only in memory and has expired.' }));
          } else if (res?.error === 'unknown_participant') {
            // Stale identity from another room — drop it and let the join form show.
            clearIdentity();
          }
        },
      );
    };

    const onConnect = () => {
      wasConnected.current = true;
      dispatch(connectionChanged('connected'));
      tryRejoin();
    };
    const onDisconnect = () => {
      if (wasConnected.current) dispatch(connectionChanged('reconnecting'));
      else dispatch(connectionChanged('disconnected'));
    };
    const onConnectError = () => {
      if (!wasConnected.current) dispatch(connectionChanged('disconnected'));
    };

    // Timer: every client derives remaining from the shared endsAt, so all
    // browsers hit zero together. The server flips the room to "ended".
    const timerInterval = window.setInterval(() => {
      const state = storeRef.getState();
      const t = state.timer.timer;
      if (!t) return;
      const remaining = Math.max(0, Math.ceil((t.endsAt - Date.now()) / 1000));
      dispatch(tick(remaining));
      const key = `${t.durationSec}:${t.endsAt}`;
      if (remaining <= 0 && activeTimerKey.current === key && firedTimerKey.current !== key) {
        firedTimerKey.current = key; // fire exactly once per countdown
        dispatch(timerUp());
      }
    }, 500);

    socket.on('snapshot', onSnapshot);
    socket.on('room:ended', onRoomEnded);
    socket.on('you:removed', onYouRemoved);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    if (socket.connected) onConnect();

    return () => {
      window.clearInterval(timerInterval);
      socket.off('snapshot', onSnapshot);
      socket.off('room:ended', onRoomEnded);
      socket.off('you:removed', onYouRemoved);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
    };
  }, [dispatch, pathname, storeRef]);

  return null;
}
