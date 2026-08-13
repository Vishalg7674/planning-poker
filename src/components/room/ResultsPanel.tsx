'use client';

import { useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '@/store';
import { openModal, triggerCelebration } from '@/store/slices/uiSlice';
import type { ConsensusLevel, Participant } from '@/lib/types';
import { cardToNumber } from '@/lib/decks';
import Avatar from '@/components/Avatar';
import Button from '@/components/Button';
import styles from './ResultsPanel.module.scss';
import { cx } from '@/lib/cx';

/** Copy that matches the server's documented consensus thresholds. */
const CONSENSUS_COPY: Record<ConsensusLevel, { label: string; body: string; emoji: string }> = {
  full: { label: 'Full Consensus', body: 'Everyone selected the same card.', emoji: '🎉' },
  strong: { label: 'Strong Consensus', body: 'Most estimates are aligned around one value.', emoji: '🟢' },
  moderate: { label: 'Moderate Disagreement', body: 'Estimates are spread across a few values.', emoji: '🟡' },
  large: { label: 'Large Disagreement', body: 'Estimates range widely — worth discussing?', emoji: '⚡' },
};

const REVEAL_DELAY: Record<string, number> = {
  normal: 0,
  staggered: 70,
  dramatic: 140,
};

const REVEAL_DURATION: Record<string, number> = {
  normal: 0.45,
  staggered: 0.55,
  dramatic: 0.9,
};

/**
 * Screen 4 — the reveal. Every participant's card flips face-up in a wave
 * (mode-aware: normal / staggered / dramatic, all synced via the snapshot).
 * Statistics respect the deck type: numeric decks get average/median/range,
 * T-Shirt gets mode + distribution. Non-voters are never counted in the math.
 */
export default function ResultsPanel() {
  const dispatch = useAppDispatch();
  const stats = useAppSelector((s) => s.voting.stats);
  const votes = useAppSelector((s) => s.voting.votes);
  const participants = useAppSelector((s) => s.participants.list);
  const myId = useAppSelector((s) => s.ui.myParticipantId);
  const revealMode = useAppSelector((s) => s.room.settings.revealMode);
  const story = useAppSelector((s) => s.voting.story);
  const roundId = useAppSelector((s) => s.voting.roundId);
  const isHost = useAppSelector((s) => s.room.hostId === s.ui.myParticipantId);
  const celebrated = useRef(false);

  // Confetti burst on full consensus — once per reveal. Big disagreement gets
  // a different, calmer visual treatment (no confetti).
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
  const delayPer = REVEAL_DELAY[revealMode] ?? 70;
  const durationSec = REVEAL_DURATION[revealMode] ?? 0.55;

  // Lowest / highest highlight for numeric decks — all participants sharing
  // the extreme value are listed.
  const lowestVoters = stats.numeric && stats.lowest != null ? voters.filter((p) => cardToNumber(votes[p.id]) === stats.lowest) : [];
  const highestVoters = stats.numeric && stats.highest != null ? voters.filter((p) => cardToNumber(votes[p.id]) === stats.highest) : [];

  const consensus = CONSENSUS_COPY[stats.level];

  return (
    <div className={styles.panel}>
      <div className={styles.storyLine}>
        {story?.id && <span className={styles.storyId}>{story.id}</span>}
        <span className={styles.storyTitle}>{story?.title || `Round ${roundId}`}</span>
      </div>

      <div className={styles.headline}>
        <span className={styles.consensusEmoji} aria-hidden="true">
          {consensus.emoji}
        </span>
        <div>
          <h3 className={styles.consensusTitle}>{consensus.label}</h3>
          <p className={styles.consensusBody}>{consensus.body}</p>
        </div>
      </div>

      <div className={styles.statsRow}>
        {stats.numeric ? (
          <>
            <Stat label="Average" value={stats.avg == null ? '—' : String(stats.avg)} />
            <Stat label="Median" value={stats.median == null ? '—' : String(stats.median)} />
            <Stat label="Most selected" value={stats.mode} />
            <Stat label="Highest" value={stats.highest == null ? '—' : String(stats.highest)} />
            <Stat label="Lowest" value={stats.lowest == null ? '—' : String(stats.lowest)} />
            <Stat label="Range" value={stats.range == null ? '—' : String(stats.range)} />
          </>
        ) : (
          <>
            <Stat label="Most selected" value={stats.mode} />
            <Stat label="Distinct cards" value={String(stats.unique)} />
            <Stat label="Average" value="N/A" />
            <Stat label="Median" value="N/A" />
          </>
        )}
        <Stat label="Votes" value={`${stats.count} / ${participants.length}`} />
      </div>

      {nonVoters.length > 0 && (
        <p className={styles.nonVoters} role="status">
          {nonVoters.length} {nonVoters.length === 1 ? 'person did' : 'people did'} not vote
        </p>
      )}

      <div className={styles.cards} aria-label="Revealed votes">
        {[...voters, ...nonVoters].map((p, i) => {
          const value = votes[p.id];
          const didVote = value !== undefined;
          const isLowest = lowestVoters.includes(p);
          const isHighest = highestVoters.includes(p);
          return (
            <div
              key={p.id}
              className={cx(
                styles.voteCard,
                !didVote && styles.blank,
                isLowest && styles.extreme,
                isHighest && styles.extreme,
              )}
              style={{ animationDelay: `${Math.min(i * delayPer, 1400)}ms`, animationDuration: `${durationSec}s` }}
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
              {isLowest && <span className={styles.extremeTag}>Lowest</span>}
              {isHighest && <span className={styles.extremeTag}>Highest</span>}
            </div>
          );
        })}
      </div>

      {(lowestVoters.length > 0 || highestVoters.length > 0) && (
        <div className={styles.extremes}>
          {lowestVoters.length > 0 && (
            <span className={styles.extremeLine}>
              <strong>Lowest</strong> {lowestVoters.map((p) => `${p.name} · ${votes[p.id]}`).join(', ')}
            </span>
          )}
          {highestVoters.length > 0 && (
            <span className={styles.extremeLine}>
              <strong>Highest</strong> {highestVoters.map((p) => `${p.name} · ${votes[p.id]}`).join(', ')}
            </span>
          )}
        </div>
      )}

      {stats.level === 'large' && stats.numeric && stats.lowest != null && stats.highest != null && (
        <div className={styles.discuss} role="status">
          <span className={styles.discussEmoji} aria-hidden="true">
            ⚡
          </span>
          <p>
            <strong>Large disagreement detected</strong> — estimates range from {stats.lowest} → {stats.highest}. Worth
            discussing?
          </p>
        </div>
      )}

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

      <div className={styles.footer}>
        <p className={styles.roundNote}>This round is closed — votes are final and the table can&rsquo;t vote again.</p>
        {isHost && (
          <Button variant="gold" size="md" onClick={() => dispatch(openModal('newRound'))}>
            + New Story
          </Button>
        )}
      </div>
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
