import Link from 'next/link';
import type { Game } from '@/lib/games';
import { getCategory } from '@/lib/games';
import Button from '@/components/Button';
import styles from './ComingSoonGame.module.scss';

interface ComingSoonGameProps {
  game: Game;
}

/** Placeholder page body for a game that isn't implemented yet. */
export default function ComingSoonGame({ game }: ComingSoonGameProps) {
  const category = getCategory(game.category);
  return (
    <div className={styles.wrap}>
      <span className={styles.icon} aria-hidden="true">
        {game.icon}
      </span>
      <span className={styles.badge}>COMING SOON</span>
      <h1 className={styles.h1}>{game.name}</h1>
      <p className={styles.category}>
        {category ? `${category.icon} ${category.short}` : game.category} · {game.players} · {game.duration}
      </p>
      <p className={styles.desc}>We&apos;re building this game! Soon you&apos;ll be able to play it with your team in realtime.</p>
      <Link href="/games" className={styles.back}>
        <Button variant="outline" size="md">
          ← Back to Games
        </Button>
      </Link>
    </div>
  );
}
