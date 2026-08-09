/**
 * Headless multi-client E2E test for the Reveal realtime server.
 *
 * The pump buffers every snapshot and `waitFor(predicate)` resolves with the
 * first snapshot that matches — immune to event-loop scheduling / packet
 * batching. This mirrors how the real client bridge works (permanent listener,
 * full-state snapshots), just with assertions.
 *
 * Flow under test: WAITING → VOTING → (ENDED | everyone-voted) → REVEALED,
 * with an optional timer (Off / 10 / 15 / 30s) stored in room settings, a
 * server-enforced permanent vote lock, and privacy until reveal.
 */
import { io } from 'socket.io-client';

const URL = process.env.E2E_URL || 'http://localhost:3001';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
      const pred = predicate ?? (() => true);
      const idx = buffer.findIndex(pred);
      if (idx >= 0) return resolve(buffer.splice(idx, 1)[0]);
      const timer = setTimeout(() => {
        const i = waiters.findIndex((w) => w.resolve === doResolve);
        if (i >= 0) waiters.splice(i, 1);
        resolve(null);
      }, 15000); // long enough to outlive the longest allowed timer (30s ÷ margin)
      const doResolve = (snap) => resolve(snap);
      waiters.push({ predicate: pred, resolve: doResolve, timer });
    });
}

const waitEvent = (s, event) =>
  new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), 5000);
    s.once(event, (data) => {
      clearTimeout(t);
      resolve(data);
    });
  });

setTimeout(() => {
  console.log(`\nWATCHDOG TIMEOUT — ${passed} passed, ${failed} failed so far`);
  process.exit(2);
}, 90000);

console.log('— connect clients —');
const host = await connect();
const voter = await connect();
const observer = await connect();
const screen = await connect();
const hostSnap = snapshotPump(host);
const voterSnap = snapshotPump(voter);
const screenSnap = snapshotPump(screen);

// ===========================================================================
// Room A — timer OFF: reveal unlocks the moment everyone has voted
// ===========================================================================
console.log('— room A: create (timer defaults to Off) —');
const created = await emitAck(host, 'room:create', { hostName: 'Ada' });
check('create ack ok', created?.ok === true, JSON.stringify(created));
check('create returns participantId', typeof created?.participantId === 'string' && created.participantId.length > 0);
const code = created.code;
console.log(`  room code: ${code}`);

let snap = await hostSnap((s) => s.code === code);
check('host snapshot has 1 participant', snap?.participants.length === 1);
check('room starts WAITING', snap?.status === 'waiting', JSON.stringify(snap?.status));
check('deck defaults to fibonacci', snap?.settings.deckId === 'fibonacci');
check('timer defaults to Off (null)', snap?.settings.timerSec === null, JSON.stringify(snap?.settings));
check('accent defaults to gold', snap?.settings.accent === 'gold');
check('reveal mode defaults to staggered', snap?.settings.revealMode === 'staggered');
check('room unlocked by default', snap?.locked === false);
check('timer null in waiting', snap?.timer === null);
check('everyoneHasVoted false initially', snap?.everyoneHasVoted === false);
check('stats null pre-reveal', snap?.stats === null);

console.log('— room customization: team name, title, deck, accent —');
const custom = await emitAck(host, 'room:create', {
  hostName: 'Ada',
  teamName: 'Frontend Team',
  roomTitle: 'Sprint 24 Planning',
  deckId: 'tshirt',
  accent: 'purple',
  revealMode: 'dramatic',
});
check('custom create ok', custom?.ok === true, JSON.stringify(custom));
const codeCustom = custom.code;
snap = await hostSnap((s) => s.code === codeCustom);
check('team name stored', snap?.teamName === 'Frontend Team');
check('room title stored', snap?.roomTitle === 'Sprint 24 Planning');
check('deck stored', snap?.settings.deckId === 'tshirt');
check('accent stored', snap?.settings.accent === 'purple');
check('reveal mode stored', snap?.settings.revealMode === 'dramatic');
const badDeck = await emitAck(host, 'room:create', { hostName: 'Ada', deckId: 'uno' });
check('unknown deck still creates a room', badDeck?.ok === true, JSON.stringify(badDeck));
if (badDeck?.ok) {
  snap = await hostSnap((s) => s.code === badDeck.code);
  check('fallback deck is fibonacci', snap?.settings.deckId === 'fibonacci');
}

// The extra room:create calls re-pointed the host socket at those rooms —
// bring it back to Room A before its flow continues below.
await emitAck(host, 'room:rejoin', { code, participantId: created.participantId, name: 'Ada' });

