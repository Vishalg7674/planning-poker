import { describe, expect, it } from 'vitest';
import { createTeamHealthModule, sanitizeHealthConfig, healthStatus } from '../../../server/games/teamHealth.mjs';
import { createLivePollModule, sanitizePollConfig } from '../../../server/games/livePoll.mjs';

type HealthModule = ReturnType<typeof createTeamHealthModule>;
type PollModule = ReturnType<typeof createLivePollModule>;

const HEALTH_CONFIG = {
  title: 'Sprint 24 Team Health',
  categories: ['Communication', 'Collaboration', 'Code Quality', 'Delivery', 'Morale', 'Requirements'],
  scale: 5,
  anonymous: true,
};

const POLL_CONFIG = {
  question: 'Should we deploy this Friday?',
  options: ['Yes', 'No', 'Maybe'],
  type: 'single' as const,
  anonymous: true,
  hideResults: true,
};

function addNamed<T extends { participants: Map<string, any> }>(game: T, name: string) {
  game.participants.set(name, {
    id: name,
    name,
    role: 'voter',
    status: 'connected',
    hasVoted: false,
    skipped: false,
    joinedAt: Date.now(),
    hue: 0,
  });
}

function healthGame(mod: HealthModule) {
  const game = mod.create({ hostName: 'Host', config: HEALTH_CONFIG });
  const res = mod.startPrompt(game, game.hostId!);
  expect(res.ok).toBe(true);
  return game;
}

function pollGame(mod: PollModule) {
  const game = mod.create({ hostName: 'Host', config: POLL_CONFIG });
  const res = mod.startPrompt(game, game.hostId!);
  expect(res.ok).toBe(true);
  return game;
}

const ratings = (n: number) => Object.fromEntries(HEALTH_CONFIG.categories.map((c) => [c, n]));

