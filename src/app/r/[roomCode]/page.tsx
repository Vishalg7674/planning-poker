'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Wordmark from '@/components/Wordmark';
import ThemeToggle from '@/components/ThemeToggle';
import ConnectionPill from '@/components/ConnectionPill';
import Celebration from '@/components/Celebration';
import Button from '@/components/Button';
import JoinForm from '@/components/room/JoinForm';
import StartPanel from '@/components/room/StartPanel';
import EndedPanel from '@/components/room/EndedPanel';
import Deck from '@/components/room/Deck';
import RevealBar from '@/components/room/RevealBar';
import ResultsPanel from '@/components/room/ResultsPanel';
import ParticipantsPanel from '@/components/room/ParticipantsPanel';
import TimerBadge from '@/components/room/TimerBadge';
import HostToolbar from '@/components/room/HostToolbar';
import { useRoomShortcuts } from '@/components/room/useShortcuts';
import EndSessionModal from '@/components/modals/EndSessionModal';
import RemoveParticipantModal from '@/components/modals/RemoveParticipantModal';
import { useAppDispatch, useAppSelector } from '@/store';
import { setMyIdentity, pushToast, closeModal } from '@/store/slices/uiSlice';
import { snapshotReceived, roomGone } from '@/store/actions';
import { emitAck } from '@/lib/socket';
import { loadIdentity, clearIdentity } from '@/lib/identity';
import type { Participant } from '@/lib/types';
import styles from './room.module.scss';

