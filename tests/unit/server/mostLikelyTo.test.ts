import { describe, expect, it, vi } from 'vitest';
import {
  PROMPTS,
  buildGameSnapshot,
  castPick,
  createGame,
  disconnectParticipant,
  everyonePicked,
  removeParticipant,
  reveal,
  setLocked,
  startPrompt,
} from '../../../server/games/mostLikelyTo.mjs';

type Game = ReturnType<typeof createGame>;

function playingGame(): Game {
  const game = createGame({ hostName: 'Host' });
  const res = startPrompt(game, game.hostId!);
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

describe('createGame', () => {
  it('creates a game in WAITING with the host seated', () => {
    const game = createGame({ hostName: 'Ada' });
    expect(game.game).toBe('most-likely-to');
    expect(game.status).toBe('waiting');
    expect(game.prompt).toBeNull();
    expect(game.participants.size).toBe(1);
    expect(game.participants.get(game.hostId!)!.name).toBe('Ada');
    expect(game.participants.get(game.hostId!)!.role).toBe('facilitator');
  });

  it('shuffles the prompt pool once per room', () => {
    const a = createGame({});
    const b = createGame({});
    expect(a.promptOrder.length).toBe(PROMPTS.length);
    expect(new Set(a.promptOrder).size).toBe(PROMPTS.length); // no duplicates
    // The order is shuffled per room (almost certainly different).
    expect(a.promptOrder.join()).not.toBe(b.promptOrder.join());
  });

  it('generates unique codes', () => {
    const random = vi.spyOn(Math, 'random');
    for (let i = 0; i < 5; i++) random.mockReturnValueOnce(0); // first code: AAAAA
    for (let i = 0; i < 5; i++) random.mockReturnValueOnce(0.5); // second code: SSSSS
    const game = createGame({ hasCode: (c) => c === 'AAAAA' });
    expect(game.code).toBe('SSSSS');
  });
});

describe('startPrompt', () => {
  it('moves WAITING → PLAYING with a prompt and clears the previous round', () => {
    const game = createGame({ hostName: 'Host' });
    addNamed(game, 'Grace');
    const res = startPrompt(game, hostId(game));
    expect(res).toEqual({ ok: true });
    expect(game.status).toBe('playing');
    expect(game.roundId).toBe(1);
    expect(game.prompt).toMatch(/^…/);
    expect(game.picks).toEqual({});
    for (const p of game.participants.values()) {
      expect(p.hasVoted).toBe(false);
      expect(p.status).toBe('connected');
    }
  });

  it('rejects a non-host', () => {
    const game = createGame({ hostName: 'Host' });
    const grace = addNamed(game, 'Grace');
    expect(startPrompt(game, grace.id)).toEqual({ ok: false, error: 'not_host' });
    expect(game.status).toBe('waiting');
  });

  it('rejects starting while a round is live (idempotent double-click)', () => {
    const game = playingGame();
    expect(startPrompt(game, hostId(game))).toEqual({ ok: false, error: 'in_progress' });
  });

  it('cycles prompts so a long session never repeats until the pool is exhausted', () => {
    const game = createGame({ hostName: 'Host' });
    const seen = new Set<string>();
    for (let i = 0; i < PROMPTS.length; i++) {
      startPrompt(game, hostId(game));
      seen.add(game.prompt!);
      // Move from PLAYING → REVEALED so the next startPrompt is legal.
      if (i < PROMPTS.length - 1) game.status = 'revealed';
    }
    expect(seen.size).toBe(PROMPTS.length);
  });
});

describe('castPick', () => {
  it('records a pick for a teammate and locks it', () => {
    const game = playingGame();
    const grace = addNamed(game, 'Grace');
    const res = castPick(game, hostId(game), grace.id);
    expect(res).toEqual({ ok: true });
    expect(game.picks[hostId(game)]).toBe(grace.id);
    expect(game.participants.get(hostId(game))!.hasVoted).toBe(true);
    expect(game.participants.get(hostId(game))!.status).toBe('voted');
  });

  it('rejects picking yourself', () => {
    const game = playingGame();
    expect(castPick(game, hostId(game), hostId(game))).toEqual({ ok: false, error: 'cannot_pick_self' });
    expect(game.picks[hostId(game)]).toBeUndefined();
  });

  it('rejects picking an unknown participant', () => {
    const game = playingGame();
    expect(castPick(game, hostId(game), 'nobody')).toEqual({ ok: false, error: 'no_participant' });
  });

  it('rejects a second pick (permanent lock)', () => {
    const game = playingGame();
    const grace = addNamed(game, 'Grace');
    const ned = addNamed(game, 'Ned');
    castPick(game, hostId(game), grace.id);
    expect(castPick(game, hostId(game), ned.id)).toEqual({ ok: false, error: 'already_voted' });
    expect(game.picks[hostId(game)]).toBe(grace.id);
  });

  it('rejects picks outside the playing phase', () => {
    const game = createGame({ hostName: 'Host' }); // waiting
    const grace = addNamed(game, 'Grace');
    expect(castPick(game, hostId(game), grace.id)).toEqual({ ok: false, error: 'not_playing' });
  });
});

describe('everyonePicked / reveal', () => {
  it('everyonePicked requires every present participant to pick', () => {
    const game = playingGame();
    const grace = addNamed(game, 'Grace');
    expect(everyonePicked(game)).toBe(false);
    castPick(game, hostId(game), grace.id);
    expect(everyonePicked(game)).toBe(false);
    castPick(game, grace.id, hostId(game));
    expect(everyonePicked(game)).toBe(true);
  });

  it('ignores disconnected participants', () => {
    const game = playingGame();
    const ghost = addNamed(game, 'Ghost');
    disconnectParticipant(game, ghost.id);
    castPick(game, hostId(game), ghost.id);
    expect(everyonePicked(game)).toBe(true);
  });

  it('reveal requires the host and everyone picked', () => {
    const game = playingGame();
    const grace = addNamed(game, 'Grace');
    expect(reveal(game, grace.id)).toEqual({ ok: false, error: 'not_host' });
    expect(reveal(game, hostId(game))).toEqual({ ok: false, error: 'not_all_voted' });
    castPick(game, hostId(game), grace.id);
    castPick(game, grace.id, hostId(game));
    expect(reveal(game, hostId(game))).toEqual({ ok: true });
    expect(game.status).toBe('revealed');
  });

  it('crowns the teammate with the most picks (ties included)', () => {
    const game = playingGame();
    const grace = addNamed(game, 'Grace');
    const ned = addNamed(game, 'Ned');
    const kim = addNamed(game, 'Kim');
    // Host + Grace pick Ned; Ned + Kim pick Grace → Grace and Ned tie at 2.
    castPick(game, hostId(game), ned.id);
    castPick(game, grace.id, ned.id);
    castPick(game, ned.id, grace.id);
    castPick(game, kim.id, grace.id);
    reveal(game, hostId(game));
    const stats = game.stats!;
    expect(stats.topCount).toBe(2);
    expect(stats.winners.sort()).toEqual([grace.id, ned.id].sort());
    expect(stats.totalPicks).toBe(4);
    expect(stats.counts).toEqual([
      { participantId: grace.id, count: 2 },
      { participantId: ned.id, count: 2 },
    ]);
  });

  it('rejects a second reveal', () => {
    const game = playingGame();
    const grace = addNamed(game, 'Grace');
    castPick(game, hostId(game), grace.id);
    castPick(game, grace.id, hostId(game));
    reveal(game, hostId(game));
    expect(reveal(game, hostId(game))).toEqual({ ok: false, error: 'already_revealed' });
  });

  it('allows the next prompt straight from REVEALED', () => {
    const game = playingGame();
    const grace = addNamed(game, 'Grace');
    castPick(game, hostId(game), grace.id);
    castPick(game, grace.id, hostId(game));
    reveal(game, hostId(game));
    const firstPrompt = game.prompt;
    const res = startPrompt(game, hostId(game));
    expect(res).toEqual({ ok: true });
    expect(game.roundId).toBe(2);
    expect(game.status).toBe('playing');
    expect(game.picks).toEqual({});
    expect(game.prompt).not.toBe(firstPrompt);
  });
});

describe('buildGameSnapshot', () => {
  it('keeps picks private until the reveal', () => {
    const game = playingGame();
    const grace = addNamed(game, 'Grace');
    castPick(game, hostId(game), grace.id);
    const snap = buildGameSnapshot(game);
    expect(snap.status).toBe('playing');
    expect(snap.pickedIds).toEqual([hostId(game)]);
    expect(snap.picks).toEqual({});
    expect(snap.stats).toBeNull();
  });

  it('exposes picks and stats only once revealed', () => {
    const game = playingGame();
    const grace = addNamed(game, 'Grace');
    castPick(game, hostId(game), grace.id);
    castPick(game, grace.id, hostId(game));
    reveal(game, hostId(game));
    const snap = buildGameSnapshot(game);
    expect(snap.status).toBe('revealed');
    expect(snap.picks[hostId(game)]).toBe(grace.id);
    expect(snap.stats!.winners).toContain(grace.id);
  });
});

describe('room management', () => {
  it('locks and unlocks for the host only', () => {
    const game = createGame({ hostName: 'Host' });
    const grace = addNamed(game, 'Grace');
    expect(setLocked(game, grace.id, true)).toEqual({ ok: false, error: 'not_host' });
    expect(setLocked(game, hostId(game), true)).toEqual({ ok: true });
    expect(game.locked).toBe(true);
    expect(setLocked(game, hostId(game), false)).toEqual({ ok: true });
    expect(game.locked).toBe(false);
  });

  it('host can remove a participant and their pick', () => {
    const game = playingGame();
    const grace = addNamed(game, 'Grace');
    castPick(game, grace.id, hostId(game));
    const res = removeParticipant(game, hostId(game), grace.id);
    expect(res).toEqual({ ok: true, removedId: grace.id });
    expect(game.participants.has(grace.id)).toBe(false);
    expect(game.picks[grace.id]).toBeUndefined();
  });

  it('rejects removing the host themself and non-host removals', () => {
    const game = createGame({ hostName: 'Host' });
    const grace = addNamed(game, 'Grace');
    expect(removeParticipant(game, hostId(game), hostId(game))).toEqual({ ok: false, error: 'cannot_remove' });
    expect(removeParticipant(game, grace.id, hostId(game))).toEqual({ ok: false, error: 'not_host' });
  });

  it('marks disconnected participants and promotes a new host when the host leaves', () => {
    const game = createGame({ hostName: 'Host' });
    const grace = addNamed(game, 'Grace');
    disconnectParticipant(game, hostId(game));
    expect(game.hostId).toBe(hostId(game)); // keeps host until gone entirely
    game.participants.delete(hostId(game));
    // Re-run the promotion path via a disconnect of the remaining participant flow.
    disconnectParticipant(game, grace.id);
    expect(game.hostId).toBe(grace.id);
  });
});