describe('Team Health Check', () => {
  const mod = createTeamHealthModule();

  it('sanitizes config (categories, scale, anonymity defaults)', () => {
    const clean = sanitizeHealthConfig({ title: '  ', categories: ['A', 'A ', 'B'], scale: 7, anonymous: false });
    expect(clean.title).toBe('Team Health Check'); // empty title → default
    expect(clean.categories).toEqual(['A', 'B']); // trimmed + exact-deduped
    expect(clean.scale).toBe(5); // only 10 is honored, anything else → 5
    expect(clean.anonymous).toBe(false);
    expect(sanitizeHealthConfig({}).scale).toBe(5);
    expect(sanitizeHealthConfig({ scale: 10 }).scale).toBe(10);
  });

  it('healthStatus maps thresholds to verdicts', () => {
    expect(healthStatus(4.0, 5)).toBe('healthy');
    expect(healthStatus(3.9, 5)).toBe('attention');
    expect(healthStatus(3.0, 5)).toBe('attention');
    expect(healthStatus(2.9, 5)).toBe('critical');
    expect(healthStatus(8.0, 10)).toBe('healthy');
    expect(healthStatus(6.0, 10)).toBe('attention');
  });

  it('creates a waiting room with the host seated and config stored', () => {
    const game = mod.create({ hostName: 'Ada', config: HEALTH_CONFIG });
    expect(game.status).toBe('waiting');
    expect(game.hostId).not.toBeNull();
    expect(game.config.title).toBe('Sprint 24 Team Health');
    expect(game.config.categories).toHaveLength(6);
    expect(game.config.scale).toBe(5);
    expect(game.responses).toEqual({});
  });

  it('startPrompt only from waiting/revealed and resets responses', () => {
    const game = healthGame(mod);
    expect(game.status).toBe('playing');
    expect(game.roundId).toBe(1);
    addNamed(game, 'Ned');
    expect(mod.cast(game, 'Ned', { ratings: ratings(4) }).ok).toBe(true);
    expect(mod.startPrompt(game, game.hostId!).ok).toBe(false); // in progress
    expect(mod.cast(game, game.hostId!, { ratings: ratings(4) }).ok).toBe(true);
    expect(mod.reveal(game, game.hostId!).ok).toBe(true);
    // New Health Check — same room, fresh round, responses reset.
    const res = mod.startPrompt(game, game.hostId!);
    expect(res.ok).toBe(true);
    expect(game.roundId).toBe(2);
    expect(game.responses).toEqual({});
    expect(game.status).toBe('playing');
  });

  it('validates that every category is rated within scale', () => {
    const game = healthGame(mod);
    addNamed(game, 'Ned');
    expect(mod.cast(game, 'Ned', { ratings: ratings(6) }).ok).toBe(false); // above scale
    expect(mod.cast(game, 'Ned', { ratings: ratings(0) }).ok).toBe(false); // below scale
    const missing = { ...ratings(3), Communication: undefined };
    expect(mod.cast(game, 'Ned', { ratings: missing }).ok).toBe(false); // incomplete
    expect(mod.cast(game, 'Ned', { ratings: ratings(4) }).ok).toBe(true);
    expect(mod.cast(game, 'Ned', { ratings: ratings(5) }).ok).toBe(false); // no take-backs
  });

  it('reveal computes per-category + overall averages with correct rounding', () => {
    const game = healthGame(mod);
    addNamed(game, 'Ned');
    addNamed(game, 'Priya');
    // Ned 4 (Communication 2), Priya 5, Host 4 → 13/3 = 4.33 → 4.3 per
    // category; Communication is 2+5+4 = 11/3 = 3.67 → 3.7.
    mod.cast(game, 'Ned', { ratings: { ...ratings(4), Communication: 2 } });
    mod.cast(game, 'Priya', { ratings: ratings(5) });
    expect(mod.everyoneVoted(game)).toBe(false); // host hasn't submitted
    expect(mod.cast(game, game.hostId!, { ratings: ratings(4) }).ok).toBe(true);
    expect(mod.everyoneVoted(game)).toBe(true);
    const res = mod.reveal(game, game.hostId!);
    expect(res.ok).toBe(true);
    const stats = game.stats as any;
    expect(stats.submitted).toBe(3);
    const comm = stats.categories.find((c: any) => c.name === 'Communication');
    expect(comm.average).toBe(3.7);
    expect(stats.categories.every((c: any) => c.average === 4.3 || c.name === 'Communication')).toBe(true);
    // Overall = average of category averages: (3.7 + 4.3*5) / 6 = 25.2/6 = 4.2
    expect(stats.overall).toBe(4.2);
    expect(stats.overallStatus).toBe('healthy');
    expect(game.history).toHaveLength(1);
    // Anonymous by default → no breakdown, no per-participant ratings.
    expect(stats.breakdown).toEqual([]);
    expect((game.stats as any).anonymous).toBe(true);
  });

  it('non-anonymous mode exposes the per-participant breakdown at reveal', () => {
    const game = mod.create({ hostName: 'Host', config: { ...HEALTH_CONFIG, anonymous: false } });
    mod.startPrompt(game, game.hostId!);
    addNamed(game, 'Ned');
    mod.cast(game, 'Ned', { ratings: ratings(4) });
    mod.cast(game, game.hostId!, { ratings: ratings(5) });
    mod.reveal(game, game.hostId!);
    const ids = (game.stats as any).breakdown.map((b: any) => b.participantId);
    expect(ids).toHaveLength(2);
    expect(ids).toContain('Ned');
    expect(ids).toContain(game.hostId);
    const snap = mod.buildGameSnapshot(game);
    expect(Object.keys(snap.votes)).toContain('Ned');
  });

  it('snapshot never leaks ratings before reveal — only who submitted', () => {
    const game = healthGame(mod);
    addNamed(game, 'Ned');
    mod.cast(game, 'Ned', { ratings: ratings(4) });
    const snap = mod.buildGameSnapshot(game);
    expect(snap.status).toBe('playing');
    expect(snap.stats).toBeNull();
    expect(snap.votedIds).toContain('Ned');
    expect(Object.keys(snap.votes)).toHaveLength(0);
    expect(snap.history).toEqual([]);
  });

  it('rejects submissions after reveal, rejects non-host reveal', () => {
    const game = healthGame(mod);
    addNamed(game, 'Ned');
    mod.cast(game, 'Ned', { ratings: ratings(4) });
    mod.cast(game, game.hostId!, { ratings: ratings(4) });
    expect(mod.reveal(game, 'Ned').ok).toBe(false);
    expect(mod.reveal(game, game.hostId!).ok).toBe(true);
    addNamed(game, 'Later');
    expect(mod.cast(game, 'Later', { ratings: ratings(3) }).ok).toBe(false);
  });

  it('trend compares against the previous check', () => {
    const game = healthGame(mod);
    mod.cast(game, game.hostId!, { ratings: ratings(2) });
    mod.reveal(game, game.hostId!);
    expect((game.stats as any).trend).toBeNull(); // no previous
    mod.startPrompt(game, game.hostId!);
    mod.cast(game, game.hostId!, { ratings: ratings(4) });
    mod.reveal(game, game.hostId!);
    expect((game.stats as any).previous).toBe(2);
    expect((game.stats as any).trend).toBe(100); // (4-2)/2
  });
});