console.log('— room A: timer pick is validated & persisted —');
const pick10 = await emitAck(host, 'room:settings', { timerSec: 10 });
check('room:settings 10s ok', pick10?.ok === true, JSON.stringify(pick10));
snap = await hostSnap((s) => s.settings?.timerSec === 10);
check('snapshot reflects 10s', snap?.settings.timerSec === 10);
const badTimer = await emitAck(host, 'room:settings', { timerSec: 45 });
check('45s rejected (only 10/15/30)', badTimer?.ok === false && badTimer.error === 'bad_timer', JSON.stringify(badTimer));
const pickOff = await emitAck(host, 'room:settings', { timerSec: null });
check('back to Off ok', pickOff?.ok === true, JSON.stringify(pickOff));
snap = await hostSnap((s) => s.settings?.timerSec === null);
check('snapshot reflects Off again', snap?.settings.timerSec === null);
const nonHostSettings = await emitAck(voter, 'room:settings', { timerSec: 15 });
check('non-host cannot change timer', nonHostSettings?.ok === false && nonHostSettings.error === 'not_host', JSON.stringify(nonHostSettings));

console.log('— room A: joining —');
const joined = await emitAck(voter, 'room:join', { code, name: 'Grace' });
check('join ack ok', joined?.ok === true, JSON.stringify(joined));
const graceId = joined.participantId;
check('join ack snapshot has 2 participants', joined.snapshot?.participants.length === 2);

snap = await hostSnap((s) => s.participants?.length === 2);
check('host sees 2 participants', snap?.participants.length === 2);
check('Grace is a voter', snap?.participants.some((p) => p.name === 'Grace' && p.role === 'voter'));
check('Ada is host', snap?.hostId && snap.participants.find((p) => p.id === snap.hostId)?.name === 'Ada');
check('nobody has voted yet', snap?.votedIds.length === 0 && snap?.everyoneHasVoted === false);

console.log('— room A: voting is closed before start —');
const earlyVote = await emitAck(voter, 'vote:cast', { value: '8' });
check('vote before start rejected', earlyVote?.ok === false && earlyVote.error === 'not_voting', JSON.stringify(earlyVote));

console.log('— room A: start with timer OFF —');
const startRes = await emitAck(host, 'voting:start', { durationSec: 999 }); // payload ignored — settings own the timer
check('voting:start ok', startRes?.ok === true, JSON.stringify(startRes));
snap = await hostSnap((s) => s.status === 'voting');
check('status → voting', snap?.status === 'voting');
check('no timer when Off', snap?.timer === null, JSON.stringify(snap?.timer));
check('votedIds empty at start', snap?.votedIds.length === 0);
const nonHostStart = await emitAck(voter, 'voting:start', {});
check('non-host cannot start', nonHostStart?.ok === false && nonHostStart.error === 'not_host', JSON.stringify(nonHostStart));

console.log('— room A: votes lock permanently —');
const voteRes = await emitAck(voter, 'vote:cast', { value: '8' });
check('vote:cast ok', voteRes?.ok === true);
snap = await hostSnap((s) => s.votedIds?.includes(graceId));
check('host sees Grace in votedIds', snap?.votedIds.includes(graceId));
check('host does NOT see value pre-reveal', snap && Object.keys(snap.votes).length === 0, JSON.stringify(snap?.votes));
check('stats hidden pre-reveal', snap?.stats === null);
check('Grace status voted', snap?.participants.find((p) => p.id === graceId)?.status === 'voted');
check('everyoneHasVoted still false (host pending)', snap?.everyoneHasVoted === false);

const dupVote = await emitAck(voter, 'vote:cast', { value: '13' });
check('duplicate vote rejected (already_voted)', dupVote?.ok === false && dupVote.error === 'already_voted', JSON.stringify(dupVote));

const badValue = await emitAck(host, 'vote:cast', { value: '99' });
check('vote value not on the deck rejected (bad_value)', badValue?.ok === false && badValue.error === 'bad_value', JSON.stringify(badValue));

const hostVote = await emitAck(host, 'vote:cast', { value: '5' });
check('host can vote too', hostVote?.ok === true, JSON.stringify(hostVote));
snap = await hostSnap((s) => s.votedIds?.length === 2);
check('both votes locked in', snap?.votedIds.length === 2);
check('everyoneHasVoted true', snap?.everyoneHasVoted === true);

