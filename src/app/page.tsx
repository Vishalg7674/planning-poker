'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import Link from 'next/link';
import Wordmark from '@/components/Wordmark';
import Button from '@/components/Button';
import ThemeToggle from '@/components/ThemeToggle';
import GameCatalog from '@/components/games/GameCatalog';
import { CATEGORIES, GAME_COUNT } from '@/lib/games';
import styles from './page.module.scss';

const joinSchema = yup.object({
  code: yup
    .string()
    .required('Enter a room code')
    .matches(/^[A-Za-z0-9]{4,6}$/, 'Codes are 4–6 letters & numbers'),
});

type JoinForm = yup.InferType<typeof joinSchema>;

const FAN = [
  { value: '21', rot: '-16deg', y: '10px', x: '-46px', delay: '0ms' },
  { value: '13', rot: '-8deg', y: '4px', x: '-24px', delay: '70ms' },
  { value: '8', rot: '0deg', y: '0', x: '0', delay: '140ms' },
  { value: '5', rot: '8deg', y: '4px', x: '24px', delay: '210ms' },
  { value: '3', rot: '16deg', y: '10px', x: '46px', delay: '280ms' },
] as const;

const WHY = [
  { icon: '⚡', title: 'Quick to start', body: 'No onboarding, no tutorial. Pick a game, share a link, go.' },
  { icon: '🔗', title: 'One shareable link', body: 'Everyone joins from a single URL — no invites, no accounts.' },
  { icon: '👥', title: 'Truly multiplayer', body: 'Real-time rooms where the whole team plays together.' },
  { icon: '🔐', title: 'No signup', body: 'Your identity is just a name in a room. No email, no history.' },
  { icon: '🏆', title: 'Scoring on the way', body: 'Points, leaderboards and bragging rights are coming.' },
] as const;

const STEPS = [
  { icon: '🎮', label: 'Pick a game' },
  { icon: '🃏', label: 'Create a room' },
  { icon: '🔗', label: 'Share the link' },
  { icon: '👥', label: 'Everyone joins' },
  { icon: '🎲', label: 'Play together' },
  { icon: '⭐', label: 'Earn points' },
  { icon: '🏆', label: 'See the leaderboard' },
] as const;

const PODIUM = [
  { medal: '🥇', name: 'Vishal', pts: 420 },
  { medal: '🥈', name: 'Rahul', pts: 360 },
  { medal: '🥉', name: 'Priya', pts: 300 },
] as const;

