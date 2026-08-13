import { describe, expect, it, vi } from 'vitest';
import {
  addParticipant,
  buildSnapshot,
  calculateConsensus,
  castVote,
  computeStats,
  createRoom,
  disconnectParticipant,
  everyoneHasVoted,
  genCode,
  promoteHostIfNeeded,
  removeParticipant,
  reveal,
  setLocked,
  skipVote,
  setRevealMode,
  setTimerSec,
  startNewRound,
  startVoting,
} from '../../../server/room.mjs';

type Room = ReturnType<typeof createRoom>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A room in the VOTING state with the host seated (timer Off by default). */
function votingRoom(timerSec: number | null = null): Room {
  const room = createRoom({ hostName: 'Host' });
  if (timerSec != null) room.settings.timerSec = timerSec;
  const res = startVoting(room, room.hostId!);
  if (!res.ok) throw new Error(`helper: start failed ${res.error}`);
  return room;
}

function addNamed(room: Room, name: string) {
  return addParticipant(room, { name });
}

/** The host always exists on a freshly created room. */
const hostId = (room: Room) => room.hostId!;

// ---------------------------------------------------------------------------
// Room creation & customization
// ---------------------------------------------------------------------------

describe('createRoom', () => {
  it('creates a room in WAITING with the host seated', () => {
    const room = createRoom({ hostName: 'Ada' });
    expect(room.status).toBe('waiting');
    expect(room.participants.size).toBe(1);
    const host = room.participants.get(room.hostId!)!;
    expect(host.name).toBe('Ada');
    expect(host.role).toBe('facilitator');
    expect(host.hasVoted).toBe(false);
  });

  it('defaults host name, deck, accent and reveal mode when omitted', () => {
    const room = createRoom({});
    expect(room.participants.get(room.hostId!)!.name).toBe('Host');
    expect(room.settings.deckId).toBe('fibonacci');
    expect(room.settings.timerSec).toBeNull();
    expect(room.settings.accent).toBe('gold');
    expect(room.settings.revealMode).toBe('staggered');
    expect(room.locked).toBe(false);
  });

  it('falls back to fibonacci for an unknown deck', () => {
    expect(createRoom({ deckId: 'pokemon' }).settings.deckId).toBe('fibonacci');
  });

  it('accepts a known deck and falls back for unknown ones', () => {
    expect(createRoom({ deckId: 'tshirt' }).settings.deckId).toBe('tshirt');
    expect(createRoom({ deckId: 'sequential' }).settings.deckId).toBe('sequential');
    expect(createRoom({ deckId: 'powersOfTwo' }).settings.deckId).toBe('powersOfTwo');
    expect(createRoom({ deckId: 'modifiedFibonacci' }).settings.deckId).toBe('modifiedFibonacci');
  });

  it('stores team name and room title (clamped)', () => {
    const room = createRoom({ teamName: 'Squad', roomTitle: 'Sprint 24 Planning' });
    expect(room.teamName).toBe('Squad');
    expect(room.roomTitle).toBe('Sprint 24 Planning');
    expect(createRoom({ roomTitle: 'x'.repeat(200) }).roomTitle).toHaveLength(60);
  });

  it('stores a valid accent and falls back for unknown ones', () => {
    expect(createRoom({ accent: 'purple' }).settings.accent).toBe('purple');
    expect(createRoom({ accent: 'blue' }).settings.accent).toBe('blue');
    expect(createRoom({ accent: 'green' }).settings.accent).toBe('green');
    expect(createRoom({ accent: 'neon' }).settings.accent).toBe('gold');
  });

  it('stores a valid reveal mode and falls back for unknown ones', () => {
    expect(createRoom({ revealMode: 'normal' }).settings.revealMode).toBe('normal');
    expect(createRoom({ revealMode: 'dramatic' }).settings.revealMode).toBe('dramatic');
    expect(createRoom({ revealMode: 'slow-mo' }).settings.revealMode).toBe('staggered');
  });

  it('starts at roundId 0 and increments on every start', () => {
    const room = createRoom({ hostName: 'Host' });
    expect(room.roundId).toBe(0);
    startVoting(room, hostId(room));
    expect(room.roundId).toBe(1);
  });

  it('generates codes that never collide with existing rooms', () => {
    // Force Math.random so the first attempt is always AAAAA, then SSSSS.
    const random = vi.spyOn(Math, 'random');
    for (let i = 0; i < 5; i++) random.mockReturnValueOnce(0); // first code: AAAAA
    for (let i = 0; i < 5; i++) random.mockReturnValueOnce(0.5); // second code: SSSSS
    const code = genCode((c) => c === 'AAAAA');
    expect(code).toBe('SSSSS');
  });
});

