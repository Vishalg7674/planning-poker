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

await fullGameFlow('would-you-rather', 'game:choose', ['0', '1'], 'options');
await fullGameFlow('most-likely-to', 'game:pick', [], 'teammate');
await fullGameFlow('team-trivia', 'game:answer', ['1', '0'], 'quiz');
await fullGameFlow('how-many', 'game:guess', ['101', '99'], 'estimate');

host.disconnect();
voter.disconnect();
console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
