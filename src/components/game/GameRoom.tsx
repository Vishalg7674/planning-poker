'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Wordmark from '@/components/Wordmark';
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
import type {
  GameSnapshot,
  GameParticipant,
  GamePrompt,
  GameStats,
  FreeStats,
  HealthStats,
  HealthConfig,
  PollStats,
  PollConfig,
} from '@/lib/gameEngine';
import styles from './game.module.scss';

type View = 'loading' | 'create' | 'join' | 'play' | 'gone';

const ROOT_PATH = '/games';

/** Read the ?room=CODE query param without a Suspense boundary. */
function roomCodeFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const m = window.location.search.match(/[?&]room=([A-Za-z0-9]+)/);
  return m ? m[1]!.toUpperCase() : null;
}

/** Read an arbitrary query param (used by the activity-switch flow). */
function paramFromUrl(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(key);
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
  const [healthDraft, setHealthDraft] = useState<HealthConfig>({
    title: 'Team Health Check',
    categories: ['Communication', 'Collaboration', 'Code Quality', 'Delivery', 'Morale', 'Requirements'],
    scale: 5,
    anonymous: true,
  });
  const [pollDraft, setPollDraft] = useState<PollConfig>({
    question: '',
    options: ['Yes', 'No'],
    type: 'single',
    anonymous: true,
    hideResults: true,
  });
  const lastRoundRef = useRef<number | null>(null);
  const lastPhaseRef = useRef<string | null>(null);
  const myIdRef = useRef<string | null>(null);
  const myNameRef = useRef<string | null>(null);
  // Refs mirror the live room/join state so the reconnect-rejoin handler (a
  // socket callback that can't close over fresh state) knows where we are.
  const codeRef = useRef<string | null>(null);
  const joinedRef = useRef(false);
  const rejoiningRef = useRef(false);

  const participants = useMemo(() => snap?.participants ?? [], [snap]);
  // Keep refs in sync for the activity-switch handler (which reads them from
  // inside a socket callback that can't close over fresh state).
  useEffect(() => {
    myIdRef.current = myId;
  }, [myId]);
  useEffect(() => {
    myNameRef.current = name;
  }, [name]);

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

    // One room → many activities: the host switched the room to another
    // activity. Everyone follows to the new activity's route, carrying their
    // participant id so nobody has to re-join as a stranger.
    const onActivityChanged = (payload: any) => {
      const target = payload?.game;
      const roomCode = String(payload?.code || '').toUpperCase();
      if (!target || !roomCode) return;
      if (target === config.id) return; // already here
      const params = new URLSearchParams({ room: roomCode });
      if (myIdRef.current) params.set('pid', myIdRef.current);
      if (myNameRef.current) params.set('name', myNameRef.current);
      const path = target === 'planning-poker' ? `/r/${roomCode}` : `${ROOT_PATH}/${target}`;
      // Hard navigation is deliberate: the target page must boot fresh to adopt
      // the pid identity before joining the room.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`${path}?${params.toString()}`);
    };

    socket.on('snapshot', onSnapshot);
    socket.on('room:ended', onEnded);
    socket.on('you:removed', onEnded);
    socket.on('room:activityChanged', onActivityChanged);

    // Restore the seat after a socket reconnect (server never restarted, or
    // restarted and the room is still there). Never navigates, never resets
    // the round — it just re-attaches this participant to the room. If the
    // room genuinely vanished (server restart wiped memory), we land on the
    // honest "game is over" screen instead of a silently dead game.
    const attemptRejoin = async () => {
      const roomCode = codeRef.current;
      const identity = loadGameIdentity(config.id);
      if (!roomCode || !identity?.participantId || rejoiningRef.current) return;
      rejoiningRef.current = true;
      try {
        const res = await emitAck<{ ok: boolean; participantId?: string; snapshot?: GameSnapshot; error?: string }>('room:rejoin', {
          code: roomCode,
          participantId: identity.participantId,
          name: identity.name,
        });
        if (res?.ok && res.snapshot) {
          const me = res.snapshot.participants.find((p) => p.id === identity.participantId);
          setMyId(identity.participantId);
          if (me) saveGameIdentity(config.id, { participantId: identity.participantId, name: me.name, role: me.role });
          lastRoundRef.current = res.snapshot.roundId;
          setSnap(res.snapshot);
          setView('play');
        } else if (res?.error === 'not_found' || res?.error === 'unknown_participant') {
          clearGameIdentity(config.id);
          setView('gone');
        }
      } finally {
        rejoiningRef.current = false;
      }
    };

    // Socket reconnected after a drop — get back into the room without a
    // page reload. `joinedRef` keeps this from firing before we ever joined.
    const onReconnect = () => {
      if (joinedRef.current) void attemptRejoin();
    };
    socket.on('connect', onReconnect);

    void (async () => {
      const initialCode = roomCodeFromUrl();
      if (!initialCode) {
        setView('create');
        return;
      }
      setCode(initialCode);
      codeRef.current = initialCode;
      const identity = loadGameIdentity(config.id);
      // Activity switch: we arrive with our participant id already seated in
      // this room — join it directly instead of showing the join form.
      const pid = paramFromUrl('pid');
      if (pid) {
        const res = await emitAck<{ ok: boolean; participantId?: string; snapshot?: GameSnapshot; error?: string }>('room:join', {
          code: initialCode,
          name: paramFromUrl('name') || identity?.name || 'Guest',
          id: pid,
        });
        if (res?.ok && res.participantId) {
          const me = res.snapshot?.participants.find((p) => p.id === res.participantId);
          saveGameIdentity(config.id, {
            participantId: res.participantId,
            name: me?.name || paramFromUrl('name') || 'Guest',
            role: me?.role ?? 'voter',
          });
          setMyId(res.participantId);
          if (res.snapshot) setSnap(res.snapshot);
          joinedRef.current = true;
          setView('play');
        } else if (res?.error === 'not_found') {
          clearGameIdentity(config.id);
          setView('gone');
        } else {
          setView('join');
        }
        return;
      }
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
        joinedRef.current = true;
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
      socket.off('room:activityChanged', onActivityChanged);
      socket.off('connect', onReconnect);
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
        // Team Health / Live Poll: the host's activity config rides along.
        ...(config.kind === 'health' ? { config: healthDraft } : config.kind === 'poll' ? { config: pollDraft } : {}),
      });
      if (!res?.ok || !res.code || !res.participantId) {
        setError(friendlyError(res?.error, 'Could not start the game.'));
        return;
      }
      saveGameIdentity(config.id, { participantId: res.participantId, name: name.trim(), role: 'facilitator' });
      setMyId(res.participantId);
      setCode(res.code);
      codeRef.current = res.code;
      joinedRef.current = true;
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
      codeRef.current = code;
      joinedRef.current = true;
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

  // Team Health: submit a complete set of ratings (the panel enforces the
  // "rate everything" rule client-side; the server validates it again).
  const submitHealth = (ratings: Record<string, number>) => {
    if (!config || snap?.status !== 'playing' || snap.votedIds.includes(myId ?? '')) return;
    emitAck<{ ok: boolean; error?: string }>('game:healthSubmit', { value: { ratings } }).then((res) => {
      if (res?.ok || res?.error === 'already_voted') return;
      dispatch(pushToast({ kind: 'error', title: 'Answer not counted', message: friendlyError(res?.error, 'Your health check was not accepted.') }));
    });
  };

  // Live Poll: submit a single option index or an array of indices.
  const submitPoll = (value: string | string[]) => {
    if (!config || snap?.status !== 'playing' || snap.votedIds.includes(myId ?? '')) return;
    emitAck<{ ok: boolean; error?: string }>('game:pollVote', { value }).then((res) => {
      if (res?.ok || res?.error === 'already_voted') return;
      dispatch(pushToast({ kind: 'error', title: 'Vote not counted', message: friendlyError(res?.error, 'Your vote was not accepted.') }));
    });
  };

  // One room → many activities: swap the room's activity in place (host-only).
  // The server broadcasts room:activityChanged and every client follows.
  const switchActivity = (target: string) => {
    if (!config || !code || busy) return;
    setBusy(true);
    emitAck<{ ok: boolean; error?: string }>('room:switchGame', { game: target })
      .then((res) => {
        if (!res?.ok) {
          dispatch(pushToast({ kind: 'error', title: 'Could not switch', message: friendlyError(res?.error, 'The activity could not be switched.') }));
        }
      })
      .finally(() => setBusy(false));
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
        <Header code={null} label={config.header} icon={config.icon} />
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
        <Header code={code} label={config.header} icon={config.icon} />
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
              {!join && config.kind === 'health' && <HealthCreateForm draft={healthDraft} onChange={setHealthDraft} />}
              {!join && config.kind === 'poll' && <PollCreateForm draft={pollDraft} onChange={setPollDraft} />}
              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}
              <Button
                variant="gold"
                size="lg"
                block
                onClick={join ? joinRoom : startRoom}
                disabled={
                  busy ||
                  !name.trim() ||
                  // The hosted-activity config forms only gate CREATION —
                  // joining an existing poll/health room must never be blocked
                  // by the (empty) local draft.
                  (!join &&
                    ((config.kind === 'health' && !healthValid(healthDraft)) ||
                      (config.kind === 'poll' && !pollValid(pollDraft))))
                }
              >
                {busy
                  ? 'Starting…'
                  : join
                    ? 'Join Game'
                    : config.kind === 'health'
                      ? 'Create Health Check'
                      : config.kind === 'poll'
                        ? 'Create Poll'
                        : 'Start Game'}
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
        <Header code={code} label={config.header} icon={config.icon} />
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
      <Header code={code} label={config.header} icon={config.icon} />
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
              onSubmitHealth={submitHealth}
              onSubmitPoll={submitPoll}
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
          {isHost && <ActivitySwitcher current={config.id} onSwitch={switchActivity} />}
        </aside>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header({ code, label, icon }: { code: string | null; label: string; icon?: string }) {
  return (
    <header className={styles.header}>
      <Link href="/games" className={styles.homeLink} aria-label="Back to games">
        {/* href="" renders the wordmark as a plain span — nesting two <a>
            elements would break hydration and can wipe form state. */}
        <Wordmark size="sm" href="" />
      </Link>
      <span className={styles.headerGame}>
        {icon && (
          <span className={styles.iconChip} aria-hidden="true">
            {icon}
          </span>
        )}
        {label}
      </span>
      {code && (
        <div className={styles.codeWrap}>
          <span className={styles.code} title="Room code">
            {code}
          </span>
        </div>
      )}
      <div className={styles.headerRight}>
        <ConnectionPill />
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
      {config.kind === 'health' && <HealthSummary config={(snap.config as HealthConfig | undefined) ?? DEFAULT_HEALTH_CONFIG} />}
      {config.kind === 'poll' && <PollSummary config={(snap.config as PollConfig | undefined) ?? DEFAULT_POLL_CONFIG} />}
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
  onSubmitHealth,
  onSubmitPoll,
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
  onSubmitHealth: (ratings: Record<string, number>) => void;
  onSubmitPoll: (value: string | string[]) => void;
  onReveal: () => void;
}) {
  const prompt = snap.prompt;
  // The server's votedIds list is the source of truth once an answer lands —
  // this is what keeps the cards locked after a rejoin/refresh mid-round too
  // (not just the in-tab optimistic value).
  const submitted = snap.votedIds.includes(myId ?? '');
  const locked = myValue !== null || submitted;
  const roundLabel =
    config.kind === 'teammate'
      ? 'Prompt'
      : config.kind === 'quiz'
        ? 'Question'
        : config.kind === 'estimate'
          ? 'Guess'
          : config.kind === 'free' && snap.phase === 'vote'
            ? 'Vote'
            : config.kind === 'free'
              ? 'Round'
              : config.kind === 'health'
                ? 'Check'
                : config.kind === 'poll'
                  ? 'Poll'
                  : 'Round';

  let body: React.ReactNode = null;
  if (config.kind === 'health') {
    body = <HealthRating snap={snap} myId={myId} onSubmit={onSubmitHealth} />;
  } else if (config.kind === 'poll') {
    body = <PollVoting snap={snap} myId={myId} onSubmit={onSubmitPoll} />;
  } else if (config.kind === 'teammate') {
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

  const hintText = config.kind === 'health' ? (
    submitted ? (
      '✓ Your health check is in — it stays hidden until the host reveals.'
    ) : (
      'Rate every area, then submit. Ratings stay hidden until the host reveals.'
    )
  ) : config.kind === 'poll' ? (
    submitted ? (
      '✓ Vote submitted — waiting for the rest of the team.'
    ) : (
      'Pick an option and submit. One vote per person — it stays hidden until the host reveals.'
    )
  ) : locked && myValue !== null ? (
    <>
      <span className={styles.lockPip}>✓</span> You {config.kind === 'free' && snap.phase === 'vote' ? 'voted for' : config.kind === 'free' ? 'answered' : 'picked'}{' '}
      <strong>{myLabel(config, prompt, participants, snap, myValue)}</strong> — it locks until the reveal.
    </>
  ) : locked ? (
    <>
      <span className={styles.lockPip}>✓</span> Your answer is in — it stays hidden until the host reveals.
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
            <span className={styles.wait}>
              Reveal unlocks once everyone has{' '}
              {config.kind === 'free' ? 'answered' : config.kind === 'health' ? 'submitted' : config.kind === 'poll' ? 'voted' : 'voted'}.
            </span>
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
    // The grid is 1fr | auto | 1fr — left card, the “or” badge, right card.
    return (
      <>
        <h2 className={styles.prompt}>{p?.text ?? config.promptLead}</h2>
        <div className={styles.choiceRow} role="group" aria-label="Pick a side">
          <button
            type="button"
            className={cx(styles.choiceCard, myValue === '0' && styles.choiceMine)}
            onClick={() => onChoose('0')}
            disabled={locked}
            aria-pressed={myValue === '0'}
          >
            <span className={styles.choiceLetter}>{letter(0)}</span>
            <span className={styles.choiceText}>{options[0]}</span>
          </button>
          <span className={styles.orBadge} aria-hidden="true">
            or
          </span>
          <button
            type="button"
            className={cx(styles.choiceCard, myValue === '1' && styles.choiceMine)}
            onClick={() => onChoose('1')}
            disabled={locked}
            aria-pressed={myValue === '1'}
          >
            <span className={styles.choiceLetter}>{letter(1)}</span>
            <span className={styles.choiceText}>{options[1]}</span>
          </button>
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

// ---------------------------------------------------------------------------
// Team Health Check & Live Poll — hosted activities (kinds 'health' | 'poll')
// ---------------------------------------------------------------------------

const DEFAULT_HEALTH_CONFIG: HealthConfig = {
  title: 'Team Health Check',
  categories: ['Communication', 'Collaboration', 'Code Quality', 'Delivery', 'Morale', 'Requirements'],
  scale: 5,
  anonymous: true,
};

const DEFAULT_POLL_CONFIG: PollConfig = {
  question: 'Should we deploy this Friday?',
  options: ['Yes', 'No', 'Maybe'],
  type: 'single',
  anonymous: true,
  hideResults: true,
};

function healthValid(d: HealthConfig): boolean {
  return d.title.trim().length > 0 && d.categories.filter((c) => c.trim()).length >= 2;
}

function pollValid(d: PollConfig): boolean {
  return d.question.trim().length > 0 && d.options.filter((o) => o.trim()).length >= 2;
}

// --- Host creation forms ----------------------------------------------------

function HealthCreateForm({ draft, onChange }: { draft: HealthConfig; onChange: (d: HealthConfig) => void }) {
  const setCat = (i: number, v: string) => onChange({ ...draft, categories: draft.categories.map((c, j) => (j === i ? v : c)) });
  const addCat = () => onChange({ ...draft, categories: [...draft.categories, ''] });
  const removeCat = (i: number) => onChange({ ...draft, categories: draft.categories.filter((_, j) => j !== i) });
  const moveCat = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= draft.categories.length) return;
    const next = [...draft.categories];
    [next[i], next[j]] = [next[j], next[i]];
    onChange({ ...draft, categories: next });
  };
  return (
    <div className={styles.createSection}>
      <h3 className={styles.createHeading}>❤️ Health check</h3>
      <Field label="Title" htmlFor="hc-title" hint="Shown to the team — e.g. Sprint 24 Team Health.">
        <Input id="hc-title" value={draft.title} onChange={(e) => onChange({ ...draft, title: e.target.value })} placeholder="Sprint 24 Team Health" autoComplete="off" maxLength={80} />
      </Field>
      <span className={styles.createLabel}>Categories</span>
      <div className={styles.catEditor}>
        {draft.categories.map((c, i) => (
          <div key={i} className={styles.catRow}>
            <Input value={c} onChange={(e) => setCat(i, e.target.value)} placeholder={`Category ${i + 1}`} maxLength={40} aria-label={`Category ${i + 1}`} />
            <button type="button" className={styles.catMove} onClick={() => moveCat(i, -1)} disabled={i === 0} aria-label="Move up">
              ↑
            </button>
            <button type="button" className={styles.catMove} onClick={() => moveCat(i, 1)} disabled={i === draft.categories.length - 1} aria-label="Move down">
              ↓
            </button>
            <button type="button" className={styles.catRemove} onClick={() => removeCat(i)} disabled={draft.categories.length <= 2} aria-label="Remove category">
              ✕
            </button>
          </div>
        ))}
        <button type="button" className={styles.catAdd} onClick={addCat}>
          + Add Category
        </button>
      </div>
      <div className={styles.settingsRow}>
        <label className={styles.settingToggle}>
          <input type="checkbox" checked={draft.anonymous} onChange={(e) => onChange({ ...draft, anonymous: e.target.checked })} />
          <span>Anonymous responses</span>
        </label>
        <span className={styles.settingGap} />
        <label className={styles.settingToggle}>
          <input type="radio" name="hc-scale" checked={draft.scale === 5} onChange={() => onChange({ ...draft, scale: 5 })} />
          <span>1–5 scale</span>
        </label>
        <label className={styles.settingToggle}>
          <input type="radio" name="hc-scale" checked={draft.scale === 10} onChange={() => onChange({ ...draft, scale: 10 })} />
          <span>1–10 scale</span>
        </label>
      </div>
    </div>
  );
}

function PollCreateForm({ draft, onChange }: { draft: PollConfig; onChange: (d: PollConfig) => void }) {
  const setOption = (i: number, v: string) => onChange({ ...draft, options: draft.options.map((o, j) => (j === i ? v : o)) });
  const addOption = () => onChange({ ...draft, options: [...draft.options, ''] });
  const removeOption = (i: number) => onChange({ ...draft, options: draft.options.filter((_, j) => j !== i) });
  return (
    <div className={styles.createSection}>
      <h3 className={styles.createHeading}>🗳️ Poll</h3>
      <Field label="Question" htmlFor="poll-q" hint="Ask the room something.">
        <Input id="poll-q" value={draft.question} onChange={(e) => onChange({ ...draft, question: e.target.value })} placeholder="Should we deploy this Friday?" autoComplete="off" maxLength={160} />
      </Field>
      <span className={styles.createLabel}>Options</span>
      <div className={styles.catEditor}>
        {draft.options.map((o, i) => (
          <div key={i} className={styles.catRow}>
            <Input value={o} onChange={(e) => setOption(i, e.target.value)} placeholder={`Option ${i + 1}`} maxLength={60} aria-label={`Option ${i + 1}`} />
            <button type="button" className={styles.catRemove} onClick={() => removeOption(i)} disabled={draft.options.length <= 2} aria-label="Remove option">
              ✕
            </button>
          </div>
        ))}
        <button type="button" className={styles.catAdd} onClick={addOption}>
          + Add Option
        </button>
      </div>
      <div className={styles.settingsRow}>
        {(['single', 'multiple', 'yesno'] as const).map((t) => (
          <label key={t} className={styles.settingToggle}>
            <input type="radio" name="poll-type" checked={draft.type === t} onChange={() => onChange({ ...draft, type: t })} />
            <span>{t === 'single' ? 'Single choice' : t === 'multiple' ? 'Multiple choice' : 'Yes / No'}</span>
          </label>
        ))}
      </div>
      <div className={styles.settingsRow}>
        <label className={styles.settingToggle}>
          <input type="checkbox" checked={draft.anonymous} onChange={(e) => onChange({ ...draft, anonymous: e.target.checked })} />
          <span>Anonymous voting</span>
        </label>
        <label className={styles.settingToggle}>
          <input type="checkbox" checked={draft.hideResults} onChange={(e) => onChange({ ...draft, hideResults: e.target.checked })} />
          <span>Hide results until reveal</span>
        </label>
      </div>
    </div>
  );
}

// --- Waiting-room summaries -------------------------------------------------

function HealthSummary({ config }: { config: HealthConfig }) {
  return (
    <div className={styles.healthSummary}>
      <span className={styles.healthTitle}>❤️ {config.title}</span>
      <div className={styles.healthChips}>
        {config.categories.map((c, i) => (
          <span key={`${c}-${i}`} className={styles.healthChip}>
            {c}
          </span>
        ))}
      </div>
      <span className={styles.healthMeta}>
        1–{config.scale} scale · {config.anonymous ? 'anonymous' : 'named'} responses
      </span>
    </div>
  );
}

function PollSummary({ config }: { config: PollConfig }) {
  return (
    <div className={styles.healthSummary}>
      <span className={styles.healthTitle}>🗳️ {config.question || 'Untitled poll'}</span>
      <div className={styles.healthChips}>
        {config.options.map((o, i) => (
          <span key={i} className={styles.healthChip}>
            {o}
          </span>
        ))}
      </div>
      <span className={styles.healthMeta}>
        {config.type === 'multiple' ? 'Multiple choice' : config.type === 'yesno' ? 'Yes / No' : 'Single choice'} ·{' '}
        {config.anonymous ? 'anonymous' : 'named'} votes{config.hideResults ? ' · hidden until reveal' : ' · live results'}
      </span>
    </div>
  );
}

// --- Activity switcher (host-only, one room → many activities) --------------

function ActivitySwitcher({ current, onSwitch }: { current: string; onSwitch: (game: string) => void }) {
  const activities = [
    { id: 'planning-poker', label: '🃏 Planning Poker' },
    { id: 'team-health', label: '❤️ Team Health' },
    { id: 'live-poll', label: '🗳️ Live Poll' },
  ];
  return (
    <div className={styles.switchPanel}>
      <span className={styles.switchTitle}>Switch activity</span>
      <p className={styles.switchNote}>The whole room follows — the code stays the same.</p>
      <div className={styles.switchGrid}>
        {activities.map((a) => {
          const active = current === a.id || (a.id === 'planning-poker' && current === 'planning-poker');
          return (
            <button
              key={a.id}
              type="button"
              className={cx(styles.switchBtn, active && styles.switchBtnActive)}
              onClick={() => !active && onSwitch(a.id)}
              disabled={active}
            >
              {a.label}
            </button>
          );
        })}
        <Link href="/games" className={styles.switchBtn}>
          🎮 All games
        </Link>
      </div>
    </div>
  );
}

// --- Team Health rating -----------------------------------------------------

function HealthRating({ snap, myId, onSubmit }: { snap: GameSnapshot; myId: string | null; onSubmit: (ratings: Record<string, number>) => void }) {
  const hc = (snap.config as HealthConfig | undefined) ?? DEFAULT_HEALTH_CONFIG;
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [tried, setTried] = useState(false);
  const submitted = snap.votedIds.includes(myId ?? '');
  const complete = hc.categories.every((c) => ratings[c] != null);

  if (submitted) {
    return (
      <div className={styles.healthDone} role="status">
        <span className={styles.winnerEmoji} aria-hidden="true">
          ✓
        </span>
        <h3 className={styles.winnerTitle}>Submitted</h3>
        <p className={styles.winnerBody}>Waiting for the rest of the team — the host will reveal when everyone’s in.</p>
      </div>
    );
  }

  return (
    <>
      <h2 className={styles.prompt}>{hc.title}</h2>
      <p className={styles.choose}>
        Rate each area from 1 to {hc.scale}. Your ratings stay hidden until the host reveals.
      </p>
      <div className={styles.healthList}>
        {hc.categories.map((cat, i) => (
          <div key={`${cat}-${i}`} className={styles.healthRow}>
            <span className={styles.healthRowName}>{cat}</span>
            <div className={styles.stars} role="radiogroup" aria-label={`Rate ${cat}`}>
              {Array.from({ length: hc.scale }, (_, i) => i + 1).map((v) => {
                const on = (ratings[cat] ?? 0) >= v;
                return (
                  <button
                    key={v}
                    type="button"
                    className={cx(styles.star, on && styles.starOn)}
                    onClick={() => setRatings((r) => ({ ...r, [cat]: v }))}
                    aria-label={`${v} out of ${hc.scale}`}
                    aria-pressed={ratings[cat] === v}
                  >
                    ★
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {tried && !complete && (
        <p className={styles.error} role="alert">
          Please rate all categories before submitting.
        </p>
      )}
      <div className={styles.estimateRow}>
        <Button variant="gold" onClick={() => {
          setTried(true);
          if (complete) onSubmit(ratings);
        }}>
          Submit Health Check
        </Button>
      </div>
    </>
  );
}

// --- Live Poll voting -------------------------------------------------------

function PollVoting({ snap, myId, onSubmit }: { snap: GameSnapshot; myId: string | null; onSubmit: (value: string | string[]) => void }) {
  const pc = (snap.config as PollConfig | undefined) ?? DEFAULT_POLL_CONFIG;
  const [pick, setPick] = useState<string | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  const [tried, setTried] = useState(false);
  const submitted = snap.votedIds.includes(myId ?? '');
  const multiple = pc.type === 'multiple';
  const canSubmit = multiple ? picks.length > 0 : pick != null;
  const live = snap.liveCounts;

  if (submitted) {
    return (
      <div className={styles.healthDone} role="status">
        <span className={styles.winnerEmoji} aria-hidden="true">
          ✓
        </span>
        <h3 className={styles.winnerTitle}>Vote submitted</h3>
        <p className={styles.winnerBody}>Waiting for the rest of the team — the host will reveal when everyone’s in.</p>
      </div>
    );
  }

  return (
    <>
      <h2 className={styles.prompt}>{pc.question}</h2>
      <div className={styles.pollList} role={multiple ? 'group' : 'radiogroup'} aria-label="Poll options">
        {pc.options.map((opt, i) => {
          const idx = String(i);
          const mine = multiple ? picks.includes(idx) : pick === idx;
          const toggle = () => {
            if (multiple) setPicks((prev) => (prev.includes(idx) ? prev.filter((x) => x !== idx) : [...prev, idx]));
            else setPick(idx);
          };
          return (
            <button key={i} type="button" className={cx(styles.pollOption, mine && styles.pollOptionMine)} onClick={toggle} aria-pressed={mine}>
              <span className={styles.pollBox} aria-hidden="true">
                {multiple ? (mine ? '☑' : '☐') : mine ? '◉' : '○'}
              </span>
              <span className={styles.pollText}>{opt}</span>
            </button>
          );
        })}
      </div>
      {live && (
        <div className={styles.liveCounts} role="status">
          <span className={styles.liveCountLabel}>Live so far</span>
          {pc.options.map((opt, i) => (
            <span key={i} className={styles.liveCountChip}>
              {opt}: {live.counts[i] ?? 0}
            </span>
          ))}
        </div>
      )}
      {tried && !canSubmit && (
        <p className={styles.error} role="alert">
          {multiple ? 'Select at least one option before submitting.' : 'Pick an option before submitting.'}
        </p>
      )}
      <div className={styles.estimateRow}>
        <Button variant="gold" onClick={() => {
          setTried(true);
          if (canSubmit) onSubmit(multiple ? picks : pick!);
        }}>
          Submit Vote
        </Button>
      </div>
    </>
  );
}

// --- Team Health results ----------------------------------------------------

function HealthResults({ config, snap, stats, isHost, onNext }: { config: GameConfig; snap: GameSnapshot; stats: HealthStats; isHost: boolean; onNext: () => void }) {
  const s = stats;
  const scale = s.scale || 5;
  const statusMeta =
    s.overallStatus === 'healthy'
      ? { emoji: '🟢', label: 'Healthy' }
      : s.overallStatus === 'attention'
        ? { emoji: '🟡', label: 'Needs Attention' }
        : { emoji: '🔴', label: 'Critical' };
  const nameOf = (id: string) => snap.participants.find((p) => p.id === id)?.name ?? 'Someone';
  return (
    <div className={styles.panel}>
      <span className={styles.eyebrow}>Check {s.roundId} · Results</span>
      <div className={styles.scoreCard} role="status">
        <span className={styles.scoreBig}>
          {s.overall} <span className={styles.scoreDen}>/ {scale}</span>
        </span>
        <span className={cx(styles.statusPill, styles[`status${s.overallStatus}`])}>
          {statusMeta.emoji} {statusMeta.label}
        </span>
        {s.trend != null && s.previous != null && (
          <span className={styles.trend}>
            {s.trend >= 0 ? '📈' : '📉'} {s.trend >= 0 ? '+' : ''}
            {s.trend}% vs last check ({s.previous})
          </span>
        )}
      </div>
      <div className={styles.healthBars}>
        {s.categories.map((c) => (
          <div key={c.name} className={styles.barRow}>
            <span className={styles.barLabel}>{c.name}</span>
            <div className={styles.barTrack}>
              <div className={cx(styles.barFill, styles[`bar${c.status}`])} style={{ width: `${Math.max(2, (c.average / scale) * 100)}%` }} />
            </div>
            <span className={styles.barValue}>
              {c.average} / {scale}
            </span>
          </div>
        ))}
      </div>
      {!s.anonymous && s.breakdown.length > 0 && (
        <div className={styles.rankList} aria-label="Individual ratings">
          {s.breakdown.map((b) => (
            <div key={b.participantId} className={styles.rankRow}>
              <Avatar name={nameOf(b.participantId)} hue={snap.participants.find((p) => p.id === b.participantId)?.hue ?? 0} size="sm" />
              <span className={styles.rankName}>{nameOf(b.participantId)}</span>
              <span className={styles.rankCount}>{s.categories.map((c) => `${b.ratings[c.name] ?? '–'}`).join(' · ')}</span>
            </div>
          ))}
        </div>
      )}
      <div className={styles.footer}>
        <p className={styles.roundNote}>
          {s.submitted} {s.submitted === 1 ? 'response' : 'responses'} · {s.anonymous ? 'anonymous mode' : 'named mode'}
        </p>
        {isHost && (
          <Button variant="gold" size="md" onClick={onNext}>
            {config.nextLabel} →
          </Button>
        )}
      </div>
    </div>
  );
}

// --- Live Poll results ------------------------------------------------------

function PollResults({ config, snap, stats, isHost, onNext }: { config: GameConfig; snap: GameSnapshot; stats: PollStats; isHost: boolean; onNext: () => void }) {
  const s = stats;
  const options = ((snap.config as PollConfig | undefined) ?? DEFAULT_POLL_CONFIG).options;
  const winnerEntry = s.winner === 'tie' ? null : s.counts.find((c) => c.option === s.winner);
  return (
    <div className={styles.panel}>
      <span className={styles.eyebrow}>Poll {s.roundId} · Results</span>
      <h2 className={styles.prompt}>{s.question}</h2>
      {winnerEntry ? (
        <div className={styles.winnerCard} role="status">
          <span className={styles.winnerEmoji} aria-hidden="true">
            🏆
          </span>
          <div>
            <h3 className={styles.winnerTitle}>{options[winnerEntry.option] ?? 'Winner'}</h3>
            <p className={styles.winnerBody}>
              {winnerEntry.count} {winnerEntry.count === 1 ? 'vote' : 'votes'} · {winnerEntry.percent}% of {s.totalSelections} selections
            </p>
          </div>
        </div>
      ) : (
        <div className={styles.winnerCard} role="status">
          <span className={styles.winnerEmoji} aria-hidden="true">
            🤝
          </span>
          <div>
            <h3 className={styles.winnerTitle}>It’s a tie</h3>
            <p className={styles.winnerBody}>Two or more options ended level on {s.topCount} votes.</p>
          </div>
        </div>
      )}
      <div className={styles.healthBars}>
        {s.counts.map((c) => (
          <div key={c.option} className={styles.barRow}>
            <span className={styles.barLabel}>{options[c.option] ?? `Option ${c.option + 1}`}</span>
            <div className={styles.barTrack}>
              <div className={styles.barFillPoll} style={{ width: `${Math.max(2, c.percent)}%` }} />
            </div>
            <span className={styles.barValue}>
              {c.count} · {c.percent}%
            </span>
          </div>
        ))}
      </div>
      <div className={styles.footer}>
        <p className={styles.roundNote}>
          {s.totalVotes} {s.totalVotes === 1 ? 'vote' : 'votes'} · {s.anonymous ? 'anonymous mode' : 'named mode'}
        </p>
        {isHost && (
          <Button variant="gold" size="md" onClick={onNext}>
            {config.nextLabel} →
          </Button>
        )}
      </div>
    </div>
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
  if (config.kind === 'health') {
    return <HealthResults config={config} snap={snap} stats={stats as any} isHost={isHost} onNext={onNext} />;
  }
  if (config.kind === 'poll') {
    return <PollResults config={config} snap={snap} stats={stats as any} isHost={isHost} onNext={onNext} />;
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
