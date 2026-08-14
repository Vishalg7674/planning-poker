/**
 * Cross-check: every 'live' game in the catalog (src/lib/games.ts) must have
 *  - a registry entry (server/games/registry.mjs → data file)
 *  - a client config (src/lib/gameConfig.ts)
 * and every registry entry / data file must be backed by a live catalog row.
 * Exit 1 on any mismatch so CI can run this as a consistency gate.
 */
import { readFileSync } from 'node:fs';
import { GAME_MODULES, GAME_IDS } from '../server/games/registry.mjs';

const gamesSrc = readFileSync(new URL('../src/lib/games.ts', import.meta.url), 'utf8');
const configSrc = readFileSync(new URL('../src/lib/gameConfig.ts', import.meta.url), 'utf8');

// Catalog: every game id is live (there are no coming-soon games anymore).
// Ids appear as object-literal `id: '…'` OR as the `liveGame('…', …)` helper.
// Only scan the GAMES array (the categories above it also use `id:`).
const gamesArray = gamesSrc.slice(gamesSrc.indexOf('export const GAMES'));
const catalogIds = new Set();
for (const m of gamesArray.matchAll(/id: '([^']+)'/g)) catalogIds.add(m[1]);
for (const m of gamesArray.matchAll(/liveGame\('([^']+)'/g)) catalogIds.add(m[1]);
const liveCatalog = catalogIds;

// Client config ids (ENGINE_GAME_IDS seeds).
const configIds = new Set();
for (const m of configSrc.matchAll(/id: '([^']+)',\s*\n\s*kind:/g)) configIds.add(m[1]);

// Planning poker lives at /create, not the engine — it's the one live game
// allowed to have no engine module.
const PLANNING_POKER = 'planning-poker';

const problems = [];

for (const id of liveCatalog) {
  if (id === PLANNING_POKER) continue;
  if (!GAME_IDS.includes(id)) problems.push(`catalog live game "${id}" has no registry entry`);
  if (!configIds.has(id)) problems.push(`catalog live game "${id}" has no client config`);
}

for (const id of GAME_IDS) {
  if (!catalogIds.has(id)) problems.push(`registry game "${id}" is missing from the catalog`);
  const mod = GAME_MODULES[id];
  if (!mod || !Array.isArray(mod.PROMPTS) || mod.PROMPTS.length === 0) {
    problems.push(`registry game "${id}" has no prompts loaded`);
  }
}

// Data files must all be registered (no orphan prompt banks).
const { readdirSync } = await import('node:fs');
const dataDir = new URL('../server/games/data/', import.meta.url);
const dataFiles = readdirSync(dataDir).filter((f) => f.endsWith('.json'));
const registryFiles = new Set();
const registrySrc = readFileSync(new URL('../server/games/registry.mjs', import.meta.url), 'utf8');
for (const m of registrySrc.matchAll(/file: '([^']+)'/g)) registryFiles.add(m[1]);
for (const f of dataFiles) {
  if (!registryFiles.has(f)) problems.push(`data file "${f}" is not registered in the registry`);
}

if (problems.length) {
  console.error(`Game consistency check FAILED (${problems.length} issue${problems.length === 1 ? '' : 's'}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(
  `Game consistency check OK — ${liveCatalog.size} live catalog games, ${GAME_IDS.length} engine games, ${dataFiles.length} prompt banks, ${configIds.size} client configs.`,
);
