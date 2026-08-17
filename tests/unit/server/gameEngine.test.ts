import { describe, expect, it, vi } from 'vitest';
import { createGameModule, GAME_KINDS, shuffle } from '../../../server/games/engine.mjs';
import { GAME_MODULES, GAME_IDS } from '../../../server/games/registry.mjs';

type Module = ReturnType<typeof createGameModule>;
type Game = ReturnType<Module['create']>;

// ---------------------------------------------------------------------------
// Fixtures — one tiny prompt bank per kind so tests are deterministic.
// ---------------------------------------------------------------------------

// A realistic bank size so two rooms' shuffles are astronomically unlikely to collide.
const teammate = createGameModule({ id: 'test-teammate', kind: 'teammate', castEvent: 'game:pick', prompts: ['…show up early?', '…forget their laptop?', '…win karaoke night?', '…order takeout?', '…miss the deadline?', '…break production?', '…name-drop a framework?', '…fall asleep in a demo?', '…send it to the wrong chat?', '…claim it works on their machine?'] });
const options = createGameModule({ id: 'test-options', kind: 'options', castEvent: 'game:choose', prompts: [{ text: 'Pick a side', options: ['Coffee', 'Tea', 'Water'] }] });
const quiz = createGameModule({ id: 'test-quiz', kind: 'quiz', castEvent: 'game:answer', prompts: [{ text: 'What is 2+2?', options: ['3', '4', '5'], answer: 1 }] });
const estimate = createGameModule({ id: 'test-estimate', kind: 'estimate', castEvent: 'game:guess', prompts: [{ text: 'How many jelly beans?', answer: 100, unit: 'jelly beans' }] });
const freeVote = createGameModule({ id: 'test-free-vote', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, prompts: [{ text: 'Caption this' }, { text: 'Another caption' }] });
const freeAnswer = createGameModule({ id: 'test-free-answer', kind: 'free', castEvent: 'game:submit', prompts: [{ text: 'Type this sentence', answerText: 'the quick brown fox' }] });

function playingGame(mod: Module): Game {
  const game = mod.create({ hostName: 'Host' });
  const res = mod.startPrompt(game, game.hostId!);
  if (!res.ok) throw new Error(`helper: start failed ${res.error}`);
  return game;
}

function addNamed(game: Game, name: string) {
  return game.participants.set(name, {
    id: name,
    name,
    role: 'voter',
    status: 'connected',
    hasVoted: false,
    skipped: false,
    joinedAt: Date.now(),
    hue: 0,
  }).get(name)!;
}

const hostId = (game: Game) => game.hostId!;

describe('createGameModule', () => {
  it('rejects unknown kinds and empty prompt banks', () => {
    expect(() => createGameModule({ id: 'x', kind: 'nope' as any, castEvent: 'e', prompts: ['a'] })).toThrow();
    expect(() => createGameModule({ id: 'x', kind: 'options', castEvent: 'e', prompts: [] })).toThrow();
    expect(GAME_KINDS).toContain('teammate');
    expect(GAME_KINDS).toContain('options');
    expect(GAME_KINDS).toContain('quiz');
    expect(GAME_KINDS).toContain('estimate');
  });

  it('shuffles deterministically-shaped arrays without duplicates', () => {
    const input = ['a', 'b', 'c', 'd'];
    const out = shuffle(input);
    expect(out).toHaveLength(input.length);
    expect(new Set(out).size).toBe(input.length);
    expect([...out].sort()).toEqual([...input].sort());
  });
});

