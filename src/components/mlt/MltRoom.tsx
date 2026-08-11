'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '@/store';
import { clearMyVote, setMyVote } from '@/store/slices/votingSlice';
import { openModal, pushToast } from '@/store/slices/uiSlice';
import { emitAck } from '@/lib/socket';
import { useGameSession } from '@/lib/useGameSession';
import type { GamePlayer } from '@/lib/gameTypes';
import Button from '@/components/Button';
import RoomQR from '@/components/RoomQR';
import Avatar from '@/components/Avatar';
import Leaderboard from '@/components/games/Leaderboard';
import WinnerModal from '@/components/games/WinnerModal';
import { cx } from '@/lib/cx';
import styles from './MltRoom.module.scss';

/**
 * Most Likely To — the third game on the platform, running on the exact same
 * realtime room architecture as Planning Poker and Would You Rather.
 *
 *   WAITING   → host sees invite + prompt count; everyone waits for Start.
 *   VOTING    → the current prompt is live; everyone secretly nominates one
 *               teammate (never themselves) — the pick locks instantly.
 *   ENDED     → defensive only (no timer is exposed for MLT rooms).
 *   REVEALED  → the nominations are public: crowned teammate(s) highlighted,
 *               crown points + predictor bonus awarded, totals shown.
 *   (finish)  → after the final round the host marks the session over and the
 *               shared WinnerModal celebrates the overall champion.
 *
 * Scoring is server-authoritative (crown ranking 100/80/60/40/20/10 + a +20
 * predictor bonus); this component only derives the leaderboard from the
 * server-provided scores via useGameSession.
 */
