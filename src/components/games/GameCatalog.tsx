'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CATEGORIES, CATEGORY_IDS, GAMES, getCategory, type CategoryId } from '@/lib/games';
import GameCard from './GameCard';
import styles from './GameCatalog.module.scss';
import { cx } from '@/lib/cx';

interface GameCatalogProps {
  /** Category preselected from the URL (e.g. /games?cat=icebreakers). */
  initialCategory?: CategoryId | null;
  /** Per-category "View all →" links (homepage only — on /games they'd be self-referential). */
  showCategoryLinks?: boolean;
}

/** The full game catalog: search + category filter + category sections. */
export default function GameCatalog({ initialCategory = null, showCategoryLinks = false }: GameCatalogProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryId | null>(initialCategory);

  const normalized = query.trim().toLowerCase();

  const matches = useMemo(() => {
    if (!normalized) return null;
    const terms = normalized.split(/\s+/);
    return (name: string, description: string, categoryName: string) =>
      terms.every((t) => `${name} ${description} ${categoryName}`.toLowerCase().includes(t));
  }, [normalized]);

  const visibleCategories = CATEGORY_IDS.filter((id) => {
    if (category && category !== id) return false;
    if (!matches) return true;
    const cat = getCategory(id);
    return GAMES.some((g) => g.category === id && matches(g.name, g.description, cat?.name ?? ''));
  });

  const visibleGames = (id: CategoryId) =>
    GAMES.filter((g) => g.category === id && (!matches || matches(g.name, g.description, getCategory(id)?.name ?? '')));

  const totalVisible = visibleCategories.reduce((sum, id) => sum + visibleGames(id).length, 0);

  return (
    <div className={styles.catalog}>
      <div className={styles.controls}>
        <label className={styles.searchWrap}>
          <span className={styles.searchIcon} aria-hidden="true">
            🔍
          </span>
          <input
            type="search"
            className={styles.search}
            placeholder="Search games…"
            aria-label="Search games"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

        <div className={styles.filters} role="group" aria-label="Filter by category">
          <button
            type="button"
            className={cx(styles.chip, category === null && styles.chipActive)}
            aria-pressed={category === null}
            onClick={() => setCategory(null)}
          >
            All
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={cx(styles.chip, category === c.id && styles.chipActive)}
              aria-pressed={category === c.id}
              onClick={() => setCategory(c.id)}
            >
              <span aria-hidden="true">{c.icon}</span> {c.short}
            </button>
          ))}
        </div>
      </div>

      <p className={styles.count} aria-live="polite">
        {totalVisible} {totalVisible === 1 ? 'game' : 'games'}
        {normalized ? ` matching “${query.trim()}”` : ''}
      </p>

      {totalVisible === 0 ? (
        <div className={styles.empty} role="status">
          <span className={styles.emptyIcon} aria-hidden="true">
            🔎
          </span>
          <h3>No games found.</h3>
          <p>Try another search.</p>
        </div>
      ) : (
        <div className={styles.sections}>
          {visibleCategories.map((id) => {
            const cat = getCategory(id)!;
            const games = visibleGames(id);
            return (
              <section key={id} className={styles.section} aria-labelledby={`cat-${id}`}>
                <div className={styles.sectionHead}>
                  <h3 className={styles.sectionTitle} id={`cat-${id}`}>
                    <span aria-hidden="true">{cat.icon}</span> {cat.name}
                  </h3>
                  <p className={styles.sectionDesc}>{cat.description}</p>
                  {showCategoryLinks && (
                    <Link className={styles.viewAll} href={`/games?cat=${id}`}>
                      View all →
                    </Link>
                  )}
                </div>
                <div className={styles.grid}>
                  {games.map((g) => (
                    <GameCard key={g.id} game={g} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