/* eslint-disable react-hooks/refs -- render-phase "did I ever join" flags are a deliberate legacy pattern; converting them to state would churn this screen for no user-visible gain. */
export default function RoomPage() {
  const params = useParams<{ roomCode: string }>();
  const dispatch = useAppDispatch();
  const code = String(params?.roomCode ?? '').toUpperCase();

  const joined = useAppSelector((s) => s.ui.joined);
  const roomGoneMessage = useAppSelector((s) => s.ui.roomGoneMessage);
  const teamName = useAppSelector((s) => s.room.teamName);
  const phase = useAppSelector((s) => s.voting.phase);
  const celebrationTick = useAppSelector((s) => s.ui.celebrationTick);
  const isHost = useAppSelector((s) => s.room.hostId === s.ui.myParticipantId);
  const modals = useAppSelector((s) => s.ui.modals);

  const wasJoined = useRef(false);
  if (joined) wasJoined.current = true;

  const [removeTarget, setRemoveTarget] = useState<Participant | null>(null);
  const rejoinAttempted = useRef(false);

  useRoomShortcuts();

  // Cold load: if this tab has an identity, try to rejoin the in-memory room.
  useEffect(() => {
    if (joined || rejoinAttempted.current) return;
    const identity = loadIdentity();
    if (!identity?.participantId) return;
    rejoinAttempted.current = true;
    emitAck<{ ok: boolean; participantId?: string; snapshot?: any; error?: string }>('room:rejoin', {
      code,
      participantId: identity.participantId,
      name: identity.name,
    })
      .then((res) => {
        if (res?.ok && res.snapshot) {
          const me = res.snapshot.participants.find((p: any) => p.id === identity.participantId);
          dispatch(
            setMyIdentity({
              participantId: identity.participantId,
              name: me?.name || identity.name,
              role: me?.role || identity.role,
            }),
          );
          dispatch(snapshotReceived(res.snapshot));
        } else if (res?.error === 'not_found') {
          // The room lived in memory and expired — show the gone screen.
          dispatch(
            roomGone({ message: `Room ${code} no longer exists — it lived only in memory and has expired.` }),
          );
        } else if (res?.error === 'unknown_participant') {
          // Stale identity from another room — drop it and show the join form.
          clearIdentity();
        }
      })
      .catch(() => {
        // Server unreachable — let the user try the join form.
        rejoinAttempted.current = false;
      });
  }, [joined, code, dispatch]);

  const copyLink = () => {
    navigator.clipboard?.writeText(window.location.href).then(
      () => dispatch(pushToast({ kind: 'success', title: 'Invite link copied', message: `Share it — joiners only need a name.` })),
      () => dispatch(pushToast({ kind: 'error', title: 'Could not copy', message: 'Copy the address bar URL manually.' })),
    );
  };

  // ------------------------------------------------------------------
  // Gone / ended screen
  // ------------------------------------------------------------------
  if (roomGoneMessage || (wasJoined.current && !joined)) {
    return (
      <div className={styles.gone}>
        <div className={styles.gonePanel}>
          <span className={styles.goneSuit} aria-hidden="true">
            🃏
          </span>
          <h1 className={styles.goneTitle}>The room is gone</h1>
          <p className={styles.goneBody}>
            {roomGoneMessage ??
              'The host ended the session. The room was cleared from server memory — by design, nothing was saved.'}
          </p>
          <div className={styles.goneActions}>
            <Link href="/create">
              <Button variant="gold">Create a new room</Button>
            </Link>
            <Link href="/">
              <Button variant="ghost">Back home</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Join / approach screen
  // ------------------------------------------------------------------
  if (!joined) {
    return (
      <div className={styles.enter}>
        <Wordmark size="lg" />
        <div className={styles.enterCard}>
          {rejoinAttempted.current ? (
            <p className={styles.entering}>
              <span className={styles.spinner} aria-hidden="true" />
              Walking up to the table…
            </p>
          ) : (
            <JoinForm code={code} onGone={(msg) => dispatch(pushToast({ kind: 'error', title: 'Room not found', message: msg }))} />
          )}
        </div>
        <p className={styles.enterNote}>Rooms live in memory only — a server restart clears every table.</p>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // The room — one round: waiting → voting → ended → revealed
  // ------------------------------------------------------------------
  return (
    <div className={styles.room}>
      <header className={styles.header}>
        <span className={styles.homeLink}>
          <Wordmark size="sm" />
        </span>
        {teamName && <span className={styles.team}>{teamName}</span>}
        <div className={styles.codeWrap}>
          <span className={styles.code} title="Room code">
            {code}
          </span>
          <button type="button" className={styles.copyBtn} onClick={copyLink} title="Copy invite link" aria-label="Copy invite link">
            ⧉
          </button>
        </div>
        <div className={styles.headerRight}>
          {isHost && (
            <button
              type="button"
              className={styles.projectBtn}
              onClick={() => window.open(`/r/${code}/screen`, '_blank', 'noopener')}
              title="Open the big-screen projection"
            >
              <span aria-hidden="true">📽</span> Project
            </button>
          )}
          <ConnectionPill />
          <ThemeToggle />
        </div>
      </header>

      <main className={styles.grid}>
        <section className={styles.table}>
          <div className={styles.tableTop}>
            <TimerBadge />
          </div>
          <div className={styles.tableSurface}>
            {phase === 'waiting' && (
              <>
                <StartPanel />
                <Deck />
              </>
            )}
            {phase === 'voting' && (
              <>
                <Deck />
                <RevealBar />
              </>
            )}
            {phase === 'ended' && (
              <>
                <EndedPanel />
                <Deck />
              </>
            )}
            {phase === 'revealed' && <ResultsPanel />}
          </div>
          {isHost && <HostToolbar />}
        </section>

        <aside className={styles.columnParticipants}>
          <ParticipantsPanel onRemove={(p) => setRemoveTarget(p)} />
        </aside>
      </main>

      <footer className={styles.footer}>
        <span className={styles.footerDot} aria-hidden="true" /> This room exists in server memory only — it disappears when
        everyone leaves.
      </footer>

      <Celebration tick={celebrationTick} label="Nailed it — full consensus!" />

      <EndSessionModal open={modals.endSession} onClose={() => dispatch(closeModal('endSession'))} />
      <RemoveParticipantModal open={modals.removeParticipant} target={removeTarget} onClose={() => dispatch(closeModal('removeParticipant'))} />
    </div>
  );
}
