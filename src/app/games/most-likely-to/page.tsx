'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Wordmark from '@/components/Wordmark';
import ThemeToggle from '@/components/ThemeToggle';
import ConnectionPill from '@/components/ConnectionPill';
import Avatar from '@/components/Avatar';
import Button from '@/components/Button';
import { Field, Input } from '@/components/Field';
import { useAppDispatch } from '@/store';
import { pushToast } from '@/store/slices/uiSlice';
import { getSocket, emitAck } from '@/lib/socket';
import { friendlyError } from '@/lib/errors';
import { loadMltIdentity, saveMltIdentity, clearMltIdentity } from '@/lib/mostLikelyTo';
import type { MltParticipant, MltSnapshot } from '@/lib/mostLikelyTo';
import styles from './game.module.scss';
import { cx } from '@/lib/cx';

type View = 'loading' | 'create' | 'join' | 'play' | 'gone';

const GAME_URL_PATH = '/games/most-likely-to';

/** Read the ?room=CODE query param without a Suspense boundary. */
function roomCodeFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const m = window.location.search.match(/[?&]room=([A-Za-z0-9]+)/);
  return m ? m[1]!.toUpperCase() : null;
}

function roomUrlFor(code: string): string {
  return `${window.location.origin}${GAME_URL_PATH}?room=${code}`;
}

/**
 * Most Likely To — vote for the teammate most likely to do it. The room
 * cycles: WAITING → PLAYING (a prompt + pick-a-teammate round) → REVEALED
 * (the table crowns the winner) → PLAYING again.
 *
 * The game manages its own socket lifecycle and local state — it deliberately
 * does not touch the planning-poker Redux slices, so the two live side by
 * side on the same transport without interfering.
 */
