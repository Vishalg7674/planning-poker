'use client';

import { useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store';
import { clearMyVote, setMyVote } from '@/store/slices/votingSlice';
import { openModal, pushToast, triggerCelebration } from '@/store/slices/uiSlice';
import { emitAck } from '@/lib/socket';
import Button from '@/components/Button';
import RoomQR from '@/components/RoomQR';
import Avatar from '@/components/Avatar';
import type { Participant } from '@/lib/types';
import styles from './WyrRoom.module.scss';
import { cx } from '@/lib/cx';

/**
 * Would You Rather — the second game on the platform, running on the exact
 * same realtime room architecture as Planning Poker (same /r/CODE link, same
 * in-memory server, same snapshot → Redux bridge).
 *
 *   WAITING   → host sees invite + question count; everyone waits for Start.
 *   VOTING    → the current question is live; everyone picks A or B exactly
 *               once (locked). The host sees who picked, never what they picked.
 *   ENDED     → defensive only (no timer is exposed for WYR rooms).
 *   REVEALED  → the A/B split is public; host advances to the next question.
 *
 * Votes are per question: the server wipes them on `wyr:next`, so the lock
 * resets for the next prompt. Server-side rules are authoritative.
 */
export default function WyrRoom() {
  const dispatch = useAppDispatch();
  const isHost = useAppSelector((s) => s.room.hostId === s.ui.myParticipantId);
  const myId = useAppSelector((s) => s.ui.myParticipantId);
  const phase = useAppSelector((s) => s.voting.phase);
  const question = useAppSelector((s) => s.voting.question);
  const questionIndex = useAppSelector((s) => s.voting.questionIndex);
  const questionCount = useAppSelector((s) => s.voting.questionCount);
  const votedIds = useAppSelector((s) => s.voting.votedIds);
  const everyoneHasVoted = useAppSelector((s) => s.voting.everyoneHasVoted);
  const votes = useAppSelector((s) => s.voting.votes);
  const stats = useAppSelector((s) => s.voting.stats);
  const participants = useAppSelector((s) => s.participants.list);
  const teamName = useAppSelector((s) => s.room.teamName);
  const roomTitle = useAppSelector((s) => s.room.roomTitle);
  const locked = useAppSelector((s) => s.room.locked);
  const code = useAppSelector((s) => s.room.code);
  const myVote = useAppSelector((s) => s.voting.myVote);

  const [busy, setBusy] = useState(false);
  const celebrated = useRef(false);
  const prevQuestion = useRef(questionIndex);

  const roomUrl = typeof window !== 'undefined' && code ? `${window.location.origin}/r/${code}` : '';

  // A new question wipes the previous one's vote — clear my optimistic pick so
  // the next prompt starts fresh (the server already wiped the real votes).
  useEffect(() => {
    if (prevQuestion.current !== questionIndex) {
      prevQuestion.current = questionIndex;
      dispatch(clearMyVote());
      celebrated.current = false;
    }
  }, [questionIndex, dispatch]);

  // Confetti on a unanimous question — everyone picked the same side.
  useEffect(() => {
    if (phase === 'revealed' && stats?.level === 'full' && !celebrated.current) {
      celebrated.current = true;
      dispatch(triggerCelebration());
    }
  }, [phase, stats, dispatch]);

  const voted = myId != null && votedIds.includes(myId);
  const myPick = myVote ?? (phase === 'revealed' && myId ? votes[myId] : undefined);
  const votingOpen = phase === 'voting';
  const lockedIn = voted || myVote != null;

  const pick = (side: 'A' | 'B') => {
    if (!votingOpen || lockedIn || busy) return;
    dispatch(setMyVote(side)); // instant lock — the server owns the real one
    setBusy(true);
    emitAck<{ ok: boolean; error?: string }>('vote:cast', { value: side })
      .then((res) => {
        if (!res?.ok) {
          dispatch(clearMyVote());
          dispatch(pushToast({ kind: 'error', title: 'Could not submit', message: res?.error }));
        }
      })
      .catch(() => dispatch(clearMyVote()))
      .finally(() => setBusy(false));
  };

  const reveal = () => {
    if (busy) return;
    setBusy(true);
    emitAck<{ ok: boolean; error?: string }>('votes:reveal', {})
      .then((res) => {
        if (!res?.ok) dispatch(pushToast({ kind: 'error', title: 'Could not reveal', message: res?.error }));
      })
      .catch(() => dispatch(pushToast({ kind: 'error', title: 'Offline', message: 'Could not reach the table.' })))
      .finally(() => setBusy(false));
  };

  const next = () => {
    if (busy) return;
    setBusy(true);
    emitAck<{ ok: boolean; done?: boolean; error?: string }>('wyr:next', {})
      .then((res) => {
        if (!res?.ok) dispatch(pushToast({ kind: 'error', title: 'Could not advance', message: res?.error }));
      })
      .catch(() => dispatch(pushToast({ kind: 'error', title: 'Offline', message: 'Could not reach the table.' })))
      .finally(() => setBusy(false));
  };

  const copyInvite = () => {
    const text = `Join our Would You Rather game:\n\n${roomUrl}\n\nEnter your name to join.`;
    navigator.clipboard?.writeText(text).then(
      () => dispatch(pushToast({ kind: 'success', title: 'Invite copied', message: 'Link + a short message — paste anywhere.' })),
      () => dispatch(pushToast({ kind: 'error', title: 'Could not copy', message: 'Copy the address bar URL manually.' })),
    );
  };

  const start = () => {
    if (busy) return;
    setBusy(true);
    emitAck<{ ok: boolean; error?: string }>('voting:start', {})
      .then((res) => {
        if (!res?.ok) dispatch(pushToast({ kind: 'error', title: 'Could not start', message: res?.error }));
      })
      .catch(() => dispatch(pushToast({ kind: 'error', title: 'Offline', message: 'Could not reach the table.' })))
      .finally(() => setBusy(false));
  };

  const toggleLock = () => {
    if (busy) return;
    setBusy(true);
    emitAck<{ ok: boolean; error?: string }>(locked ? 'room:unlock' : 'room:lock', {})
      .then((res) => {
        if (!res?.ok) dispatch(pushToast({ kind: 'error', title: 'Could not change lock', message: res?.error }));
      })
      .catch(() => dispatch(pushToast({ kind: 'error', title: 'Offline', message: 'Could not reach the table.' })))
      .finally(() => setBusy(false));
  };

  const shareRoom = async () => {
    const text = `Join our Would You Rather game:\n\n${roomUrl}\n\nEnter your name to join.`;
    if ('share' in navigator) {
      try {
        await navigator.share({ title: 'Would You Rather', text, url: roomUrl });
      } catch {
        /* user cancelled the share sheet — nothing to do */
      }
      return;
    }
    copyInvite();
  };

  const pickedCount = votedIds.length;

  if (phase === 'waiting') {
    return (
      <div className={styles.panel}>
        <span className={styles.eyebrow}>Would You Rather · waiting room</span>
        <h2 className={styles.title}>{roomTitle || (isHost ? 'Invite your team' : 'Waiting for the host…')}</h2>
        {teamName && <p className={styles.teamLine}>{teamName}</p>}
        <p className={styles.sub}>
          {questionCount} {questionCount === 1 ? 'question' : 'questions'} ready · {participants.length}{' '}
          {participants.length === 1 ? 'person is' : 'people are'} at the table.
        </p>

        {isHost ? (
          <>
            <div className={styles.inviteWrap}>
              <RoomQR value={roomUrl} />
              <div className={styles.invite}>
                <span className={styles.inviteUrl} title={roomUrl}>
                  {roomUrl}
                </span>
                <div className={styles.inviteActions}>
                  <Button variant="outline" size="sm" onClick={copyInvite}>
                    ⧉ Copy Invite
                  </Button>
                  {typeof window !== 'undefined' && 'share' in navigator && (
                    <Button variant="outline" size="sm" onClick={shareRoom}>
                      Share Room
                    </Button>
                  )}
                </div>
                <p className={styles.scanNote}>Scan to join on a phone — or share the link above.</p>
              </div>
            </div>

            <div className={styles.hostRow}>
              <Button variant={locked ? 'danger' : 'outline'} size="sm" onClick={toggleLock} disabled={busy} aria-pressed={locked}>
                {locked ? '🔓 Unlock Room' : '🔒 Lock Room'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => dispatch(openModal('endSession'))}>
                End session
              </Button>
            </div>

            <Button variant="gold" size="lg" onClick={start} disabled={busy}>
              {busy ? 'Starting…' : 'Start Game'}
            </Button>
            <p className={styles.note}>Everyone votes once per question — the moment you pick, it locks.</p>
          </>
        ) : (
          <>
            <p className={styles.hint}>The host will start the first question when everyone’s here.</p>
            {locked && (
              <p className={styles.roomLockedNote} role="status">
                🔒 The room is locked — no new people can join until the host unlocks it.
              </p>
            )}
          </>
        )}
      </div>
    );
  }

  // revealed — the split is public, the host drives the next question
  if (phase === 'revealed') {
    const aCount = stats?.counts.find((c) => c.value === 'A')?.count ?? 0;
    const bCount = stats?.counts.find((c) => c.value === 'B')?.count ?? 0;
    const total = (stats?.count ?? 0) || 1;
    const aPct = Math.round((aCount / total) * 100);
    const bPct = Math.round((bCount / total) * 100);
    const winner = aCount > bCount ? 'A' : bCount > aCount ? 'B' : null;
    const aVoters = participants.filter((p) => votes[p.id] === 'A');
    const bVoters = participants.filter((p) => votes[p.id] === 'B');
    const nonVoters = participants.filter((p) => votes[p.id] === undefined);
    const isLast = questionIndex + 1 >= questionCount;

    return (
      <div className={styles.panel}>
        <span className={styles.eyebrow}>
          Question {questionIndex + 1} of {questionCount} · revealed
        </span>
        <h2 className={cx(styles.title, stats?.level === 'full' && styles.titleUnanimous)}>
          {stats?.level === 'full' ? '🎉 Full agreement!' : stats ? 'The room was split' : 'Nobody picked this round'}
        </h2>

        {question && (
          <p className={styles.questionPrompt}>
            Would you rather <strong>{question.a}</strong> or <strong>{question.b}</strong>?
          </p>
        )}

        {stats ? (
          <>
            <div className={styles.split} aria-label="Vote split">
              <SplitSide
                side="A"
                text={question?.a}
                count={aCount}
                pct={aPct}
                winner={winner === 'A'}
                voters={aVoters}
                myId={myId}
              />
              <SplitSide
                side="B"
                text={question?.b}
                count={bCount}
                pct={bPct}
                winner={winner === 'B'}
                voters={bVoters}
                myId={myId}
              />
            </div>

            {nonVoters.length > 0 && (
              <p className={styles.nonVoters} role="status">
                {nonVoters.map((p) => p.name).join(', ')} didn&rsquo;t pick
              </p>
            )}
          </>
        ) : (
          <p className={styles.hint}>Everyone was still thinking — the round closed without any picks.</p>
        )}

        {isHost ? (
          <div className={styles.hostRow}>
            {isLast ? (
              <>
                <p className={styles.lastNote}>That was the last question.</p>
                <Button variant="danger" size="md" onClick={() => dispatch(openModal('endSession'))}>
                  End Session
                </Button>
              </>
            ) : (
              <Button variant="gold" size="lg" onClick={next} disabled={busy}>
                {busy ? 'Loading…' : 'Next Question →'}
              </Button>
            )}
          </div>
        ) : (
          <p className={styles.hint}>Waiting for the host{isLast ? ' to end the session' : '…'}.</p>
        )}
      </div>
    );
  }

  // voting (or defensively ended) — the question is live, picks are A or B
  const closed = phase === 'ended';
  return (
    <div className={styles.panel}>
      <span className={styles.eyebrow}>
        Question {questionIndex + 1} of {questionCount}
      </span>
      <p className={styles.questionPrompt}>
        Would you rather <strong>{question?.a}</strong> or <strong>{question?.b}</strong>?
      </p>

      <div className={styles.choices} role="group" aria-label="Your choice">
        <ChoiceCard
          side="A"
          text={question?.a}
          picked={myPick === 'A'}
          locked={lockedIn}
          disabled={!votingOpen || lockedIn}
          onClick={() => pick('A')}
        />
        <ChoiceCard
          side="B"
          text={question?.b}
          picked={myPick === 'B'}
          locked={lockedIn}
          disabled={!votingOpen || lockedIn}
          onClick={() => pick('B')}
        />
      </div>

      {lockedIn ? (
        <p className={styles.lockedNote} role="status">
          <span aria-hidden="true">✓</span> Vote locked{myPick ? ` — you picked ${myPick}` : ''}. No take-backs.
        </p>
      ) : closed ? (
        <p className={styles.hint}>Voting closed — the host will reveal the picks.</p>
      ) : (
        <p className={styles.hint}>Pick a side — your vote locks the moment you tap.</p>
      )}

      <div className={styles.statusRow} role="status" aria-live="polite">
        <span className={styles.count}>
          {everyoneHasVoted ? (
            <>
              <span className={styles.tick} aria-hidden="true">
                ✓
              </span>{' '}
              Everyone picked · {pickedCount} / {participants.length}
            </>
          ) : (
            <>
              {pickedCount} / {participants.length} picked
            </>
          )}
        </span>
        {isHost ? (
          <Button variant="gold" size="md" onClick={reveal} disabled={busy}>
            {busy ? 'Revealing…' : 'Reveal Picks'}
          </Button>
        ) : (
          <span className={styles.hint}>Picks stay hidden until the host reveals.</span>
        )}
      </div>
    </div>
  );
}

interface ChoiceCardProps {
  side: 'A' | 'B';
  text?: string;
  picked: boolean;
  locked: boolean;
  disabled: boolean;
  onClick: () => void;
}

function ChoiceCard({ side, text, picked, locked, disabled, onClick }: ChoiceCardProps) {
  return (
    <button
      type="button"
      className={cx(styles.choice, picked && styles.choicePicked, locked && styles.choiceLocked)}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={picked}
      aria-label={`Vote ${side}: ${text ?? ''}`}
    >
      <span className={styles.choiceLetter}>{side}</span>
      <span className={styles.choiceText}>{text}</span>
      {picked && (
        <span className={styles.choicePip} aria-hidden="true">
          ✓
        </span>
      )}
    </button>
  );
}

interface SplitSideProps {
  side: 'A' | 'B';
  text?: string;
  count: number;
  pct: number;
  winner: boolean;
  voters: Participant[];
  myId: string | null;
}

function SplitSide({ side, text, count, pct, winner, voters, myId }: SplitSideProps) {
  return (
    <div className={cx(styles.splitSide, winner && styles.splitWinner)}>
      <div className={styles.splitHead}>
        <span className={styles.splitLetter}>{side}</span>
        <span className={styles.splitCount}>
          {count} {count === 1 ? 'pick' : 'picks'} · {pct}%
        </span>
      </div>
      <p className={styles.splitText}>{text}</p>
      <div className={styles.splitTrack}>
        <div className={styles.splitFill} style={{ width: `${pct}%` }} />
      </div>
      <div className={styles.splitVoters}>
        {voters.length === 0 && <span className={styles.splitEmpty}>No one picked {side}.</span>}
        {voters.map((p) => (
          <span key={p.id} className={styles.voterChip}>
            <Avatar name={p.name} hue={p.hue} size="sm" status={p.status} isMe={p.id === myId} />
            {p.id === myId ? 'You' : p.name}
          </span>
        ))}
      </div>
    </div>
  );
}
