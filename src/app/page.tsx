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
import styles from './page.module.scss';

const joinSchema = yup.object({
  code: yup
    .string()
    .required('Enter a room code')
    .matches(/^[A-Za-z0-9]{4,6}$/, 'Codes are 4–6 letters & numbers'),
});

type JoinForm = yup.InferType<typeof joinSchema>;

const FEATURES = [
  { icon: '🎴', title: 'Private votes', body: 'Your card stays face-down until the whole table reveals together.' },
  { icon: '♻️', title: 'Zero database', body: 'Rooms live in server memory. When everyone leaves, the room is gone.' },
  { icon: '⚡', title: 'No accounts', body: 'Your identity is just a name in a room. No signup, no email, no history.' },
] as const;

const FAN = [
  { value: '21', rot: '-16deg', y: '10px', x: '-46px', delay: '0ms' },
  { value: '13', rot: '-8deg', y: '4px', x: '-24px', delay: '70ms' },
  { value: '8', rot: '0deg', y: '0', x: '0', delay: '140ms' },
  { value: '5', rot: '8deg', y: '4px', x: '24px', delay: '210ms' },
  { value: '3', rot: '16deg', y: '10px', x: '46px', delay: '280ms' },
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
        <span className={styles.tag}>no database · no accounts</span>
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
        <section className={styles.hero}>
          <div className={styles.copy}>
            <p className={styles.eyebrow}>Planning poker, as a table that forgets you</p>
            <h1 className={styles.h1}>
              Vote in secret.
              <br />
              <em>Reveal</em> together.
            </h1>
            <p className={styles.pitch}>
              Free, real-time planning poker with no signup and no database. Create a room, share the link, vote in
              secret, then flip the whole table at once. When the room empties, it simply <strong>vanishes from memory</strong>.
            </p>

            <div className={styles.ctaRow}>
              <Link href="/create" className={styles.ctaLink}>
                <Button variant="gold" size="lg" className={styles.ctaPrimary}>
                  Create a room — it’s free
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

            <div className={styles.trust}>
              <span>no accounts</span>
              <span>no database</span>
              <span>rooms vanish when empty</span>
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
              <div className={styles.feltLabel}>rooms live in memory only</div>
            </div>
          </div>
        </section>

        <section className={styles.features}>
          {FEATURES.map((f) => (
            <div key={f.title} className={styles.feature}>
              <span className={styles.featureIcon}>{f.icon}</span>
              <h2>{f.title}</h2>
              <p>{f.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className={styles.footer}>
        <Wordmark size="sm" />
        <p>
          Reveal is ephemeral by design — nothing is written to disk, nothing is tracked. When the server restarts, every
          room is gone.
        </p>
      </footer>
    </div>
  );
}