describe('create / startPrompt (shared across kinds)', () => {
  it('creates a game in WAITING with the host seated', () => {
    const game = teammate.create({ hostName: 'Ada' });
    expect(game.game).toBe('test-teammate');
    expect(game.kind).toBe('teammate');
    expect(game.status).toBe('waiting');
    expect(game.prompt).toBeNull();
    expect(game.participants.size).toBe(1);
    expect(game.participants.get(game.hostId!)!.role).toBe('facilitator');
  });

  it('shuffles the prompt pool once per room', () => {
    const a = teammate.create({});
    const b = teammate.create({});
    expect(a.promptOrder.length).toBe(teammate.PROMPTS.length);
    expect(new Set(a.promptOrder).size).toBe(teammate.PROMPTS.length);
    expect(a.promptOrder.join()).not.toBe(b.promptOrder.join());
  });

  it('generates unique codes', () => {
    const random = vi.spyOn(Math, 'random');
    for (let i = 0; i < 5; i++) random.mockReturnValueOnce(0); // first code: AAAAA
    for (let i = 0; i < 5; i++) random.mockReturnValueOnce(0.5); // second code: SSSSS
    const game = teammate.create({ hasCode: (c: string) => c === 'AAAAA' });
    expect(game.code).toBe('SSSSS');
  });

  it('moves WAITING → PLAYING with a prompt and clears the previous round', () => {
    const game = teammate.create({ hostName: 'Host' });
    addNamed(game, 'Grace');
    const res = teammate.startPrompt(game, hostId(game));
    expect(res).toEqual({ ok: true });
    expect(game.status).toBe('playing');
    expect(game.roundId).toBe(1);
    expect(game.prompt).toBeTruthy();
    expect(game.votes).toEqual({});
    for (const p of game.participants.values()) {
      expect(p.hasVoted).toBe(false);
      expect(p.status).toBe('connected');
    }
  });

  it('rejects a non-host and double-starts (idempotent)', () => {
    const game = teammate.create({ hostName: 'Host' });
    const grace = addNamed(game, 'Grace');
    expect(teammate.startPrompt(game, grace.id)).toEqual({ ok: false, error: 'not_host' });
    const started = playingGame(teammate);
    expect(teammate.startPrompt(started, hostId(started))).toEqual({ ok: false, error: 'in_progress' });
  });

  it('cycles prompts so a long session never repeats until the pool is exhausted', () => {
    const game = teammate.create({ hostName: 'Host' });
    const seen = new Set<string>();
    for (let i = 0; i < teammate.PROMPTS.length; i++) {
      teammate.startPrompt(game, hostId(game));
      seen.add(String(game.prompt));
      if (i < teammate.PROMPTS.length - 1) game.status = 'revealed';
    }
    expect(seen.size).toBe(teammate.PROMPTS.length);
  });
});

