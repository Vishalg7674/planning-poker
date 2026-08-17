import type { Metadata } from 'next';
import Link from 'next/link';
import Wordmark from '@/components/Wordmark';
import Button from '@/components/Button';
import GameCatalog from '@/components/games/GameCatalog';
import { CATEGORY_IDS, GAME_COUNT, type CategoryId } from '@/lib/games';
import styles from './games.module.scss';

export const metadata: Metadata = {
  title: 'Games — Reveal',
  description: 'Browse 100+ real-time multiplayer games for teams, retrospectives and icebreakers. No login required.',
};

interface GamesPageProps {
  searchParams: Promise<{ cat?: string }>;
}

export default async function GamesPage({ searchParams }: GamesPageProps) {
  const { cat } = await searchParams;
  const initialCategory = (CATEGORY_IDS as string[]).includes(cat ?? '') ? (cat as CategoryId) : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Wordmark size="sm" />
        <span className={styles.tag}>{GAME_COUNT} games · 0 logins</span>
        <div className={styles.headerActions}>
          <Link href="/create">
            <Button variant="primary" size="sm">
              Create a room
            </Button>
          </Link>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>The game shelf</p>
          <h1 className={styles.h1}>Explore Games</h1>
          <p className={styles.sub}>Pick a game and start playing with your team — one link, no signup.</p>
        </div>
        {/* key forces a fresh catalog when the ?cat= URL changes client-side */}
        <GameCatalog key={initialCategory ?? 'all'} initialCategory={initialCategory} />
      </main>
    </div>
  );
}
