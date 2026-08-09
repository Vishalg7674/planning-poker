import { createAction } from '@reduxjs/toolkit';
import type { ConnectionStatus, Snapshot } from '@/lib/types';

// ---------------------------------------------------------------------------
// Realtime → Redux bridge actions.
// The socket layer dispatches exactly these; components never talk to the
// socket directly.
// ---------------------------------------------------------------------------

/** Full room state after any mutation. Handled by every slice via extraReducers. */
export const snapshotReceived = createAction<Snapshot>('realtime/snapshotReceived');

/** Timer reached zero (clients derive the same instant from the shared endsAt). */
export const timerUp = createAction('realtime/timerUp');

/** Facilitator ended the session — room is being torn down. */
export const roomEnded = createAction('realtime/roomEnded');

/** The room no longer exists (server restarted, or it expired). */
export const roomGone = createAction<{ message: string }>('realtime/roomGone');

/** This participant was removed by the facilitator. */
export const youRemoved = createAction('realtime/youRemoved');

/** Connection status changed (connected / reconnecting / disconnected). */
export const connectionChanged = createAction<ConnectionStatus>('realtime/connectionChanged');
