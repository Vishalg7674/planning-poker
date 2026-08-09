import Link from 'next/link';
import type { Game } from '@/lib/games';
import styles from './GameCard.module.scss';

interface GameCardProps {
  game: Game;
}

/** A single catalog card. The whole card is the link — accessible and tappable. */
export default function GameCard({ game }: GameCardProps) {
  const live = game.status === 'live';
  return (
    <Link
      href={game.route}
      className={styles.card}
      aria-label={`${game.name} — ${live ? 'Play now' : 'Coming soon'}`}
    >
      <span className={styles.icon} aria-hidden="true">
        {game.icon}
      </span>

      <span className={styles.body}>
        <span className={styles.nameRow}>
          <span className={styles.name}>{game.name}</span>
          <span className={live ? styles.badgeLive : styles.badgeSoon} data-status={game.status}>
            {live ? 'LIVE' : 'COMING SOON'}
          </span>
        </span>
        <span className={styles.desc}>{game.description}</span>
        <span className={styles.meta}>
          <span className={styles.metaItem}>👥 {game.players}</span>
          <span className={styles.metaItem}>⚡ {game.duration}</span>
        </span>
        <span className={styles.cta} aria-hidden="true">
          {live ? 'Play Game →' : 'Peek inside →'}
        </span>
      </span>
    </Link>
  );
}
