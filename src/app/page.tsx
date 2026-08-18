'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import Link from 'next/link';
import Wordmark from '@/components/Wordmark';
import Button from '@/components/Button';
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
  { icon: '⚡', title: 'Quick to start', body: 'Create a room, share one link, and your team joins with just a name.' },
  { icon: '🔗', title: 'One shareable link', body: 'Everyone joins from a single URL or QR code — no invites, no accounts.' },
  { icon: '👥', title: 'Truly multiplayer', body: 'Real-time voting rooms where every player’s card syncs instantly.' },
  { icon: '🔐', title: 'Votes stay private', body: 'Nobody — not even the host — sees a value until the reveal.' },
  { icon: '🗂️', title: 'Many stories, one room', body: 'Estimate story after story in the same room; votes reset for every round.' },
] as const;

const STEPS = [
  { icon: '🃏', label: 'Create a room' },
  { icon: '🔗', label: 'Share the link' },
  { icon: '👥', label: 'Everyone joins' },
  { icon: '🗳️', label: 'Vote in private' },
  { icon: '🎉', label: 'Reveal together' },
  { icon: '🗂️', label: 'Next story' },
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
          <Link href="#how-it-works">How it works</Link>
        </nav>
        <span className={styles.tag}>Planning Poker · no signup</span>
        <div className={styles.headerActions}>
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
            <p className={styles.eyebrow}>Real-time sprint planning</p>
            <h1 className={styles.h1}>
              Estimate together.
              <br />
              <em>Reveal together.</em>
            </h1>
            <p className={styles.pitch}>
              Private votes, one shared reveal, and statistics that settle the debate. Create a room, share one link,
              and your team estimates stories in real time — <strong>no login required</strong>.
            </p>

            <div className={styles.ctaRow}>
              <Link href="/create" className={styles.ctaLink}>
                <Button variant="gold" size="lg" className={styles.ctaPrimary}>
                  Create a Room
                </Button>
              </Link>
            </div>

            <div className={styles.trust}>
              <span>✓ No signup</span>
              <span>✓ Votes stay private</span>
              <span>✓ One link to play</span>
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
              <div className={styles.feltLabel}>planning poker · no login · just play</div>
            </div>
          </div>
        </section>

        {/* -------------------------------------------------- Quick stats */}
        <section className={styles.stats} aria-label="Planning poker at a glance">
          <div className={styles.stat}>
            <span className={styles.statValue}>5</span>
            <span className={styles.statLabel}>decks</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>10–30s</span>
            <span className={styles.statLabel}>voting timer</span>
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
            <div className={styles.featuredBadge}>⭐ Planning Poker</div>
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
              Sprint planning, without the chaos
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

        {/* ------------------------------------------------------- How it works */}
        <section className={styles.how} id="how-it-works" aria-labelledby="how-heading">
          <div className={styles.sectionHead}>
            <p className={styles.eyebrow}>How it works</p>
            <h2 id="how-heading" className={styles.sectionTitle}>
              From link to reveal in a minute
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
            Ready to estimate?
          </h2>
          <p className={styles.ctaSub}>Create a room, share the link, and see the whole team align.</p>
          <div className={styles.ctaRow}>
            <Link href="/create" className={styles.ctaLink}>
              <Button variant="gold" size="lg" className={styles.ctaPrimary}>
                Create a Room
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <Wordmark size="sm" />
        <p>
          Real-time Planning Poker for agile teams. No login, no signup — just play. Rooms live in server memory and
          vanish when everyone leaves.
        </p>
        <nav className={styles.footerNav} aria-label="Footer">
          <Link href="/create">Planning Poker</Link>
          <Link href="#how-it-works">How it works</Link>
        </nav>
        <p className={styles.copyright}>© 2026 Reveal</p>
      </footer>
    </div>
  );
}