console.log('— room A: reveal while voting, once everyone voted —');
const nonHostReveal = await emitAck(voter, 'votes:reveal', {});
check('non-host cannot reveal', nonHostReveal?.ok === false && nonHostReveal.error === 'not_host', JSON.stringify(nonHostReveal));
const revealRes = await emitAck(host, 'votes:reveal', {});
check('reveal accepted straight from VOTING', revealRes?.ok === true, JSON.stringify(revealRes));
snap = await voterSnap((s) => s.code === code && s.status === 'revealed' && s.stats != null);
check('status → revealed for voter', snap?.status === 'revealed');
check('voter sees value after reveal', snap?.votes[graceId] === '8');
check('host vote visible too', snap?.votes[created.participantId] === '5');
check('stats count 2', snap?.stats?.count === 2);
check('avg (8+5)/2 = 6.5', snap?.stats?.avg === 6.5);
check('median 6.5', snap?.stats?.median === 6.5);

const castAfterReveal = await emitAck(voter, 'vote:cast', { value: '13' });
check('voting after reveal rejected', castAfterReveal?.ok === false && castAfterReveal.error === 'revealed', JSON.stringify(castAfterReveal));

// ===========================================================================
// room:end wipes memory (do it now, while the host socket still owns room A)
// ===========================================================================
console.log('— room:end wipes memory —');
await emitAck(observer, 'room:join', { code, name: 'Obs' });
const endedP = waitEvent(observer, 'room:ended');
await emitAck(host, 'room:end', {});
check('observer received room:ended', (await endedP) !== null);
const joinAfterEnd = await emitAck(voter, 'room:join', { code, name: 'Zed' });
check('room gone after end (not_found)', joinAfterEnd?.ok === false && joinAfterEnd.error === 'not_found', JSON.stringify(joinAfterEnd));

// ===========================================================================
// Room B — timer ON: reveal rejected until the timer ends the round
// ===========================================================================
console.log('— room B: create with 10s timer —');
const createdB = await emitAck(host, 'room:create', { hostName: 'Bob' });
const codeB = createdB.code;
await emitAck(host, 'room:settings', { timerSec: 10 });
snap = await hostSnap((s) => s.code === codeB && s.settings?.timerSec === 10);
check('room B timer 10s stored', snap?.settings.timerSec === 10);

const joinedB = await emitAck(voter, 'room:join', { code: codeB, name: 'Eve' });
check('Eve joins room B', joinedB?.ok === true);
const eveId = joinedB.participantId;

await emitAck(host, 'voting:start', {});
snap = await hostSnap((s) => s.code === codeB && s.status === 'voting');
check('room B voting, timer running', snap?.timer?.durationSec === 10 && snap.timer.endsAt > Date.now());

const eveVote = await emitAck(voter, 'vote:cast', { value: '5' });
check('Eve votes', eveVote?.ok === true);
snap = await hostSnap((s) => s.code === codeB && s.votedIds?.includes(eveId));
check('room B: host pending → everyoneHasVoted false', snap?.everyoneHasVoted === false);

const earlyReveal = await emitAck(host, 'votes:reveal', {});
check('reveal rejected while someone is thinking', earlyReveal?.ok === false && earlyReveal.error === 'not_all_voted', JSON.stringify(earlyReveal));

console.log('— room B: server timer ends voting —');
snap = await hostSnap((s) => s.code === codeB && s.status === 'ended');
check('status → ended when timer hits zero', snap?.status === 'ended');
check('values still hidden after end', snap && Object.keys(snap.votes).length === 0, JSON.stringify(snap?.votes));

const lateVote = await emitAck(voter, 'vote:cast', { value: '21' });
check('vote after timer rejected', lateVote?.ok === false && lateVote.error === 'not_voting', JSON.stringify(lateVote));

const revealB = await emitAck(host, 'votes:reveal', {});
check('reveal ok after timer ended', revealB?.ok === true, JSON.stringify(revealB));
snap = await voterSnap((s) => s.code === codeB && s.status === 'revealed');
check('room B revealed', snap?.status === 'revealed');
check('Eve value visible', snap?.votes[eveId] === '5');
check('non-voter (Bob) absent from votes', snap?.votes[createdB.participantId] === undefined);
check('stats count excludes non-voter', snap?.stats?.count === 1);
check('avg = 5', snap?.stats?.avg === 5);

// ===========================================================================
// Room C — timer OFF: reveal rejected while nobody has voted
// ===========================================================================
console.log('— room C: no votes, timer off —');
const createdC = await emitAck(host, 'room:create', { hostName: 'Cara' });
const codeC = createdC.code;
await emitAck(host, 'voting:start', {});
snap = await hostSnap((s) => s.code === codeC && s.status === 'voting');
check('room C voting without timer', snap?.timer === null);
const noVotesReveal = await emitAck(host, 'votes:reveal', {});
check('reveal rejected with zero votes', noVotesReveal?.ok === false && noVotesReveal.error === 'not_all_voted', JSON.stringify(noVotesReveal));

