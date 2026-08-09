'use client';

import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store';
import { pushToast } from '@/store/slices/uiSlice';
import { emitAck } from '@/lib/socket';
import Button from '@/components/Button';
import styles from './StartPanel.module.scss';
import { cx } from '@/lib/cx';

/** The only timer presets allowed — anything else is rejected by the server. */
const TIMER_PRESETS = [10, 15, 30];

/**
 * Screen 1 — the waiting room. The host picks the timer (Off by default),
 * copies the invite link, and starts the round. Participants just wait.
 */
export default function StartPanel() {
  const dispatch = useAppDispatch();
  const isHost = useAppSelector((s) => s.room.hostId === s.ui.myParticipantId);
  const participantCount = useAppSelector((s) => s.participants.list.length);
  const timerSec = useAppSelector((s) => s.room.settings.timerSec);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);

  const pickTimer = (sec: number | null) => {
    if (saving || sec === timerSec) return;
    setSaving(true);
    emitAck<{ ok: boolean; error?: string }>('room:settings', { timerSec: sec })
      .then((res) => {
        if (!res?.ok) dispatch(pushToast({ kind: 'error', title: 'Could not save timer', message: res?.error }));
      })
      .catch(() => dispatch(pushToast({ kind: 'error', title: 'Offline', message: 'Could not reach the table.' })))
      .finally(() => setSaving(false));
  };

  const copyLink = () => {
    navigator.clipboard?.writeText(window.location.href).then(
      () => dispatch(pushToast({ kind: 'success', title: 'Invite link copied', message: 'Share it — joiners only need a name.' })),
      () => dispatch(pushToast({ kind: 'error', title: 'Could not copy', message: 'Copy the address bar URL manually.' })),
    );
  };

  const start = () => {
    if (starting) return;
    setStarting(true);
    emitAck<{ ok: boolean; error?: string }>('voting:start', {})
      .then((res) => {
        if (!res?.ok) {
          dispatch(pushToast({ kind: 'error', title: 'Could not start', message: res?.error }));
          setStarting(false);
        }
      })
      .catch(() => {
        dispatch(pushToast({ kind: 'error', title: 'Offline', message: 'Could not reach the table.' }));
        setStarting(false);
      });
  };

  return (
    <div className={styles.panel}>
      <span className={styles.eyebrow}>Waiting room</span>
      <h2 className={styles.title}>{isHost ? 'Invite your team' : 'Waiting for the host…'}</h2>
      <p className={styles.sub}>
        {isHost
          ? `${participantCount} ${participantCount === 1 ? 'person is' : 'people are'} at the table. Share the link — joiners only need a name.`
          : 'The host will start the round when everyone’s here. The cards below unlock then.'}
      </p>

      {isHost ? (
        <>
          <div className={styles.invite}>
            <span className={styles.inviteUrl} title={typeof window !== 'undefined' ? window.location.href : ''}>
              {typeof window !== 'undefined' ? window.location.href : ''}
            </span>
            <Button variant="outline" size="sm" onClick={copyLink}>
              ⧉ Copy Invite Link
            </Button>
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

          <Button variant="gold" size="lg" onClick={start} disabled={starting}>
            {starting ? 'Starting…' : 'Start Voting'}
          </Button>
        </>
      ) : (
        <p className={styles.hint}>Votes lock in the moment you pick a card — no take-backs, no revotes.</p>
      )}

      {isHost && <p className={styles.note}>Votes lock the moment someone picks a card — no revotes, no resets.</p>}
    </div>
  );
}