export default function MltRoom() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const isHost = useAppSelector((s) => s.room.hostId === s.ui.myParticipantId);
  const hostId = useAppSelector((s) => s.room.hostId);
  const myId = useAppSelector((s) => s.ui.myParticipantId);
  const phase = useAppSelector((s) => s.voting.phase);
  const prompt = useAppSelector((s) => s.voting.prompt);
  const promptIndex = useAppSelector((s) => s.voting.promptIndex);
  const promptCount = useAppSelector((s) => s.voting.promptCount);
  const votedIds = useAppSelector((s) => s.voting.votedIds);
  const everyoneHasVoted = useAppSelector((s) => s.voting.everyoneHasVoted);
  const votes = useAppSelector((s) => s.voting.votes);
  const mltResult = useAppSelector((s) => s.voting.mltResult);
  const mltScores = useAppSelector((s) => s.voting.mltScores);
  const sessionOver = useAppSelector((s) => s.voting.sessionOver);
  const participants = useAppSelector((s) => s.participants.list);
  const teamName = useAppSelector((s) => s.room.teamName);
  const roomTitle = useAppSelector((s) => s.room.roomTitle);
  const locked = useAppSelector((s) => s.room.locked);
  const code = useAppSelector((s) => s.room.code);
  const myVote = useAppSelector((s) => s.voting.myVote);

  const [busy, setBusy] = useState(false);
  const prevPrompt = useRef(promptIndex);
  const prevSessionOver = useRef(sessionOver);

  const roomUrl = typeof window !== 'undefined' && code ? `${window.location.origin}/r/${code}` : '';

  // A new prompt wipes the previous round's nomination — clear my optimistic
  // pick so the next prompt starts fresh (the server already wiped the votes).
  useEffect(() => {
    if (prevPrompt.current !== promptIndex) {
      prevPrompt.current = promptIndex;
      dispatch(clearMyVote());
    }
  }, [promptIndex, dispatch]);

  // Play Again resets promptIndex to 0, so in a single-prompt room the effect
  // above never fires and the finished round's optimistic pick would re-lock
  // the chips in the next session. Wipe it whenever the session-over flag
  // clears instead (the server already wiped votes / votedIds).
  useEffect(() => {
    if (prevSessionOver.current && !sessionOver) {
      dispatch(clearMyVote());
    }
    prevSessionOver.current = sessionOver;
  }, [sessionOver, dispatch]);

  // ------------------------------------------------------------------
  // Shared game engine: leaderboard + winner celebration.
  // ------------------------------------------------------------------
  const players: GamePlayer[] = useMemo(
    () =>
      participants.map((p) => ({
        playerId: p.id,
        name: p.name,
        hue: p.hue,
        isHost: p.id === hostId,
        isConnected: p.status !== 'disconnected',
        status: votedIds.includes(p.id) ? 'answered' : p.status === 'disconnected' ? 'disconnected' : 'playing',
        roundScore: mltResult?.points[p.id] ?? 0,
        totalScore: mltScores[p.id] ?? 0,
      })),
    [participants, hostId, votedIds, mltResult, mltScores],
  );

  const session = useGameSession({
    players,
    myId,
    ended: sessionOver,
    onPlayAgain: () => {
      if (isHost) {
        emitAck<{ ok: boolean; error?: string }>('mlt:playAgain', {}).catch(() =>
          dispatch(pushToast({ kind: 'error', title: 'Offline', message: 'Could not restart the game.' })),
        );
      }
    },
  });

  const voted = myId != null && votedIds.includes(myId);
  const myPick = myVote ?? (phase === 'revealed' && myId ? votes[myId] : undefined);
  const votingOpen = phase === 'voting';
  const lockedIn = voted || myVote != null;
  // Teammates I may nominate: everyone at the table except myself.
  const nominees = participants.filter((p) => p.id !== myId);
  const isLast = promptIndex + 1 >= promptCount;

  const nominate = (targetId: string) => {
    if (!votingOpen || lockedIn || busy || targetId === myId) return;
    dispatch(setMyVote(targetId)); // instant lock — the server owns the real one
    setBusy(true);
    emitAck<{ ok: boolean; error?: string }>('vote:cast', { value: targetId })
      .then((res) => {
        if (!res?.ok) {
          dispatch(clearMyVote());
          dispatch(pushToast({ kind: 'error', title: 'Could not nominate', message: res?.error }));
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
    emitAck<{ ok: boolean; done?: boolean; error?: string }>('mlt:next', {})
      .then((res) => {
        if (!res?.ok) dispatch(pushToast({ kind: 'error', title: 'Could not advance', message: res?.error }));
      })
      .catch(() => dispatch(pushToast({ kind: 'error', title: 'Offline', message: 'Could not reach the table.' })))
      .finally(() => setBusy(false));
  };

  const finish = () => {
    if (busy) return;
    setBusy(true);
    emitAck<{ ok: boolean; error?: string }>('mlt:finish', {})
      .then((res) => {
        if (!res?.ok) dispatch(pushToast({ kind: 'error', title: 'Could not finish', message: res?.error }));
      })
      .catch(() => dispatch(pushToast({ kind: 'error', title: 'Offline', message: 'Could not reach the table.' })))
      .finally(() => setBusy(false));
  };

  const copyInvite = () => {
    const text = `Join our Most Likely To game:\n\n${roomUrl}\n\nEnter your name to join.`;
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
    const text = `Join our Most Likely To game:\n\n${roomUrl}\n\nEnter your name to join.`;
    if ('share' in navigator) {
      try {
        await navigator.share({ title: 'Most Likely To', text, url: roomUrl });
      } catch {
        /* user cancelled the share sheet — nothing to do */
      }
      return;
    }
    copyInvite();
  };

  const nominatedCount = votedIds.length;

  // ------------------------------------------------------------------
  // WAITING — invite + start (host) or wait (participants)
  // ------------------------------------------------------------------
  let body: React.ReactNode;
  if (phase === 'waiting') {
    body = (
      <>
        <span className={styles.eyebrow}>Most Likely To · waiting room</span>
        <h2 className={styles.title}>{roomTitle || (isHost ? 'Invite your team' : 'Waiting for the host…')}</h2>
        {teamName && <p className={styles.teamLine}>{teamName}</p>}
        <p className={styles.sub}>
          {promptCount} {promptCount === 1 ? 'prompt' : 'prompts'} ready · {participants.length}{' '}
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
            <p className={styles.note}>
              Everyone secretly nominates the teammate most likely to do it — crowned teammates earn points, and anyone
              who predicts the crown earns a bonus.
            </p>
          </>
        ) : (
          <>
            <p className={styles.hint}>The host will start the first prompt when everyone’s here.</p>
            {locked && (
              <p className={styles.roomLockedNote} role="status">
                🔒 The room is locked — no new people can join until the host unlocks it.
              </p>
            )}
          </>
        )}
      </>
    );
  } else if (phase === 'revealed') {
    // ------------------------------------------------------------------
    // REVEALED — public nominations, crown + totals, next / finish
    // ------------------------------------------------------------------
    const counts = mltResult?.counts ?? {};
    const winners = mltResult?.winners ?? [];
    const predictors = mltResult?.predictors ?? [];
    const scored = participants
      .map((p) => ({ participant: p, count: counts[p.id] ?? 0 }))
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count || a.participant.name.localeCompare(b.participant.name));
    const nonVoters = participants.filter((p) => !votedIds.includes(p.id));
    const crowned = winners
      .map((id) => participants.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p));
    const iPredicted = myId ? predictors.includes(myId) : false;
    const hasVotes = scored.length > 0;

    body = (
      <>
        <span className={styles.eyebrow}>
          Prompt {promptIndex + 1} of {promptCount} · revealed
        </span>
        <h2 className={styles.title}>
          {hasVotes
            ? crowned.length === 1
              ? `👑 ${crowned[0]!.name} takes the crown!`
              : `👑 ${crowned.map((p) => p.name).join(' & ')} share the crown!`
            : 'Nobody nominated anyone'}
        </h2>

        {prompt && (
          <p className={styles.promptLine}>
            Who is most likely to <strong>{prompt}</strong>?
          </p>
        )}

        {hasVotes ? (
          <>
            <div className={styles.tally} aria-label="Nomination tally">
              {scored.map(({ participant, count }) => {
                const isWinner = winners.includes(participant.id);
                const nominators = participants.filter((p) => votes[p.id] === participant.id);
                return (
                  <div key={participant.id} className={cx(styles.tallyCard, isWinner && styles.tallyWinner)}>
                    <div className={styles.tallyHead}>
                      <Avatar name={participant.name} hue={participant.hue} size="sm" />
                      <span className={styles.tallyName}>
                        {participant.name}
                        {participant.id === myId && (
                          <span className={styles.you} aria-label="you">
                            you
                          </span>
                        )}
                      </span>
                      {isWinner && (
                        <span className={styles.crown} aria-label="crowned">
                          👑
                        </span>
                      )}
                      <span className={styles.tallyCount}>
                        {count} {count === 1 ? 'vote' : 'votes'}
                      </span>
                      <span className={styles.tallyPoints} role="status" aria-label={`plus ${mltResult?.points[participant.id] ?? 0} points`}>
                        +{mltResult?.points[participant.id] ?? 0}
                      </span>
                    </div>
                    <div className={styles.tallyVoters}>
                      {nominators.map((v) => (
                        <span key={v.id} className={styles.voterChip}>
                          <Avatar name={v.name} hue={v.hue} size="sm" />
                          {v.id === myId ? 'You' : v.name}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {iPredicted && (
              <p className={styles.predicted} role="status">
                🎯 You predicted the crown — +20 bonus
              </p>
            )}

            {nonVoters.length > 0 && (
              <p className={styles.nonVoters} role="status">
                {nonVoters.map((p) => p.name).join(', ')} didn&rsquo;t nominate
              </p>
            )}
          </>
        ) : (
          <p className={styles.hint}>No one nominated anyone this round — no points were awarded.</p>
        )}

        <Leaderboard entries={session.leaderboard} title="Total scores" showDelta className={styles.leaderboard} />

        {isHost ? (
          <div className={styles.hostRow}>
            {isLast ? (
              <>
                <p className={styles.lastNote}>That was the last prompt — finish the game to crown the champion.</p>
                <Button variant="gold" size="lg" onClick={finish} disabled={busy}>
                  {busy ? 'Finishing…' : 'Finish Game 🏆'}
                </Button>
              </>
            ) : (
              <Button variant="gold" size="lg" onClick={next} disabled={busy}>
                {busy ? 'Loading…' : 'Next Prompt →'}
              </Button>
            )}
          </div>
        ) : (
          <p className={styles.hint}>
            {isLast ? 'Waiting for the host to finish the game…' : 'Waiting for the host to start the next prompt…'}
          </p>
        )}
      </>
    );
  } else {
    // ------------------------------------------------------------------
    // VOTING (or defensively ENDED) — the prompt is live
    // ------------------------------------------------------------------
    const closed = phase === 'ended';
    body = (
      <>
        <span className={styles.eyebrow}>
          Prompt {promptIndex + 1} of {promptCount}
        </span>
        <p className={styles.promptLine}>
          Who is most likely to <strong>{prompt}</strong>?
        </p>

        <div className={styles.chips} role="group" aria-label="Your nomination">
          {nominees.length === 0 && <p className={styles.hint}>Invite teammates to join — nobody to nominate yet.</p>}
          {nominees.map((p) => (
            <button
              key={p.id}
              type="button"
              className={cx(styles.chip, myPick === p.id && styles.chipPicked, lockedIn && styles.chipLocked)}
              onClick={() => nominate(p.id)}
              disabled={!votingOpen || lockedIn}
              aria-pressed={myPick === p.id}
              aria-label={`Nominate ${p.name}`}
            >
              <Avatar name={p.name} hue={p.hue} size="sm" />
              <span className={styles.chipName}>{p.name}</span>
              {myPick === p.id && (
                <span className={styles.chipPip} aria-hidden="true">
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>

        {lockedIn ? (
          <p className={styles.lockedNote} role="status">
            <span aria-hidden="true">✓</span> Nomination locked
            {myPick ? ` — you picked ${participants.find((p) => p.id === myPick)?.name ?? ''}` : ''}. No take-backs.
          </p>
        ) : closed ? (
          <p className={styles.hint}>Voting closed — the host will reveal the nominations.</p>
        ) : (
          <p className={styles.hint}>Pick the teammate most likely to do it — your pick locks the moment you tap.</p>
        )}

        <div className={styles.statusRow} role="status" aria-live="polite">
          <span className={styles.count}>
            {everyoneHasVoted ? (
              <>
                <span className={styles.tick} aria-hidden="true">
                  ✓
                </span>{' '}
                Everyone nominated · {nominatedCount} / {participants.length}
              </>
            ) : (
              <>
                {nominatedCount} / {participants.length} nominated
              </>
            )}
          </span>
          {isHost ? (
            <Button variant="gold" size="md" onClick={reveal} disabled={busy}>
              {busy ? 'Revealing…' : 'Reveal Nominations'}
            </Button>
          ) : (
            <span className={styles.hint}>Nominations stay hidden until the host reveals.</span>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <div className={styles.panel}>{body}</div>

      {/* The end-of-game celebration — opens automatically when the server
          marks the session over; Play Again restarts (host), Back to Games
          returns to the catalog. */}
      <WinnerModal
        open={session.winnerOpen}
        gameName="Most Likely To"
        entries={session.leaderboard}
        totalRounds={promptCount}
        onPlayAgain={session.playAgain}
        onBackToGames={() => router.push('/games')}
        onClose={session.closeWinner}
      />
    </>
  );
}
