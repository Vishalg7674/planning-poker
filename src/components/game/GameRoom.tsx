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
import { cx } from '@/lib/cx';
import { getGameConfig, type GameConfig } from '@/lib/gameConfig';
import { clearGameIdentity, loadGameIdentity, saveGameIdentity } from '@/lib/gameEngine';
import type { GameSnapshot, GameParticipant, GamePrompt, GameStats, FreeStats } from '@/lib/gameEngine';
import styles from './game.module.scss';

type View = 'loading' | 'create' | 'join' | 'play' | 'gone';

const ROOT_PATH = '/games';

/** Read the ?room=CODE query param without a Suspense boundary. */
function roomCodeFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const m = window.location.search.match(/[?&]room=([A-Za-z0-9]+)/);
  return m ? m[1]!.toUpperCase() : null;
}

/**
 * The shared room for every engine-backed game (server/games/engine.mjs). One
 * component renders the full lifecycle — create / join / rejoin / play —
 * driven entirely by the game's client config (src/lib/gameConfig.ts):
 * the socket events, the per-kind panels, and the copy. Adding a game is a
 * JSON data file + a registry row + a config entry; this component never
 * changes.
 */
export default function GameRoom({ gameId }: { gameId: string }) {
  const config = getGameConfig(gameId);
  const router = useRouter();
  const dispatch = useAppDispatch();

  const [view, setView] = useState<View>('loading');
  const [code, setCode] = useState<string | null>(null);
  const [snap, setSnap] = useState<GameSnapshot | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [myValue, setMyValue] = useState<string | null>(null);
  const [myGuess, setMyGuess] = useState('');

  const [name, setName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [myAnswer, setMyAnswer] = useState(''); // free-kind submit input
  const lastRoundRef = useRef<number | null>(null);
  const lastPhaseRef = useRef<string | null>(null);

  const participants = useMemo(() => snap?.participants ?? [], [snap]);

  // ------------------------------------------------------------------
  // Realtime lifecycle (shared by every engine game)
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!config) return;
    const socket = getSocket();

    const onSnapshot = (payload: any) => {
      if (payload?.game !== config.id) return;
      // A new round resets my optimistic vote (event callback — ref writes are fine here).
      if (lastRoundRef.current !== null && payload.roundId !== lastRoundRef.current) {
        setMyValue(null);
        setMyGuess('');
        setMyAnswer('');
      }
      // A phase flip within a free round (submit → vote) also resets my pick.
      if (lastPhaseRef.current !== null && payload.phase !== undefined && payload.phase !== lastPhaseRef.current) {
        setMyValue(null);
        setMyGuess('');
      }
      lastRoundRef.current = payload.roundId;
      lastPhaseRef.current = payload.phase ?? null;
      setSnap(payload as GameSnapshot);
    };
    const onEnded = () => {
      clearGameIdentity(config.id);
      setView('gone');
    };

    socket.on('snapshot', onSnapshot);
    socket.on('room:ended', onEnded);
    socket.on('you:removed', onEnded);

    void (async () => {
      const initialCode = roomCodeFromUrl();
      if (!initialCode) {
        setView('create');
        return;
      }
      setCode(initialCode);
      const identity = loadGameIdentity(config.id);
      if (!identity?.participantId) {
        setView('join');
        return;
      }
      const res = await emitAck<{ ok: boolean; participantId?: string; snapshot?: GameSnapshot; error?: string }>('room:rejoin', {
        code: initialCode,
        participantId: identity.participantId,
        name: identity.name,
      });
      if (res?.ok && res.snapshot) {
        const me = res.snapshot.participants.find((p) => p.id === identity.participantId);
        setMyId(identity.participantId);
        if (me) saveGameIdentity(config.id, { participantId: identity.participantId, name: me.name, role: me.role });
        setSnap(res.snapshot);
        setView('play');
      } else if (res?.error === 'not_found') {
        clearGameIdentity(config.id);
        setView('gone');
      } else {
        setView('join');
      }
    })();

    return () => {
      socket.off('snapshot', onSnapshot);
      socket.off('room:ended', onEnded);
      socket.off('you:removed', onEnded);
    };
  }, [config]);

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------
  const startRoom = async () => {
    if (!config || busy || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await emitAck<{ ok: boolean; code?: string; participantId?: string; error?: string }>('room:create', {
        game: config.id,
        hostName: name.trim(),
        teamName: teamName.trim(),
      });
      if (!res?.ok || !res.code || !res.participantId) {
        setError(friendlyError(res?.error, 'Could not start the game.'));
        return;
      }
      saveGameIdentity(config.id, { participantId: res.participantId, name: name.trim(), role: 'facilitator' });
      setMyId(res.participantId);
      setCode(res.code);
      router.replace(`${ROOT_PATH}/${config.id}?room=${res.code}`, { scroll: false });
      dispatch(pushToast({ kind: 'success', title: 'Game created', message: `Code ${res.code} — share the link with your team.` }));
      setView('play');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the game.');
    } finally {
      setBusy(false);
    }
  };

  const joinRoom = async () => {
    if (!config || busy || !code || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await emitAck<{ ok: boolean; participantId?: string; snapshot?: GameSnapshot; error?: string }>('room:join', {
        code,
        name: name.trim(),
      });
      if (!res?.ok || !res.participantId) {
        setError(friendlyError(res?.error, 'Could not join the game.'));
        return;
      }
      saveGameIdentity(config.id, { participantId: res.participantId, name: name.trim(), role: 'voter' });
      setMyId(res.participantId);
      if (res.snapshot) setSnap(res.snapshot);
      setView('play');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join the game.');
    } finally {
      setBusy(false);
    }
  };

  const cast = (value: string) => {
    if (!config || snap?.status !== 'playing' || myValue !== null) return;
    if (snap.votedIds.includes(myId ?? '')) return;
    // `free` games: the submit phase casts via the cast event, the vote phase
    // via the vote event — the server rejects the wrong one either way.
    const isVoting = config.kind === 'free' && snap.phase === 'vote';
    const event = isVoting && config.voteEvent ? config.voteEvent : config.castEvent;
    setMyValue(value); // optimistic — the server owns the real lock
    emitAck<{ ok: boolean; error?: string }>(event, { value }).then((res) => {
      // already_voted = the server already recorded our vote — that is success.
      if (res?.ok || res?.error === 'already_voted') return;
      setMyValue(null);
      dispatch(pushToast({ kind: 'error', title: 'Vote not counted', message: friendlyError(res?.error, 'Your vote was not accepted.') }));
    });
  };

  const submitAnswer = () => {
    if (!config || snap?.status !== 'playing' || myValue !== null) return;
    if (snap.votedIds.includes(myId ?? '')) return;
    const v = myAnswer.trim();
    if (!v) return;
    setMyValue(v); // optimistic
    emitAck<{ ok: boolean; error?: string }>(config.castEvent, { value: v }).then((res) => {
      if (res?.ok || res?.error === 'already_voted') return;
      setMyValue(null);
      dispatch(pushToast({ kind: 'error', title: 'Answer not counted', message: friendlyError(res?.error, 'Your answer was not accepted.') }));
    });
  };

  const startVote = () => {
    if (!config) return;
    emitAck<{ ok: boolean; error?: string }>('game:startVote', {}).then((res) => {
      if (!res?.ok) {
        dispatch(pushToast({ kind: 'error', title: 'Could not open vote', message: friendlyError(res?.error, 'The vote could not be started.') }));
      }
    });
  };

  const submitGuess = () => {
    if (!config || snap?.status !== 'playing' || myValue !== null) return;
    if (snap.votedIds.includes(myId ?? '')) return;
    const v = myGuess.trim();
    if (!v || !/^-?\d+(\.\d+)?$/.test(v)) return;
    cast(v);
  };

  const startPrompt = () => {
    if (!config) return;
    emitAck<{ ok: boolean; error?: string }>('game:startPrompt', {}).then((res) => {
      if (!res?.ok) {
        dispatch(pushToast({ kind: 'error', title: 'Could not start', message: friendlyError(res?.error, 'The round could not be started.') }));
      }
    });
  };

  const reveal = () => {
    if (!config) return;
    emitAck<{ ok: boolean; error?: string }>('game:reveal', {}).then((res) => {
      if (!res?.ok) {
        dispatch(pushToast({ kind: 'error', title: 'Could not reveal', message: friendlyError(res?.error, 'The votes could not be revealed.') }));
      }
    });
  };

  const copyInvite = () => {
    if (!config || !code) return;
    const text = `Join our ${config.title} game:\n\n${window.location.origin}${ROOT_PATH}/${config.id}?room=${code}\n\nEnter your name to join.`;
    navigator.clipboard?.writeText(text).then(
      () => dispatch(pushToast({ kind: 'success', title: 'Invite copied', message: 'Link + a short message — paste anywhere.' })),
      () => dispatch(pushToast({ kind: 'error', title: 'Could not copy', message: 'Copy the address bar URL manually.' })),
    );
  };

  // Unknown game id (shouldn't happen — the route guards) — bail safely.
  if (!config) {
    return (
      <div className={styles.page}>
        <Header code={null} label="" />
        <main className={styles.centered}>
          <p className={styles.entering}>Game not found.</p>
        </main>
      </div>
    );
  }

  const isHost = snap?.hostId != null && snap.hostId === myId;
  const roomUrl = (c: string) => `${window.location.origin}${ROOT_PATH}/${config.id}?room=${c}`;

  // ------------------------------------------------------------------
  // Gone / entry screens
  // ------------------------------------------------------------------
  if (view === 'gone') {
    return (
      <div className={styles.page}>
        <Header code={null} label={config.header} />
        <main className={styles.centered}>
          <div className={styles.gonePanel}>
            <span className={styles.goneIcon} aria-hidden="true">
              {config.icon}
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
        <Header code={code} label={config.header} />
        <main className={styles.centered}>
          <div className={styles.entryCard}>
            <span className={styles.entryEmoji} aria-hidden="true">
              {config.icon}
            </span>
            <h1 className={styles.entryTitle}>{join ? `Join room ${code}` : config.title}</h1>
            <p className={styles.entrySub}>{join ? 'Someone is hosting — add your name and take a seat.' : config.tagline}</p>
            <div className={styles.entryForm}>
              <Field label="Your Name" htmlFor="game-name" hint="Required.">
                <Input id="game-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ada" autoComplete="off" maxLength={24} />
              </Field>
              {!join && (
                <Field label="Team Name" htmlFor="game-team" hint="Optional — shown at the top of the room.">
                  <Input id="game-team" value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="e.g. Frontend Team" autoComplete="off" maxLength={40} />
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
        <Header code={code} label={config.header} />
        <main className={styles.centered}>
          <p className={styles.entering}>
            <span className={styles.spinner} aria-hidden="true" />
            Walking up to the table…
          </p>
        </main>
      </div>
    );
  }

  const votedCount = participants.filter((p) => p.status !== 'disconnected' && p.hasVoted).length;
  const totalCount = participants.filter((p) => p.status !== 'disconnected').length;

  return (
    <div className={styles.page} data-accent={config.accent}>
      <Header code={code} label={config.header} />
      <main className={styles.layout}>
        <section className={styles.table}>
          {snap.status === 'waiting' && (
            <WaitingPanel
              config={config}
              snap={snap}
              isHost={isHost}
              roomUrl={code ? roomUrl(code) : ''}
              onStart={startPrompt}
              onCopy={copyInvite}
            />
          )}
          {snap.status === 'playing' && (
            <PlayingPanel
              config={config}
              snap={snap}
              participants={participants}
              isHost={isHost}
              myId={myId}
              myValue={myValue}
              myGuess={myGuess}
              setMyGuess={setMyGuess}
              myAnswer={myAnswer}
              setMyAnswer={setMyAnswer}
              votedCount={votedCount}
              totalCount={totalCount}
              onCast={cast}
              onSubmitGuess={submitGuess}
              onSubmitAnswer={submitAnswer}
              onReveal={reveal}
            />
          )}
          {snap.status === 'revealed' && (
            <ResultsPanel
              config={config}
              snap={snap}
              participants={participants}
              isHost={isHost}
              onNext={startPrompt}
              onVote={startVote}
            />
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
                      <span className={styles.picked}>✓ {config.doneLabel}</span>
                    ) : (
                      'Thinking…'
                    )}
                  </span>
                </div>
              </li>
            ))}
            {participants.length === 0 && <li className={styles.playerEmpty}>Nobody here yet — share the invite link.</li>}
          </ul>
          <p className={styles.sideNote}>{config.sideNote}</p>
        </aside>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header({ code, label }: { code: string | null; label: string }) {
  return (
    <header className={styles.header}>
      <Link href="/games" className={styles.homeLink} aria-label="Back to games">
        <Wordmark size="sm" />
      </Link>
      <span className={styles.headerGame}>{label}</span>
      {code && (
        <div className={styles.codeWrap}>
          <span className={styles.code} title="Room code">
            {code}
          </span>
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
// Waiting room
// ---------------------------------------------------------------------------

function WaitingPanel({
  config,
  snap,
  isHost,
  roomUrl,
  onStart,
  onCopy,
}: {
  config: GameConfig;
  snap: GameSnapshot;
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
          : config.waitingSub}
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
            {config.startLabel}
          </Button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Playing — per-kind voting UI
// ---------------------------------------------------------------------------

function PlayingPanel({
  config,
  snap,
  participants,
  isHost,
  myId,
  myValue,
  myGuess,
  setMyGuess,
  myAnswer,
  setMyAnswer,
  votedCount,
  totalCount,
  onCast,
  onSubmitGuess,
  onSubmitAnswer,
  onReveal,
}: {
  config: GameConfig;
  snap: GameSnapshot;
  participants: GameParticipant[];
  isHost: boolean;
  myId: string | null;
  myValue: string | null;
  myGuess: string;
  setMyGuess: (v: string) => void;
  myAnswer: string;
  setMyAnswer: (v: string) => void;
  votedCount: number;
  totalCount: number;
  onCast: (value: string) => void;
  onSubmitGuess: () => void;
  onSubmitAnswer: () => void;
  onReveal: () => void;
}) {
  const prompt = snap.prompt;
  const locked = myValue !== null;
  const roundLabel = config.kind === 'teammate' ? 'Prompt' : config.kind === 'quiz' ? 'Question' : config.kind === 'estimate' ? 'Guess' : config.kind === 'free' && snap.phase === 'vote' ? 'Vote' : config.kind === 'free' ? 'Round' : 'Round';

  let body: React.ReactNode = null;
  if (config.kind === 'teammate') {
    body = (
      <TeammateVoting
        snap={snap}
        participants={snap.participants}
        myId={myId}
        myValue={myValue}
        locked={locked}
        lead={config.promptLead}
        onPick={onCast}
      />
    );
  } else if (config.kind === 'options' || config.kind === 'quiz') {
    body = <OptionsVoting config={config} prompt={prompt} myValue={myValue} locked={locked} onChoose={onCast} />;
  } else if (config.kind === 'free' && snap.phase === 'vote') {
    body = <FreeVoteVoting snap={snap} myId={myId} myValue={myValue} locked={locked} onPick={onCast} />;
  } else if (config.kind === 'free') {
    body = (
      <FreeAnswerVoting
        config={config}
        prompt={prompt}
        myAnswer={myAnswer}
        setMyAnswer={setMyAnswer}
        locked={locked}
        onSubmit={onSubmitAnswer}
      />
    );
  } else {
    body = (
      <EstimateVoting
        config={config}
        prompt={prompt}
        myGuess={myGuess}
        setMyGuess={setMyGuess}
        locked={locked}
        onSubmit={onSubmitGuess}
      />
    );
  }

  const hintText = locked ? (
    <>
      <span className={styles.lockPip}>✓</span> You {config.kind === 'free' && snap.phase === 'vote' ? 'voted for' : config.kind === 'free' ? 'answered' : 'picked'}{' '}
      <strong>{myLabel(config, prompt, participants, snap, myValue!)}</strong> — it locks until the reveal.
    </>
  ) : config.kind === 'free' && snap.phase === 'vote' ? (
    'Pick the answer you liked best. One vote, no take-backs — it stays hidden until the host reveals.'
  ) : config.kind === 'free' ? (
    'Write your answer. It stays hidden until the host reveals.'
  ) : (
    'One pick per round, no take-backs. Yours stays hidden until the host reveals.'
  );

  return (
    <div className={styles.panel}>
      <span className={styles.eyebrow}>
        Round {snap.roundId} · {roundLabel}
      </span>
      {body}
      <p className={styles.hint} role="status">
        {hintText}
      </p>

      <div className={styles.revealBar} data-complete={snap.everyoneVoted}>
        <span className={styles.revealCount} role="status" aria-live="polite">
          {snap.everyoneVoted ? (
            <>
              <span className={styles.lockPip}>✓</span> {config.everyoneDone} · {votedCount} / {totalCount}
            </>
          ) : (
            `${votedCount} / ${totalCount} ${config.progressVerb}`
          )}
        </span>
        {isHost ? (
          snap.everyoneVoted ? (
            <Button variant="gold" onClick={onReveal}>
              {config.revealLabel}
            </Button>
          ) : (
            <span className={styles.wait}>Reveal unlocks once everyone has {config.kind === 'free' ? 'answered' : 'voted'}.</span>
          )
        ) : (
          <span className={styles.wait}>Votes stay hidden until the host reveals.</span>
        )}
      </div>
    </div>
  );
}

/** Human-readable label for my locked vote (used in the hint). */
function myLabel(config: GameConfig, prompt: GamePrompt | null, participants: GameParticipant[], snap: GameSnapshot, value: string): string {
  if (config.kind === 'teammate') {
    return participants.find((p) => p.id === value)?.name ?? value;
  }
  if (config.kind === 'estimate') return value;
  if (config.kind === 'free') {
    if (snap.phase === 'vote') {
      const sub = snap.submissions?.[value];
      return sub ? `“${sub}”` : (participants.find((p) => p.id === value)?.name ?? value);
    }
    return `“${value}”`;
  }
  const p = prompt as { options?: string[] } | null;
  if (!p?.options) return value;
  return p.options[Number(value)] ?? value;
}

// --- Teammate pick ----------------------------------------------------------

function TeammateVoting({
  snap,
  participants,
  myId,
  myValue,
  locked,
  lead,
  onPick,
}: {
  snap: GameSnapshot;
  participants: GameParticipant[];
  myId: string | null;
  myValue: string | null;
  locked: boolean;
  lead: string;
  onPick: (value: string) => void;
}) {
  const prompt = typeof snap.prompt === 'string' ? snap.prompt : '';
  return (
    <>
      <h2 className={styles.prompt}>
        {lead} <em>{prompt}</em>
      </h2>
      <p className={styles.choose}>Pick the teammate you think fits. One pick per round — no take-backs.</p>
      <div className={styles.pickGrid} role="group" aria-label="Pick a teammate">
        {participants.map((p) => {
          const isMe = p.id === myId;
          const isPicked = locked && myValue === p.id;
          const disabled = snap.status !== 'playing' || locked || isMe;
          return (
            <button
              key={p.id}
              type="button"
              className={cx(styles.pickCard, isMe && styles.pickMe, isPicked && styles.pickMine, locked && !isPicked && !isMe && styles.pickDim)}
              onClick={() => onPick(p.id)}
              disabled={disabled}
              aria-pressed={isPicked}
            >
              <Avatar name={p.name} hue={p.hue} size="lg" status={p.status} />
              <span className={styles.pickName}>{p.name}</span>
              <span className={styles.pickState}>
                {isMe ? 'That’s you' : isPicked ? '✓ Your pick' : locked ? 'Picked by the table' : 'Tap to pick'}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

// --- Options / quiz ----------------------------------------------------------

function OptionsVoting({
  config,
  prompt,
  myValue,
  locked,
  onChoose,
}: {
  config: GameConfig;
  prompt: GamePrompt | null;
  myValue: string | null;
  locked: boolean;
  onChoose: (value: string) => void;
}) {
  const p = prompt as { text?: string; options?: string[] } | null;
  const options = p?.options ?? [];
  const isPair = options.length === 2;
  const letter = (i: number) => String.fromCharCode(65 + i);

  if (isPair) {
    return (
      <>
        <p className={styles.or}>{p?.text ?? config.promptLead}</p>
        <div className={styles.choiceRow} role="group" aria-label="Pick a side">
          {options.map((opt, i) => (
            <button
              key={i}
              type="button"
              className={cx(styles.choiceCard, myValue === String(i) && styles.choiceMine)}
              onClick={() => onChoose(String(i))}
              disabled={locked}
              aria-pressed={myValue === String(i)}
            >
              <span className={styles.choiceLetter}>{letter(i)}</span>
              <span className={styles.choiceText}>{opt}</span>
            </button>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <h2 className={styles.prompt}>{p?.text ?? config.promptLead}</h2>
      <div className={styles.pickGrid} role="group" aria-label="Pick an option">
        {options.map((opt, i) => {
          const mine = myValue === String(i);
          return (
            <button
              key={i}
              type="button"
              className={cx(styles.pickCard, mine && styles.pickMine, locked && !mine && styles.pickDim)}
              onClick={() => onChoose(String(i))}
              disabled={locked}
              aria-pressed={mine}
            >
              <span className={styles.optionLetter}>{letter(i)}</span>
              <span className={styles.pickName}>{opt}</span>
              <span className={styles.pickState}>{mine ? '✓ Your pick' : 'Tap to pick'}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

// --- Estimate ---------------------------------------------------------------

function EstimateVoting({
  config,
  prompt,
  myGuess,
  setMyGuess,
  locked,
  onSubmit,
}: {
  config: GameConfig;
  prompt: GamePrompt | null;
  myGuess: string;
  setMyGuess: (v: string) => void;
  locked: boolean;
  onSubmit: () => void;
}) {
  const p = prompt as { text?: string; unit?: string } | null;
  return (
    <>
      <h2 className={styles.prompt}>{p?.text ?? config.promptLead}</h2>
      {p?.unit && <p className={styles.choose}>Answer in {p.unit.toLowerCase()}.</p>}
      <div className={styles.estimateRow}>
        <Input
          type="number"
          inputMode="decimal"
          className={styles.estimateInput}
          placeholder="Your guess…"
          aria-label="Your guess"
          value={myGuess}
          onChange={(e) => setMyGuess(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !locked && myGuess.trim()) onSubmit();
          }}
          disabled={locked}
          maxLength={14}
        />
        <Button variant="gold" onClick={onSubmit} disabled={locked || !myGuess.trim()}>
          {locked ? 'Locked in' : 'Submit guess'}
        </Button>
      </div>
    </>
  );
}

// --- Free-text answer (submit phase) ---------------------------------------

function FreeAnswerVoting({
  config,
  prompt,
  myAnswer,
  setMyAnswer,
  locked,
  onSubmit,
}: {
  config: GameConfig;
  prompt: GamePrompt | null;
  myAnswer: string;
  setMyAnswer: (v: string) => void;
  locked: boolean;
  onSubmit: () => void;
}) {
  const p = prompt as { text?: string } | null;
  return (
    <>
      <h2 className={styles.prompt}>{p?.text ?? config.promptLead}</h2>
      <div className={styles.estimateRow}>
        <Input
          className={styles.estimateInput}
          placeholder="Type your answer…"
          aria-label="Your answer"
          value={myAnswer}
          onChange={(e) => setMyAnswer(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !locked && myAnswer.trim()) onSubmit();
          }}
          disabled={locked}
          maxLength={240}
        />
        <Button variant="gold" onClick={onSubmit} disabled={locked || !myAnswer.trim()}>
          {locked ? 'Locked in' : 'Submit answer'}
        </Button>
      </div>
    </>
  );
}

// --- Free-text vote phase: pick the best submission -------------------------

function FreeVoteVoting({
  snap,
  myId,
  myValue,
  locked,
  onPick,
}: {
  snap: GameSnapshot;
  myId: string | null;
  myValue: string | null;
  locked: boolean;
  onPick: (value: string) => void;
}) {
  const submissions = snap.submissions ?? {};
  const entries = Object.entries(submissions).map(([id, text]) => ({ id, text }));
  return (
    <>
      <p className={styles.choose}>Pick the answer you liked best. You can’t vote for your own.</p>
      <div className={styles.pickGrid} role="group" aria-label="Pick the best answer">
        {entries.map(({ id, text }) => {
          const isMe = id === myId;
          const isPicked = locked && myValue === id;
          return (
            <button
              key={id}
              type="button"
              className={cx(styles.pickCard, isMe && styles.pickMe, isPicked && styles.pickMine, locked && !isPicked && !isMe && styles.pickDim)}
              onClick={() => onPick(id)}
              disabled={locked || isMe}
              aria-pressed={isPicked}
            >
              <span className={styles.pickName}>{text}</span>
              <span className={styles.pickState}>
                {isMe ? 'That’s yours' : isPicked ? '✓ Your vote' : 'Tap to vote'}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Revealed — per-kind results
// ---------------------------------------------------------------------------

function ResultsPanel({
  config,
  snap,
  participants,
  isHost,
  onNext,
  onVote,
}: {
  config: GameConfig;
  snap: GameSnapshot;
  participants: GameParticipant[];
  isHost: boolean;
  onNext: () => void;
  onVote: () => void;
}) {
  const stats = snap.stats;
  const nameOf = (id: string) => participants.find((p) => p.id === id)?.name ?? 'Someone';

  if (!stats) {
    return (
      <div className={styles.panel}>
        <h3 className={styles.emptyTitle}>Nobody voted this round</h3>
        <p className={styles.emptyBody}>The table was still deciding.</p>
      </div>
    );
  }

  if (config.kind === 'teammate') {
    return <TeammateResults config={config} snap={snap} stats={stats as any} nameOf={nameOf} isHost={isHost} onNext={onNext} />;
  }
  if (config.kind === 'options') {
    return <OptionsResults config={config} snap={snap} stats={stats as any} nameOf={nameOf} isHost={isHost} onNext={onNext} />;
  }
  if (config.kind === 'quiz') {
    return <QuizResults config={config} snap={snap} stats={stats as any} nameOf={nameOf} isHost={isHost} onNext={onNext} />;
  }
  if (config.kind === 'free') {
    const freeStats = stats as FreeStats;
    if (freeStats.phase === 'vote') {
      return <FreeVoteResults config={config} snap={snap} stats={stats as any} nameOf={nameOf} isHost={isHost} onNext={onNext} />;
    }
    return <FreeSubmitResults config={config} snap={snap} stats={stats as any} nameOf={nameOf} isHost={isHost} hasVote={!!config.hasVote} onNext={onNext} onVote={onVote} />;
  }
  return <EstimateResults config={config} snap={snap} stats={stats as any} nameOf={nameOf} isHost={isHost} onNext={onNext} />;
}

// --- Free results: submissions revealed (before the vote) -------------------

function FreeSubmitResults({
  config,
  snap,
  stats,
  nameOf,
  isHost,
  hasVote,
  onNext,
  onVote,
}: {
  config: GameConfig;
  snap: GameSnapshot;
  stats: Extract<GameStats, { phase: 'submit' }>;
  nameOf: (id: string) => string;
  isHost: boolean;
  hasVote: boolean;
  onNext: () => void;
  onVote: () => void;
}) {
  const entries = stats.submissions;
  const answered = stats.totalSubmissions;
  return (
    <div className={styles.panel}>
      <span className={styles.eyebrow}>Round {stats.roundId} · Answers</span>
      <h2 className={styles.prompt}>{typeof snap.prompt === 'string' ? '' : (snap.prompt as { text?: string })?.text ?? ''}</h2>

      <div className={styles.rankList} aria-label="Submitted answers">
        {entries.map((s) => (
          <div key={s.participantId} className={cx(styles.rankRow, s.correct && styles.rankWinner)}>
            <Avatar name={nameOf(s.participantId)} hue={snap.participants.find((p) => p.id === s.participantId)?.hue ?? 0} size="sm" />
            <span className={styles.rankName}>{nameOf(s.participantId)}</span>
            <span className={styles.rankCount}>
              {s.correct !== undefined && <>{s.correct ? '✓ ' : '✗ '}</>}
              {s.text}
            </span>
          </div>
        ))}
      </div>

      <div className={styles.footer}>
        <p className={styles.roundNote}>
          {answered} {answered === 1 ? 'answer' : 'answers'} on the table.
        </p>
        {isHost && hasVote ? (
          <div className={styles.footerRow}>
            <Button variant="outline" size="md" onClick={onVote}>
              🗳️ Vote on the best
            </Button>
            <Button variant="gold" size="md" onClick={onNext}>
              {config.nextLabel} →
            </Button>
          </div>
        ) : isHost ? (
          <Button variant="gold" size="md" onClick={onNext}>
            {config.nextLabel} →
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// --- Free results: winner of the best-answer vote ---------------------------

function FreeVoteResults({
  config,
  snap,
  stats,
  nameOf,
  isHost,
  onNext,
}: {
  config: GameConfig;
  snap: GameSnapshot;
  stats: Extract<GameStats, { phase: 'vote' }>;
  nameOf: (id: string) => string;
  isHost: boolean;
  onNext: () => void;
}) {
  const winnerNames = stats.winners.map(nameOf).join(' & ');
  const winningText = stats.winners[0] ? (stats.submissions[stats.winners[0]] ?? '') : '';
  return (
    <div className={styles.panel}>
      <span className={styles.eyebrow}>Round {stats.roundId} · Winner</span>

      <div className={styles.winnerCard} role="status">
        <span className={styles.winnerEmoji} aria-hidden="true">
          🏆
        </span>
        <div>
          <h3 className={styles.winnerTitle}>{winnerNames}</h3>
          <p className={styles.winnerBody}>“{winningText}” — {stats.topCount} {stats.topCount === 1 ? 'vote' : 'votes'}.</p>
        </div>
      </div>

      <div className={styles.rankList} aria-label="Answer ranking">
        {stats.counts.map((c, i) => (
          <div key={c.participantId} className={cx(styles.rankRow, stats.winners.includes(c.participantId) && styles.rankWinner)}>
            <span className={styles.rankPos}>{i + 1}</span>
            <Avatar name={nameOf(c.participantId)} hue={snap.participants.find((p) => p.id === c.participantId)?.hue ?? 0} size="sm" />
            <span className={styles.rankName}>{nameOf(c.participantId)}</span>
            <span className={styles.rankCount}>{stats.submissions[c.participantId] ?? ''}</span>
          </div>
        ))}
      </div>

      <div className={styles.footer}>
        <p className={styles.roundNote}>The room has spoken — answers are final.</p>
        {isHost && (
          <Button variant="gold" size="md" onClick={onNext}>
            {config.nextLabel} →
          </Button>
        )}
      </div>
    </div>
  );
}

function TeammateResults({
  config,
  snap,
  stats,
  nameOf,
  isHost,
  onNext,
}: {
  config: GameConfig;
  snap: GameSnapshot;
  stats: Extract<GameStats, { winners: string[] }>;
  nameOf: (id: string) => string;
  isHost: boolean;
  onNext: () => void;
}) {
  const prompt = typeof snap.prompt === 'string' ? snap.prompt : '';
  const winnerNames = stats.winners.map(nameOf).join(' & ');
  return (
    <div className={styles.panel}>
      <span className={styles.eyebrow}>Round {stats.roundId} · Results</span>
      <h2 className={styles.prompt}>
        {config.promptLead} <em>{prompt}</em>
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
            <Avatar name={nameOf(c.participantId)} hue={snap.participants.find((p) => p.id === c.participantId)?.hue ?? 0} size="sm" />
            <span className={styles.rankName}>{nameOf(c.participantId)}</span>
            <span className={styles.rankCount}>
              {c.count} {c.count === 1 ? 'pick' : 'picks'}
            </span>
          </div>
        ))}
      </div>

      <div className={styles.pickReveal}>
        <h4 className={styles.pickRevealTitle}>{config.whoTitle}</h4>
        <ul className={styles.pickRevealList}>
          {Object.entries(snap.votes).map(([voterId, targetId]) => (
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
            {config.nextLabel} →
          </Button>
        )}
      </div>
    </div>
  );
}

function OptionsResults({
  config,
  snap,
  stats,
  nameOf,
  isHost,
  onNext,
}: {
  config: GameConfig;
  snap: GameSnapshot;
  stats: Extract<GameStats, { winner: number | 'tie' }>;
  nameOf: (id: string) => string;
  isHost: boolean;
  onNext: () => void;
}) {
  const p = snap.prompt as { text?: string; options?: string[] } | null;
  const options = p?.options ?? [];
  const total = Math.max(stats.totalVotes, 1);
  const winnerLabel = stats.winner === 'tie' ? 'It’s a tie!' : options[stats.winner] ?? 'A side';
  const winnerPct = stats.winner === 'tie' ? 50 : Math.round(((stats.counts.find((c) => c.option === stats.winner)?.count ?? 0) / total) * 100);

  return (
    <div className={styles.panel}>
      <span className={styles.eyebrow}>Round {stats.roundId} · Results</span>
      <p className={styles.resultsPrompt}>{p?.text ?? config.promptLead}</p>

      <div className={styles.winnerCard} role="status">
        <span className={styles.winnerEmoji} aria-hidden="true">
          {stats.winner === 'tie' ? '⚖️' : '🏆'}
        </span>
        <div>
          <h3 className={styles.winnerTitle}>{winnerLabel}</h3>
          <p className={styles.winnerBody}>
            {stats.winner === 'tie' ? 'Perfectly split — the table cannot agree.' : `${winnerPct}% of the table picked this side.`}
          </p>
        </div>
      </div>

      <div className={styles.splitBars} aria-label="Vote split">
        {options.map((opt, i) => {
          const count = stats.counts.find((c) => c.option === i)?.count ?? 0;
          const pct = Math.round((count / total) * 100);
          const letter = String.fromCharCode(65 + i);
          const mine = stats.winner === i;
          return (
            <div key={i} className={styles.splitRow}>
              <span className={styles.splitLetter}>{letter}</span>
              <div className={styles.splitTrack}>
                <div className={cx(styles.splitFill, mine ? styles.fillWin : styles.fillLoss)} style={{ width: `${pct}%` }} />
              </div>
              <span className={styles.splitMeta}>
                {count} · {pct}%
              </span>
            </div>
          );
        })}
      </div>

      <div className={styles.pickReveal}>
        <h4 className={styles.pickRevealTitle}>{config.whoTitle}</h4>
        <ul className={styles.pickRevealList}>
          {Object.entries(snap.votes).map(([voterId, value]) => (
            <li key={voterId} className={styles.pickRevealRow}>
              <span className={styles.pickRevealVoter}>{nameOf(voterId)}</span>
              <span className={styles.choiceTag}>{options[Number(value)] ?? value}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.footer}>
        <p className={styles.roundNote}>This round is closed — choices are final.</p>
        {isHost && (
          <Button variant="gold" size="md" onClick={onNext}>
            {config.nextLabel} →
          </Button>
        )}
      </div>
    </div>
  );
}

function QuizResults({
  config,
  snap,
  stats,
  nameOf,
  isHost,
  onNext,
}: {
  config: GameConfig;
  snap: GameSnapshot;
  stats: Extract<GameStats, { correctIndex: number }>;
  nameOf: (id: string) => string;
  isHost: boolean;
  onNext: () => void;
}) {
  const p = snap.prompt as { text?: string; options?: string[] } | null;
  const options = p?.options ?? [];
  const correctCount = stats.correctIds.length;
  return (
    <div className={styles.panel}>
      <span className={styles.eyebrow}>Round {stats.roundId} · Results</span>
      <h2 className={styles.prompt}>{p?.text ?? ''}</h2>

      <div className={styles.winnerCard} role="status">
        <span className={styles.winnerEmoji} aria-hidden="true">
          {correctCount > 0 ? '🎯' : '💤'}
        </span>
        <div>
          <h3 className={styles.winnerTitle}>{stats.correctText}</h3>
          <p className={styles.winnerBody}>
            {correctCount > 0
              ? `${correctCount} ${correctCount === 1 ? 'person got' : 'people got'} it right.`
              : 'Nobody got it right this round.'}
          </p>
        </div>
      </div>

      <div className={styles.splitBars} aria-label="Answer split">
        {options.map((opt, i) => {
          const count = stats.counts.find((c) => c.option === i)?.count ?? 0;
          const pct = Math.round((count / Math.max(stats.totalVotes, 1)) * 100);
          const letter = String.fromCharCode(65 + i);
          const correct = i === stats.correctIndex;
          return (
            <div key={i} className={styles.splitRow}>
              <span className={styles.splitLetter}>{letter}</span>
              <div className={styles.splitTrack}>
                <div className={cx(styles.splitFill, correct ? styles.fillWin : styles.fillLoss)} style={{ width: `${pct}%` }} />
              </div>
              <span className={styles.splitMeta}>
                {count} · {pct}%
              </span>
            </div>
          );
        })}
      </div>

      <div className={styles.pickReveal}>
        <h4 className={styles.pickRevealTitle}>{config.whoTitle}</h4>
        <ul className={styles.pickRevealList}>
          {Object.entries(snap.votes).map(([voterId, value]) => (
            <li key={voterId} className={styles.pickRevealRow}>
              <span className={styles.pickRevealVoter}>{nameOf(voterId)}</span>
              <span className={cx(styles.choiceTag, Number(value) === stats.correctIndex ? styles.tagRight : styles.tagWrong)}>
                {Number(value) === stats.correctIndex ? '✓ ' : '✗ '}
                {options[Number(value)] ?? value}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.footer}>
        <p className={styles.roundNote}>This round is closed — answers are final.</p>
        {isHost && (
          <Button variant="gold" size="md" onClick={onNext}>
            {config.nextLabel} →
          </Button>
        )}
      </div>
    </div>
  );
}

function EstimateResults({
  config,
  snap,
  stats,
  nameOf,
  isHost,
  onNext,
}: {
  config: GameConfig;
  snap: GameSnapshot;
  stats: Extract<GameStats, { answer: number }>;
  nameOf: (id: string) => string;
  isHost: boolean;
  onNext: () => void;
}) {
  const p = snap.prompt as { text?: string; unit?: string } | null;
  const unit = stats.unit || p?.unit || '';
  const winnerNames = stats.winnerIds.map(nameOf).join(' & ');
  return (
    <div className={styles.panel}>
      <span className={styles.eyebrow}>Round {stats.roundId} · Results</span>
      <h2 className={styles.prompt}>{p?.text ?? ''}</h2>

      <div className={styles.winnerCard} role="status">
        <span className={styles.winnerEmoji} aria-hidden="true">
          🎯
        </span>
        <div>
          <h3 className={styles.winnerTitle}>
            {stats.answer}
            {unit ? ` ${unit}` : ''}
          </h3>
          <p className={styles.winnerBody}>
            {stats.winnerIds.length > 0
              ? `${winnerNames} ${stats.winnerIds.length === 1 ? 'was' : 'were'} closest — off by ${stats.closest}${unit ? ` ${unit}` : ''}.`
              : 'Nobody guessed this round.'}
          </p>
        </div>
      </div>

      <div className={styles.rankList} aria-label="Guess leaderboard">
        {stats.guesses.map((g, i) => (
          <div key={g.participantId} className={cx(styles.rankRow, stats.winnerIds.includes(g.participantId) && styles.rankWinner)}>
            <span className={styles.rankPos}>{i + 1}</span>
            <span className={styles.rankName}>{nameOf(g.participantId)}</span>
            <span className={styles.rankCount}>
              {g.value}
              {unit ? ` ${unit}` : ''} · off by {g.distance}
            </span>
          </div>
        ))}
      </div>

      <div className={styles.footer}>
        <p className={styles.roundNote}>This round is closed — guesses are final.</p>
        {isHost && (
          <Button variant="gold" size="md" onClick={onNext}>
            {config.nextLabel} →
          </Button>
        )}
      </div>
    </div>
  );
}
