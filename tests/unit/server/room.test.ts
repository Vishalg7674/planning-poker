import { describe, expect, it, vi } from 'vitest';
import {
  MLT_PREDICTOR_BONUS,
  MLT_RANKING_POINTS,
  addParticipant,
  buildSnapshot,
  calculateConsensus,
  castVote,
  computeMltResult,
  computeStats,
  computeWyrStats,
  createRoom,
  disconnectParticipant,
  everyoneHasVoted,
  finishMlt,
  genCode,
  isNameTaken,
  nextPrompt,
  nextQuestion,
  normalizePrompts,
  normalizeQuestions,
  playAgainMlt,
  promoteHostIfNeeded,
  removeParticipant,
  reveal,
  setLocked,
  setRevealMode,
  setTimerSec,
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

describe('isNameTaken', () => {
  it('is false when no one at the table has the name', () => {
    const room = createRoom({ hostName: 'Ada' });
    expect(isNameTaken(room, 'Grace')).toBe(false);
  });

  it('is true when the host or a participant already uses the name', () => {
    const room = createRoom({ hostName: 'Ada' });
    expect(isNameTaken(room, 'ada')).toBe(true); // case-insensitive
    expect(isNameTaken(room, '  Ada  ')).toBe(true); // trimmed
    addNamed(room, 'Grace');
    expect(isNameTaken(room, 'grace')).toBe(true);
  });

  it('is false for empty or blank names', () => {
    const room = createRoom({ hostName: 'Ada' });
    expect(isNameTaken(room, '')).toBe(false);
    expect(isNameTaken(room, '   ')).toBe(false);
    expect(isNameTaken(room, undefined)).toBe(false);
  });

  it('ignores the excluded participant (their own seat on rejoin)', () => {
    const room = createRoom({ hostName: 'Ada' });
    const grace = addNamed(room, 'Grace');
    expect(isNameTaken(room, 'Grace', grace.id)).toBe(false);
    // A different participant's name is still taken even with an excludeId.
    expect(isNameTaken(room, 'Ada', grace.id)).toBe(true);
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
// Would You Rather — game rooms, A/B voting, per-question rounds
// ---------------------------------------------------------------------------

const wyrQuestions = [
  { a: 'Have the ability to fly', b: 'Have the ability to be invisible' },
  { a: 'Always be 10 minutes early', b: 'Always be 10 minutes late' },
  { a: 'Work from home forever', b: 'Work in the office forever' },
];

/** A WYR room in the VOTING state with the host seated. */
function wyrVotingRoom(questions = wyrQuestions): Room {
  const room = createRoom({ hostName: 'Host', game: 'would-you-rather', questions });
  const res = startVoting(room, room.hostId!);
  if (!res.ok) throw new Error(`helper: start failed ${res.error}`);
  return room;
}

describe('createRoom (would-you-rather)', () => {
  it('defaults to planning-poker when game is omitted or unknown', () => {
    expect(createRoom({}).game).toBe('planning-poker');
    expect(createRoom({ game: 'wyr' }).game).toBe('planning-poker');
  });

  it('stores the sanitized question deck for a WYR room', () => {
    const room = createRoom({ game: 'would-you-rather', questions: wyrQuestions });
    expect(room.game).toBe('would-you-rather');
    expect(room.questions).toEqual(wyrQuestions);
    expect(room.questionIndex).toBe(-1); // no active question yet
  });

  it('falls back to the built-in bank when no valid questions survive', () => {
    const empty = createRoom({ game: 'would-you-rather', questions: [] });
    expect(empty.questions.length).toBeGreaterThan(0);
    const garbage = createRoom({ game: 'would-you-rather', questions: [{ a: '', b: '' }, 'nope', null] });
    expect(garbage.questions.length).toBeGreaterThan(0);
    const nonList = createRoom({ game: 'would-you-rather' });
    expect(nonList.questions.length).toBeGreaterThan(0);
  });

  it('drops empty options and clamps the deck to 20 questions', () => {
    const room = createRoom({
      game: 'would-you-rather',
      questions: [
        ...wyrQuestions,
        { a: 'Only valid', b: '' }, // dropped
        ...Array.from({ length: 30 }, (_, i) => ({ a: `A${i}`, b: `B${i}` })),
      ],
    });
    expect(room.questions).toHaveLength(20);
    expect(room.questions.some((q) => q.a === 'Only valid')).toBe(false);
  });

  it('trims and clamps question option text', () => {
    const room = createRoom({
      game: 'would-you-rather',
      questions: [{ a: '  fly  ', b: 'x'.repeat(300) }],
    });
    expect(room.questions[0].a).toBe('fly');
    expect(room.questions[0].b).toHaveLength(120);
  });
});

describe('normalizeQuestions', () => {
  it('passes through valid {a, b} pairs', () => {
    expect(normalizeQuestions(wyrQuestions)).toEqual(wyrQuestions);
  });

  it('returns the default bank for non-array input', () => {
    expect(normalizeQuestions(undefined)).toHaveLength(5);
  });
});

describe('computeWyrStats', () => {
  it('returns null for zero votes', () => {
    expect(computeWyrStats([])).toBeNull();
  });

  it('computes the A/B split with non-numeric stats', () => {
    const stats = computeWyrStats(['A', 'B', 'A'])!;
    expect(stats.count).toBe(3);
    expect(stats.numeric).toBe(false);
    expect(stats.avg).toBeNull();
    expect(stats.mode).toBe('A');
    expect(stats.modeShare).toBe(0.667); // rounded to 3 decimals
    expect(stats.unique).toBe(2);
    expect(stats.counts).toEqual([
      { value: 'A', count: 2 },
      { value: 'B', count: 1 },
    ]);
  });

  it('labels a unanimous room as full consensus', () => {
    expect(computeWyrStats(['B', 'B'])!.level).toBe('full');
  });

  it('labels an even split as moderate', () => {
    expect(computeWyrStats(['A', 'B'])!.level).toBe('moderate');
  });
});

describe('WYR voting', () => {
  it('accepts only A or B — a deck card is rejected', () => {
    const room = wyrVotingRoom();
    const grace = addNamed(room, 'Grace');
    expect(castVote(room, grace.id, '8')).toEqual({ ok: false, error: 'bad_value' });
    expect(castVote(room, grace.id, 'C')).toEqual({ ok: false, error: 'bad_value' });
    expect(castVote(room, grace.id, 'A')).toEqual({ ok: true });
  });

  it('locks a pick per question — nextQuestion resets the lock', () => {
    const room = wyrVotingRoom();
    const grace = addNamed(room, 'Grace');
    castVote(room, grace.id, 'A');
    expect(castVote(room, grace.id, 'B')).toEqual({ ok: false, error: 'already_voted' });
    // Host reveals and advances — the same participant may vote again.
    castVote(room, hostId(room), 'B');
    reveal(room, hostId(room));
    const res = nextQuestion(room, hostId(room));
    expect(res).toEqual({ ok: true, done: false });
    expect(room.questionIndex).toBe(1);
    expect(room.votes).toEqual({});
    expect(room.participants.get(grace.id)!.hasVoted).toBe(false);
    expect(castVote(room, grace.id, 'B')).toEqual({ ok: true });
  });

  it('the host may reveal mid-question without waiting for everyone', () => {
    const room = wyrVotingRoom();
    const grace = addNamed(room, 'Grace');
    castVote(room, grace.id, 'A'); // host hasn't picked
    const res = reveal(room, hostId(room));
    expect(res).toEqual({ ok: true });
    expect(room.stats!.count).toBe(1);
    expect(room.stats!.mode).toBe('A');
  });

  it('a zero-pick reveal closes the question with null stats (UI shows the empty state)', () => {
    const room = wyrVotingRoom();
    addNamed(room, 'Grace'); // nobody picks
    const res = reveal(room, hostId(room));
    expect(res).toEqual({ ok: true });
    expect(room.status).toBe('revealed');
    expect(room.stats).toBeNull();
  });

  it('hides pick values until the reveal', () => {
    const room = wyrVotingRoom();
    const grace = addNamed(room, 'Grace');
    castVote(room, grace.id, 'B');
    const snap = buildSnapshot(room);
    expect(snap.votedIds).toContain(grace.id);
    expect(snap.votes).toEqual({});
    expect(snap.stats).toBeNull();
  });
});

describe('WYR snapshot', () => {
  it('exposes the active question once the round starts', () => {
    const room = wyrVotingRoom();
    const snap = buildSnapshot(room);
    expect(snap.game).toBe('would-you-rather');
    expect(snap.question).toEqual(wyrQuestions[0]);
    expect(snap.questionIndex).toBe(0);
    expect(snap.questionCount).toBe(3);
  });

  it('keeps the question null while waiting', () => {
    const room = createRoom({ game: 'would-you-rather', questions: wyrQuestions });
    const snap = buildSnapshot(room);
    expect(snap.question).toBeNull();
    expect(snap.questionCount).toBe(3);
  });

  it('shows the revealed split values like every other game', () => {
    const room = wyrVotingRoom([wyrQuestions[0]]);
    const grace = addNamed(room, 'Grace');
    castVote(room, grace.id, 'A');
    castVote(room, hostId(room), 'A');
    reveal(room, hostId(room));
    const snap = buildSnapshot(room);
    expect(snap.votes[grace.id]).toBe('A');
    expect(snap.stats!.counts).toEqual([{ value: 'A', count: 2 }]);
  });
});

describe('nextQuestion', () => {
  it('rejects non-hosts', () => {
    const room = wyrVotingRoom();
    const grace = addNamed(room, 'Grace');
    expect(nextQuestion(room, grace.id)).toEqual({ ok: false, error: 'not_host' });
  });

  it('is a no-op for planning-poker rooms', () => {
    const room = votingRoom();
    expect(nextQuestion(room, hostId(room))).toEqual({ ok: false, error: 'not_this_game' });
  });

  it('requires the room to be revealed first', () => {
    const room = wyrVotingRoom();
    expect(nextQuestion(room, hostId(room))).toEqual({ ok: false, error: 'not_revealed' });
  });

  it('advances through the deck and signals done at the end', () => {
    const room = wyrVotingRoom([wyrQuestions[0], wyrQuestions[1]]);
    castVote(room, hostId(room), 'A');
    reveal(room, hostId(room));
    const first = nextQuestion(room, hostId(room));
    expect(first).toEqual({ ok: true, done: false });
    expect(room.questionIndex).toBe(1);
    expect(room.status).toBe('voting');
    castVote(room, hostId(room), 'B');
    reveal(room, hostId(room));
    const last = nextQuestion(room, hostId(room));
    expect(last).toEqual({ ok: true, done: true });
    expect(room.questionIndex).toBe(1); // deck exhausted — stays put
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

// ---------------------------------------------------------------------------
// Most Likely To — nomination rounds, crown scoring, predictor bonus
// ---------------------------------------------------------------------------

const mltPrompts = ['Forget their laptop at home', 'Reply-all to everyone', 'Show up 10 minutes late'];

/** An MLT room in the VOTING state with the host seated. */
function mltVotingRoom(prompts = mltPrompts): Room {
  const room = createRoom({ hostName: 'Host', game: 'most-likely-to', prompts });
  const res = startVoting(room, room.hostId!);
  if (!res.ok) throw new Error(`helper: start failed ${res.error}`);
  return room;
}

describe('createRoom (most-likely-to)', () => {
  it('stores the sanitized prompt deck for an MLT room', () => {
    const room = createRoom({ game: 'most-likely-to', prompts: mltPrompts });
    expect(room.game).toBe('most-likely-to');
    expect(room.prompts).toEqual(mltPrompts);
    expect(room.promptIndex).toBe(-1); // no active prompt yet
    expect(room.mltScores).toEqual({});
    expect(room.mltResult).toBeNull();
    expect(room.sessionOver).toBe(false);
  });

  it('falls back to the built-in bank when no valid prompts survive', () => {
    const empty = createRoom({ game: 'most-likely-to', prompts: [] });
    expect(empty.prompts.length).toBeGreaterThan(0);
    const garbage = createRoom({ game: 'most-likely-to', prompts: ['', '   ', 42, null] });
    expect(garbage.prompts.length).toBeGreaterThan(0);
    const nonList = createRoom({ game: 'most-likely-to' });
    expect(nonList.prompts.length).toBeGreaterThan(0);
  });

  it('drops blank prompts and clamps the deck to 12', () => {
    const room = createRoom({
      game: 'most-likely-to',
      prompts: [...mltPrompts, '', '   ', ...Array.from({ length: 30 }, (_, i) => `Prompt ${i}`)],
    });
    expect(room.prompts).toHaveLength(12);
    expect(room.prompts.some((p) => !p.trim())).toBe(false);
  });

  it('trims and clamps prompt text', () => {
    const room = createRoom({ game: 'most-likely-to', prompts: ['  spaced  ', 'x'.repeat(300)] });
    expect(room.prompts[0]).toBe('spaced');
    expect(room.prompts[1]).toHaveLength(160);
  });
});

describe('normalizePrompts', () => {
  it('passes through valid prompt strings', () => {
    expect(normalizePrompts(mltPrompts)).toEqual(mltPrompts);
  });

  it('returns the default bank for non-array input', () => {
    expect(normalizePrompts(undefined).length).toBeGreaterThan(0);
  });
});

describe('MLT voting', () => {
  it('startVoting puts prompt 0 on the table', () => {
    const room = mltVotingRoom();
    expect(room.status).toBe('voting');
    expect(room.promptIndex).toBe(0);
  });

  it('accepts a nomination for a real teammate and locks it', () => {
    const room = mltVotingRoom();
    const grace = addNamed(room, 'Grace');
    const res = castVote(room, hostId(room), grace.id);
    expect(res).toEqual({ ok: true });
    expect(room.votes[hostId(room)]).toBe(grace.id);
    expect(room.participants.get(hostId(room))!.hasVoted).toBe(true);
  });

  it('rejects nominating yourself', () => {
    const room = mltVotingRoom();
    expect(castVote(room, hostId(room), hostId(room))).toEqual({ ok: false, error: 'self_vote' });
  });

  it('rejects an unknown target and deck-card values', () => {
    const room = mltVotingRoom();
    const grace = addNamed(room, 'Grace');
    expect(castVote(room, grace.id, 'nobody')).toEqual({ ok: false, error: 'bad_value' });
    expect(castVote(room, grace.id, '8')).toEqual({ ok: false, error: 'bad_value' });
    expect(castVote(room, grace.id, 'A')).toEqual({ ok: false, error: 'bad_value' });
    expect(room.votes[grace.id]).toBeUndefined();
  });

  it('rejects a duplicate nomination and keeps the original', () => {
    const room = mltVotingRoom();
    const grace = addNamed(room, 'Grace');
    castVote(room, grace.id, hostId(room));
    const dup = castVote(room, grace.id, 'other');
    expect(dup).toEqual({ ok: false, error: 'already_voted' });
    expect(room.votes[grace.id]).toBe(hostId(room));
  });

  it('cannot nominate while waiting', () => {
    const room = createRoom({ game: 'most-likely-to', prompts: mltPrompts });
    const grace = addNamed(room, 'Grace');
    expect(castVote(room, grace.id, hostId(room))).toEqual({ ok: false, error: 'not_voting' });
  });
});

describe('computeMltResult (crown + predictor scoring)', () => {
  it('crowns the most-nominated player with 100 and predicts +20', () => {
    const room = mltVotingRoom();
    const grace = addNamed(room, 'Grace');
    const ned = addNamed(room, 'Ned');
    const priya = addNamed(room, 'Priya');
    // Grace gets 3 nominations; the host gets 1.
    castVote(room, hostId(room), grace.id);
    castVote(room, grace.id, hostId(room));
    castVote(room, ned.id, grace.id);
    castVote(room, priya.id, grace.id);
    const res = computeMltResult(room);
    expect(res.winners).toEqual([grace.id]);
    expect(res.points[grace.id]).toBe(100); // crowned
    expect(res.points[hostId(room)]).toBe(80 + MLT_PREDICTOR_BONUS); // 2nd place + predicted
    expect(res.points[ned.id]).toBe(MLT_PREDICTOR_BONUS); // predicted only
    expect(res.points[priya.id]).toBe(MLT_PREDICTOR_BONUS);
    expect(res.points).not.toHaveProperty('missing');
  });

  it('a tied top crowns everyone and the next rank is skipped', () => {
    const room = mltVotingRoom();
    const grace = addNamed(room, 'Grace');
    const ned = addNamed(room, 'Ned');
    const priya = addNamed(room, 'Priya');
    const quinn = addNamed(room, 'Quinn');
    // Grace 2, Ned 2, Host 1 → ranks 1, 1, 3 (standard competition).
    castVote(room, hostId(room), grace.id);
    castVote(room, grace.id, ned.id);
    castVote(room, ned.id, grace.id);
    castVote(room, priya.id, ned.id);
    castVote(room, quinn.id, hostId(room));
    const res = computeMltResult(room);
    expect(new Set(res.winners)).toEqual(new Set([grace.id, ned.id]));
    expect(res.points[grace.id]).toBe(100 + MLT_PREDICTOR_BONUS);
    expect(res.points[ned.id]).toBe(100 + MLT_PREDICTOR_BONUS);
    // Host is rank 3 → 60, plus +20 for predicting a winner (voted Grace).
    expect(res.points[hostId(room)]).toBe(60 + MLT_PREDICTOR_BONUS);
    expect(res.points[priya.id]).toBe(MLT_PREDICTOR_BONUS);
    expect(res.points[quinn.id]).toBeUndefined(); // zero nominations → no points
  });

  it('returns an empty result for zero nominations', () => {
    const room = mltVotingRoom();
    addNamed(room, 'Grace');
    const res = computeMltResult(room);
    expect(res.points).toEqual({});
    expect(res.counts).toEqual({});
    expect(res.winners).toEqual([]);
    expect(res.predictors).toEqual([]);
  });

  it('uses the shared ranking table (100/80/60/40/20/10)', () => {
    expect(MLT_RANKING_POINTS).toEqual([100, 80, 60, 40, 20, 10]);
    expect(MLT_PREDICTOR_BONUS).toBe(20);
  });
});

describe('MLT reveal', () => {
  it('is host-paced: reveals while someone is still thinking', () => {
    const room = mltVotingRoom();
    const grace = addNamed(room, 'Grace');
    castVote(room, grace.id, hostId(room)); // host hasn't nominated
    const res = reveal(room, hostId(room));
    expect(res).toEqual({ ok: true });
    expect(room.status).toBe('revealed');
    expect(room.mltResult!.counts[hostId(room)]).toBe(1);
    expect(room.stats).toBeNull(); // MLT carries mltResult, not deck stats
  });

  it('accumulates session totals into mltScores at reveal', () => {
    const room = mltVotingRoom();
    const grace = addNamed(room, 'Grace');
    const ned = addNamed(room, 'Ned');
    // Grace: 2 nominations → 100 crown. Ned: 1 → 80. Host: 0 → nothing.
    // Predictors of the crowned player (+20): host and Ned both voted Grace.
    castVote(room, hostId(room), grace.id);
    castVote(room, grace.id, ned.id);
    castVote(room, ned.id, grace.id);
    reveal(room, hostId(room));
    expect(room.mltScores[grace.id]).toBe(100); // crowned; voted Ned (not a winner)
    expect(room.mltScores[ned.id]).toBe(100); // 80 second place + 20 prediction
    expect(room.mltScores[hostId(room)]).toBe(20); // prediction only
  });

  it('keeps nomination values private until the reveal', () => {
    const room = mltVotingRoom();
    const grace = addNamed(room, 'Grace');
    castVote(room, grace.id, hostId(room));
    const snap = buildSnapshot(room);
    expect(snap.votedIds).toContain(grace.id);
    expect(snap.votes).toEqual({});
    expect(snap.mltResult).toBeNull();
  });

  it('rejects reveal from the waiting room and a second reveal', () => {
    const room = createRoom({ game: 'most-likely-to', prompts: mltPrompts });
    expect(reveal(room, hostId(room))).toEqual({ ok: false, error: 'not_started' });
    const started = mltVotingRoom();
    const grace = addNamed(started, 'Grace');
    castVote(started, grace.id, hostId(started));
    reveal(started, hostId(started));
    expect(reveal(started, hostId(started))).toEqual({ ok: false, error: 'already_revealed' });
  });
});

describe('nextPrompt', () => {
  it('rejects non-hosts and non-MLT rooms', () => {
    const room = mltVotingRoom();
    const grace = addNamed(room, 'Grace');
    expect(nextPrompt(room, grace.id)).toEqual({ ok: false, error: 'not_host' });
    expect(nextPrompt(votingRoom(), hostId(votingRoom()))).toEqual({ ok: false, error: 'not_this_game' });
  });

  it('requires the round to be revealed first', () => {
    const room = mltVotingRoom();
    expect(nextPrompt(room, hostId(room))).toEqual({ ok: false, error: 'not_revealed' });
  });

  it('advances, wipes nominations and re-arms the per-round lock', () => {
    const room = mltVotingRoom();
    const grace = addNamed(room, 'Grace');
    castVote(room, grace.id, hostId(room));
    reveal(room, hostId(room));
    const res = nextPrompt(room, hostId(room));
    expect(res).toEqual({ ok: true, done: false });
    expect(room.promptIndex).toBe(1);
    expect(room.status).toBe('voting');
    expect(room.votes).toEqual({});
    expect(room.mltResult).toBeNull();
    expect(room.participants.get(grace.id)!.hasVoted).toBe(false);
    expect(castVote(room, grace.id, hostId(room))).toEqual({ ok: true });
  });

  it('signals done on the last prompt', () => {
    const room = mltVotingRoom([mltPrompts[0]]);
    // Solo room: nobody to nominate — reveal with zero votes, then advance.
    reveal(room, hostId(room));
    const last = nextPrompt(room, hostId(room));
    expect(last).toEqual({ ok: true, done: true });
    expect(room.promptIndex).toBe(0);
  });
});

describe('finishMlt & playAgainMlt', () => {
  it('finishMlt marks the session over (host-only, after a reveal)', () => {
    const room = mltVotingRoom();
    const grace = addNamed(room, 'Grace');
    expect(finishMlt(room, grace.id)).toEqual({ ok: false, error: 'not_host' });
    expect(finishMlt(room, hostId(room))).toEqual({ ok: false, error: 'not_revealed' });
    castVote(room, grace.id, hostId(room));
    reveal(room, hostId(room));
    expect(finishMlt(room, hostId(room))).toEqual({ ok: true });
    expect(room.sessionOver).toBe(true);
  });

  it('playAgainMlt resets rounds but keeps the session leaderboard', () => {
    const room = mltVotingRoom();
    const grace = addNamed(room, 'Grace');
    castVote(room, grace.id, hostId(room));
    castVote(room, hostId(room), grace.id);
    reveal(room, hostId(room));
    expect(room.mltScores[grace.id]).toBe(120);
    finishMlt(room, hostId(room));

    const res = playAgainMlt(room, hostId(room));
    expect(res).toEqual({ ok: true });
    expect(room.status).toBe('waiting');
    expect(room.promptIndex).toBe(-1);
    expect(room.votes).toEqual({});
    expect(room.mltResult).toBeNull();
    expect(room.sessionOver).toBe(false);
    expect(room.mltScores[grace.id]).toBe(120); // totals survive
  });

  it('playAgainMlt requires an over session', () => {
    const room = mltVotingRoom();
    expect(playAgainMlt(room, hostId(room))).toEqual({ ok: false, error: 'not_finished' });
  });
});

describe('MLT snapshot', () => {
  it('exposes the active prompt once the session starts', () => {
    const room = mltVotingRoom();
    const snap = buildSnapshot(room);
    expect(snap.game).toBe('most-likely-to');
    expect(snap.prompt).toBe(mltPrompts[0]);
    expect(snap.promptIndex).toBe(0);
    expect(snap.promptCount).toBe(3);
  });

  it('keeps the prompt null and scores empty while waiting', () => {
    const room = createRoom({ game: 'most-likely-to', prompts: mltPrompts });
    const snap = buildSnapshot(room);
    expect(snap.prompt).toBeNull();
    expect(snap.mltScores).toEqual({});
    expect(snap.sessionOver).toBe(false);
  });

  it('shows nominations and the result only once revealed', () => {
    const room = mltVotingRoom();
    const grace = addNamed(room, 'Grace');
    castVote(room, grace.id, hostId(room));
    castVote(room, hostId(room), grace.id);
    reveal(room, hostId(room));
    const snap = buildSnapshot(room);
    expect(snap.votes[grace.id]).toBe(hostId(room));
    // Both players tie for the crown (1 nomination each) — order-insensitive.
    expect([...snap.mltResult!.winners].sort()).toEqual([grace.id, hostId(room)].sort());
    expect(snap.mltScores[grace.id]).toBe(120); // 100 crown + 20 prediction
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