export default function MostLikelyToPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();

  const [view, setView] = useState<View>('loading');
  const [code, setCode] = useState<string | null>(null);
  const [snap, setSnap] = useState<MltSnapshot | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [myPick, setMyPick] = useState<string | null>(null);

  // Create / join forms.
  const [name, setName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const lastRoundRef = useRef<number | null>(null);

  const isHost = snap?.hostId != null && snap.hostId === myId;
  const participants = useMemo(() => snap?.participants ?? [], [snap]);

  // ------------------------------------------------------------------
  // Realtime lifecycle
  // ------------------------------------------------------------------
  useEffect(() => {
    const socket = getSocket();

    const onSnapshot = (payload: any) => {
      if (payload?.game !== 'most-likely-to') return;
      // A new round resets my optimistic pick (event callback — ref writes are fine here).
      if (lastRoundRef.current !== null && payload.roundId !== lastRoundRef.current) {
        setMyPick(null);
      }
      lastRoundRef.current = payload.roundId;
      setSnap(payload as MltSnapshot);
    };
    const onEnded = () => {
      clearMltIdentity();
      setView('gone');
    };

    socket.on('snapshot', onSnapshot);
    socket.on('room:ended', onEnded);
    socket.on('you:removed', onEnded);

    // Decide between create / join / rejoin based on the URL. Runs in an async
    // task so no state is set synchronously inside the effect body.
    void (async () => {
      const initialCode = roomCodeFromUrl();
      if (!initialCode) {
        setView('create');
        return;
      }
      setCode(initialCode);
      const identity = loadMltIdentity();
      if (!identity?.participantId) {
        setView('join');
        return;
      }
      const res = await emitAck<{ ok: boolean; participantId?: string; snapshot?: MltSnapshot; error?: string }>('room:rejoin', {
        code: initialCode,
        participantId: identity.participantId,
        name: identity.name,
      });
      if (res?.ok && res.snapshot) {
        const me = res.snapshot.participants.find((p) => p.id === identity.participantId);
        setMyId(identity.participantId);
        if (me) saveMltIdentity({ participantId: identity.participantId, name: me.name, role: me.role });
        setSnap(res.snapshot);
        setView('play');
      } else if (res?.error === 'not_found') {
        clearMltIdentity();
        setView('gone');
      } else {
        // Unknown / stale identity — fresh join form for this room.
        setView('join');
      }
    })();

    return () => {
      socket.off('snapshot', onSnapshot);
      socket.off('room:ended', onEnded);
      socket.off('you:removed', onEnded);
    };
  }, []);

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------
  const startRoom = async () => {
    if (busy || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await emitAck<{ ok: boolean; code?: string; participantId?: string; error?: string }>('room:create', {
        game: 'most-likely-to',
        hostName: name.trim(),
        teamName: teamName.trim(),
      });
      if (!res?.ok || !res.code || !res.participantId) {
        setError(friendlyError(res?.error, 'Could not start the game.'));
        return;
      }
      saveMltIdentity({ participantId: res.participantId, name: name.trim(), role: 'facilitator' });
      setMyId(res.participantId);
      setCode(res.code);
      router.replace(`${GAME_URL_PATH}?room=${res.code}`, { scroll: false });
      dispatch(pushToast({ kind: 'success', title: 'Game created', message: `Code ${res.code} — share the link with your team.` }));
      setView('play');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the game.');
    } finally {
      setBusy(false);
    }
  };

  const joinRoom = async () => {
    if (busy || !code || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await emitAck<{ ok: boolean; participantId?: string; snapshot?: MltSnapshot; error?: string }>('room:join', {
        code,
        name: name.trim(),
      });
      if (!res?.ok || !res.participantId) {
        setError(friendlyError(res?.error, 'Could not join the game.'));
        return;
      }
      saveMltIdentity({ participantId: res.participantId, name: name.trim(), role: 'voter' });
      setMyId(res.participantId);
      if (res.snapshot) setSnap(res.snapshot);
      setView('play');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join the game.');
    } finally {
      setBusy(false);
    }
  };

  const pick = (targetId: string) => {
    if (snap?.status !== 'playing' || myPick !== null || targetId === myId) return;
    const already = snap.pickedIds.includes(myId ?? '');
    if (already) return;
    setMyPick(targetId); // optimistic — the server owns the real lock
    emitAck<{ ok: boolean; error?: string }>('game:pick', { targetId }).then((res) => {
      // already_voted = the server already recorded our pick — that is success.
      if (res?.ok || res?.error === 'already_voted') return;
      setMyPick(null);
      dispatch(pushToast({ kind: 'error', title: 'Pick not counted', message: friendlyError(res?.error, 'Your pick was not accepted.') }));
    });
  };

  const startPrompt = () => {
    emitAck<{ ok: boolean; error?: string }>('game:startPrompt', {}).then((res) => {
      if (!res?.ok) {
        dispatch(pushToast({ kind: 'error', title: 'Could not start', message: friendlyError(res?.error, 'The prompt could not be started.') }));
      }
    });
  };

  const reveal = () => {
    emitAck<{ ok: boolean; error?: string }>('game:reveal', {}).then((res) => {
      if (!res?.ok) {
        dispatch(pushToast({ kind: 'error', title: 'Could not reveal', message: friendlyError(res?.error, 'The picks could not be revealed.') }));
      }
    });
  };

  const copyInvite = () => {
    if (!code) return;
    const text = `Join our Most Likely To game:\n\n${roomUrlFor(code)}\n\nEnter your name to join.`;
    navigator.clipboard?.writeText(text).then(
      () => dispatch(pushToast({ kind: 'success', title: 'Invite copied', message: 'Link + a short message — paste anywhere.' })),
      () => dispatch(pushToast({ kind: 'error', title: 'Could not copy', message: 'Copy the address bar URL manually.' })),
    );
  };

  // ------------------------------------------------------------------
  // Gone / entry screens
  // ------------------------------------------------------------------
  if (view === 'gone') {
    return (
      <div className={styles.page}>
        <Header code={null} />
        <main className={styles.centered}>
          <div className={styles.gonePanel}>
            <span className={styles.goneIcon} aria-hidden="true">
              😂
            </span>
            <h1 className={styles.goneTitle}>This game is over</h1>
            <p className={styles.goneBody}>The host ended the session — the room lived in memory only, so nothing was saved.</p>
            <Link href="/games">
              <Button variant="gold">Back to Games</Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (view !== 'play') {
    const join = view === 'join';
    return (
      <div className={styles.page}>
        <Header code={code} />
        <main className={styles.centered}>
          <div className={styles.entryCard}>
            <span className={styles.entryEmoji} aria-hidden="true">
              😂
            </span>
            <h1 className={styles.entryTitle}>{join ? `Join room ${code}` : 'Most Likely To'}</h1>
            <p className={styles.entrySub}>
              {join
                ? 'Someone is hosting — add your name and take a seat.'
                : 'Vote for the teammate most likely to do it. Yes, that one.'}
            </p>
            <div className={styles.entryForm}>
              <Field label="Your Name" htmlFor="mlt-name" hint="Required.">
                <Input id="mlt-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ada" autoComplete="off" maxLength={24} />
              </Field>
              {!join && (
                <Field label="Team Name" htmlFor="mlt-team" hint="Optional — shown at the top of the room.">
                  <Input id="mlt-team" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="e.g. Frontend Team" autoComplete="off" maxLength={40} />
                </Field>
              )}
              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}
              <Button variant="gold" size="lg" block onClick={join ? joinRoom : startRoom} disabled={busy || !name.trim()}>
                {busy ? (join ? 'Joining…' : 'Starting…') : join ? 'Join Game' : 'Start Game'}
              </Button>
            </div>
            <p className={styles.entryNote}>Rooms live in memory only — a server restart clears every table.</p>
          </div>
        </main>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // The game
  // ------------------------------------------------------------------
  if (!snap) {
    return (
      <div className={styles.page}>
        <Header code={code} />
        <main className={styles.centered}>
          <p className={styles.entering}>
            <span className={styles.spinner} aria-hidden="true" />
            Walking up to the table…
          </p>
        </main>
      </div>
    );
  }

  const myLocked = myPick !== null || snap.pickedIds.includes(myId ?? '');
  const myPickName = myPick ? participants.find((p) => p.id === myPick)?.name : undefined;
  const pickedCount = participants.filter((p) => p.status !== 'disconnected' && p.hasVoted).length;
  const totalCount = participants.filter((p) => p.status !== 'disconnected').length;

  return (
    <div className={styles.page} data-accent="gold">
      <Header code={code} />
      <main className={styles.layout}>
        <section className={styles.table}>
          {snap.status === 'waiting' && (
            <WaitingPanel
              snap={snap}
              isHost={isHost}
              roomUrl={code ? roomUrlFor(code) : ''}
              onStart={startPrompt}
              onCopy={copyInvite}
            />
          )}
          {snap.status === 'playing' && (
            <PlayingPanel
              snap={snap}
              participants={participants}
              isHost={isHost}
              myId={myId}
              myPick={myPick}
              myLocked={myLocked}
              myPickName={myPickName}
              pickedCount={pickedCount}
              totalCount={totalCount}
              onPick={pick}
              onReveal={reveal}
            />
          )}
          {snap.status === 'revealed' && (
            <ResultsPanel snap={snap} participants={participants} isHost={isHost} onNext={startPrompt} />
          )}
        </section>
        <aside className={styles.side}>
          <h3 className={styles.sideTitle}>
            Players
            <span className={styles.sideCount}>
              {participants.length} {participants.length === 1 ? 'person' : 'people'}
            </span>
          </h3>
          <ul className={styles.playerList}>
            {participants.map((p) => (
              <li key={p.id} className={styles.playerRow} data-status={p.status}>
                <Avatar name={p.name} hue={p.hue} size="md" status={p.status} isHost={p.id === snap.hostId} isMe={p.id === myId} />
                <div className={styles.playerMeta}>
                  <span className={styles.playerName}>
                    {p.name}
                    {p.id === myId && <span className={styles.you}>(you)</span>}
                  </span>
                  <span className={styles.playerStatus}>
                    {p.status === 'disconnected' ? (
                      <span>⚠ Disconnected</span>
                    ) : snap.status === 'waiting' ? (
                      'Joined'
                    ) : p.hasVoted ? (
                      <span className={styles.picked}>✓ Picked</span>
                    ) : (
                      'Thinking…'
                    )}
                  </span>
                </div>
              </li>
            ))}
            {participants.length === 0 && <li className={styles.playerEmpty}>Nobody here yet — share the invite link.</li>}
          </ul>
          <p className={styles.sideNote}>Picks stay hidden until the host reveals the round.</p>
        </aside>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header({ code }: { code: string | null }) {
  const dispatch = useAppDispatch();
  const copy = () => {
    if (!code) return;
    navigator.clipboard?.writeText(roomUrlFor(code)).then(
      () => dispatch(pushToast({ kind: 'success', title: 'Invite link copied', message: 'Share it — joiners only need a name.' })),
      () => dispatch(pushToast({ kind: 'error', title: 'Could not copy', message: 'Copy the address bar URL manually.' })),
    );
  };
  return (
    <header className={styles.header}>
      <Link href="/games" className={styles.homeLink} aria-label="Back to games">
        <Wordmark size="sm" />
      </Link>
      <span className={styles.headerGame}>😂 Most Likely To</span>
      {code && (
        <div className={styles.codeWrap}>
          <span className={styles.code} title="Room code">
            {code}
          </span>
          <button type="button" className={styles.copyBtn} onClick={copy} title="Copy invite link" aria-label="Copy invite link">
            ⧉
          </button>
        </div>
      )}
      <div className={styles.headerRight}>
        <ConnectionPill />
        <ThemeToggle />
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Waiting
// ---------------------------------------------------------------------------

function WaitingPanel({
  snap,
  isHost,
  roomUrl,
  onStart,
  onCopy,
}: {
  snap: MltSnapshot;
  isHost: boolean;
  roomUrl: string;
  onStart: () => void;
  onCopy: () => void;
}) {
  const players = snap.participants.filter((p) => p.status !== 'disconnected').length;
  return (
    <div className={styles.panel}>
      <span className={styles.eyebrow}>Waiting room</span>
      <h2 className={styles.title}>{isHost ? 'Invite your team' : 'Waiting for the host…'}</h2>
      {snap.teamName && <p className={styles.teamLine}>{snap.teamName}</p>}
      <p className={styles.sub}>
        {isHost
          ? `${players} ${players === 1 ? 'person is' : 'people are'} at the table. Share the link — joiners only need a name.`
          : 'The host will start the first prompt when everyone’s here.'}
      </p>
      {isHost && (
        <>
          <div className={styles.invite}>
            <span className={styles.inviteUrl} title={roomUrl}>
              {roomUrl}
            </span>
            <Button variant="outline" size="sm" onClick={onCopy}>
              ⧉ Copy Invite
            </Button>
          </div>
          <p className={styles.scanNote}>Share the link — the room code stays the same for every round.</p>
          <Button variant="gold" size="lg" onClick={onStart}>
            Start the First Prompt
          </Button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Playing — pick a teammate
// ---------------------------------------------------------------------------

function PlayingPanel({
  snap,
  participants,
  isHost,
  myId,
  myPick,
  myLocked,
  myPickName,
  pickedCount,
  totalCount,
  onPick,
  onReveal,
}: {
  snap: MltSnapshot;
  participants: MltParticipant[];
  isHost: boolean;
  myId: string | null;
  myPick: string | null;
  myLocked: boolean;
  myPickName?: string;
  pickedCount: number;
  totalCount: number;
  onPick: (targetId: string) => void;
  onReveal: () => void;
}) {
  return (
    <div className={styles.panel}>
      <span className={styles.eyebrow}>
        Round {snap.roundId} · Prompt
      </span>
      <h2 className={styles.prompt}>
        Most likely to <em>{snap.prompt}</em>
      </h2>
      <p className={styles.choose}>Pick the teammate you think fits. One pick per round — no take-backs.</p>

      <div className={styles.pickGrid} role="group" aria-label="Pick a teammate">
        {participants.map((p) => {
          const isMe = p.id === myId;
          const isPicked = myLocked && myPick === p.id;
          const disabled = snap.status !== 'playing' || myLocked || isMe;
          return (
            <button
              key={p.id}
              type="button"
              className={cx(styles.pickCard, isMe && styles.pickMe, isPicked && styles.pickMine, myLocked && !isPicked && !isMe && styles.pickDim)}
              onClick={() => onPick(p.id)}
              disabled={disabled}
              aria-pressed={isPicked}
            >
              <Avatar name={p.name} hue={p.hue} size="lg" status={p.status} />
              <span className={styles.pickName}>{p.name}</span>
              <span className={styles.pickState}>
                {isMe ? 'That’s you' : isPicked ? '✓ Your pick' : myLocked ? 'Picked by the table' : 'Tap to pick'}
              </span>
            </button>
          );
        })}
      </div>

      <p className={styles.hint} role="status">
        {myLocked ? (
          <>
            <span className={styles.lockPip}>✓</span> You picked <strong>{myPickName ?? 'a teammate'}</strong> — it locks until the
            reveal.
          </>
        ) : (
          'Your pick stays hidden until the host reveals.'
        )}
      </p>

      <div className={styles.revealBar} data-complete={snap.everyonePicked}>
        <span className={styles.revealCount} role="status" aria-live="polite">
          {snap.everyonePicked ? (
            <>
              <span className={styles.lockPip}>✓</span> Everyone has picked · {pickedCount} / {totalCount}
            </>
          ) : (
            `${pickedCount} / ${totalCount} picked`
          )}
        </span>
        {isHost ? (
          snap.everyonePicked ? (
            <Button variant="gold" onClick={onReveal}>
              Reveal the Votes
            </Button>
          ) : (
            <span className={styles.wait}>Reveal unlocks once everyone has picked.</span>
          )
        ) : (
          <span className={styles.wait}>Picks stay hidden until the host reveals.</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Revealed — results
// ---------------------------------------------------------------------------

function ResultsPanel({
  snap,
  participants,
  isHost,
  onNext,
}: {
  snap: MltSnapshot;
  participants: MltParticipant[];
  isHost: boolean;
  onNext: () => void;
}) {
  const stats = snap.stats;
  const nameOf = (id: string) => participants.find((p) => p.id === id)?.name ?? 'a teammate';
  if (!stats) {
    return (
      <div className={styles.panel}>
        <h3 className={styles.emptyTitle}>Nobody picked this round</h3>
        <p className={styles.emptyBody}>The table was still deciding.</p>
      </div>
    );
  }
  const winnerNames = stats.winners.map(nameOf).join(' & ');
  return (
    <div className={styles.panel}>
      <span className={styles.eyebrow}>Round {stats.roundId} · Results</span>
      <h2 className={styles.prompt}>
        Most likely to <em>{stats.prompt}</em>
      </h2>

      <div className={styles.winnerCard} role="status">
        <span className={styles.winnerEmoji} aria-hidden="true">
          🏆
        </span>
        <div>
          <h3 className={styles.winnerTitle}>{winnerNames}</h3>
          <p className={styles.winnerBody}>
            {stats.winners.length === 1 ? 'The table voted — no contest.' : 'It’s a tie at the top!'} {stats.topCount}{' '}
            {stats.topCount === 1 ? 'pick' : 'picks'} each.
          </p>
        </div>
      </div>

      <div className={styles.rankList} aria-label="Vote distribution">
        {stats.counts.map((c, i) => (
          <div key={c.participantId} className={cx(styles.rankRow, stats.winners.includes(c.participantId) && styles.rankWinner)}>
            <span className={styles.rankPos}>{i + 1}</span>
            <Avatar name={nameOf(c.participantId)} hue={participants.find((p) => p.id === c.participantId)?.hue ?? 0} size="sm" />
            <span className={styles.rankName}>{nameOf(c.participantId)}</span>
            <span className={styles.rankCount}>
              {c.count} {c.count === 1 ? 'pick' : 'picks'}
            </span>
          </div>
        ))}
      </div>

      <div className={styles.pickReveal}>
        <h4 className={styles.pickRevealTitle}>Who picked whom</h4>
        <ul className={styles.pickRevealList}>
          {Object.entries(snap.picks).map(([voterId, targetId]) => (
            <li key={voterId} className={styles.pickRevealRow}>
              <span className={styles.pickRevealVoter}>{nameOf(voterId)}</span>
              <span aria-hidden="true">→</span>
              <span className={styles.pickRevealTarget}>{nameOf(targetId)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.footer}>
        <p className={styles.roundNote}>This round is closed — votes are final.</p>
        {isHost && (
          <Button variant="gold" size="md" onClick={onNext}>
            Next Prompt →
          </Button>
        )}
      </div>
    </div>
  );
}