describe('teammate kind — pick a teammate', () => {
  it('records a pick for a teammate and locks it', () => {
    const game = playingGame(teammate);
    const grace = addNamed(game, 'Grace');
    const res = teammate.cast(game, hostId(game), grace.id);
    expect(res).toEqual({ ok: true });
    expect(game.votes[hostId(game)]).toBe(grace.id);
    expect(game.participants.get(hostId(game))!.hasVoted).toBe(true);
    expect(game.participants.get(hostId(game))!.status).toBe('voted');
  });

  it('rejects picking yourself, unknown participants and second picks', () => {
    const game = playingGame(teammate);
    const grace = addNamed(game, 'Grace');
    expect(teammate.cast(game, hostId(game), hostId(game))).toEqual({ ok: false, error: 'cannot_pick_self' });
    expect(teammate.cast(game, hostId(game), 'nobody')).toEqual({ ok: false, error: 'no_participant' });
    expect(teammate.cast(game, hostId(game), grace.id)).toEqual({ ok: true });
    expect(teammate.cast(game, hostId(game), grace.id)).toEqual({ ok: false, error: 'already_voted' });
  });

  it('rejects picks outside the playing phase', () => {
    const game = teammate.create({ hostName: 'Host' });
    const grace = addNamed(game, 'Grace');
    expect(teammate.cast(game, hostId(game), grace.id)).toEqual({ ok: false, error: 'not_playing' });
  });

  it('everyoneVoted requires every present participant to vote', () => {
    const game = playingGame(teammate);
    const grace = addNamed(game, 'Grace');
    expect(teammate.everyoneVoted(game)).toBe(false);
    teammate.cast(game, hostId(game), grace.id);
    expect(teammate.everyoneVoted(game)).toBe(false);
    teammate.cast(game, grace.id, hostId(game));
    expect(teammate.everyoneVoted(game)).toBe(true);
  });

  it('ignores disconnected participants', () => {
    const game = playingGame(teammate);
    const ghost = addNamed(game, 'Ghost');
    teammate.disconnectParticipant(game, ghost.id);
    teammate.cast(game, hostId(game), ghost.id);
    expect(teammate.everyoneVoted(game)).toBe(true);
  });

  it('reveal requires the host and everyone voted, and crowns the top (ties included)', () => {
    const game = playingGame(teammate);
    const grace = addNamed(game, 'Grace');
    const ned = addNamed(game, 'Ned');
    const kim = addNamed(game, 'Kim');
    expect(teammate.reveal(game, grace.id)).toEqual({ ok: false, error: 'not_host' });
    expect(teammate.reveal(game, hostId(game))).toEqual({ ok: false, error: 'not_all_voted' });
    // Host → Ned, Grace → Ned, Ned → Grace, Kim → Grace → Grace and Ned tie at 2.
    teammate.cast(game, hostId(game), ned.id);
    teammate.cast(game, grace.id, ned.id);
    teammate.cast(game, ned.id, grace.id);
    teammate.cast(game, kim.id, grace.id);
    expect(teammate.reveal(game, hostId(game))).toEqual({ ok: true });
    const stats = game.stats!;
    expect(stats.topCount).toBe(2);
    expect(stats.winners.sort()).toEqual([grace.id, ned.id].sort());
    expect(stats.totalVotes).toBe(4);
    expect(stats.counts).toEqual([
      { participantId: grace.id, count: 2 },
      { participantId: ned.id, count: 2 },
    ]);
  });

  it('allows the next prompt straight from REVEALED', () => {
    const game = playingGame(teammate);
    const grace = addNamed(game, 'Grace');
    teammate.cast(game, hostId(game), grace.id);
    teammate.cast(game, grace.id, hostId(game));
    teammate.reveal(game, hostId(game));
    const first = game.prompt;
    expect(teammate.startPrompt(game, hostId(game))).toEqual({ ok: true });
    expect(game.roundId).toBe(2);
    expect(game.votes).toEqual({});
    expect(game.prompt).not.toBe(first);
  });

  it('buildGameSnapshot keeps votes private until reveal', () => {
    const game = playingGame(teammate);
    const grace = addNamed(game, 'Grace');
    teammate.cast(game, hostId(game), grace.id);
    const snap = teammate.buildGameSnapshot(game);
    expect(snap.status).toBe('playing');
    expect(snap.votedIds).toEqual([hostId(game)]);
    expect(snap.votes).toEqual({});
    expect(snap.stats).toBeNull();
    teammate.cast(game, grace.id, hostId(game));
    teammate.reveal(game, hostId(game));
    const revealed = teammate.buildGameSnapshot(game);
    expect(revealed.status).toBe('revealed');
    expect(revealed.votes[hostId(game)]).toBe(grace.id);
    expect(revealed.stats!.winners).toContain(grace.id);
  });
});

describe('options kind — pick one of N', () => {
  it('records an option index and rejects out-of-range values', () => {
    const game = playingGame(options);
    addNamed(game, 'Grace');
    expect(options.cast(game, hostId(game), '1')).toEqual({ ok: true });
    expect(game.votes[hostId(game)]).toBe('1');
    const g = playingGame(options);
    expect(options.cast(g, hostId(g), '9')).toEqual({ ok: false, error: 'bad_value' });
    expect(options.cast(g, hostId(g), 'x')).toEqual({ ok: false, error: 'bad_value' });
  });

  it('reveals per-option counts and a single winner', () => {
    const game = playingGame(options);
    const grace = addNamed(game, 'Grace');
    const ned = addNamed(game, 'Ned');
    options.cast(game, hostId(game), '0');
    options.cast(game, grace.id, '0');
    options.cast(game, ned.id, '2');
    options.reveal(game, hostId(game));
    const stats = game.stats! as { winner: number | 'tie'; counts: { option: number; count: number }[] };
    expect(stats.winner).toBe(0);
    expect(stats.counts).toEqual([
      { option: 0, count: 2 },
      { option: 2, count: 1 },
    ]);
  });

  it('calls a perfect split a tie', () => {
    const game = playingGame(options);
    const grace = addNamed(game, 'Grace');
    options.cast(game, hostId(game), '0');
    options.cast(game, grace.id, '1');
    options.reveal(game, hostId(game));
    expect((game.stats! as { winner: number | 'tie' }).winner).toBe('tie');
  });
});

