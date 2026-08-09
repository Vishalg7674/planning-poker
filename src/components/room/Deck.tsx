'use client';

import { useAppDispatch, useAppSelector } from '@/store';
import { setMyVote, clearMyVote } from '@/store/slices/votingSlice';
import { pushToast } from '@/store/slices/uiSlice';
import { emitAck } from '@/lib/socket';
import styles from './Deck.module.scss';
import { cx } from '@/lib/cx';

/**
 * The voting deck, visible from the waiting room all the way to the end of
 * the round. Cards only unlock while the round is live (VOTING) — before the
 * start and after the timer ends they stay face-up but inert.
 *
 * A committed vote is FINAL: the server permanently locks it, so there is no
 * change, no cancel, no revote. The selected card tucks in with a checkmark.
 */
export default function Deck() {
  const dispatch = useAppDispatch();
  const phase = useAppSelector((s) => s.voting.phase);
  const deckValues = useAppSelector((s) => s.voting.deckValues);
  const myVote = useAppSelector((s) => s.voting.myVote);
  const myId = useAppSelector((s) => s.ui.myParticipantId);
  const votedIds = useAppSelector((s) => s.voting.votedIds);
  const isHost = useAppSelector((s) => s.room.hostId === s.ui.myParticipantId);

  // Locked = I committed this session (optimistic) OR the server already has
  // my vote (after a refresh / a vote cast from another tab).
  const locked = myVote !== null || (myId != null && votedIds.includes(myId));
  // Cards are inert outside the live voting phase.
  const interactive = phase === 'voting' && !locked;

  const cast = (value: string) => {
    if (!interactive) return; // the server would reject this anyway
    dispatch(setMyVote(value));
    emitAck<{ ok: boolean; error?: string }>('vote:cast', { value })
      .then((res) => {
        if (!res.ok) {
          dispatch(clearMyVote());
          dispatch(pushToast({ kind: 'error', title: 'Vote not counted', message: res.error }));
        }
      })
      .catch(() => {
        dispatch(clearMyVote());
        dispatch(pushToast({ kind: 'error', title: 'Offline', message: 'Could not reach the table — check your connection.' }));
      });
  };

  const hint =
    phase === 'waiting'
      ? locked
        ? 'Your vote carries over to the round when it starts.'
        : isHost
          ? 'Cards unlock for everyone when you start the round.'
          : 'Cards unlock when the host starts voting.'
      : phase === 'ended'
        ? locked
          ? 'Voting ended — your vote stays locked until the host reveals.'
          : 'Voting ended — no more cards can be played.'
        : locked
          ? undefined // handled below
          : 'Pick a card. Your vote locks in the moment you tap — and it’s final.';

  return (
    <div className={styles.wrap}>
      {phase === 'voting' && (
        <div className={styles.heading}>
          <span className={styles.eyebrow}>Voting</span>
          <h2 className={styles.choose}>Choose your estimate</h2>
        </div>
      )}
      <div className={styles.deck} role="group" aria-label="Voting deck">
        {deckValues.map((value) => {
          const isMine = myVote === value;
          return (
            <button
              key={value}
              type="button"
              className={cx(styles.card, isMine && styles.cardLocked, locked && !isMine && styles.cardDim)}
              onClick={() => cast(value)}
              disabled={!interactive}
              aria-pressed={isMine}
              aria-label={`Vote ${value}`}
            >
              <span className={styles.suit} aria-hidden="true">
                ♦
              </span>
              <span className={styles.value}>{value}</span>
              <span className={styles.pip} aria-hidden="true">
                ♦
              </span>
            </button>
          );
        })}
      </div>
      <p className={styles.hint}>
        {phase === 'voting' && locked ? (
          <>
            <span className={styles.lockPip}>✓</span> Vote locked — your vote has been submitted. It stays face-down until the
            reveal.
          </>
        ) : (
          hint
        )}
      </p>
    </div>
  );
}
