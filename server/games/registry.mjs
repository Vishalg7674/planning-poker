/**
 * Game registry — the single source of truth for the shipped games on the
 * realtime server.
 *
 * Each entry names the game id, the engine "kind" (how votes work), the socket
 * event clients use to cast a vote, and the JSON data file that holds the
 * prompt/question bank. Adding a new game is one row here + one JSON file in
 * `./data/` — the engine does the rest.
 *
 * The JSON files also carry a `kind` field; it's asserted against the config
 * here so a mis-edited data file fails loudly at boot, not mid-game. `free`
 * games may additionally declare `vote: true` (the room picks the best answer
 * after the submissions reveal) — the engine then exposes a second cast
 * event, `voteEvent`, used during the vote phase.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createGameModule } from './engine.mjs';
import { createTeamHealthModule } from './teamHealth.mjs';
import { createLivePollModule } from './livePoll.mjs';

/** @type {Array<{ id: string, kind: string, castEvent: string, voteEvent?: string, vote?: boolean, file: string }>} */
const GAME_CONFIGS = [
  // --- 🧊 Icebreakers -----------------------------------------------------
  { id: 'most-likely-to', kind: 'teammate', castEvent: 'game:pick', file: 'most-likely-to.json' },
  { id: 'team-superlatives', kind: 'teammate', castEvent: 'game:pick', file: 'team-superlatives.json' },
  { id: 'who-said-it', kind: 'teammate', castEvent: 'game:pick', file: 'who-said-it.json' },
  { id: 'would-you-rather', kind: 'options', castEvent: 'game:choose', file: 'would-you-rather.json' },
  { id: 'this-or-that', kind: 'options', castEvent: 'game:choose', file: 'this-or-that.json' },
  { id: 'emoji-check-in', kind: 'options', castEvent: 'game:choose', file: 'emoji-check-in.json' },
  { id: 'guess-the-mood', kind: 'options', castEvent: 'game:choose', file: 'guess-the-mood.json' },
  { id: 'team-trivia', kind: 'quiz', castEvent: 'game:answer', file: 'team-trivia.json' },
  { id: 'odd-one-out', kind: 'quiz', castEvent: 'game:answer', file: 'odd-one-out.json' },

  // --- ⚡ Fast Reaction & Speed -------------------------------------------
  { id: 'quick-math', kind: 'quiz', castEvent: 'game:answer', file: 'quick-math.json' },
  { id: 'speed-quiz', kind: 'quiz', castEvent: 'game:answer', file: 'speed-quiz.json' },
  { id: 'word-scramble', kind: 'quiz', castEvent: 'game:answer', file: 'word-scramble.json' },
  { id: 'anagram-race', kind: 'quiz', castEvent: 'game:answer', file: 'anagram-race.json' },
  { id: 'missing-letter', kind: 'quiz', castEvent: 'game:answer', file: 'missing-letter.json' },
  { id: 'pattern-puzzle', kind: 'quiz', castEvent: 'game:answer', file: 'pattern-puzzle.json' },

  // --- 🧠 Guessing ---------------------------------------------------------
  { id: 'emoji-guess', kind: 'quiz', castEvent: 'game:answer', file: 'emoji-guess.json' },
  { id: 'movie-guess', kind: 'quiz', castEvent: 'game:answer', file: 'movie-guess.json' },
  { id: 'logo-guess', kind: 'quiz', castEvent: 'game:answer', file: 'logo-guess.json' },
  { id: 'famous-person-guess', kind: 'quiz', castEvent: 'game:answer', file: 'famous-person-guess.json' },
  { id: 'country-guess', kind: 'quiz', castEvent: 'game:answer', file: 'country-guess.json' },
  { id: 'image-guess', kind: 'quiz', castEvent: 'game:answer', file: 'image-guess.json' },
  { id: 'zoomed-in-guess', kind: 'quiz', castEvent: 'game:answer', file: 'zoomed-in-guess.json' },
  { id: 'mystery-word', kind: 'quiz', castEvent: 'game:answer', file: 'mystery-word.json' },
  { id: 'higher-or-lower', kind: 'quiz', castEvent: 'game:answer', file: 'higher-or-lower.json' },

  // --- 💻 Developer --------------------------------------------------------
  { id: 'code-trivia', kind: 'quiz', castEvent: 'game:answer', file: 'code-trivia.json' },
  { id: 'tech-acronym-quiz', kind: 'quiz', castEvent: 'game:answer', file: 'tech-acronym-quiz.json' },
  { id: 'http-status-challenge', kind: 'quiz', castEvent: 'game:answer', file: 'http-status-challenge.json' },
  { id: 'guess-the-output', kind: 'quiz', castEvent: 'game:answer', file: 'guess-the-output.json' },
  { id: 'guess-the-error', kind: 'quiz', castEvent: 'game:answer', file: 'guess-the-error.json' },
  { id: 'tech-logo-guess', kind: 'quiz', castEvent: 'game:answer', file: 'tech-logo-guess.json' },
  { id: 'programming-language-guess', kind: 'quiz', castEvent: 'game:answer', file: 'programming-language-guess.json' },
  { id: 'guess-the-git-command', kind: 'quiz', castEvent: 'game:answer', file: 'guess-the-git-command.json' },
  { id: 'regex-challenge', kind: 'quiz', castEvent: 'game:answer', file: 'regex-challenge.json' },
  { id: 'sql-challenge', kind: 'quiz', castEvent: 'game:answer', file: 'sql-challenge.json' },
  { id: 'debugging-race', kind: 'quiz', castEvent: 'game:answer', file: 'debugging-race.json' },
  { id: 'code-scramble', kind: 'quiz', castEvent: 'game:answer', file: 'code-scramble.json' },
  { id: 'guess-the-framework', kind: 'quiz', castEvent: 'game:answer', file: 'guess-the-framework.json' },
  { id: 'stack-overflow-challenge', kind: 'quiz', castEvent: 'game:answer', file: 'stack-overflow-challenge.json' },
  { id: 'developer-meme-guess', kind: 'quiz', castEvent: 'game:answer', file: 'developer-meme-guess.json' },

  // --- 😂 Funny & Social ---------------------------------------------------
  { id: 'bug-or-feature', kind: 'options', castEvent: 'game:choose', file: 'bug-or-feature.json' },
  { id: 'caption-this', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'caption-this.json' },
  { id: 'bad-advice', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'bad-advice.json' },
  { id: 'wrong-answers-only', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'wrong-answers-only.json' },
  { id: 'finish-the-sentence', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'finish-the-sentence.json' },
  { id: 'complete-the-meme', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'complete-the-meme.json' },
  { id: 'pun-battle', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'pun-battle.json' },
  { id: 'roast-the-scenario', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'roast-the-scenario.json' },
  { id: 'excuse-generator', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'excuse-generator.json' },
  { id: 'office-excuse-battle', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'office-excuse-battle.json' },
  { id: 'fake-product', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'fake-product.json' },
  { id: 'fake-startup', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'fake-startup.json' },
  { id: 'worst-feature-ever', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'worst-feature-ever.json' },
  { id: 'developer-translator', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'developer-translator.json' },

  // --- 🎯 Estimation -------------------------------------------------------
  { id: 'closest-wins', kind: 'estimate', castEvent: 'game:guess', file: 'closest-wins.json' },
  { id: 'how-many', kind: 'estimate', castEvent: 'game:guess', file: 'how-many.json' },
  { id: 'price-is-right', kind: 'estimate', castEvent: 'game:guess', file: 'price-is-right.json' },
  { id: 'estimation-battle', kind: 'estimate', castEvent: 'game:guess', file: 'estimation-battle.json' },
  { id: 'team-estimation', kind: 'estimate', castEvent: 'game:guess', file: 'team-estimation.json' },
  { id: 'higher-lower', kind: 'quiz', castEvent: 'game:answer', file: 'higher-lower.json' },

  // --- 🔤 Word -------------------------------------------------------------
  { id: 'unscramble', kind: 'quiz', castEvent: 'game:answer', file: 'unscramble.json' },
  { id: 'guess-the-word', kind: 'quiz', castEvent: 'game:answer', file: 'guess-the-word.json' },
  { id: 'synonym-race', kind: 'quiz', castEvent: 'game:answer', file: 'synonym-race.json' },
  { id: 'opposite-challenge', kind: 'quiz', castEvent: 'game:answer', file: 'opposite-challenge.json' },

  // --- 🧊 Icebreakers (second wave) ---------------------------------------
  { id: 'two-truths-and-a-lie', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'two-truths-and-a-lie.json' },
  { id: 'guess-who', kind: 'free', castEvent: 'game:submit', file: 'guess-who.json' },
  { id: 'who-knows-the-team-best', kind: 'quiz', castEvent: 'game:answer', file: 'who-knows-the-team-best.json' },
  { id: 'human-bingo', kind: 'free', castEvent: 'game:submit', file: 'human-bingo.json' },
  { id: 'one-word-check-in', kind: 'free', castEvent: 'game:submit', file: 'one-word-check-in.json' },
  { id: 'rose-thorn-bud', kind: 'free', castEvent: 'game:submit', file: 'rose-thorn-bud.json' },
  { id: 'high-low-buffalo', kind: 'free', castEvent: 'game:submit', file: 'high-low-buffalo.json' },

  // --- ⚡ Fast Reaction & Speed (second wave) ------------------------------
  { id: 'fastest-finger', kind: 'quiz', castEvent: 'game:answer', file: 'fastest-finger.json' },
  { id: 'memory-challenge', kind: 'free', castEvent: 'game:submit', file: 'memory-challenge.json' },
  { id: 'reaction-challenge', kind: 'free', castEvent: 'game:submit', file: 'reaction-challenge.json' },
  { id: 'typing-race', kind: 'free', castEvent: 'game:submit', file: 'typing-race.json' },
  { id: 'category-blitz', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'category-blitz.json' },

  // --- 🧠 Guessing (second wave) ------------------------------------------
  { id: 'song-guess', kind: 'quiz', castEvent: 'game:answer', file: 'song-guess.json' },
  { id: 'sound-guess', kind: 'quiz', castEvent: 'game:answer', file: 'sound-guess.json' },
  { id: '20-questions', kind: 'free', castEvent: 'game:submit', file: '20-questions.json' },

  // --- 🎨 Creative ---------------------------------------------------------
  { id: 'draw-and-guess', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'draw-and-guess.json' },
  { id: 'one-line-story', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'one-line-story.json' },
  { id: 'story-chain', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'story-chain.json' },
  { id: 'build-a-story', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'build-a-story.json' },
  { id: 'doodle-battle', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'doodle-battle.json' },
  { id: 'logo-drawing', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'logo-drawing.json' },
  { id: 'draw-without-words', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'draw-without-words.json' },
  { id: 'describe-and-draw', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'describe-and-draw.json' },
  { id: 'emoji-story', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'emoji-story.json' },
  { id: 'create-a-meme', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'create-a-meme.json' },
  { id: 'name-that-product', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'name-that-product.json' },
  { id: 'tagline-battle', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'tagline-battle.json' },

  // --- 🔤 Word (second wave) ----------------------------------------------
  { id: 'word-chain', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'word-chain.json' },
  { id: 'word-association', kind: 'free', castEvent: 'game:submit', file: 'word-association.json' },
  { id: 'last-letter', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'last-letter.json' },
  { id: 'forbidden-word', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'forbidden-word.json' },
  { id: 'hangman', kind: 'free', castEvent: 'game:submit', file: 'hangman.json' },
  { id: 'wordle-multiplayer', kind: 'free', castEvent: 'game:submit', file: 'wordle-multiplayer.json' },
  { id: 'alphabet-challenge', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'alphabet-challenge.json' },
  { id: 'categories', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'categories.json' },
  { id: 'rhyming-battle', kind: 'free', castEvent: 'game:submit', voteEvent: 'game:pick', vote: true, file: 'rhyming-battle.json' },

  // --- 🏆 Competitive ------------------------------------------------------
  { id: 'trivia-battle', kind: 'quiz', castEvent: 'game:answer', file: 'trivia-battle.json' },
  { id: 'quiz-royale', kind: 'quiz', castEvent: 'game:answer', file: 'quiz-royale.json' },
  { id: 'survival-quiz', kind: 'quiz', castEvent: 'game:answer', file: 'survival-quiz.json' },
  { id: 'last-player-standing', kind: 'quiz', castEvent: 'game:answer', file: 'last-player-standing.json' },
  { id: 'point-rush', kind: 'quiz', castEvent: 'game:answer', file: 'point-rush.json' },
  { id: 'team-vs-team-quiz', kind: 'quiz', castEvent: 'game:answer', file: 'team-vs-team-quiz.json' },
  { id: 'speed-round', kind: 'quiz', castEvent: 'game:answer', file: 'speed-round.json' },
  { id: 'lightning-round', kind: 'quiz', castEvent: 'game:answer', file: 'lightning-round.json' },
  { id: 'knockout', kind: 'quiz', castEvent: 'game:answer', file: 'knockout.json' },
  { id: 'leaderboard-challenge', kind: 'quiz', castEvent: 'game:answer', file: 'leaderboard-challenge.json' },
];