// ===========================================================================
// participant removal
// ===========================================================================
console.log('— participant removal —');
const createdR = await emitAck(host, 'room:create', { hostName: 'Ren' });
const codeR = createdR.code;
const joinedR = await emitAck(voter, 'room:join', { code: codeR, name: 'Sue' });
check('Sue joins removal room', joinedR?.ok === true);
const youRemovedP = waitEvent(voter, 'you:removed');
const removed = await emitAck(host, 'participant:remove', { participantId: joinedR.participantId });
check('participant:remove ok', removed?.ok === true);
check('removed socket got you:removed', (await youRemovedP) !== null);
snap = await hostSnap((s) => s.code === codeR && !s.participants?.some((p) => p.id === joinedR.participantId));
check('Sue removed from participants', snap && !snap.participants.some((p) => p.id === joinedR.participantId));

// ===========================================================================
// room lock — new joiners refused, existing participants rejoin freely
// ===========================================================================
console.log('— room lock —');
const createdL = await emitAck(host, 'room:create', { hostName: 'Lia' });
const codeL = createdL.code;
const lockRes = await emitAck(host, 'room:lock', {});
check('room:lock ok', lockRes?.ok === true, JSON.stringify(lockRes));
snap = await hostSnap((s) => s.code === codeL && s.locked === true);
check('snapshot reflects locked', snap?.locked === true);
const lockedJoin = await emitAck(voter, 'room:join', { code: codeL, name: 'Stranger' });
check('new joiner refused while locked', lockedJoin?.ok === false && lockedJoin.error === 'room_locked', JSON.stringify(lockedJoin));
const unlockRes = await emitAck(host, 'room:unlock', {});
check('room:unlock ok', unlockRes?.ok === true, JSON.stringify(unlockRes));
snap = await hostSnap((s) => s.code === codeL && s.locked === false);
check('snapshot reflects unlocked', snap?.locked === false);
const openJoin = await emitAck(voter, 'room:join', { code: codeL, name: 'Stranger' });
check('joiner admitted after unlock', openJoin?.ok === true, JSON.stringify(openJoin));
const relock = await emitAck(host, 'room:lock', {});
check('relock ok', relock?.ok === true);
const rejoinMine = await emitAck(host, 'room:rejoin', { code: codeL, participantId: createdL.participantId, name: 'Lia' });
check('host rejoin allowed while locked', rejoinMine?.ok === true, JSON.stringify(rejoinMine));
const nonHostLock = await emitAck(voter, 'room:lock', {});
check('non-host cannot lock', nonHostLock?.ok === false && nonHostLock.error === 'not_host', JSON.stringify(nonHostLock));

// ===========================================================================
// T-Shirt deck — non-numeric stats (no average/median/range)
// ===========================================================================
console.log('— T-Shirt deck stats —');
const createdT = await emitAck(host, 'room:create', { hostName: 'Tia', deckId: 'tshirt' });
const codeT = createdT.code;
await emitAck(voter, 'room:join', { code: codeT, name: 'Sue' });
await emitAck(host, 'voting:start', {});
await emitAck(voter, 'vote:cast', { value: 'M' });
await emitAck(host, 'vote:cast', { value: 'M' });
snap = await hostSnap((s) => s.code === codeT && s.status === 'voting' && s.votedIds?.length === 2);
check('tshirt everyone voted', snap?.everyoneHasVoted === true);
await emitAck(host, 'votes:reveal', {});
snap = await voterSnap((s) => s.code === codeT && s.status === 'revealed');
check('tshirt stats numeric=false', snap?.stats?.numeric === false, JSON.stringify(snap?.stats));
check('tshirt mode is M', snap?.stats?.mode === 'M');
check('tshirt avg is null (no numeric average)', snap?.stats?.avg === null);
check('tshirt median is null', snap?.stats?.median === null);
check('tshirt consensus is full', snap?.stats?.level === 'full');