describe('quiz kind — question with a correct answer', () => {
  it('records answers and keeps the correct answer private pre-reveal', () => {
    const game = playingGame(quiz);
    const grace = addNamed(game, 'Grace');
    expect(quiz.cast(game, hostId(game), '1')).toEqual({ ok: true });
    const snap = quiz.buildGameSnapshot(game);
    // The answer is stripped from the pre-reveal prompt.
    expect((snap.prompt as any).answer).toBeUndefined();
    expect(snap.stats).toBeNull();
    quiz.cast(game, grace.id, '0');
    quiz.reveal(game, hostId(game));
    const stats = game.stats! as { correctIndex: number; correctText: string; correctIds: string[]; wrongIds: string[] };
    expect(stats.correctIndex).toBe(1);
    expect(stats.correctText).toBe('4');
    expect(stats.correctIds).toEqual([hostId(game)]);
    expect(stats.wrongIds).toEqual([grace.id]);
  });

  it('rejects answers outside the option list', () => {
    const game = playingGame(quiz);
    expect(quiz.cast(game, hostId(game), '7')).toEqual({ ok: false, error: 'bad_value' });
  });
});

describe('estimate kind — closest wins', () => {
  it('records numeric guesses, keeps the answer secret, and sorts by distance', () => {
    const game = playingGame(estimate);
    const grace = addNamed(game, 'Grace');
    const ned = addNamed(game, 'Ned');
    expect(estimate.cast(game, hostId(game), '99')).toEqual({ ok: true });
    expect(estimate.cast(game, grace.id, '50')).toEqual({ ok: true });
    expect(estimate.cast(game, ned.id, '102')).toEqual({ ok: true });
    const snap = estimate.buildGameSnapshot(game);
    expect((snap.prompt as any).answer).toBeUndefined(); // secret pre-reveal
    estimate.reveal(game, hostId(game));
    const stats = game.stats! as { answer: number; winnerIds: string[]; guesses: { participantId: string; value: string; distance: number }[] };
    expect(stats.answer).toBe(100);
    expect(stats.winnerIds).toEqual([hostId(game)]); // |99-100| = 1, closest
    expect(stats.guesses.map((g) => g.distance)).toEqual([1, 2, 50]); // sorted ascending
  });

  it('handles a tie for closest and rejects non-numeric guesses', () => {
    const game = playingGame(estimate);
    const grace = addNamed(game, 'Grace');
    const ned = addNamed(game, 'Ned');
    estimate.cast(game, hostId(game), '99'); // distance 1
    estimate.cast(game, grace.id, '101'); // distance 1 — tie
    estimate.cast(game, ned.id, '50'); // distance 50
    estimate.reveal(game, hostId(game));
    const stats = game.stats! as { winnerIds: string[] };
    expect(stats.winnerIds.sort()).toEqual([hostId(game), grace.id].sort());
    const fresh = playingGame(estimate);
    expect(estimate.cast(fresh, hostId(fresh), 'abc')).toEqual({ ok: false, error: 'bad_estimate' });
  });

  it('rejects non-numeric guesses', () => {
    const game = playingGame(estimate);
    expect(estimate.cast(game, hostId(game), 'abc')).toEqual({ ok: false, error: 'bad_estimate' });
  });
});

