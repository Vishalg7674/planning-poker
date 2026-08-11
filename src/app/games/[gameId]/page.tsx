import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import Wordmark from '@/components/Wordmark';
import ThemeToggle from '@/components/ThemeToggle';
import ComingSoonGame from '@/components/games/ComingSoonGame';
import { getGame, getCategory } from '@/lib/games';
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

  // Live games are real — send players to the actual implementation. A game
  // whose route is /games/<id> has its own static page which shadows this
  // dynamic route, so this redirect never loops: /games/would-you-rather is
  // served by the static page, and only games implemented elsewhere (e.g.
  // planning-poker → /create) ever reach this redirect.
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