// ===========================================================================
// Modified Fibonacci — numeric stats with highest/lowest/range
// ===========================================================================
console.log('— modified fibonacci stats —');
const createdM = await emitAck(host, 'room:create', { hostName: 'Mia', deckId: 'modifiedFibonacci' });
const codeM = createdM.code;
await emitAck(voter, 'room:join', { code: codeM, name: 'Eve' });
await emitAck(host, 'voting:start', {});
await emitAck(voter, 'vote:cast', { value: '½' });
await emitAck(host, 'vote:cast', { value: '21' });
snap = await hostSnap((s) => s.code === codeM && s.status === 'voting' && s.votedIds?.length === 2);
await emitAck(host, 'votes:reveal', {});
snap = await voterSnap((s) => s.code === codeM && s.status === 'revealed');
check('half value parses as numeric deck (numeric=true)', snap?.stats?.numeric === true);
check('lowest is 0.5', snap?.stats?.lowest === 0.5, JSON.stringify(snap?.stats?.lowest));
check('highest is 21', snap?.stats?.highest === 21);
check('range is 20.5', snap?.stats?.range === 20.5);
check('avg is 10.75', snap?.stats?.avg === 10.75);
check('consensus is moderate (two votes, 50/50 split)', snap?.stats?.level === 'moderate', JSON.stringify(snap?.stats?.level));

// ===========================================================================
// screen / projector role
// ===========================================================================
console.log('— screen / projector role —');
const createdS = await emitAck(host, 'room:create', { hostName: 'Sid' });
const codeS = createdS.code;
const scrJoin = await emitAck(screen, 'room:join', { code: codeS, role: 'screen' });
check('screen join ok', scrJoin?.ok === true && scrJoin?.screen === true, JSON.stringify(scrJoin));
check('screen is not a participant', scrJoin?.participantId === null);
check('screen ack snapshot shows only host', scrJoin?.snapshot?.participants?.length === 1);

const nina = await emitAck(voter, 'room:join', { code: codeS, name: 'Nina' });
check('Nina joins screen room', nina?.ok === true);
snap = await hostSnap((s) => s.code === codeS && s.participants?.length === 2);
check('host sees 2 in screen room', snap?.participants?.length === 2);

await emitAck(host, 'voting:start', {});
const scrLiveP = screenSnap((s) => s.code === codeS && s.votedIds?.length === 1);
const castS = await emitAck(voter, 'vote:cast', { value: '5' });
check('Nina votes in screen room', castS?.ok === true);
snap = await scrLiveP;
check('screen receives live broadcasts', snap?.votedIds?.length === 1);
check('screen does not see vote values pre-reveal', snap && Object.keys(snap.votes).length === 0, JSON.stringify(snap?.votes));

const scrVote = await emitAck(screen, 'vote:cast', { value: '13' });
check('screen cannot vote', scrVote?.ok === false, JSON.stringify(scrVote));

// ===========================================================================
// Room D — a participant who disconnects without voting must not deadlock
// reveal when the timer is OFF (everyoneHasVoted counts only the present)
// ===========================================================================
console.log('— room D: disconnected non-voter does not block reveal —');
const createdD = await emitAck(host, 'room:create', { hostName: 'Dan' });
const codeD = createdD.code;
const ghost = await emitAck(observer, 'room:join', { code: codeD, name: 'Ghost' });
check('Ghost joins room D', ghost?.ok === true);
const voterD = await emitAck(voter, 'room:join', { code: codeD, name: 'Ned' });
check('Ned joins room D', voterD?.ok === true);

await emitAck(host, 'voting:start', {});
snap = await hostSnap((s) => s.code === codeD && s.status === 'voting');
check('room D voting, timer off', snap?.timer === null);

observer.disconnect(); // Ghost's tab closes without voting
await sleep(700); // let the server mark Ghost disconnected
snap = await hostSnap((s) => s.code === codeD && s.participants?.some((p) => p.name === 'Ghost' && p.status === 'disconnected'));
check('Ghost marked disconnected', snap?.participants?.some((p) => p.name === 'Ghost' && p.status === 'disconnected') === true);
check('everyoneHasVoted false (Dan + Ned pending)', snap?.everyoneHasVoted === false);

const hostVoteD = await emitAck(host, 'vote:cast', { value: '3' });
check('Dan votes', hostVoteD?.ok === true);
const nedVote = await emitAck(voter, 'vote:cast', { value: '8' });
check('Ned votes', nedVote?.ok === true);
snap = await hostSnap((s) => s.code === codeD && s.votedIds?.length === 2);
check('everyone present has voted → everyoneHasVoted true', snap?.everyoneHasVoted === true);

const revealD = await emitAck(host, 'votes:reveal', {});
check('reveal ok despite disconnected non-voter', revealD?.ok === true, JSON.stringify(revealD));
snap = await voterSnap((s) => s.code === codeD && s.status === 'revealed');
check('room D revealed', snap?.status === 'revealed');
check('stats exclude the disconnected ghost', snap?.stats?.count === 2 && snap?.stats?.avg === 5.5);

host.disconnect();
voter.disconnect();
observer.disconnect();
screen.disconnect();
console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