export default function HomePage() {
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<JoinForm>({ resolver: yupResolver(joinSchema) });

  const onJoin = ({ code }: JoinForm) => {
    setJoining(true);
    router.push(`/r/${code.trim().toUpperCase()}`);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Wordmark />
        <nav className={styles.nav} aria-label="Primary">
          <Link href="/games">Games</Link>
          <Link href="#how-it-works">How it works</Link>
        </nav>
        <span className={styles.tag}>{GAME_COUNT} games · 0 logins</span>
        <div className={styles.headerActions}>
          <ThemeToggle />
          <Link href="/create">
            <Button variant="primary" size="sm">
              Create a room
            </Button>
          </Link>
        </div>
      </header>

      <main className={styles.main}>
        {/* ------------------------------------------------------------- Hero */}
        <section className={styles.hero}>
          <div className={styles.copy}>
            <p className={styles.eyebrow}>Real-time team games</p>
            <h1 className={styles.h1}>
              Break the ice.
              <br />
              <em>Play together.</em>
            </h1>
            <p className={styles.pitch}>
              Fun, fast, real-time multiplayer games for retrospectives, team meetings, icebreakers and everything in
              between. Create a room, share one link, and play together — <strong>no login required</strong>.
            </p>

            <div className={styles.ctaRow}>
              <Link href="/create" className={styles.ctaLink}>
                <Button variant="gold" size="lg" className={styles.ctaPrimary}>
                  Create a Game
                </Button>
              </Link>
              <a href="#games" className={styles.ctaLink}>
                <Button variant="outline" size="lg" className={styles.ctaPrimary}>
                  Explore Games
                </Button>
              </a>
            </div>

            <div className={styles.trust}>
              <span>✓ No signup</span>
              <span>✓ Share one link</span>
              <span>✓ Play together</span>
            </div>
          </div>

          <div className={styles.table}>
            <div className={styles.felt} aria-hidden="true">
              <div className={styles.fan}>
                {FAN.map((c) => (
                  <div
                    key={c.value}
                    className={styles.fanCard}
                    style={{ '--fan-rot': c.rot, '--fan-y': c.y, '--fan-x': c.x, animationDelay: c.delay } as React.CSSProperties}
                  >
                    <span className={styles.fanSuit}>♦</span>
                    <span className={styles.fanValue}>{c.value}</span>
                  </div>
                ))}
              </div>
              <div className={styles.feltLabel}>
                {GAME_COUNT}+ games · no login · just play
              </div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- Game counter */}
        <section className={styles.stats} aria-label="Games at a glance">
          <div className={styles.stat}>
            <span className={styles.statValue}>{GAME_COUNT}</span>
            <span className={styles.statLabel}>games</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{CATEGORIES.length}</span>
            <span className={styles.statLabel}>categories</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>1</span>
            <span className={styles.statLabel}>click to play</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>0</span>
            <span className={styles.statLabel}>logins required</span>
          </div>
        </section>

        {/* --------------------------------------------------------- Featured */}
        <section className={styles.featured} aria-labelledby="featured-heading">
          <div className={styles.featuredCard}>
            <div className={styles.featuredBadge}>⭐ Featured</div>
            <div className={styles.featuredIcon} aria-hidden="true">
              🃏
            </div>
            <div className={styles.featuredBody}>
              <h2 id="featured-heading" className={styles.featuredTitle}>
                Planning Poker
              </h2>
              <p className={styles.featuredDesc}>
                Estimate together. Reveal together. Make sprint planning faster and more fun — private votes, one
                click, one shared reveal.
              </p>
              <Link href="/create" className={styles.ctaLink}>
                <Button variant="gold" size="lg">
                  Play Planning Poker
                </Button>
              </Link>

              <form className={styles.joinForm} onSubmit={handleSubmit(onJoin)} noValidate>
                <div className={styles.joinWrap}>
                  <span className={styles.joinLabel}>or join with a code</span>
                  <input
                    {...register('code')}
                    className={`${styles.codeInput} ${errors.code ? styles.codeError : ''}`}
                    placeholder="ABCDE"
                    maxLength={6}
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-label="Room code"
                  />
                  <Button type="submit" variant="primary" size="md" disabled={joining}>
                    {joining ? 'Opening…' : 'Join'}
                  </Button>
                </div>
                {errors.code && <p className={styles.joinError}>{errors.code.message}</p>}
              </form>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------- Why teams love it */}
        <section className={styles.features} aria-labelledby="why-heading">
          <div className={styles.sectionHead}>
            <p className={styles.eyebrow}>Why teams love it</p>
            <h2 id="why-heading" className={styles.sectionTitle}>
              Meetings were never this fun
            </h2>
          </div>
          <div className={styles.featureGrid}>
            {WHY.map((f) => (
              <div key={f.title} className={styles.feature}>
                <span className={styles.featureIcon}>{f.icon}</span>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------ Game catalog */}
        <section className={styles.catalog} id="games" aria-labelledby="games-heading">
          <div className={styles.sectionHead}>
            <p className={styles.eyebrow}>Explore Games</p>
            <h2 id="games-heading" className={styles.sectionTitle}>
              Something for every meeting
            </h2>
            <p className={styles.sectionSub}>Pick a game and start playing with your team.</p>
          </div>
          <GameCatalog showCategoryLinks />
        </section>

        {/* ---------------------------------------------- Play. Score. Compete. */}
        <section className={styles.podium} aria-labelledby="podium-heading">
          <div className={styles.sectionHead}>
            <p className={styles.eyebrow}>Coming soon</p>
            <h2 id="podium-heading" className={styles.sectionTitle}>
              🏆 Play. Score. Compete.
            </h2>
            <p className={styles.sectionSub}>Earn points across games and see who tops the leaderboard.</p>
          </div>
          <div className={styles.podiumBox}>
            {PODIUM.map((p) => (
              <div key={p.medal} className={styles.podiumRow}>
                <span className={styles.podiumMedal} aria-hidden="true">
                  {p.medal}
                </span>
                <span className={styles.podiumName}>{p.name}</span>
                <span className={styles.podiumBar} style={{ '--fill': `${(p.pts / 420) * 100}%` } as React.CSSProperties} />
                <span className={styles.podiumPts}>{p.pts} pts</span>
              </div>
            ))}
          </div>
          <p className={styles.podiumNote}>This is the roadmap, not the game — scoring ships with future games.</p>
        </section>

        {/* ------------------------------------------------------- How it works */}
        <section className={styles.how} id="how-it-works" aria-labelledby="how-heading">
          <div className={styles.sectionHead}>
            <p className={styles.eyebrow}>How it works</p>
            <h2 id="how-heading" className={styles.sectionTitle}>
              From link to laughs in a minute
            </h2>
          </div>
          <ol className={styles.steps}>
            {STEPS.map((s, i) => (
              <li key={s.label} className={styles.step}>
                <span className={styles.stepNum}>{i + 1}</span>
                <span className={styles.stepIcon} aria-hidden="true">
                  {s.icon}
                </span>
                <span className={styles.stepLabel}>{s.label}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* -------------------------------------------------------------- CTA */}
        <section className={styles.cta} aria-labelledby="cta-heading">
          <h2 id="cta-heading" className={styles.ctaTitle}>
            Ready to break the ice?
          </h2>
          <p className={styles.ctaSub}>Pick a game, share the link, and see your team light up.</p>
          <div className={styles.ctaRow}>
            <a href="#games" className={styles.ctaLink}>
              <Button variant="gold" size="lg" className={styles.ctaPrimary}>
                Explore Games
              </Button>
            </a>
            <Link href="/create" className={styles.ctaLink}>
              <Button variant="outline" size="lg" className={styles.ctaPrimary}>
                Create a Game
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <Wordmark size="sm" />
        <p>
          Real-time games for teams, retrospectives and icebreakers. No login, no signup — just play. Rooms live in
          server memory and vanish when everyone leaves.
        </p>
        <nav className={styles.footerNav} aria-label="Footer">
          <Link href="/games">Games</Link>
          <Link href="/create">Planning Poker</Link>
          <Link href="#how-it-works">How it works</Link>
        </nav>
        <p className={styles.copyright}>© 2026 Reveal</p>
      </footer>
    </div>
  );
}
