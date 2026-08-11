'use client';

import { useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Wordmark from '@/components/Wordmark';
import Avatar from '@/components/Avatar';
import DistributionChart from '@/components/DistributionChart';
import { useAppDispatch, useAppSelector } from '@/store';
import { snapshotReceived, roomGone } from '@/store/actions';
import { emitAck } from '@/lib/socket';
import type { Participant, RoomPhase } from '@/lib/types';
import styles from './screen.module.scss';
import { cx } from '@/lib/cx';

/* eslint-disable react-hooks/refs -- render-phase "have we got the room" flags are a deliberate legacy pattern here (see the join effect below). */
const PHASE_COPY: Record<RoomPhase, { title: string; sub: string }> = {
  waiting: { title: 'Waiting for the host…', sub: 'Voting hasn’t started yet.' },
  voting: { title: 'Voting in progress', sub: 'Pick a card — your vote locks in the moment you tap.' },
  ended: { title: 'Voting ended', sub: 'The reveal is coming up.' },
  revealed: { title: 'Results', sub: 'One round, final answers.' },
};

/**
 * Big-screen / presentation mode — a read-only projection of the table.
 * The socket joins as a "screen" (not a participant) and renders the round
 * large: phase status, the synced countdown, face-down cards that flip in a
 * staggered wave on reveal, and the statistics. Zero controls.
 */
export default function ScreenPage() {
  const params = useParams<{ roomCode: string }>();
  const dispatch = useAppDispatch();
  const code = String(params?.roomCode ?? '').toUpperCase();

  const connection = useAppSelector((s) => s.ui.connection);
  const roomCode = useAppSelector((s) => s.room.code);
  const roomGoneMessage = useAppSelector((s) => s.ui.roomGoneMessage);
  const teamName = useAppSelector((s) => s.room.teamName);
  const game = useAppSelector((s) => s.room.game);
  const question = useAppSelector((s) => s.voting.question);
  const questionIndex = useAppSelector((s) => s.voting.questionIndex);
  const questionCount = useAppSelector((s) => s.voting.questionCount);
  const participants = useAppSelector((s) => s.participants.list);
  const phase = useAppSelector((s) => s.voting.phase);
  const votes = useAppSelector((s) => s.voting.votes);
  const stats = useAppSelector((s) => s.voting.stats);
  const timer = useAppSelector((s) => s.timer.timer);
  const remaining = useAppSelector((s) => s.timer.remaining);
  const timesUp = useAppSelector((s) => s.timer.timesUp);

  const joinedRef = useRef(false);
  const hadRoomRef = useRef(false);
  if (roomCode === code) hadRoomRef.current = true;

  // Join as a "screen" once connected (also re-joins after a drop).
  useEffect(() => {
    if (connection !== 'connected' || roomGoneMessage) {
      joinedRef.current = false;
      return;
    }
    if (joinedRef.current) return;
    joinedRef.current = true;
    emitAck<{ ok: boolean; error?: string; snapshot?: any }>('room:join', { code, role: 'screen' })
      .then((res) => {
        if (res?.ok && res.snapshot) {
          dispatch(snapshotReceived(res.snapshot));
        } else if (res?.error === 'not_found') {
          // The room lived in memory and expired — show the gone screen.
          dispatch(roomGone({ message: `Room ${code} no longer exists — it lived only in memory and has expired.` }));
        } else {
          joinedRef.current = false; // allow a retry on the next connect tick
        }
      })
      .catch(() => {
        joinedRef.current = false;
      });
  }, [connection, code, dispatch, roomGoneMessage]);

  const gone = roomGoneMessage || (hadRoomRef.current && roomCode !== code);

  if (gone) {
    return (
      <div className={styles.gone}>
        <span className={styles.goneIcon} aria-hidden="true">
          🃏
        </span>
        <h1 className={styles.goneTitle}>The room is gone</h1>
        <p className={styles.goneBody}>
          {roomGoneMessage ??
            'The session ended and the room was cleared from memory. Nothing was saved — by design.'}
        </p>
        <Link href="/">
          <span className={styles.exitBtn}>Back home</span>
        </Link>
      </div>
    );
  }

  if (!hadRoomRef.current) {
    return (
      <div className={styles.connecting}>
        <span className={styles.spinner} aria-hidden="true" />
        <p>
          {connection === 'disconnected' ? (
            <>Can’t reach the realtime server — is it running?</>
          ) : (
            <>
              Connecting to <span className={styles.code}>{code}</span>…
            </>
          )}
        </p>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Would You Rather projection — question headline + A/B split (or the
  // live pick status while voting). Same data, different stage.
  // -------------------------------------------------------------------------
  if (game === 'would-you-rather') {
    const wyrRevealed = phase === 'revealed';
    const aCount = stats?.counts.find((c) => c.value === 'A')?.count ?? 0;
    const bCount = stats?.counts.find((c) => c.value === 'B')?.count ?? 0;
    const total = (stats?.count ?? 0) || 1;
    const aPct = Math.round((aCount / total) * 100);
    const bPct = Math.round((bCount / total) * 100);

    return (
      <div className={styles.screen}>
        <header className={styles.bar}>
          <Wordmark size="sm" />
          {teamName && <span className={styles.team}>{teamName}</span>}
          <span className={styles.code} title="Room code">
            {code}
          </span>
          <span className={styles.spacer} />
          <span className={styles.live} role="status">
            <span className={styles.liveDot} aria-hidden="true" /> LIVE
          </span>
          <Link href={`/r/${code}`} className={styles.exit}>
            Exit
          </Link>
        </header>

        <main className={styles.stage}>
          <section className={styles.status}>
            <p className={styles.eyebrow}>
              {phase === 'waiting'
                ? 'Would You Rather · waiting room'
                : `Would You Rather · question ${questionIndex + 1} of ${questionCount}`}
            </p>
            {question ? (
              <h1 className={styles.statusTitle}>
                {question.a} <span className={styles.wyrOr}>or</span> {question.b}
              </h1>
            ) : (
              <h1 className={styles.statusTitle}>Waiting for the host…</h1>
            )}
            {phase === 'voting' && <p className={styles.statusSub}>Everyone picks a side — votes lock the moment they tap.</p>}
            {wyrRevealed && <p className={styles.statusSub}>Picks are in — the room is split.</p>}
          </section>

          {wyrRevealed ? (
            <section className={styles.wyrSplit} aria-label="Vote split">
              <div className={cx(styles.wyrSide, aCount > bCount && styles.wyrWinner)}>
                <span className={styles.wyrLetter}>A</span>
                <p className={styles.wyrText}>{question?.a}</p>
                <span className={styles.wyrCount}>
                  {aCount} · {aPct}%
                </span>
              </div>
              <div className={cx(styles.wyrSide, bCount > aCount && styles.wyrWinner)}>
                <span className={styles.wyrLetter}>B</span>
                <p className={styles.wyrText}>{question?.b}</p>
                <span className={styles.wyrCount}>
                  {bCount} · {bPct}%
                </span>
              </div>
            </section>
          ) : (
            <section className={styles.table} aria-label="Voting table">
              {participants.map((p) => (
                <div key={p.id} className={styles.card}>
                  <Avatar name={p.name} hue={p.hue} size="lg" status={p.status} />
                  <div className={styles.cardMeta}>
                    <span className={styles.cardName}>{p.name}</span>
                    {p.status === 'voted' && (
                      <span className={styles.lockPip} title="picked">
                        ✓
                      </span>
                    )}
                    {phase === 'voting' && p.status === 'connected' && (
                      <span className={styles.wyrThinking} title="thinking">
                        ○
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </section>
          )}
        </main>
      </div>
    );
  }

  const revealed = phase === 'revealed';
  const timerTone =
    timesUp || remaining <= 0 ? 'zero' : timer && remaining / timer.durationSec <= 0.15 ? 'urgent' : 'calm';
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  const copy = PHASE_COPY[phase];

  return (
    <div className={styles.screen}>
      <header className={styles.bar}>
        <Wordmark size="sm" />
        {teamName && <span className={styles.team}>{teamName}</span>}
        <span className={styles.code} title="Room code">
          {code}
        </span>
        <span className={styles.spacer} />
        <span className={styles.live} role="status">
          <span className={styles.liveDot} aria-hidden="true" /> LIVE
        </span>
        <Link href={`/r/${code}`} className={styles.exit}>
          Exit
        </Link>
      </header>

      <main className={styles.stage}>
        <section className={styles.status}>
          <p className={styles.eyebrow}>
            {phase === 'voting' ? 'Choose your estimate' : phase === 'waiting' ? 'Waiting room' : phase === 'ended' ? "Time's up" : 'Round complete'}
          </p>
          <h1 className={styles.statusTitle}>{copy.title}</h1>
          {phase !== 'voting' && <p className={styles.statusSub}>{copy.sub}</p>}
          {timer && (
            <div className={cx(styles.timer, styles[timerTone])}>
              <span className={styles.timerTime} aria-live="polite">
                {timesUp ? '0:00' : `${mm}:${ss}`}
              </span>
              <span className={styles.timerLabel}>{timesUp ? 'Time’s up!' : phase === 'ended' ? 'Voting closed' : 'Voting in progress'}</span>
            </div>
          )}
        </section>

        <section className={styles.table} aria-label="Voting table">
          {participants.map((p, i) => (
            <ScreenCard key={p.id} p={p} revealed={revealed} value={votes[p.id]} index={i} />
          ))}
        </section>

        {revealed && stats && (
          <section className={styles.results}>
            <div className={styles.statRow}>
              <ScreenStat label="Average" value={stats.avg == null ? '—' : String(stats.avg)} />
              <ScreenStat label="Median" value={stats.median == null ? '—' : String(stats.median)} />
              <ScreenStat label="Most selected" value={stats.mode} />
              <ScreenStat label="Votes" value={String(stats.count)} />
            </div>
            <div className={styles.chart}>
              <DistributionChart data={stats.counts.map((c) => ({ label: c.value, count: c.count }))} />
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

interface ScreenCardProps {
  p: Participant;
  revealed: boolean;
  value: string | undefined;
  index: number;
}

function ScreenCard({ p, revealed, value, index }: ScreenCardProps) {
  const voted = value !== undefined;
  const flipped = revealed && voted;
  return (
    <div className={styles.card} style={{ '--delay': `${Math.min(index * 70, 900)}ms` } as React.CSSProperties}>
      <div className={cx(styles.flip, flipped && styles.flipped)}>
        <div className={cx(styles.face, styles.back)} aria-hidden="true">
          <span className={styles.backSuit}>♦</span>
          <span className={styles.backMark}>?</span>
        </div>
        <div className={cx(styles.face, styles.front)}>
          <span className={styles.frontSuit} aria-hidden="true">
            ♦
          </span>
          <span className={styles.frontValue}>{value}</span>
        </div>
      </div>
      <div className={styles.cardMeta}>
        <Avatar name={p.name} hue={p.hue} size="sm" status={p.status} />
        <span className={styles.cardName}>{p.name}</span>
        {!revealed && p.status === 'voted' && (
          <span className={styles.lockPip} title="voted">
            ✓
          </span>
        )}
        {revealed && !voted && <span className={styles.noVote}>didn’t vote</span>}
      </div>
    </div>
  );
}

function ScreenStat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
    </div>
  );
}
