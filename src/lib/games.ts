// ---------------------------------------------------------------------------
// Central game registry — the single source of truth for the game catalog.
//
// The homepage, /games page and /games/[gameId] placeholder all render from
// this data. To ship a new game: implement it, flip `status` to 'live' and
// point `route` at its real page — nothing else needs to change.
// ---------------------------------------------------------------------------

export type GameStatus = 'live' | 'coming-soon';

export type CategoryId =
  | 'icebreakers'
  | 'speed'
  | 'guessing'
  | 'estimation'
  | 'funny'
  | 'developer'
  | 'creative'
  | 'word'
  | 'competitive';

export interface Game {
  id: string;
  name: string;
  category: CategoryId;
  description: string;
  icon: string;
  status: GameStatus;
  /** Where the game actually lives. Live games use their real route. */
  route: string;
  players: string;
  duration: string;
}

export interface GameCategory {
  id: CategoryId;
  name: string;
  /** Short label used in filter chips. */
  short: string;
  icon: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const CATEGORIES: GameCategory[] = [
  { id: 'icebreakers', name: 'Retrospective & Team Icebreakers', short: 'Icebreakers', icon: '🧊', description: 'Warm the team up with quick questions, check-ins and shared laughs.' },
  { id: 'speed', name: 'Fast Reaction & Speed', short: 'Speed', icon: '⚡', description: 'How fast can your team think? Race the clock and find out.' },
  { id: 'guessing', name: 'Guessing Games', short: 'Guessing', icon: '🧠', description: 'Test how well your team knows movies, songs, logos and each other.' },
  { id: 'estimation', name: 'Estimation Games', short: 'Estimation', icon: '🎯', description: 'Guesstimate, compare and see who lands closest.' },
  { id: 'funny', name: 'Funny & Social', short: 'Funny', icon: '😂', description: 'Silly prompts, punchlines and office inside jokes.' },
  { id: 'developer', name: 'Developer Games', short: 'Developer', icon: '💻', description: 'Code trivia, bugs and broken builds — for teams that ship.' },
  { id: 'creative', name: 'Creative Games', short: 'Creative', icon: '✍️', description: 'Draw, write and improvise something new together.' },
  { id: 'word', name: 'Word Games', short: 'Word', icon: '🔤', description: 'Quick thinking, faster fingers, one letter at a time.' },
  { id: 'competitive', name: 'Competitive Games', short: 'Competitive', icon: '🏆', description: 'Battle it out, stack points and climb the leaderboard.' },
];

export const CATEGORY_IDS: CategoryId[] = CATEGORIES.map((c) => c.id);

export function getCategory(id: string): GameCategory | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

// ---------------------------------------------------------------------------
// Games (110 total, numbered to match the product backlog)
// ---------------------------------------------------------------------------

const comingSoon = (
  id: string,
  category: CategoryId,
  name: string,
  description: string,
  icon: string,
  players = '3–20 players',
  duration = '5 min',
): Game => ({
  id,
  name,
  category,
  description,
  icon,
  status: 'coming-soon',
  route: `/games/${id}`,
  players,
  duration,
});

export const GAMES: Game[] = [
  // --- 🧊 Icebreakers (1–15) -------------------------------------------------
  {
    id: 'most-likely-to',
    name: 'Most Likely To',
    category: 'icebreakers',
    description: 'Vote for the teammate most likely to do it — crowned teammates earn points, predictors earn bonuses. Live now.',
    icon: '😂',
    status: 'live',
    route: '/games/most-likely-to',
    players: '3–20 players',
    duration: '10 min',
  },
  {
    id: 'would-you-rather',
    name: 'Would You Rather',
    category: 'icebreakers',
    description: 'Tough picks, hot takes, zero right answers. Live now — vote A or B and reveal the split together.',
    icon: '🤔',
    status: 'live',
    route: '/games/would-you-rather',
    players: '2–20 players',
    duration: '10 min',
  },
  comingSoon('this-or-that', 'icebreakers', 'This or That', 'Pick a side and defend it for 10 seconds.', '⚖️'),
  comingSoon('two-truths-and-a-lie', 'icebreakers', 'Two Truths & a Lie', 'Spot the lie before the room votes you out.', '🕵️'),
  comingSoon('who-said-it', 'icebreakers', 'Who Said It?', 'Guess which teammate actually said that quote.', '💬'),
  comingSoon('guess-who', 'icebreakers', 'Guess Who', 'A teammate describes themselves — the room guesses who.', '🫣'),
  comingSoon('team-superlatives', 'icebreakers', 'Team Superlatives', 'Crown the teammate most likely to win every category.', '🏅'),
  comingSoon('who-knows-the-team-best', 'icebreakers', 'Who Knows the Team Best?', 'Answer team questions. Compare answers. Laugh.', '🎓'),
  comingSoon('human-bingo', 'icebreakers', 'Human Bingo', 'Fill your card with teammates who match the squares.', '🟩'),
  comingSoon('team-trivia', 'icebreakers', 'Team Trivia', 'Trivia about the team, for the team.', '🧠'),
  comingSoon('emoji-check-in', 'icebreakers', 'Emoji Check-in', 'How are you really doing? Pick one emoji.', '🙂'),
  comingSoon('one-word-check-in', 'icebreakers', 'One Word Check-in', 'Describe your week in a single word. Go.', '🗣️'),
  comingSoon('rose-thorn-bud', 'icebreakers', 'Rose, Thorn & Bud', 'Share a win, a struggle and something you look forward to.', '🌹'),
  comingSoon('high-low-buffalo', 'icebreakers', 'High, Low, Buffalo', 'The classic daily standup round, gamified.', '🦬'),
  comingSoon('guess-the-mood', 'icebreakers', 'Guess the Mood', 'Rate the vibe. See who reads the room best.', '🎭'),

  // --- ⚡ Fast Reaction & Speed (16–27) --------------------------------------
  comingSoon('fastest-finger', 'speed', 'Fastest Finger', 'First to tap the right answer takes the point.', '👆'),
  comingSoon('quick-math', 'speed', 'Quick Math', 'Arithmetic under pressure — calculators banned.', '🧮'),
  comingSoon('speed-quiz', 'speed', 'Speed Quiz', 'A quiz where every second counts.', '⏱️'),
  comingSoon('word-scramble', 'speed', 'Word Scramble', 'Unscramble the word before the timer runs out.', '🔀'),
  comingSoon('anagram-race', 'speed', 'Anagram Race', 'Rearrange the letters. Race your teammates.', '🔄'),
  comingSoon('missing-letter', 'speed', 'Missing Letter', 'Spot the letter that keeps the word alive.', '🔤'),
  comingSoon('odd-one-out', 'speed', 'Odd One Out', 'Four options. Three fit. Find the imposter.', '🥷'),
  comingSoon('pattern-puzzle', 'speed', 'Pattern Puzzle', 'Spot the pattern faster than everyone else.', '🧩'),
  comingSoon('memory-challenge', 'speed', 'Memory Challenge', 'Memorize the sequence. Then it disappears.', '🧠'),
  comingSoon('reaction-challenge', 'speed', 'Reaction Challenge', 'Tap when the screen changes. Don’t be last.', '⚡'),
  comingSoon('typing-race', 'speed', 'Typing Race', 'First to type the sentence wins the round.', '⌨️'),
  comingSoon('category-blitz', 'speed', 'Category Blitz', 'Name something in the category — fast, fast, fast.', '🎲'),

  // --- 🧠 Guessing (28–39) ---------------------------------------------------
  comingSoon('emoji-guess', 'guessing', 'Emoji Guess', 'Decode the movie, phrase or song from emojis.', '🫠'),
  comingSoon('movie-guess', 'guessing', 'Movie Guess', 'Guess the film from a single screenshot.', '🎬'),
  comingSoon('song-guess', 'guessing', 'Song Guess', 'Name that tune — first notes only.', '🎵'),
  comingSoon('logo-guess', 'guessing', 'Logo Guess', 'Zoomed-out logos. Can you name them all?', '🏷️'),
  comingSoon('famous-person-guess', 'guessing', 'Famous Person Guess', 'Clues drop one by one. Guess before the room does.', '🌟'),
  comingSoon('country-guess', 'guessing', 'Country Guess', 'Guess the country from a shape, flag or food.', '🌍'),
  comingSoon('image-guess', 'guessing', 'Image Guess', 'What is this a photo of? Be specific.', '🖼️'),
  comingSoon('zoomed-in-guess', 'guessing', 'Zoomed-In Guess', 'Extreme close-ups of everyday objects.', '🔬'),
  comingSoon('sound-guess', 'guessing', 'Sound Guess', 'Name it by sound alone.', '🔊'),
  comingSoon('mystery-word', 'guessing', 'Mystery Word', 'One word, endless guesses, shared letters only.', '🕵️‍♀️'),
  comingSoon('20-questions', 'guessing', '20 Questions', 'Twenty yes-or-no questions to crack the answer.', '❓'),
  comingSoon('higher-or-lower', 'guessing', 'Higher or Lower', 'Guess whether the number goes up or down.', '📈'),

  // --- 🎯 Estimation (40–46) -------------------------------------------------
  comingSoon('estimation-battle', 'estimation', 'Estimation Battle', 'Everyone estimates. Closest to the truth wins.', '⚔️'),
  comingSoon('price-is-right', 'estimation', 'Price Is Right', 'Guess the price — without going over.', '💸'),
  comingSoon('how-many', 'estimation', 'How Many?', 'Jelly beans in the jar. Guess the count.', '🫙'),
  comingSoon('closest-wins', 'estimation', 'Closest Wins', 'Estimate, compare, closest takes the point.', '🎯'),
  comingSoon('higher-lower', 'estimation', 'Higher / Lower', 'Estimate the stat, then guess higher or lower.', '↕️'),
  {
    id: 'planning-poker',
    name: 'Planning Poker',
    category: 'estimation',
    description: 'Estimate together, reveal together. The classic sprint-planning game — live now.',
    icon: '🃏',
    status: 'live',
    route: '/create',
    players: '2–20 players',
    duration: '10 min',
  },
  comingSoon('team-estimation', 'estimation', 'Team Estimation', 'Estimate as a team and defend your number.', '🤝'),

  // --- 😂 Funny & Social (47–60) --------------------------------------------
  comingSoon('caption-this', 'funny', 'Caption This', 'Everyone captions the same image. Vote the best.', '🖊️'),
  comingSoon('bad-advice', 'funny', 'Bad Advice', 'Give the worst possible advice. On purpose.', '🙃'),
  comingSoon('wrong-answers-only', 'funny', 'Wrong Answers Only', 'Answer trivia as incorrectly as possible.', '🚫'),
  comingSoon('finish-the-sentence', 'funny', 'Finish the Sentence', 'Start a sentence, let the team finish it hilariously.', '✂️'),
  comingSoon('complete-the-meme', 'funny', 'Complete the Meme', 'Top text, bottom text, your best lines.', '🎭'),
  comingSoon('pun-battle', 'funny', 'Pun Battle', 'Best pun wins the round. No groaning allowed.', '🎤'),
  comingSoon('roast-the-scenario', 'funny', 'Roast the Scenario', 'The most awkward work situation — roast it.', '🔥'),
  comingSoon('excuse-generator', 'funny', 'Excuse Generator', 'Generate excuses, vote the most believable.', '🦥'),
  comingSoon('office-excuse-battle', 'funny', 'Office Excuse Battle', '“The dog ate my ticket” — make it work.', '🐶'),
  comingSoon('fake-product', 'funny', 'Fake Product', 'Invent a ridiculous product and pitch it.', '📦'),
  comingSoon('fake-startup', 'funny', 'Fake Startup', 'Pitch a startup so bad it’s brilliant.', '🚀'),
  comingSoon('worst-feature-ever', 'funny', 'Worst Feature Ever', 'Design the feature no user asked for.', '💣'),
  comingSoon('bug-or-feature', 'funny', 'Bug or Feature?', 'Is it broken or is it intended? The team decides.', '🐛'),
  comingSoon('developer-translator', 'funny', 'Developer Translator', 'Translate “it works on my machine” into business speak.', '🔁'),

  // --- 💻 Developer (61–75) --------------------------------------------------
  comingSoon('guess-the-error', 'developer', 'Guess the Error', 'A stack trace, one chance. What broke?', '🚨'),
  comingSoon('guess-the-output', 'developer', 'Guess the Output', 'Read the snippet. Predict the console output.', '🖥️'),
  comingSoon('code-trivia', 'developer', 'Code Trivia', 'Programming history, languages and lore.', '📚'),
  comingSoon('tech-logo-guess', 'developer', 'Tech Logo Guess', 'Frameworks, clouds and tools — by logo.', '🔷'),
  comingSoon('programming-language-guess', 'developer', 'Programming Language Guess', 'Name the language from its quirkiest snippet.', '🐍'),
  comingSoon('guess-the-git-command', 'developer', 'Guess the Git Command', 'Untangle the mess with the right command.', '🔀'),
  comingSoon('http-status-challenge', 'developer', 'HTTP Status Challenge', 'What status code does that situation deserve?', '🔣'),
  comingSoon('regex-challenge', 'developer', 'Regex Challenge', 'Match the pattern. Escape the chaos.', '🎯'),
  comingSoon('sql-challenge', 'developer', 'SQL Challenge', 'Write the query that answers the question.', '🗄️'),
  comingSoon('debugging-race', 'developer', 'Debugging Race', 'Find the bug before your teammates do.', '🐞'),
  comingSoon('code-scramble', 'developer', 'Code Scramble', 'Rearrange the lines into working code.', '🔀'),
  comingSoon('tech-acronym-quiz', 'developer', 'Tech Acronym Quiz', 'What does that three-letter acronym mean?', '🔡'),
  comingSoon('guess-the-framework', 'developer', 'Guess the Framework', 'Identify the framework from its boilerplate.', '🧱'),
  comingSoon('stack-overflow-challenge', 'developer', 'Stack Overflow Challenge', 'Match the question to its legendary answer.', '📋'),
  comingSoon('developer-meme-guess', 'developer', 'Developer Meme Guess', 'Caption, identify and rate the dev memes.', '😅'),

  // --- ✍️ Creative (76–87) ---------------------------------------------------
  comingSoon('draw-and-guess', 'creative', 'Draw & Guess', 'Sketch it fast, guess it faster.', '🎨'),
  comingSoon('one-line-story', 'creative', 'One-Line Story', 'Everyone adds one line. Chaos becomes canon.', '📖'),
  comingSoon('story-chain', 'creative', 'Story Chain', 'Pass the story around, one twist at a time.', '⛓️'),
  comingSoon('build-a-story', 'creative', 'Build a Story', 'Vote on the best next beat for the group story.', '🏗️'),
  comingSoon('doodle-battle', 'creative', 'Doodle Battle', 'Best doodle for the prompt wins the round.', '✏️'),
  comingSoon('logo-drawing', 'creative', 'Logo Drawing', 'Recreate a famous logo from memory.', '🏷️'),
  comingSoon('draw-without-words', 'creative', 'Draw Without Words', 'No letters, no numbers — only shapes.', '🔇'),
  comingSoon('describe-and-draw', 'creative', 'Describe & Draw', 'Describe it, teammate draws what they hear.', '🗣️'),
  comingSoon('emoji-story', 'creative', 'Emoji Story', 'Tell a whole story using only emojis.', '🫧'),
  comingSoon('create-a-meme', 'creative', 'Create a Meme', 'Template provided. Punchline is on you.', '🖼️'),
  comingSoon('name-that-product', 'creative', 'Name That Product', 'Invent a product, then invent its name.', '🏷️'),
  comingSoon('tagline-battle', 'creative', 'Tagline Battle', 'One product, ten taglines, one winner.', '💬'),

  // --- 🔤 Word (88–100) ------------------------------------------------------
  comingSoon('word-chain', 'word', 'Word Chain', 'Last letter becomes the next word’s first.', '⛓️'),
  comingSoon('word-association', 'word', 'Word Association', 'Say the first word that comes to mind.', '🧠'),
  comingSoon('last-letter', 'word', 'Last Letter', 'New word, last letter of the previous one. Fast.', '🔚'),
  comingSoon('forbidden-word', 'word', 'Forbidden Word', 'Describe it without saying the obvious word.', '🚫'),
  comingSoon('unscramble', 'word', 'Unscramble', 'Mixed-up letters, one clear word.', '🫧'),
  comingSoon('hangman', 'word', 'Hangman', 'The classic. One wrong guess from the gallows.', '🪢'),
  comingSoon('wordle-multiplayer', 'word', 'Wordle-style Multiplayer', 'Guess the word in five tries — together.', '🟩'),
  comingSoon('guess-the-word', 'word', 'Guess the Word', 'Clues drop, letters fill, team guesses.', '🔤'),
  comingSoon('alphabet-challenge', 'word', 'Alphabet Challenge', 'Words in alphabetical order, under pressure.', '🔠'),
  comingSoon('categories', 'word', 'Categories', 'Stop! Name five things in the category.', '🛑'),
  comingSoon('rhyming-battle', 'word', 'Rhyming Battle', 'Rhyme on command or bow out.', '🎤'),
  comingSoon('synonym-race', 'word', 'Synonym Race', 'Another way to say it — race the clock.', '🔄'),
  comingSoon('opposite-challenge', 'word', 'Opposite Challenge', 'Say the opposite. Faster than everyone.', '⚖️'),

  // --- 🏆 Competitive (101–110) ----------------------------------------------
  comingSoon('trivia-battle', 'competitive', 'Trivia Battle', 'Head-to-head trivia across every topic.', '⚔️'),
  comingSoon('quiz-royale', 'competitive', 'Quiz Royale', 'Everyone answers. Wrong answers get voted out.', '👑'),
  comingSoon('survival-quiz', 'competitive', 'Survival Quiz', 'Last one standing with correct answers wins.', '🪖'),
  comingSoon('last-player-standing', 'competitive', 'Last Player Standing', 'Keep answering, keep surviving.', '🏅'),
  comingSoon('point-rush', 'competitive', 'Point Rush', 'Stack points fast in rapid-fire rounds.', '⚡'),
  comingSoon('team-vs-team-quiz', 'competitive', 'Team vs Team Quiz', 'Two teams, one buzzer, bragging rights.', '🆚'),
  comingSoon('speed-round', 'competitive', 'Speed Round', 'Rapid questions, even faster answers.', '⏩'),
  comingSoon('lightning-round', 'competitive', 'Lightning Round', 'No time to think — just answer.', '🌩️'),
  comingSoon('knockout', 'competitive', 'Knockout', 'One wrong answer and you’re out.', '🥊'),
  comingSoon('leaderboard-challenge', 'competitive', 'Leaderboard Challenge', 'Climb the board round after round.', '📊'),
];

export const GAME_COUNT = GAMES.length;

export function getGame(id: string): Game | undefined {
  return GAMES.find((g) => g.id === id);
}

export function gamesByCategory(category: CategoryId): Game[] {
  return GAMES.filter((g) => g.category === category);
}

/** Live games currently playable. */
export const LIVE_GAMES = GAMES.filter((g) => g.status === 'live');