describe('free kind — submit an answer, then vote on the best', () => {
  it('records a submit-phase answer and keeps it private pre-reveal', () => {
    const game = playingGame(freeVote);
    const grace = addNamed(game, 'Grace');
    expect(freeVote.cast(game, hostId(game), '  A wild caption  ')).toEqual({ ok: true });
    expect(game.submissions[hostId(game)]).toBe('A wild caption'); // trimmed
    const snap = freeVote.buildGameSnapshot(game);
    expect(snap.phase).toBe('submit');
    expect(snap.votedIds).toEqual([hostId(game)]);
    expect(snap.submissions).toEqual({}); // private until reveal
    expect(snap.votes).toEqual({});
    expect(freeVote.cast(game, grace.id, 'gibberish')).toEqual({ ok: true });
    expect(freeVote.everyoneVoted(game)).toBe(true);
  });

  it('rejects empty and over-long answers, plus submits in the vote phase', () => {
    const game = playingGame(freeVote);
    expect(freeVote.cast(game, hostId(game), '   ')).toEqual({ ok: false, error: 'no_value' });
    expect(freeVote.cast(game, hostId(game), 'x'.repeat(241))).toEqual({ ok: false, error: 'too_long' });
    // submit → reveal → startVote moves to the vote phase
    const grace = addNamed(game, 'Grace');
    freeVote.cast(game, hostId(game), 'First answer');
    freeVote.cast(game, grace.id, 'Second answer');
    freeVote.reveal(game, hostId(game));
    expect(freeVote.startVote(game, hostId(game))).toEqual({ ok: true });
    expect(game.phase).toBe('vote');
    expect(game.status).toBe('playing');
    // In the vote phase a new submission is rejected; a pick is accepted.
    expect(freeVote.cast(game, hostId(game), 'new answer')).toEqual({ ok: false, error: 'no_participant' });
    expect(freeVote.cast(game, hostId(game), grace.id)).toEqual({ ok: true });
  });

  it('lets the room vote on the best answer and crowns a winner', () => {
    const game = playingGame(freeVote);
    const grace = addNamed(game, 'Grace');
    const ned = addNamed(game, 'Ned');
    freeVote.cast(game, hostId(game), 'Answer A');
    freeVote.cast(game, grace.id, 'Answer B');
    freeVote.cast(game, ned.id, 'Answer C');
    freeVote.reveal(game, hostId(game));
    const submitStats = game.stats! as { phase: 'submit'; totalSubmissions: number };
    expect(submitStats.phase).toBe('submit');
    expect(submitStats.totalSubmissions).toBe(3);
    freeVote.startVote(game, hostId(game));
    freeVote.cast(game, hostId(game), grace.id);
    freeVote.cast(game, grace.id, ned.id);
    freeVote.cast(game, ned.id, grace.id);
    freeVote.reveal(game, hostId(game));
    const voteStats = game.stats! as { phase: 'vote'; winners: string[]; topCount: number };
    expect(voteStats.phase).toBe('vote');
    expect(voteStats.topCount).toBe(2);
    // Grace gets 2 votes (host + Ned); Ned gets 1. Grace wins outright.
    expect(voteStats.winners).toEqual([grace.id]);
    // The final snapshot exposes both the submissions and the vote values.
    const snap = freeVote.buildGameSnapshot(game);
    expect(snap.submissions[grace.id]).toBe('Answer B');
    expect(snap.votes[hostId(game)]).toBe(grace.id);
  });

  it('blocks self-votes, startVote before reveal, and double-votes', () => {
    const game = playingGame(freeVote);
    const grace = addNamed(game, 'Grace');
    expect(freeVote.startVote(game, hostId(game))).toEqual({ ok: false, error: 'in_progress' }); // not revealed yet
    freeVote.cast(game, hostId(game), 'Mine');
    freeVote.cast(game, grace.id, 'Yours');
    freeVote.reveal(game, hostId(game));
    freeVote.startVote(game, hostId(game));
    expect(freeVote.cast(game, hostId(game), hostId(game))).toEqual({ ok: false, error: 'cannot_pick_self' });
    expect(freeVote.cast(game, hostId(game), grace.id)).toEqual({ ok: true });
    expect(freeVote.cast(game, hostId(game), grace.id)).toEqual({ ok: false, error: 'already_voted' });
  });

  it('flags correct answers against an answerText prompt', () => {
    const game = playingGame(freeAnswer);
    const grace = addNamed(game, 'Grace');
    freeAnswer.cast(game, hostId(game), 'The quick brown fox');
    freeAnswer.cast(game, grace.id, 'the quick brown fox'); // case-insensitive match
    freeAnswer.reveal(game, hostId(game));
    const stats = game.stats! as { phase: 'submit'; correctIds: string[]; wrongIds: string[] };
    expect(stats.correctIds.sort()).toEqual([hostId(game), grace.id].sort());
    expect(stats.wrongIds).toEqual([]);
  });

  it('requires everyone to submit before revealing the answers', () => {
    const game = playingGame(freeVote);
    const grace = addNamed(game, 'Grace');
    freeVote.cast(game, hostId(game), 'Only me');
    expect(freeVote.reveal(game, hostId(game))).toEqual({ ok: false, error: 'not_all_voted' });
    freeVote.cast(game, grace.id, 'And me');
    expect(freeVote.reveal(game, hostId(game))).toEqual({ ok: true });
  });
});

