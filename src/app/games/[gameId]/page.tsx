import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import Wordmark from '@/components/Wordmark';
import ThemeToggle from '@/components/ThemeToggle';
import ComingSoonGame from '@/components/games/ComingSoonGame';
import GameRoom from '@/components/game/GameRoom';
import { getGame, getCategory } from '@/lib/games';
import { getGameConfig } from '@/lib/gameConfig';
import styles from './placeholder.module.scss';

interface GamePageProps {
  params: Promise<{ gameId: string }>;
}

export async function generateMetadata({ params }: GamePageProps): Promise<Metadata> {
  const { gameId } = await params;
  const game = getGame(gameId);
  if (!game) return { title: 'Game not found — Reveal' };
  return {
    title: `${game.name} — Reveal`,
    description: game.description,
  };
}

export default async function GamePage({ params }: GamePageProps) {
  const { gameId } = await params;
  const game = getGame(gameId);
  if (!game) notFound();

  // Engine-backed live games render through the shared GameRoom — one
  // component, driven by src/lib/gameConfig.ts + server JSON data.
  if (game.status === 'live' && getGameConfig(gameId)) {
    return <GameRoom gameId={gameId} />;
  }

  // Planning poker has its own dedicated page at /create.
  if (game.status === 'live') redirect(game.route);

  const category = getCategory(game.category);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Wordmark size="sm" />
        <div className={styles.headerActions}>
          <ThemeToggle />
          <Link href="/games" className={styles.gamesLink}>
            All games
          </Link>
        </div>
      </header>

      <main className={styles.main}>
        <ComingSoonGame game={game} />
        <p className={styles.categoryNote} aria-hidden="true">
          {category ? `${category.icon} ${category.name}` : ''}
        </p>
      </main>
    </div>
  );
}
