# Multiplayer Games Development Tracker

The master checklist for building out the game catalog, one game at a time.
The source of truth for the game list itself is `src/lib/games.ts` — this
file is the **implementation tracker**: mark a game ✅ only when it is truly
playable, tested, and live in the registry (`status: 'live'`).

## Status Legend

- ⬜ Not Started
- 🟡 In Progress
- ✅ Completed
- ⚠️ Needs Review

## How games get built

1. Find the first `⬜ Not Started` game below (top to bottom, per category).
2. Implement ONLY that game on the shared realtime room architecture.
3. Add scoring, leaderboard, winner celebration and replay.
4. Test it (unit + component + E2E) and fix all issues.
5. Flip its status in `src/lib/games.ts` to `'live'`.
6. Mark it ✅ here — never delete a game from this file.
7. Stop. The next game is implemented only when explicitly requested.

---

## 🧊 Retrospective / Team Icebreakers

- ✅ Would You Rather
- ✅ Most Likely To
- ⬜ This or That
- ⬜ Two Truths & a Lie
- ⬜ Who Said It?
- ⬜ Guess Who
- ⬜ Team Superlatives
- ⬜ Who Knows the Team Best?
- ⬜ Human Bingo
- ⬜ Team Trivia
- ⬜ Emoji Check-in
- ⬜ One Word Check-in
- ⬜ Rose, Thorn & Bud
- ⬜ High, Low, Buffalo
- ⬜ Guess the Mood

## ⚡ Fast Reaction & Speed

- ⬜ Fastest Finger
- ⬜ Quick Math
- ⬜ Speed Quiz
- ⬜ Word Scramble
- ⬜ Anagram Race
- ⬜ Missing Letter
- ⬜ Odd One Out
- ⬜ Pattern Puzzle
- ⬜ Memory Challenge
- ⬜ Reaction Challenge
- ⬜ Typing Race
- ⬜ Category Blitz

## 🧠 Guessing Games

- ⬜ Emoji Guess
- ⬜ Movie Guess
- ⬜ Song Guess
- ⬜ Logo Guess
- ⬜ Famous Person Guess
- ⬜ Country Guess
- ⬜ Image Guess
- ⬜ Zoomed-In Guess
- ⬜ Sound Guess
- ⬜ Mystery Word
- ⬜ 20 Questions
- ⬜ Higher or Lower

## 🎯 Estimation Games

- ✅ Planning Poker
- ⬜ Estimation Battle
- ⬜ Price Is Right
- ⬜ How Many?
- ⬜ Closest Wins
- ⬜ Higher / Lower
- ⬜ Team Estimation

## 😂 Funny & Social

- ⬜ Caption This
- ⬜ Bad Advice
- ⬜ Wrong Answers Only
- ⬜ Finish the Sentence
- ⬜ Complete the Meme
- ⬜ Pun Battle
- ⬜ Roast the Scenario
- ⬜ Excuse Generator
- ⬜ Office Excuse Battle
- ⬜ Fake Product
- ⬜ Fake Startup
- ⬜ Worst Feature Ever
- ⬜ Bug or Feature?
- ⬜ Developer Translator

## 💻 Developer Games

- ⬜ Guess the Error
- ⬜ Guess the Output
- ⬜ Code Trivia
- ⬜ Tech Logo Guess
- ⬜ Programming Language Guess
- ⬜ Guess the Git Command
- ⬜ HTTP Status Challenge
- ⬜ Regex Challenge
- ⬜ SQL Challenge
- ⬜ Debugging Race
- ⬜ Code Scramble
- ⬜ Tech Acronym Quiz
- ⬜ Guess the Framework
- ⬜ Stack Overflow Challenge
- ⬜ Developer Meme Guess

## ✍️ Creative Games

- ⬜ Draw & Guess
- ⬜ One-Line Story
- ⬜ Story Chain
- ⬜ Build a Story
- ⬜ Doodle Battle
- ⬜ Logo Drawing
- ⬜ Draw Without Words
- ⬜ Describe & Draw
- ⬜ Emoji Story
- ⬜ Create a Meme
- ⬜ Name That Product
- ⬜ Tagline Battle

## 🔤 Word Games

- ⬜ Word Chain
- ⬜ Word Association
- ⬜ Last Letter
- ⬜ Forbidden Word
- ⬜ Unscramble
- ⬜ Hangman
- ⬜ Wordle-style Multiplayer
- ⬜ Guess the Word
- ⬜ Alphabet Challenge
- ⬜ Categories
- ⬜ Rhyming Battle
- ⬜ Synonym Race
- ⬜ Opposite Challenge

## 🏆 Competitive Games

- ⬜ Trivia Battle
- ⬜ Quiz Royale
- ⬜ Survival Quiz
- ⬜ Last Player Standing
- ⬜ Point Rush
- ⬜ Team vs Team Quiz
- ⬜ Speed Round
- ⬜ Lightning Round
- ⬜ Knockout
- ⬜ Leaderboard Challenge

---

### Completed

- Planning Poker — implemented (foundation game, pre-dates this tracker)
- Would You Rather — implemented on 2026-08-09
- Most Likely To — implemented on 2026-08-11 (crown ranking 100/80/60/40/20/10 +
  +20 predictor bonus, Play Again keeps session totals)

### Next up

- **This or That** — the next game to build with the shared game engine.
