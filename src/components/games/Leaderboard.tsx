'use client';

import type { LeaderboardEntry } from '@/lib/gameTypes';
import { useAnimatedNumber } from '@/lib/useAnimatedNumber';
import { cx } from '@/lib/cx';
import Avatar from '@/components/Avatar';
import styles from './Leaderboard.module.scss';

/** 🥇/🥈/🥉 for the top three, null beyond — every rank still gets text. */
export function medalForRank(rank: number): string | null {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return null;
}

interface LeaderboardProps {
  /** Already ranked + sorted entries (see buildLeaderboard in lib/scoring). */
  entries: LeaderboardEntry[];
  title?: string;
  subtitle?: string;
  myId?: string | null;
  /** Render "+N" chips with each row's round delta. */
  showDelta?: boolean;
  /** Denser row padding — used inside the WinnerModal podium. */
  compact?: boolean;
  className?: string;
}

/**
 * Reusable ranked scoreboard for every competitive game: medals for the top
 * three, avatar initials, an animated total-score counter and an optional
 * "+N" round-delta chip. Top-three rows get a distinct gold/silver/bronze
 * treatment; my own row is highlighted.
 */
export default function Leaderboard({
  entries,
  title,
  subtitle,
  myId = null,
  showDelta = false,
  compact = false,
  className,
}: LeaderboardProps) {
  if (entries.length === 0) {
    return (
      <section className={cx(styles.board, compact && styles.compact, className)} aria-label={title ?? 'Leaderboard'}>
        {title && <h3 className={styles.title}>{title}</h3>}
        <p className={styles.empty}>No scores yet — play a round to light up the board.</p>
      </section>
    );
  }

  return (
    <section className={cx(styles.board, compact && styles.compact, className)} aria-label={title ?? 'Leaderboard'}>
      {(title || subtitle) && (
        <header className={styles.head}>
          {title && <h3 className={styles.title}>{title}</h3>}
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </header>
      )}

      <ol className={styles.list}>
        {entries.map((entry) => {
          const medal = medalForRank(entry.rank);
          const isMe = entry.isMe || entry.playerId === myId;
          return (
            <li
              key={entry.playerId}
              className={cx(styles.row, entry.rank === 1 && styles.first, isMe && styles.me)}
            >
              <span
                className={cx(styles.rank, medal && styles[`rank-${entry.rank}`])}
                aria-label={`${entry.rank}${ordinal(entry.rank)} place`}
              >
                {medal ?? entry.rank}
              </span>
              <span className={styles.player}>
                <Avatar name={entry.name} hue={entry.hue} size="sm" isMe={isMe} />
                <span className={styles.name}>
                  {entry.name}
                  {isMe && (
                    <span className={styles.you} aria-label="you">
                      you
                    </span>
                  )}
                </span>
              </span>

              {showDelta && (entry.delta ?? 0) > 0 && (
                <span className={styles.delta} role="status" aria-label={`plus ${entry.delta} points`}>
                  +{entry.delta}
                </span>
              )}

              <span className={styles.score}>
                <AnimatedScore value={entry.score} />
                <span className={styles.pts}>pts</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] ?? s[v] ?? s[0]!;
}

function AnimatedScore({ value }: { value: number }) {
  const shown = useAnimatedNumber(value);
  return <span className={styles.number}>{shown.toLocaleString()}</span>;
}
