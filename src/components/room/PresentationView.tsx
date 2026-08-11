'use client';

import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store';
import { setPresentation } from '@/store/slices/uiSlice';
import { requestReveal, requestStart } from '@/lib/roomActions';
import Avatar from '@/components/Avatar';
import Button from '@/components/Button';
import Deck from '@/components/room/Deck';
import { isNumericDeck } from '@/lib/decks';
import styles from './PresentationView.module.scss';
import { cx } from '@/lib/cx';

/**
 * Presentation mode — a simplified, large-font view of the same room state
 * designed for TV / projector / screen share. Realtime updates and the reveal
 * animation work exactly as in the normal view; only the chrome is stripped.
 */
export default function PresentationView() {
  const dispatch = useAppDispatch();
  const [revealing, setRevealing] = useState(false);
  const [starting, setStarting] = useState(false);

  const phase = useAppSelector((s) => s.voting.phase);
  const participants = useAppSelector((s) => s.participants.list);
  const everyoneHasVoted = useAppSelector((s) => s.voting.everyoneHasVoted);
  // Progress counts ignore disconnected participants, matching the server's
  // everyoneHasVoted definition.
  const activeCount = participants.filter((p) => p.status !== 'disconnected').length;
  const activeVotedCount = participants.filter((p) => p.status !== 'disconnected' && p.hasVoted).length;
  const votes = useAppSelector((s) => s.voting.votes);
  const stats = useAppSelector((s) => s.voting.stats);
  const teamName = useAppSelector((s) => s.room.teamName);
  const roomTitle = useAppSelector((s) => s.room.roomTitle);
  const code = useAppSelector((s) => s.room.code);
  const timer = useAppSelector((s) => s.timer.timer);
  const remaining = useAppSelector((s) => s.timer.remaining);
  const isHost = useAppSelector((s) => s.room.hostId === s.ui.myParticipantId);
  const hostId = useAppSelector((s) => s.room.hostId);
  const deckId = useAppSelector((s) => s.room.settings.deckId);
  const numeric = isNumericDeck(deckId);

  const start = () => {
    if (starting) return;
    setStarting(true);
    requestStart(dispatch).finally(() => setStarting(false));
  };

  const reveal = () => {
    if (revealing) return;
    setRevealing(true);
    requestReveal(dispatch).finally(() => setRevealing(false));
  };

  const title = roomTitle || (teamName ? `${teamName} — Planning Poker` : 'Planning Poker');

  return (
    <div className={styles.view} data-phase={phase}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.meta}>
            Room {code}
            {teamName && !roomTitle && <span> · {teamName}</span>}
          </p>
        </div>
        <div className={styles.headerActions}>
          {phase === 'voting' && timer && (
            <span className={styles.clock} role="timer" aria-live="off">
              00:{String(remaining).padStart(2, '0')}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => dispatch(setPresentation(false))}>
            Exit Presentation
          </Button>
        </div>
      </header>

      <main className={styles.main}>
        {phase === 'waiting' && (
          <section className={styles.centerBlock}>
            <span className={styles.eyebrow}>Waiting room</span>
            <h2 className={styles.bigLine}>{isHost ? 'Everyone is ready — start the round!' : 'Waiting for the host to start…'}</h2>
            {isHost && (
              <Button variant="gold" size="lg" onClick={start} disabled={starting}>
                {starting ? 'Starting…' : 'Start Voting'}
              </Button>
            )}
          </section>
        )}

        {(phase === 'voting' || phase === 'ended') && (
          <section className={styles.votingBlock}>
            <div className={styles.counter} aria-live="polite">
              <span className={styles.counterBig}>
                {activeVotedCount} / {activeCount}
              </span>
              <span className={styles.counterLabel}>voted</span>
              {everyoneHasVoted && <span className={styles.allVoted}>✓ Everyone has voted</span>}
            </div>
            <div className={styles.avatarGrid}>
              {participants.map((p) => (
                <div key={p.id} className={cx(styles.avatarCell, p.status === 'disconnected' && styles.offline)}>
                  <Avatar name={p.name} hue={p.hue} size="lg" status={p.status} isHost={p.id === hostId} />
                  <span className={styles.avatarName}>{p.name}</span>
                  <span className={styles.avatarStatus}>
                    {p.status === 'voted' ? '✓ Voted' : p.status === 'disconnected' ? '⚠ Disconnected' : '○ Thinking'}
                  </span>
                </div>
              ))}
            </div>
            {isHost && (phase === 'ended' || (phase === 'voting' && everyoneHasVoted)) && (
              <Button variant="gold" size="lg" onClick={reveal} disabled={revealing}>
                {revealing ? 'Revealing…' : 'Reveal Votes'}
              </Button>
            )}
          </section>
        )}

        {(phase === 'voting' || phase === 'ended') && (
          <section className={styles.deckBlock}>
            <Deck />
          </section>
        )}

        {phase === 'revealed' && stats && (
          <section className={styles.resultsBlock}>
            <div className={styles.voteRow}>
              {participants
                .filter((p) => votes[p.id] !== undefined)
                .map((p) => (
                  <span key={p.id} className={styles.bigVote}>
                    {votes[p.id]}
                  </span>
                ))}
            </div>
            <div className={styles.statRow}>
              {numeric ? (
                <>
                  <Stat label="Average" value={stats.avg == null ? '—' : String(stats.avg)} />
                  <Stat label="Median" value={stats.median == null ? '—' : String(stats.median)} />
                </>
              ) : null}
              <Stat label="Most selected" value={stats.mode} />
              <Stat label="Votes" value={`${stats.count} / ${participants.length}`} />
            </div>
            <div className={styles.consensusLine}>
              {stats.level === 'full' ? '🎉 Full Consensus' : stats.level === 'strong' ? '🟢 Strong Consensus' : stats.level === 'moderate' ? '🟡 Moderate Disagreement' : '⚡ Large Disagreement'}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}