/**
 * Resolve a data file. Primary: relative to this module (works in plain
 * Node). Fallback: relative to the process cwd (covers bundler/test runners
 * that rewrite import.meta.url).
 */
function dataFile(file) {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const fromModule = join(moduleDir, 'data', file);
  if (existsSync(fromModule)) return fromModule;
  return resolve(process.cwd(), 'server/games/data', file);
}

function loadPrompts(file, expectedKind) {
  const raw = JSON.parse(readFileSync(dataFile(file), 'utf8'));
  if (raw.kind !== expectedKind) {
    throw new Error(`registry: ${file} declares kind "${raw.kind}" but is configured as "${expectedKind}"`);
  }
  return raw.prompts;
}

export const GAME_MODULES = Object.fromEntries(
  GAME_CONFIGS.map(({ id, kind, castEvent, voteEvent, vote, file }) => [
    id,
    createGameModule({ id, kind, castEvent, voteEvent, vote, prompts: loadPrompts(file, kind) }),
  ]),
);

// Hosted activities that don't use the JSON prompt banks — the host builds
// them at creation time (Team Health categories, Poll question/options). They
// implement the exact same module contract, so the socket layer treats them
// identically to the engine games.
Object.assign(GAME_MODULES, {
  'team-health': createTeamHealthModule(),
  'live-poll': createLivePollModule(),
});

export const GAME_IDS = Object.keys(GAME_MODULES);

/** The cast events → games map, used to wire generic socket handlers. */
export const CAST_EVENTS = new Set(GAME_CONFIGS.flatMap((c) => (c.voteEvent ? [c.castEvent, c.voteEvent] : [c.castEvent])));
CAST_EVENTS.add('game:healthSubmit');
CAST_EVENTS.add('game:pollVote');

export { GAME_KINDS, shuffle, promoteHostIfNeeded, hueFromString } from './engine.mjs';