describe('addParticipant', () => {
  it('assigns a stable identity with hue derived from the name', () => {
    const room = createRoom({ hostName: 'Host' });
    const p = addNamed(room, 'Grace');
    expect(p.role).toBe('voter');
    expect(p.status).toBe('connected');
    expect(p.hasVoted).toBe(false);
    expect(p.hue).toBeGreaterThanOrEqual(0);
    expect(p.hue).toBeLessThan(360);
    expect(addNamed(room, 'Grace').hue).toBe(p.hue); // deterministic
  });

  it('truncates long names to 32 characters', () => {
    const room = createRoom({ hostName: 'Host' });
    const p = addParticipant(room, { name: 'x'.repeat(80) });
    expect(p.name).toHaveLength(32);
  });
});

// ---------------------------------------------------------------------------
// Statistics — deck-aware (numeric vs T-Shirt)
// ---------------------------------------------------------------------------

describe('computeStats', () => {
  it('computes average, median, mode, highest, lowest and range', () => {
    const stats = computeStats(['5', '8', '8', '13'], 'fibonacci')!;
    expect(stats.count).toBe(4);
    expect(stats.numeric).toBe(true);
    expect(stats.avg).toBe(8.5);
    expect(stats.median).toBe(8);
    expect(stats.mode).toBe('8');
    expect(stats.modeShare).toBe(0.5);
    expect(stats.unique).toBe(3);
    expect(stats.highest).toBe(13);
    expect(stats.lowest).toBe(5);
    expect(stats.range).toBe(8);
    expect(stats.counts).toEqual([
      { value: '8', count: 2 },
      { value: '5', count: 1 },
      { value: '13', count: 1 },
    ]);
  });

  it('returns the middle value for an odd-sized set', () => {
    expect(computeStats(['5', '8', '13'], 'fibonacci')!.median).toBe(8);
  });

  it('averages the two middle values for an even-sized set', () => {
    expect(computeStats(['5', '8', '13', '21'], 'fibonacci')!.median).toBe(10.5);
  });

  it('handles multiple modes by picking the lowest value', () => {
    // 5 and 13 both appear twice — entries sort by count desc, then value asc.
    const stats = computeStats(['13', '5', '13', '5'], 'fibonacci')!;
    expect(stats.mode).toBe('5');
    expect(stats.modeShare).toBe(0.5);
  });

  it('returns null for zero votes', () => {
    expect(computeStats([], 'fibonacci')).toBeNull();
  });

  it('treats the ½ card (modified Fibonacci) as 0.5', () => {
    const stats = computeStats(['½', '21'], 'modifiedFibonacci')!;
    expect(stats.numeric).toBe(true);
    expect(stats.lowest).toBe(0.5);
    expect(stats.highest).toBe(21);
    expect(stats.range).toBe(20.5);
    expect(stats.avg).toBe(10.75);
  });

  it('treats T-Shirt as non-numeric: no average/median/range', () => {
    const stats = computeStats(['S', 'M', 'M', 'M'], 'tshirt')!;
    expect(stats.numeric).toBe(false);
    expect(stats.mode).toBe('M');
    expect(stats.avg).toBeNull();
    expect(stats.median).toBeNull();
    expect(stats.highest).toBeNull();
    expect(stats.lowest).toBeNull();
    expect(stats.range).toBeNull();
    expect(stats.count).toBe(4);
  });

  it('labels a single-value round as full consensus', () => {
    const stats = computeStats(['8'], 'fibonacci')!;
    expect(stats.level).toBe('full');
    expect(stats.avg).toBe(8);
    expect(stats.range).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateConsensus — deterministic thresholds (documented in docs/TRD.md)
// ---------------------------------------------------------------------------

describe('calculateConsensus', () => {
  it('returns null for no votes', () => {
    expect(calculateConsensus([])).toBeNull();
  });

  it('full when every voter picked the same card', () => {
    expect(calculateConsensus(['5', '5', '5'])).toBe('full');
  });

  it('strong when the dominant value holds ≥ 70%', () => {
    expect(calculateConsensus(['5', '5', '5', '8', '5'])).toBe('strong'); // 4/5 = 0.8
  });

  it('moderate when the dominant value holds ≥ 45%', () => {
    expect(calculateConsensus(['5', '5', '8', '8', '13'])).toBe('moderate'); // 2/5 = 0.4 → but unique ≤ 3
  });

  it('moderate when there are only a few unique values', () => {
    expect(calculateConsensus(['5', '5', '8', '8', '13', '13'])).toBe('moderate'); // 3 unique
  });

  it('large when the distribution is wide with a weak dominant value', () => {
    expect(calculateConsensus(['3', '5', '8', '13', '21'])).toBe('large'); // 1/5 = 0.2, 5 unique
  });
});

// ---------------------------------------------------------------------------
// everyoneHasVoted / privacy-aware snapshots
// ---------------------------------------------------------------------------

describe('everyoneHasVoted', () => {
  it('is false for an empty or pre-vote room', () => {
    const room = createRoom({ hostName: 'Host' });
    expect(everyoneHasVoted(room)).toBe(false);
    addNamed(room, 'Grace');
    expect(everyoneHasVoted(room)).toBe(false);
  });

  it('is true only when every present participant has voted', () => {
    const room = votingRoom();
    const grace = addNamed(room, 'Grace');
    castVote(room, hostId(room), '5');
    expect(everyoneHasVoted(room)).toBe(false);
    castVote(room, grace.id, '8');
    expect(everyoneHasVoted(room)).toBe(true);
  });

  it('ignores participants who disconnected without voting', () => {
    const room = votingRoom();
    const ghost = addNamed(room, 'Ghost');
    const ned = addNamed(room, 'Ned');
    disconnectParticipant(room, ghost.id);
    castVote(room, hostId(room), '3');
    castVote(room, ned.id, '8');
    expect(everyoneHasVoted(room)).toBe(true);
  });
});

describe('buildSnapshot', () => {
  it('hides vote values and stats before the reveal', () => {
    const room = votingRoom();
    const grace = addNamed(room, 'Grace');
    castVote(room, grace.id, '8');
    const snap = buildSnapshot(room);
    expect(snap.votedIds).toContain(grace.id);
    expect(snap.votes).toEqual({});
    expect(snap.stats).toBeNull();
    expect(snap.timer).toBeNull();
  });

  it('exposes values and stats only once revealed', () => {
    const room = votingRoom();
    const grace = addNamed(room, 'Grace');
    castVote(room, hostId(room), '5');
    castVote(room, grace.id, '8');
    reveal(room, hostId(room));
    const snap = buildSnapshot(room);
    expect(snap.status).toBe('revealed');
    expect(snap.votes[grace.id]).toBe('8');
    expect(snap.stats!.count).toBe(2);
  });

  it('ships the round id in the snapshot', () => {
    expect(buildSnapshot(votingRoom()).roundId).toBe(1);
    expect(buildSnapshot(createRoom({ hostName: 'Host' })).roundId).toBe(0);
  });

  it('carries the room customization into the snapshot', () => {
    const room = createRoom({ teamName: 'T', roomTitle: 'R', accent: 'blue', revealMode: 'dramatic' });
    const snap = buildSnapshot(room);
    expect(snap.teamName).toBe('T');
    expect(snap.roomTitle).toBe('R');
    expect(snap.settings.accent).toBe('blue');
    expect(snap.settings.revealMode).toBe('dramatic');
    expect(snap.locked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// startVoting — host-only, WAITING-only
// ---------------------------------------------------------------------------

describe('startVoting', () => {
  it('transitions WAITING → VOTING and clears the previous round', () => {
    const room = createRoom({ hostName: 'Host' });
    addNamed(room, 'Grace');
    const res = startVoting(room, hostId(room));
    expect(res).toEqual({ ok: true });
    expect(room.status).toBe('voting');
    expect(room.votes).toEqual({});
    for (const p of room.participants.values()) {
      expect(p.hasVoted).toBe(false);
      expect(p.status).toBe('connected');
    }
  });

  it('rejects a participant', () => {
    const room = createRoom({ hostName: 'Host' });
    const grace = addNamed(room, 'Grace');
    expect(startVoting(room, grace.id)).toEqual({ ok: false, error: 'not_host' });
  });

  it('rejects starting an already-started room', () => {
    const room = votingRoom();
    expect(startVoting(room, hostId(room))).toEqual({ ok: false, error: 'in_progress' });
  });

  it('arms the timer from settings when one is selected', () => {
    const room = createRoom({ hostName: 'Host' });
    room.settings.timerSec = 10;
    const before = Date.now();
    startVoting(room, hostId(room));
    expect(room.timer!.durationSec).toBe(10);
    expect(room.timer!.endsAt).toBeGreaterThanOrEqual(before + 10_000);
  });

  it('keeps the timer null when Off', () => {
    expect(votingRoom(null).timer).toBeNull();
  });

  it('stores a sanitized story and ships it in the snapshot', () => {
    const room = createRoom({ hostName: 'Host' });
    const res = startVoting(room, hostId(room), { id: 'PROJ-143', title: '  User Profile  ', description: 'As a user…' });
    expect(res).toEqual({ ok: true });
    expect(room.story).toEqual({ id: 'PROJ-143', title: 'User Profile', description: 'As a user…' });
    expect(buildSnapshot(room).story).toEqual({ id: 'PROJ-143', title: 'User Profile', description: 'As a user…' });
  });

  it('clamps story fields and drops a story with no content', () => {
    const room = createRoom({ hostName: 'Host' });
    startVoting(room, hostId(room), { id: 'x'.repeat(80), title: 't'.repeat(120), description: 'd'.repeat(300) });
    expect(room.story!.id).toHaveLength(32);
    expect(room.story!.title).toHaveLength(80);
    expect(room.story!.description).toHaveLength(200);
    expect(createRoom({ hostName: 'H' }).story).toBeNull();
    const room2 = createRoom({ hostName: 'Host' });
    startVoting(room2, hostId(room2), { id: '   ', title: '', description: '   ' });
    expect(room2.story).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// castVote — the permanent lock, enforced here
// ---------------------------------------------------------------------------

describe('castVote', () => {
  it('accepts a first vote and locks it immediately', () => {
    const room = votingRoom();
    const grace = addNamed(room, 'Grace');
    const res = castVote(room, grace.id, '8');
    expect(res).toEqual({ ok: true });
    expect(room.votes[grace.id]).toBe('8');
    expect(room.participants.get(grace.id)!.hasVoted).toBe(true);
    expect(room.participants.get(grace.id)!.status).toBe('voted');
  });

  it('rejects a duplicate vote and keeps the original', () => {
    const room = votingRoom();
    const grace = addNamed(room, 'Grace');
    castVote(room, grace.id, '8');
    const dup = castVote(room, grace.id, '13');
    expect(dup).toEqual({ ok: false, error: 'already_voted' });
    expect(room.votes[grace.id]).toBe('8'); // unchanged
  });

  it('rejects voting before the round starts', () => {
    const room = createRoom({ hostName: 'Host' });
    const grace = addNamed(room, 'Grace');
    expect(castVote(room, grace.id, '8')).toEqual({ ok: false, error: 'not_voting' });
  });

  it('rejects voting after the reveal', () => {
    const room = votingRoom();
    const grace = addNamed(room, 'Grace');
    castVote(room, grace.id, '8');
    castVote(room, hostId(room), '5');
    reveal(room, hostId(room));
    expect(castVote(room, grace.id, '13')).toEqual({ ok: false, error: 'revealed' });
  });

  it('rejects a vote landing after the timer expired and closes the round', () => {
    const room = votingRoom(10);
    const grace = addNamed(room, 'Grace');
    room.timer!.endsAt = Date.now() - 1000; // the server sweep would have flipped this
    const res = castVote(room, grace.id, '8') as { ok: false; error: string; timerEnded: boolean };
    expect(res.ok).toBe(false);
    expect(res.error).toBe('not_voting');
    expect(res.timerEnded).toBe(true);
    expect(room.status).toBe('ended');
    expect(room.votes[grace.id]).toBeUndefined();
  });

  it('rejects a missing participant', () => {
    const room = votingRoom();
    expect(castVote(room, 'nobody', '8')).toEqual({ ok: false, error: 'not_found' });
  });

  it('rejects an empty value', () => {
    const room = votingRoom();
    const grace = addNamed(room, 'Grace');
    expect(castVote(room, grace.id, '')).toEqual({ ok: false, error: 'no_value' });
  });

  it('rejects a value that is not on the room deck (bad_value)', () => {
    const room = votingRoom(); // fibonacci: 1 2 3 5 8 13 21
    const grace = addNamed(room, 'Grace');
    expect(castVote(room, grace.id, '99')).toEqual({ ok: false, error: 'bad_value' });
    expect(castVote(room, grace.id, 'M')).toEqual({ ok: false, error: 'bad_value' });
    expect(room.votes[grace.id]).toBeUndefined();
  });

  it('accepts every value of the room deck, including ½ on modified Fibonacci', () => {
    const room = votingRoom();
    room.settings.deckId = 'modifiedFibonacci';
    const grace = addNamed(room, 'Grace');
    expect(castVote(room, grace.id, '½')).toEqual({ ok: true });
  });

  it('rejects a ½ on a deck that does not contain it', () => {
    const room = votingRoom(); // fibonacci
    const grace = addNamed(room, 'Grace');
    expect(castVote(room, grace.id, '½')).toEqual({ ok: false, error: 'bad_value' });
  });

  it('reports already_voted before the timer check for a returning voter', () => {
    const room = votingRoom(10);
    const grace = addNamed(room, 'Grace');
    castVote(room, grace.id, '8');
    room.timer!.endsAt = Date.now() - 1000; // timer expired after they voted
    const dup = castVote(room, grace.id, '13') as { ok: false; error: string; timerEnded?: boolean };
    expect(dup.error).toBe('already_voted');
    expect(dup.timerEnded).toBeUndefined();
    expect(room.votes[grace.id]).toBe('8');
  });
});

// ---------------------------------------------------------------------------
// skipVote — host-only: sit the round out, count as done, no vote value
// ---------------------------------------------------------------------------

describe('skipVote', () => {
  it('marks the host as done without adding a vote value', () => {
    const room = votingRoom();
    const res = skipVote(room, hostId(room));
    expect(res).toEqual({ ok: true });
    expect(room.participants.get(hostId(room))!.hasVoted).toBe(true);
    expect(room.participants.get(hostId(room))!.skipped).toBe(true);
    expect(room.participants.get(hostId(room))!.status).toBe('voted');
    expect(room.votes[hostId(room)]).toBeUndefined();
  });

  it('unlocks everyoneHasVoted once the rest of the table has voted', () => {
    const room = votingRoom();
    const grace = addNamed(room, 'Grace');
    skipVote(room, hostId(room));
    expect(everyoneHasVoted(room)).toBe(false); // Grace is still thinking
    castVote(room, grace.id, '8');
    expect(everyoneHasVoted(room)).toBe(true);
  });

  it('keeps skipped hosts out of the stats', () => {
    const room = votingRoom();
    const grace = addNamed(room, 'Grace');
    skipVote(room, hostId(room));
    castVote(room, grace.id, '8');
    reveal(room, hostId(room));
    expect(room.status).toBe('revealed');
    expect(room.stats!.count).toBe(1); // only Grace's value counts
    expect(Object.keys(room.votes)).toEqual([grace.id]);
  });

  it('rejects a non-host actor', () => {
    const room = votingRoom();
    const grace = addNamed(room, 'Grace');
    expect(skipVote(room, grace.id)).toEqual({ ok: false, error: 'not_host' });
    expect(room.participants.get(grace.id)!.skipped).toBe(false);
  });

  it('rejects skipping outside the voting phase', () => {
    const room = createRoom({ hostName: 'Host' }); // waiting
    expect(skipVote(room, hostId(room))).toEqual({ ok: false, error: 'not_voting' });
  });

  it('rejects a second skip or a skip after voting (already_voted)', () => {
    const room = votingRoom();
    skipVote(room, hostId(room));
    expect(skipVote(room, hostId(room))).toEqual({ ok: false, error: 'already_voted' });
    const room2 = votingRoom();
    castVote(room2, hostId(room2), '5');
    expect(skipVote(room2, hostId(room2))).toEqual({ ok: false, error: 'already_voted' });
  });

  it('closes the round when a skip lands after the timer expired', () => {
    const room = votingRoom(10);
    room.timer!.endsAt = Date.now() - 1000;
    const res = skipVote(room, hostId(room)) as { ok: false; error: string; timerEnded: boolean };
    expect(res.ok).toBe(false);
    expect(res.error).toBe('not_voting');
    expect(res.timerEnded).toBe(true);
    expect(room.status).toBe('ended');
    expect(room.participants.get(hostId(room))!.skipped).toBe(false);
  });

  it('resets the skip when the next round starts', () => {
    const room = votingRoom();
    const grace = addNamed(room, 'Grace');
    skipVote(room, hostId(room));
    castVote(room, grace.id, '8');
    reveal(room, hostId(room)); // REVEALED — startNewRound is legal from here
    expect(room.participants.get(hostId(room))!.skipped).toBe(true);
    startNewRound(room, hostId(room));
    expect(room.participants.get(hostId(room))!.skipped).toBe(false);
    expect(room.participants.get(hostId(room))!.hasVoted).toBe(false);
  });

  it('ships skippedIds in the snapshot (but only the host skips)', () => {
    const room = votingRoom();
    const grace = addNamed(room, 'Grace');
    skipVote(room, hostId(room));
    const snap = buildSnapshot(room);
    expect(snap.skippedIds).toEqual([hostId(room)]);
    expect(snap.skippedIds).not.toContain(grace.id);
    expect(snap.votedIds).toEqual([]); // no vote value, so not in votedIds
  });
});

// ---------------------------------------------------------------------------
// reveal — host-only, legal after ENDED or once everyone has voted
// ---------------------------------------------------------------------------

describe('reveal', () => {
  it('rejects a non-host', () => {
    const room = votingRoom();
    const grace = addNamed(room, 'Grace');
    castVote(room, grace.id, '8');
    expect(reveal(room, grace.id)).toEqual({ ok: false, error: 'not_host' });
  });

  it('rejects revealing from the waiting room', () => {
    const room = createRoom({ hostName: 'Host' });
    expect(reveal(room, hostId(room))).toEqual({ ok: false, error: 'not_started' });
  });

  it('rejects revealing while someone is still thinking', () => {
    const room = votingRoom();
    const grace = addNamed(room, 'Grace');
    castVote(room, grace.id, '8'); // host has not voted
    expect(reveal(room, hostId(room))).toEqual({ ok: false, error: 'not_all_voted' });
  });

  it('allows reveal straight from VOTING once everyone has voted', () => {
    const room = votingRoom();
    const grace = addNamed(room, 'Grace');
    castVote(room, grace.id, '8');
    castVote(room, hostId(room), '5');
    const res = reveal(room, hostId(room));
    expect(res).toEqual({ ok: true });
    expect(room.status).toBe('revealed');
    expect(room.stats!.avg).toBe(6.5);
    expect(room.timer).toBeNull();
  });

  it('allows reveal after the timer ended the round (even with non-voters)', () => {
    const room = votingRoom(10);
    const grace = addNamed(room, 'Grace');
    castVote(room, grace.id, '5');
    room.status = 'ended'; // the server sweep just fired
    const res = reveal(room, hostId(room));
    expect(res).toEqual({ ok: true });
    expect(room.stats!.count).toBe(1); // non-voter excluded
  });

  it('computes deck-aware stats on reveal (T-Shirt has no average)', () => {
    const room = votingRoom();
    room.settings.deckId = 'tshirt';
    const grace = addNamed(room, 'Grace');
    castVote(room, grace.id, 'M');
    castVote(room, hostId(room), 'M');
    reveal(room, hostId(room));
    expect(room.stats!.numeric).toBe(false);
    expect(room.stats!.mode).toBe('M');
    expect(room.stats!.avg).toBeNull();
  });

  it('rejects a second reveal', () => {
    const room = votingRoom();
    const grace = addNamed(room, 'Grace');
    castVote(room, grace.id, '8');
    castVote(room, hostId(room), '5');
    reveal(room, hostId(room));
    expect(reveal(room, hostId(room))).toEqual({ ok: false, error: 'already_revealed' });
  });
});

// ---------------------------------------------------------------------------
// startNewRound — next story in the SAME room: round payload resets, the
// room (code / host / participants / settings / lock) is untouched
// ---------------------------------------------------------------------------

describe('startNewRound', () => {
  /** A room in REVEALED with 2 participants, a story and votes on the board. */
  function finishedRoom(): { room: Room; graceId: string } {
    const room = createRoom({ hostName: 'Host' });
    room.settings.timerSec = 15;
    const grace = addNamed(room, 'Grace');
    startVoting(room, hostId(room), { id: 'PROJ-1', title: 'Password Reset' });
    castVote(room, hostId(room), '5');
    castVote(room, grace.id, '8');
    room.timer!.endsAt = Date.now() - 1000; // timer expired after the votes landed
    room.status = 'ended';
    reveal(room, hostId(room));
    expect(room.status).toBe('revealed');
    return { room, graceId: grace.id };
  }    it('resets the round payload back to WAITING for a fresh story', () => {
    const { room } = finishedRoom();
    expect(Object.keys(room.votes).length).toBe(2);
    expect(room.stats).not.toBeNull();
    expect(room.story).not.toBeNull();

    const res = startNewRound(room, hostId(room));
    expect(res).toEqual({ ok: true });
    expect(room.status).toBe('waiting');
    expect(room.votes).toEqual({});
    expect(room.stats).toBeNull();
    expect(room.story).toBeNull();
    expect(room.timer).toBeNull();
    for (const p of room.participants.values()) {
      expect(p.hasVoted).toBe(false);
      expect(p.status).toBe('connected');
    }
  });

  it('keeps the room identity: code, roundId, host, participants, settings, lock', () => {
    const { room, graceId } = finishedRoom();
    const code = room.code;
    const roundId = room.roundId;
    const host = hostId(room);
    const settings = { ...room.settings };
    setLocked(room, hostId(room), true);

    startNewRound(room, hostId(room));

    expect(room.code).toBe(code);
    expect(room.roundId).toBe(roundId); // next round's id is assigned by startVoting
    expect(room.hostId).toBe(host);
    expect(room.participants.size).toBe(2);
    expect(room.participants.has(graceId)).toBe(true);
    expect(room.settings).toEqual(settings);
    expect(room.locked).toBe(true);
  });

  it('rejects a non-host actor', () => {
    const { room, graceId } = finishedRoom();
    expect(startNewRound(room, graceId)).toEqual({ ok: false, error: 'not_host' });
    expect(room.status).toBe('revealed');
  });

  it('is idempotent: rejected while WAITING or VOTING (double-click / second tab)', () => {
    const { room } = finishedRoom();
    startNewRound(room, hostId(room));
    // Now WAITING — a racing duplicate click must be rejected, so only one
    // new round can ever be opened.
    expect(startNewRound(room, hostId(room))).toEqual({ ok: false, error: 'in_progress' });
    const voting = votingRoom();
    expect(startNewRound(voting, hostId(voting))).toEqual({ ok: false, error: 'in_progress' });
  });

  it('can abandon an ENDED round (timer up) without a reveal', () => {
    const room = votingRoom(10);
    const grace = addNamed(room, 'Grace');
    castVote(room, grace.id, '8');
    room.status = 'ended';
    expect(startNewRound(room, hostId(room))).toEqual({ ok: true });
    expect(room.status).toBe('waiting');
    expect(room.votes).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// setTimerSec — only the host, only in the waiting room, only 10/15/30/null
// ---------------------------------------------------------------------------

describe('setTimerSec', () => {
  it('accepts Off and the three allowed presets', () => {
    const room = createRoom({ hostName: 'Host' });
    for (const sec of [null, 10, 15, 30]) {
      expect(setTimerSec(room, hostId(room), sec)).toEqual({ ok: true });
      expect(room.settings.timerSec).toBe(sec);
    }
  });

  it('rejects anything outside 10/15/30', () => {
    const room = createRoom({ hostName: 'Host' });
    for (const sec of [5, 45, 60, 120, 'banana']) {
      expect(setTimerSec(room, hostId(room), sec)).toEqual({ ok: false, error: 'bad_timer' });
    }
  });

  it('rejects non-host changes', () => {
    const room = createRoom({ hostName: 'Host' });
    const grace = addNamed(room, 'Grace');
    expect(setTimerSec(room, grace.id, 10)).toEqual({ ok: false, error: 'not_host' });
  });

  it('rejects changes once voting has started', () => {
    const room = votingRoom();
    expect(setTimerSec(room, hostId(room), 10)).toEqual({ ok: false, error: 'in_progress' });
  });
});

// ---------------------------------------------------------------------------
// setRevealMode — host-only, waiting-room-only, one of three modes
// ---------------------------------------------------------------------------

describe('setRevealMode', () => {
  it('accepts the three modes and stores them', () => {
    const room = createRoom({ hostName: 'Host' });
    for (const mode of ['normal', 'staggered', 'dramatic']) {
      expect(setRevealMode(room, hostId(room), mode)).toEqual({ ok: true });
      expect(room.settings.revealMode).toBe(mode);
    }
  });

  it('rejects unknown modes', () => {
    const room = createRoom({ hostName: 'Host' });
    expect(setRevealMode(room, hostId(room), 'slidey')).toEqual({ ok: false, error: 'bad_reveal_mode' });
  });

  it('rejects non-host and post-start changes', () => {
    const room = createRoom({ hostName: 'Host' });
    const grace = addNamed(room, 'Grace');
    expect(setRevealMode(room, grace.id, 'normal')).toEqual({ ok: false, error: 'not_host' });
    const started = votingRoom();
    expect(setRevealMode(started, hostId(started), 'normal')).toEqual({ ok: false, error: 'in_progress' });
  });
});

// ---------------------------------------------------------------------------
// setLocked — host-only, any phase, guards new joiners
// ---------------------------------------------------------------------------

describe('setLocked', () => {
  it('locks and unlocks the room for the host', () => {
    const room = createRoom({ hostName: 'Host' });
    expect(setLocked(room, hostId(room), true)).toEqual({ ok: true });
    expect(room.locked).toBe(true);
    expect(setLocked(room, hostId(room), false)).toEqual({ ok: true });
    expect(room.locked).toBe(false);
  });

  it('rejects non-host changes', () => {
    const room = createRoom({ hostName: 'Host' });
    const grace = addNamed(room, 'Grace');
    expect(setLocked(room, grace.id, true)).toEqual({ ok: false, error: 'not_host' });
    expect(room.locked).toBe(false);
  });

  it('works in any phase (not just the waiting room)', () => {
    const room = votingRoom();
    expect(setLocked(room, hostId(room), true)).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// removeParticipant & disconnectParticipant
// ---------------------------------------------------------------------------

describe('removeParticipant', () => {
  it('host can remove a voter and their vote', () => {
    const room = votingRoom();
    const grace = addNamed(room, 'Grace');
    castVote(room, grace.id, '8');
    const res = removeParticipant(room, hostId(room), grace.id);
    expect(res).toEqual({ ok: true, removedId: grace.id });
    expect(room.participants.has(grace.id)).toBe(false);
    expect(room.votes[grace.id]).toBeUndefined();
  });

  it('rejects removing the host themself', () => {
    const room = createRoom({ hostName: 'Host' });
    expect(removeParticipant(room, hostId(room), hostId(room))).toEqual({ ok: false, error: 'cannot_remove' });
  });

  it('rejects non-host removals and unknown targets', () => {
    const room = createRoom({ hostName: 'Host' });
    const grace = addNamed(room, 'Grace');
    expect(removeParticipant(room, grace.id, hostId(room))).toEqual({ ok: false, error: 'not_host' });
    expect(removeParticipant(room, hostId(room), 'nobody')).toEqual({ ok: false, error: 'no_participant' });
  });
});

describe('disconnectParticipant', () => {
  it('marks the participant disconnected', () => {
    const room = createRoom({ hostName: 'Host' });
    const grace = addNamed(room, 'Grace');
    disconnectParticipant(room, grace.id);
    expect(room.participants.get(grace.id)!.status).toBe('disconnected');
  });

  it('sets emptySince only when the last participant leaves', () => {
    const room = createRoom({ hostName: 'Host' });
    const grace = addNamed(room, 'Grace');
    disconnectParticipant(room, grace.id);
    expect(room.emptySince).toBeNull(); // host still present
    disconnectParticipant(room, hostId(room));
    expect(room.emptySince).not.toBeNull();
  });

  it('keeps a disconnected host as host (they reclaim it on rejoin)', () => {
    const room = createRoom({ hostName: 'Host' });
    const original = hostId(room);
    addNamed(room, 'Grace');
    disconnectParticipant(room, hostId(room));
    expect(room.hostId).toBe(original);
  });

  it('promotes the longest-connected participant when the host vanishes entirely', () => {
    const room = createRoom({ hostName: 'Host' });
    const grace = addNamed(room, 'Grace');
    addNamed(room, 'Ned');
    room.participants.delete(room.hostId!); // host participant is gone
    promoteHostIfNeeded(room);
    expect(room.hostId).toBe(grace.id); // joined before Ned
  });
});
