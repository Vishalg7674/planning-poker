/**
 * Headless multi-client E2E test for the engine-backed games
 * (server/games/engine.mjs + registry.mjs). Exercises the shared protocol —
 * room:create with a game, game:startPrompt, the per-kind cast event,
 * game:reveal — for one game of every kind, plus privacy guarantees.
 *
 * Run: node scripts/e2e-games.mjs (server must already be listening on :3001)
 */
import { io } from 'socket.io-client';

const URL = process.env.E2E_URL || 'http://localhost:3001';
let passed = 0;
let failed = 0;

function check(name, cond, extra = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

function connect() {
  return new Promise((resolve, reject) => {
    const s = io(URL, { transports: ['websocket'] });
    const t = setTimeout(() => reject(new Error('connect timeout')), 5000);
    s.on('connect', () => {
      clearTimeout(t);
      resolve(s);
    });
    s.on('connect_error', (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

const emitAck = (s, event, payload = {}) =>
  new Promise((resolve) => {
    const t = setTimeout(() => resolve({ ok: false, error: `timeout:${event}` }), 5000);
    s.emit(event, payload, (res) => {
      clearTimeout(t);
      resolve(res);
    });
  });

function snapshotPump(s) {
  const buffer = [];
  const waiters = [];
  s.on('snapshot', (snap) => {
    for (let i = 0; i < waiters.length; i++) {
      if (waiters[i].predicate(snap)) {
        const w = waiters.splice(i, 1)[0];
        clearTimeout(w.timer);
        w.resolve(snap);
        return;
      }
    }
    buffer.push(snap);
  });
  return (predicate) =>
    new Promise((resolve) => {
      const idx = buffer.findIndex(predicate);
      if (idx >= 0) return resolve(buffer.splice(idx, 1)[0]);
      const timer = setTimeout(() => {
        const i = waiters.findIndex((w) => w.resolve === doResolve);
        if (i >= 0) waiters.splice(i, 1);
        resolve(null);
      }, 10000);
      const doResolve = (snap) => resolve(snap);
      waiters.push({ predicate, resolve: doResolve, timer });
    });
}

setTimeout(() => {
  console.log(`\nWATCHDOG TIMEOUT — ${passed} passed, ${failed} failed so far`);
  process.exit(2);
}, 60000);

const host = await connect();
const voter = await connect();
const hostSnap = snapshotPump(host);
const voterSnap = snapshotPump(voter);

async function fullGameFlow(gameId, castEvent, castValues, kind) {
  console.log(`— ${gameId} (${kind}) —`);
  const created = await emitAck(host, 'room:create', { game: gameId, hostName: 'Ada' });
  check('create ack ok', created?.ok === true, JSON.stringify(created));
  const code = created.code;
  const snap1 = await hostSnap((s) => s.code === code);
  check(`snapshot has game=${gameId}`, snap1?.game === gameId, JSON.stringify(snap1?.game));
  check(`snapshot has kind=${kind}`, snap1?.kind === kind, JSON.stringify(snap1?.kind));
  check('game starts WAITING', snap1?.status === 'waiting');

  const joined = await emitAck(voter, 'room:join', { code, name: 'Grace' });
  check('join ack ok', joined?.ok === true, JSON.stringify(joined));
  await hostSnap((s) => s.code === code && s.participants?.length === 2);

  const started = await emitAck(host, 'game:startPrompt', {});
  check('game:startPrompt ok', started?.ok === true, JSON.stringify(started));
  const live = await hostSnap((s) => s.code === code && s.status === 'playing');
  check('status → playing', live?.status === 'playing');
  check('prompt present', live?.prompt != null, JSON.stringify(live?.prompt));
  check('everyoneVoted false', live?.everyoneVoted === false);

  const early = await emitAck(host, 'game:reveal', {});
  check('reveal blocked before everyone votes', early?.ok === false && early.error === 'not_all_voted', JSON.stringify(early));

  // Teammate games cast the OTHER participant's id; everyone else casts the
  // provided values.
  const hostVal = kind === 'teammate' ? joined.participantId : castValues[0];
  const voterVal = kind === 'teammate' ? created.participantId : castValues[1];
  const castRes = await emitAck(host, castEvent, { value: hostVal });
  check(`${castEvent} accepted`, castRes?.ok === true, JSON.stringify(castRes));
  const voterCast = await emitAck(voter, castEvent, { value: voterVal });
  check(`${castEvent} accepted for voter`, voterCast?.ok === true, JSON.stringify(voterCast));
  const voted = await hostSnap((s) => s.code === code && s.votedIds?.length === 2);
  check('votedIds = 2', voted?.votedIds?.length === 2, JSON.stringify(voted?.votedIds));
  check('everyoneVoted true', voted?.everyoneVoted === true);

  const dup = await emitAck(host, castEvent, { value: hostVal });
  check('duplicate cast rejected', dup?.ok === false && dup.error === 'already_voted', JSON.stringify(dup));

  const rev = await emitAck(host, 'game:reveal', {});
  check('game:reveal ok', rev?.ok === true, JSON.stringify(rev));
  const revealed = await voterSnap((s) => s.code === code && s.status === 'revealed');
  check('status → revealed', revealed?.status === 'revealed');
  check('votes public after reveal', Object.keys(revealed?.votes || {}).length === 2, JSON.stringify(revealed?.votes));
  check('stats computed', revealed?.stats != null, JSON.stringify(revealed?.stats));

  const next = await emitAck(host, 'game:startPrompt', {});
  check('next prompt ok', next?.ok === true, JSON.stringify(next));
  const round2 = await hostSnap((s) => s.code === code && s.roundId === 2);
  check('round 2 started, votes cleared', round2?.status === 'playing' && round2?.votedIds?.length === 0, JSON.stringify(round2?.roundId));
}

// --- Team Health Check ------------------------------------------------------

async function healthFlow() {
  console.log('— team-health (health) —');
  const config = {
    title: 'Sprint 24 Team Health',
    categories: ['Communication', 'Delivery', 'Morale'],
    scale: 5,
    anonymous: true,
  };
  const created = await emitAck(host, 'room:create', { game: 'team-health', hostName: 'Ada', config });
  check('create ack ok', created?.ok === true, JSON.stringify(created));
  const code = created.code;
  const snap1 = await hostSnap((s) => s.code === code);
  check('snapshot carries the health config', snap1?.config?.title === config.title && snap1?.config?.categories?.length === 3, JSON.stringify(snap1?.config));
  check('kind = health', snap1?.kind === 'health');

  const joined = await emitAck(voter, 'room:join', { code, name: 'Grace' });
  check('join ack ok', joined?.ok === true);
  await hostSnap((s) => s.code === code && s.participants?.length === 2);

  const started = await emitAck(host, 'game:startPrompt', {});
  check('start check ok', started?.ok === true, JSON.stringify(started));
  await hostSnap((s) => s.code === code && s.status === 'playing');

  const ratings = { Communication: 4, Delivery: 2, Morale: 5 };
  const missing = { Communication: 4 }; // Delivery + Morale missing
  const bad = await emitAck(host, 'game:healthSubmit', { value: { ratings: missing } });
  check('incomplete submission rejected', bad?.ok === false && bad.error === 'bad_value', JSON.stringify(bad));
  const castRes = await emitAck(host, 'game:healthSubmit', { value: { ratings } });
  check('health submit accepted', castRes?.ok === true, JSON.stringify(castRes));
  const voterCast = await emitAck(voter, 'game:healthSubmit', { value: { ratings: { Communication: 5, Delivery: 3, Morale: 4 } } });
  check('voter health submit accepted', voterCast?.ok === true, JSON.stringify(voterCast));
  const voted = await hostSnap((s) => s.code === code && s.votedIds?.length === 2);
  check('votedIds = 2', voted?.votedIds?.length === 2);
  check('ratings hidden before reveal', voted?.stats == null && Object.keys(voted?.votes || {}).length === 0, JSON.stringify(voted?.stats));

  const dup = await emitAck(voter, 'game:healthSubmit', { value: { ratings } });
  check('duplicate submission rejected', dup?.ok === false && dup.error === 'already_voted', JSON.stringify(dup));

  const rev = await emitAck(host, 'game:reveal', {});
  check('health reveal ok', rev?.ok === true, JSON.stringify(rev));
  const revealed = await voterSnap((s) => s.code === code && s.status === 'revealed');
  check('status → revealed', revealed?.status === 'revealed');
  check('overall computed', revealed?.stats?.overall != null, JSON.stringify(revealed?.stats?.overall));
  check('anonymous → no breakdown', revealed?.stats?.breakdown?.length === 0, JSON.stringify(revealed?.stats?.breakdown));

  const next = await emitAck(host, 'game:startPrompt', {});
  check('New Health Check ok', next?.ok === true, JSON.stringify(next));
  const round2 = await hostSnap((s) => s.code === code && s.roundId === 2);
  check('responses reset in same room', round2?.status === 'playing' && round2?.votedIds?.length === 0 && round2?.code === code, JSON.stringify(round2?.roundId));
}

// --- Live Poll --------------------------------------------------------------

async function pollFlow() {
  console.log('— live-poll (poll) —');
  const config = { question: 'Ship on Friday?', options: ['Yes', 'No'], type: 'single', anonymous: true, hideResults: true };
  const created = await emitAck(host, 'room:create', { game: 'live-poll', hostName: 'Ada', config });
  check('create ack ok', created?.ok === true, JSON.stringify(created));
  const code = created.code;
  const snap1 = await hostSnap((s) => s.code === code);
  check('snapshot carries the poll config', snap1?.config?.question === config.question && snap1?.config?.options?.length === 2, JSON.stringify(snap1?.config));

  const joined = await emitAck(voter, 'room:join', { code, name: 'Grace' });
  check('join ack ok', joined?.ok === true);
  await hostSnap((s) => s.code === code && s.participants?.length === 2);

  const started = await emitAck(host, 'game:startPrompt', {});
  check('start poll ok', started?.ok === true, JSON.stringify(started));
  await hostSnap((s) => s.code === code && s.status === 'playing');

  const outOfRange = await emitAck(host, 'game:pollVote', { value: '9' });
  check('out-of-range option rejected', outOfRange?.ok === false && outOfRange.error === 'bad_value', JSON.stringify(outOfRange));
  const hostVote = await emitAck(host, 'game:pollVote', { value: '0' });
  check('poll vote accepted', hostVote?.ok === true, JSON.stringify(hostVote));
  const voterVote = await emitAck(voter, 'game:pollVote', { value: '0' });
  check('voter poll vote accepted', voterVote?.ok === true, JSON.stringify(voterVote));
  const voted = await hostSnap((s) => s.code === code && s.votedIds?.length === 2);
  check('votedIds = 2', voted?.votedIds?.length === 2);
  check('votes hidden before reveal', voted?.stats == null && Object.keys(voted?.votes || {}).length === 0);

  const dup = await emitAck(voter, 'game:pollVote', { value: '0' });
  check('duplicate vote rejected', dup?.ok === false && dup.error === 'already_voted', JSON.stringify(dup));

  const rev = await emitAck(host, 'game:reveal', {});
  check('poll reveal ok', rev?.ok === true, JSON.stringify(rev));
  const revealed = await voterSnap((s) => s.code === code && s.status === 'revealed');
  check('status → revealed', revealed?.status === 'revealed');
  check('winner = Yes (option 0)', revealed?.stats?.winner === 0, JSON.stringify(revealed?.stats?.winner));
  check('percentages computed', revealed?.stats?.counts?.[0]?.percent === 100, JSON.stringify(revealed?.stats?.counts));
  check('anonymous → no per-participant votes', Object.keys(revealed?.votes || {}).length === 0);

  const next = await emitAck(host, 'game:startPrompt', {});
  check('New Poll ok', next?.ok === true, JSON.stringify(next));
  const round2 = await hostSnap((s) => s.code === code && s.roundId === 2);
  check('votes reset in same room', round2?.status === 'playing' && round2?.votedIds?.length === 0 && round2?.code === code);
}

// --- One room → many activities: switch in place ----------------------------

async function switchFlow() {
  console.log('— switchGame (poll → team-health, same room) —');
  const created = await emitAck(host, 'room:create', { game: 'live-poll', hostName: 'Ada' });
  const code = created.code;
  await hostSnap((s) => s.code === code);
  await emitAck(voter, 'room:join', { code, name: 'Grace' });
  await hostSnap((s) => s.code === code && s.participants?.length === 2);

  // Both clients must be told to follow.
  let hostFollowed = false;
  let voterFollowed = false;
  const onChanged = (payload) => {
    if (payload?.game === 'team-health' && payload?.code === code) hostFollowed = true;
  };
  host.on('room:activityChanged', onChanged);
  voter.on('room:activityChanged', (payload) => {
    if (payload?.game === 'team-health' && payload?.code === code) voterFollowed = true;
  });

  const switched = await emitAck(host, 'room:switchGame', { game: 'team-health' });
  check('switch ack ok', switched?.ok === true, JSON.stringify(switched));
  const nextSnap = await hostSnap((s) => s.code === code && s.game === 'team-health');
  check('room now runs team-health', nextSnap?.game === 'team-health' && nextSnap?.kind === 'health');
  check('same room code preserved', nextSnap?.code === code);
  check('participants preserved', nextSnap?.participants?.length === 2);
  check('host preserved', nextSnap?.hostId === created.participantId);
  check('activityChanged broadcast to host', hostFollowed === true);
  check('activityChanged broadcast to voter', voterFollowed === true);
  await new Promise((r) => setTimeout(r, 100));
  host.off('room:activityChanged', onChanged);

  // Double-click: switching again to the same activity is rejected.
  const again = await emitAck(host, 'room:switchGame', { game: 'team-health' });
  check('switch to same activity rejected', again?.ok === false && again.error === 'in_progress', JSON.stringify(again));
}

await fullGameFlow('would-you-rather', 'game:choose', ['0', '1'], 'options');
await fullGameFlow('most-likely-to', 'game:pick', [], 'teammate');
await fullGameFlow('team-trivia', 'game:answer', ['1', '0'], 'quiz');
await fullGameFlow('how-many', 'game:guess', ['101', '99'], 'estimate');
await healthFlow();
await pollFlow();
await switchFlow();

host.disconnect();
voter.disconnect();
console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
