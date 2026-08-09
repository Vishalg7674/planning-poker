'use client';

import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/store';
import { triggerCelebration } from '@/store/slices/uiSlice';
import type { Participant } from '@/lib/types';
import Avatar from '@/components/Avatar';
import styles from './ResultsPanel.module.scss';
import { cx } from '@/lib/cx';

/**
 * Screen 4 — the reveal. Every participant's card flips face-up in a
 * staggered wave, synced via the snapshot. Voters show their value;
 * non-voters get a clear "didn't vote" card. Statistics are computed from
 * the votes that were actually submitted — non-voters are never included.
 */
export default function ResultsPanel() {
  const dispatch = useAppDispatch();
  const stats = useAppSelector((s) => s.voting.stats);
  const votes = useAppSelector((s) => s.voting.votes);
  const participants = useAppSelector((s) => s.participants.list);
  const myId = useAppSelector((s) => s.ui.myParticipantId);
  const celebrated = useRef(false);

  // Confetti burst on full consensus — once per reveal.
  useEffect(() => {
    if (stats?.level === 'full' && !celebrated.current) {
      celebrated.current = true;
      dispatch(triggerCelebration());
    }
  }, [stats, dispatch]);

  if (!stats) {
    // Revealed with zero votes: the whole table was still thinking.
    return (
      <div className={styles.panel}>
        <h3 className={styles.emptyTitle}>Nobody voted this round</h3>
        <p className={styles.emptyBody}>The timer ran out while everyone was still thinking.</p>
      </div>
    );
  }

  const voters: Participant[] = participants.filter((p) => votes[p.id] !== undefined);
  const nonVoters: Participant[] = participants.filter((p) => votes[p.id] === undefined);

  return (
    <div className={styles.panel}>
      <div className={styles.statsRow}>
        <Stat label="Average" value={stats.avg == null ? '—' : String(stats.avg)} />
        <Stat label="Median" value={stats.median == null ? '—' : String(stats.median)} />
        <Stat label="Most selected" value={stats.mode} />
        <Stat label="Votes" value={`${stats.count} / ${participants.length}`} />
      </div>

      <div className={styles.cards} aria-label="Revealed votes">
        {[...voters, ...nonVoters].map((p, i) => {
          const value = votes[p.id];
          const didVote = value !== undefined;
          return (
            <div
              key={p.id}
              className={cx(styles.voteCard, !didVote && styles.blank)}
              style={{ animationDelay: `${Math.min(i * 70, 900)}ms` }}
            >
              <div className={didVote ? styles.voteFace : styles.blankFace}>
                {didVote && <span className={styles.voteSuit} aria-hidden="true">♦</span>}
                <span className={didVote ? styles.voteValue : styles.blankMark}>{didVote ? value : '?'}</span>
              </div>
              <div className={styles.voterMeta}>
                <Avatar name={p.name} hue={p.hue} size="sm" status={p.status} isMe={p.id === myId} />
                <span className={styles.voterName}>{p.id === myId ? 'You' : p.name}</span>
              </div>
              {!didVote && <span className={styles.noVote}>Didn&rsquo;t vote</span>}
            </div>
          );
        })}
      </div>

      <div className={styles.breakdown}>
        <h4 className={styles.breakdownTitle}>Vote distribution</h4>
        <div className={styles.bars}>
          {stats.counts.map((c) => (
            <div key={c.value} className={styles.barRow}>
              <span className={styles.barValue}>{c.value}</span>
              <div className={styles.barTrack}>
                <div
                  className={cx(styles.barFill, c.value === stats.mode && styles.barMode)}
                  style={{ width: `${Math.round((c.count / stats.count) * 100)}%` }}
                />
              </div>
              <span className={styles.barCount}>{c.count}</span>
            </div>
          ))}
        </div>
      </div>

      <p className={styles.roundNote}>This round is closed — votes are final and the table can&rsquo;t vote again.</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
    </div>
  );
}