describe('room management (shared by every kind)', () => {
  it('locks and unlocks for the host only', () => {
    const game = teammate.create({ hostName: 'Host' });
    const grace = addNamed(game, 'Grace');
    expect(teammate.setLocked(game, grace.id, true)).toEqual({ ok: false, error: 'not_host' });
    expect(teammate.setLocked(game, hostId(game), true)).toEqual({ ok: true });
    expect(game.locked).toBe(true);
    expect(teammate.setLocked(game, hostId(game), false)).toEqual({ ok: true });
    expect(game.locked).toBe(false);
  });

  it('host can remove a participant and their vote', () => {
    const game = playingGame(teammate);
    const grace = addNamed(game, 'Grace');
    teammate.cast(game, grace.id, hostId(game));
    const res = teammate.removeParticipant(game, hostId(game), grace.id);
    expect(res).toEqual({ ok: true, removedId: grace.id });
    expect(game.participants.has(grace.id)).toBe(false);
    expect(game.votes[grace.id]).toBeUndefined();
  });

  it('rejects removing the host themself and non-host removals', () => {
    const game = teammate.create({ hostName: 'Host' });
    const grace = addNamed(game, 'Grace');
    expect(teammate.removeParticipant(game, hostId(game), hostId(game))).toEqual({ ok: false, error: 'cannot_remove' });
    expect(teammate.removeParticipant(game, grace.id, hostId(game))).toEqual({ ok: false, error: 'not_host' });
  });

  it('marks disconnected participants and promotes a new host', () => {
    const game = teammate.create({ hostName: 'Host' });
    const grace = addNamed(game, 'Grace');
    teammate.disconnectParticipant(game, hostId(game));
    expect(game.hostId).toBe(hostId(game)); // keeps host until gone entirely
    game.participants.delete(hostId(game));
    teammate.disconnectParticipant(game, grace.id);
    expect(game.hostId).toBe(grace.id);
  });

  it('committed reflects a locked vote for rejoin status', () => {
    const game = playingGame(teammate);
    const grace = addNamed(game, 'Grace');
    expect(teammate.committed(game, hostId(game))).toBeUndefined();
    teammate.cast(game, hostId(game), grace.id);
    expect(teammate.committed(game, hostId(game))).toBe(grace.id);
  });
});

// ---------------------------------------------------------------------------
// Registry integrity — every shipped game loads real JSON data.
// ---------------------------------------------------------------------------

describe('registry', () => {
  it('registers every configured game with a non-empty prompt bank', () => {
    for (const id of GAME_IDS) {
      const mod = GAME_MODULES[id];
      expect(mod, id).toBeTruthy();
      // Hosted activities (Team Health / Live Poll) are config-driven and
      // intentionally carry no JSON prompt bank.
      if (mod.kind === 'health' || mod.kind === 'poll') {
        expect(mod.castEvent, id).toBeTruthy();
        continue;
      }
      expect(mod.PROMPTS.length, `${id} prompt bank`).toBeGreaterThan(0);
      expect(mod.castEvent, id).toBeTruthy();
    }
  });

  it("ships the catalog's flagship games", () => {
    expect(GAME_MODULES['most-likely-to'].kind).toBe('teammate');
    expect(GAME_MODULES['would-you-rather'].kind).toBe('options');
    expect(GAME_MODULES['team-trivia'].kind).toBe('quiz');
    expect(GAME_MODULES['how-many'].kind).toBe('estimate');
  });

  it('registers the hosted activities (Team Health, Live Poll)', () => {
    expect(GAME_MODULES['team-health'].kind).toBe('health');
    expect(GAME_MODULES['team-health'].castEvents).toContain('game:healthSubmit');
    expect(GAME_MODULES['live-poll'].kind).toBe('poll');
    expect(GAME_MODULES['live-poll'].castEvents).toContain('game:pollVote');
  });
});