describe('Live Poll', () => {
  const mod = createLivePollModule();

  it('sanitizes config (question, options, type, privacy defaults)', () => {
    const clean = sanitizePollConfig({ question: 'q', options: ['A', 'B', 'A'], type: 'nope' as any });
    expect(clean.options).toEqual(['A', 'B']); // deduped
    expect(clean.type).toBe('single');
    expect(clean.anonymous).toBe(true);
    expect(clean.hideResults).toBe(true);
    const yn = sanitizePollConfig({ type: 'yesno' });
    expect(yn.type).toBe('yesno');
    expect(yn.options).toEqual(['Yes', 'No']);
    const multi = sanitizePollConfig({ type: 'multiple', options: ['A', 'B'] });
    expect(multi.type).toBe('multiple');
  });

  it('creates a waiting room with the host seated', () => {
    const game = mod.create({ hostName: 'Ada', config: POLL_CONFIG });
    expect(game.status).toBe('waiting');
    expect(game.hostId).not.toBeNull();
    expect(game.config.question).toBe('Should we deploy this Friday?');
    expect(game.config.options).toEqual(['Yes', 'No', 'Maybe']);
  });

  it('single choice: one vote per participant, validated against options', () => {
    const game = pollGame(mod);
    addNamed(game, 'Ned');
    expect(mod.cast(game, 'Ned', '9').ok).toBe(false); // out of range
    expect(mod.cast(game, 'Ned', 'abc').ok).toBe(false);
    expect(mod.cast(game, 'Ned', '1').ok).toBe(true); // No
    expect(mod.cast(game, 'Ned', '2').ok).toBe(false); // already voted
    expect((game.votes as Record<string, string>)['Ned']).toBe('1');
  });

  it('multiple choice: array of indices, deduped, non-empty', () => {
    const game = pollGame(mod);
    (game.config as any).type = 'multiple';
    addNamed(game, 'Ned');
    expect(mod.cast(game, 'Ned', []).ok).toBe(false);
    expect(mod.cast(game, 'Ned', ['0', '2', '0']).ok).toBe(true);
    expect((game.votes as Record<string, string[]>)['Ned']).toEqual(['0', '2']);
    expect(mod.cast(game, 'Ned', ['1']).ok).toBe(false); // one vote only
  });

  it('reveal computes counts, percentages and the winner', () => {
    const game = pollGame(mod);
    addNamed(game, 'Ned');
    addNamed(game, 'Priya');
    addNamed(game, 'Amit');
    mod.cast(game, 'Ned', '0'); // Yes
    mod.cast(game, 'Priya', '0'); // Yes
    mod.cast(game, 'Amit', '2'); // Maybe
    mod.cast(game, game.hostId!, '1'); // No
    expect(mod.everyoneVoted(game)).toBe(true);
    expect(mod.reveal(game, game.hostId!).ok).toBe(true);
    const s = game.stats as any;
    expect(s.totalVotes).toBe(4);
    expect(s.counts).toEqual([
      { option: 0, count: 2, percent: 50 },
      { option: 1, count: 1, percent: 25 },
      { option: 2, count: 1, percent: 25 },
    ]);
    expect(s.winner).toBe(0);
    expect(s.topCount).toBe(2);
  });

  it('snapshot hides results before reveal and hides identities in anonymous mode', () => {
    const game = pollGame(mod);
    addNamed(game, 'Ned');
    mod.cast(game, 'Ned', '0');
    const pre = mod.buildGameSnapshot(game);
    expect(pre.votedIds).toEqual(['Ned']);
    expect(Object.keys(pre.votes)).toHaveLength(0);
    expect(pre.stats).toBeNull();
    expect(pre.liveCounts).toBeNull();
    mod.cast(game, game.hostId!, '1');
    mod.reveal(game, game.hostId!);
    const post = mod.buildGameSnapshot(game);
    expect((post.stats as any).winner).toBeDefined();
    expect(Object.keys(post.votes)).toHaveLength(0); // anonymous → no identities
  });

  it('hideResults = OFF exposes aggregate live counts only', () => {
    const game = mod.create({ hostName: 'Host', config: { ...POLL_CONFIG, hideResults: false } });
    mod.startPrompt(game, game.hostId!);
    addNamed(game, 'Ned');
    mod.cast(game, 'Ned', '0');
    const snap = mod.buildGameSnapshot(game);
    expect(snap.liveCounts).toEqual({ counts: [1, 0, 0], total: 1 });
    // Still no identities or per-option pre-reveal in the hidden-votes path.
    expect(Object.keys(snap.votes)).toHaveLength(0);
  });

  it('New Poll resets votes in the same room', () => {
    const game = pollGame(mod);
    addNamed(game, 'Ned');
    mod.cast(game, 'Ned', '0');
    mod.cast(game, game.hostId!, '1');
    mod.reveal(game, game.hostId!);
    expect(game.history).toHaveLength(1);
    expect(mod.startPrompt(game, game.hostId!).ok).toBe(true);
    expect(game.roundId).toBe(2);
    expect(game.votes).toEqual({});
    expect(game.stats).toBeNull();
    expect(game.status).toBe('playing');
  });
});
