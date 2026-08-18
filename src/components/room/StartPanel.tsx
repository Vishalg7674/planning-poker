'use client';

import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store';
import { pushToast, setPresentation } from '@/store/slices/uiSlice';
import { requestStart } from '@/lib/roomActions';
import { friendlyError } from '@/lib/errors';
import { emitAck } from '@/lib/socket';
import Button from '@/components/Button';
import RoomQR from '@/components/RoomQR';
import { getDeckById } from '@/lib/decks';
import styles from './StartPanel.module.scss';
import { cx } from '@/lib/cx';

/** The only timer presets allowed — anything else is rejected by the server. */
const TIMER_PRESETS = [10, 15, 30];

/** Reveal animation modes — host picks in the waiting room. */
const REVEAL_MODES = [
  { id: 'normal', label: 'Normal' },
  { id: 'staggered', label: 'Staggered' },
  { id: 'dramatic', label: 'Dramatic' },
] as const;

/**
 * Screen 1 — the waiting room. The host picks the timer (Off by default) and
 * reveal mode, sees the QR code + invite link, can lock the room, and starts
 * the round. Participants see the table configuration but can't modify it.
 */
export default function StartPanel() {
  const dispatch = useAppDispatch();
  const isHost = useAppSelector((s) => s.room.hostId === s.ui.myParticipantId);
  const participants = useAppSelector((s) => s.participants.list);
  // "At the table" = people still connected; ghosts are excluded.
  const participantCount = participants.filter((p) => p.status !== 'disconnected').length;
  const timerSec = useAppSelector((s) => s.room.settings.timerSec);
  const revealMode = useAppSelector((s) => s.room.settings.revealMode);
  const deckId = useAppSelector((s) => s.room.settings.deckId);
  const accent = useAppSelector((s) => s.room.settings.accent);
  const teamName = useAppSelector((s) => s.room.teamName);
  const roomTitle = useAppSelector((s) => s.room.roomTitle);
  const locked = useAppSelector((s) => s.room.locked);
  const code = useAppSelector((s) => s.room.code);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);

  // Build the invite URL from the room code instead of location.href: during
  // client-side navigation the address bar may not have settled yet, which
  // would bake a stale URL into the QR code.
  const roomUrl = typeof window !== 'undefined' && code ? `${window.location.origin}/r/${code}` : '';
  const deck = getDeckById(deckId);

  const pickTimer = (sec: number | null) => {
    if (saving || sec === timerSec) return;
    setSaving(true);
    emitAck<{ ok: boolean; error?: string }>('room:settings', { timerSec: sec })
      .then((res) => {
        if (!res?.ok) {
          dispatch(pushToast({ kind: 'error', title: 'Could not save timer', message: friendlyError(res?.error, 'The timer could not be saved.') }));
        }
      })
      .catch(() => dispatch(pushToast({ kind: 'error', title: 'Offline', message: 'Could not reach the table.' })))
      .finally(() => setSaving(false));
  };

  const pickRevealMode = (mode: string) => {
    if (saving || mode === revealMode) return;
    setSaving(true);
    emitAck<{ ok: boolean; error?: string }>('room:settings', { revealMode: mode })
      .then((res) => {
        if (!res?.ok) {
          dispatch(pushToast({ kind: 'error', title: 'Could not save reveal mode', message: friendlyError(res?.error, 'The reveal mode could not be saved.') }));
        }
      })
      .catch(() => dispatch(pushToast({ kind: 'error', title: 'Offline', message: 'Could not reach the table.' })))
      .finally(() => setSaving(false));
  };

  const copyInvite = () => {
    const text = `Join our Planning Poker room:\n\n${roomUrl}\n\nEnter your name to join.`;
    navigator.clipboard?.writeText(text).then(
      () => dispatch(pushToast({ kind: 'success', title: 'Invite copied', message: 'Link + a short message — paste anywhere.' })),
      () => dispatch(pushToast({ kind: 'error', title: 'Could not copy', message: 'Copy the address bar URL manually.' })),
    );
  };

  const shareRoom = async () => {
    const text = `Join our Planning Poker room:\n\n${roomUrl}\n\nEnter your name to join.`;
    if ('share' in navigator) {
      try {
        await navigator.share({ title: 'Planning Poker', text, url: roomUrl });
      } catch {
        /* user cancelled the share sheet — nothing to do */
      }
      return;
    }
    copyInvite();
  };

  const toggleLock = () => {
    if (saving) return;
    setSaving(true);
    emitAck<{ ok: boolean; error?: string }>(locked ? 'room:unlock' : 'room:lock', {})
      .then((res) => {
        if (!res?.ok) {
          dispatch(pushToast({ kind: 'error', title: 'Could not change lock', message: friendlyError(res?.error, 'The room lock could not be changed.') }));
        }
      })
      .catch(() => dispatch(pushToast({ kind: 'error', title: 'Offline', message: 'Could not reach the table.' })))
      .finally(() => setSaving(false));
  };

  const start = () => {
    if (starting) return;
    setStarting(true);
    requestStart(dispatch).finally(() => setStarting(false));
  };

  return (
    <div className={styles.panel}>
      <span className={styles.eyebrow}>Waiting room</span>
      <h2 className={styles.title}>{roomTitle || (isHost ? 'Invite your team' : 'Waiting for the host…')}</h2>
      {teamName && <p className={styles.teamLine}>{teamName}</p>}
      <p className={styles.sub}>
        {isHost
          ? `${participantCount} ${participantCount === 1 ? 'person is' : 'people are'} at the table. Share the link — joiners only need a name.`
          : 'The host will start the round when everyone’s here. The cards below unlock then.'}
      </p>

      {/* Table configuration — read-only for everyone */}
      <div className={styles.config} aria-label="Room configuration">
        <span className={styles.configItem}>
          Deck <strong>{deck.name}</strong>
        </span>
        <span className={styles.configItem}>
          Timer <strong>{timerSec ? `${timerSec}s` : 'Off'}</strong>
        </span>
        <span className={styles.configItem}>
          Accent <strong className={styles.accentName}>{accent}</strong>
        </span>
      </div>

      {isHost ? (
        <>
          <div className={styles.inviteWrap}>
            <RoomQR value={roomUrl} />
            <div className={styles.invite}>
              <span className={styles.inviteUrl} title={roomUrl}>
                {roomUrl}
              </span>
              <div className={styles.inviteActions}>
                <Button variant="outline" size="sm" onClick={copyInvite}>
                  ⧉ Copy Invite
                </Button>
                {typeof window !== 'undefined' && 'share' in navigator && (
                  <Button variant="outline" size="sm" onClick={shareRoom}>
                    Share Room
                  </Button>
                )}
              </div>
              <p className={styles.scanNote}>Scan to join on a phone — or share the link above.</p>
            </div>
          </div>

          <div className={styles.presets} role="group" aria-label="Voting timer">
            <span className={styles.presetsLabel}>Timer</span>
            <button
              type="button"
              className={cx(styles.preset, timerSec === null && styles.presetActive)}
              onClick={() => pickTimer(null)}
              aria-pressed={timerSec === null}
              disabled={saving}
            >
              Off
            </button>
            {TIMER_PRESETS.map((s) => (
              <button
                key={s}
                type="button"
                className={cx(styles.preset, timerSec === s && styles.presetActive)}
                onClick={() => pickTimer(s)}
                aria-pressed={timerSec === s}
                disabled={saving}
              >
                {s}s
              </button>
            ))}
          </div>

          <div className={styles.presets} role="group" aria-label="Reveal animation">
            <span className={styles.presetsLabel}>Reveal</span>
            {REVEAL_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={cx(styles.preset, revealMode === m.id && styles.presetActive)}
                onClick={() => pickRevealMode(m.id)}
                aria-pressed={revealMode === m.id}
                disabled={saving}
              >
                {m.label}
              </button>
            ))}
          </div>

          <div className={styles.hostRow}>
            <Button
              variant={locked ? 'danger' : 'outline'}
              size="sm"
              onClick={toggleLock}
              disabled={saving}
              aria-pressed={locked}
            >
              {locked ? '🔓 Unlock Room' : '🔒 Lock Room'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => dispatch(setPresentation(true))}>
              📺 Presentation Mode
            </Button>
          </div>
          <Button variant="gold" size="lg" onClick={start} disabled={starting}>
            {starting ? 'Starting…' : 'Start Voting'}
          </Button>
        </>
      ) : (
        <>
          <p className={styles.hint}>Votes lock in the moment you pick a card — no take-backs, no revotes.</p>
          {locked && (
            <p className={styles.lockedNote} role="status">
              🔒 The room is locked — no new people can join until the host unlocks it.
            </p>
          )}
        </>
      )}

      {isHost && <p className={styles.note}>Votes lock the moment someone picks a card — no revotes, no resets.</p>}
    </div>
  );
}
