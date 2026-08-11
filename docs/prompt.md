# Build All Multiplayer Games — Incremental Game Development System

The existing Next.js application has already been redesigned as a **real-time multiplayer games platform for teams, retrospectives, icebreakers, and fun**.

Planning Poker is already implemented.

Now I want to start implementing the remaining games **one by one**.

Do NOT attempt to implement all games in a single task.

The application must be developed incrementally, with strong reusable architecture, shared multiplayer infrastructure, scoring, leaderboards, animations, and testing.

---

# 1. CREATE `games.md`

Create a root-level file:

```text
games.md
```

This file is the **master game-development checklist**.

Add all 110 games currently defined in the homepage/game registry.

Use this structure:

```md
# Multiplayer Games Development Tracker

## Status Legend

- ⬜ Not Started
- 🟡 In Progress
- ✅ Completed
- ⚠️ Needs Review

---

## Retrospective / Team Icebreakers

- ⬜ Most Likely To
- ⬜ Would You Rather
- ⬜ This or That
  ...
```

Include all 110 games grouped exactly according to the existing categories.

---

# 2. IMPORTANT GAME DEVELOPMENT RULE

We will develop games **one at a time**.

Whenever I ask:

> "Develop the next game"

you must:

1. Read `games.md`
2. Find the first game marked `⬜ Not Started`
3. Implement ONLY that game
4. Test it
5. Fix all issues
6. Mark that game as:

```md
- ✅ Game Name
```

7. Do not implement the next game automatically.

The next game should only be implemented when I explicitly request it.

---

# 3. NEVER DELETE THE GAME FROM `games.md`

Do not remove completed games from the file.

Change:

```md
- ⬜ Most Likely To
```

to:

```md
- ✅ Most Likely To
```

This gives us a permanent implementation history.

Optionally add:

```md
### Completed

- Most Likely To — implemented on YYYY-MM-DD
```

if useful.

---

# 4. FIRST CREATE THE SHARED GAME ENGINE

Before implementing multiple games, inspect the existing Planning Poker architecture.

Do NOT duplicate its realtime logic.

Extract/create reusable multiplayer infrastructure where appropriate.

The application should have a generic concept like:

```text
Game
Game Room
Host
Participants
Rounds
Game State
Score
Leaderboard
Winner
```

Conceptually:

```text
GAME ROOM
   │
   ├── Host
   │
   ├── Participants
   │
   ├── Current Game
   │
   ├── Current Round
   │
   ├── Player Actions
   │
   ├── Scores
   │
   └── Results
```

Planning Poker should continue working.

Do not break existing Planning Poker functionality.

---

# 5. COMMON GAME FLOW

Unless a particular game requires a different flow, use this standard:

```text
GAME LANDING
      ↓
ENTER NAME
      ↓
LOBBY
      ↓
HOST STARTS GAME
      ↓
ROUND START
      ↓
PLAYERS PLAY
      ↓
ROUND ENDS
      ↓
CALCULATE POINTS
      ↓
SHOW RESULTS
      ↓
UPDATE LEADERBOARD
      ↓
NEXT ROUND
      ↓
FINAL RESULTS
```

The experience should feel consistent across games.

---

# 6. PLAYER JOIN FLOW

Every multiplayer game should support:

```text
Enter your name
```

Example:

```text
┌─────────────────────────────┐
│                             │
│        🎮 Most Likely To    │
│                             │
│      Enter your name        │
│                             │
│  [ Vishal_______________ ]  │
│                             │
│       [ Join Game ]         │
│                             │
└─────────────────────────────┘
```

No login.

No signup.

No account creation.

No password.

No email.

After entering a valid name:

```text
→ Join/create room
→ Enter lobby
```

---

# 7. ROOM MODEL

Games should support the existing room philosophy:

```text
Host creates room
        ↓
Share room link
        ↓
Other players open link
        ↓
Enter name
        ↓
Join room
        ↓
Host starts game
```

Do not require users to create accounts.

---

# 8. PLAYER IDENTITY

Do NOT rely only on player name.

Generate a temporary unique player ID for each participant.

Example:

```js
playerId;
name;
isHost;
isConnected;
score;
```

Names should be unique within a room.

If someone tries:

```text
Vishal
```

while Vishal already exists:

Show:

> This name is already taken. Please choose another name.

---

# 9. COMMON PLAYER STATES

Where applicable, support:

```text
joined
ready
playing
answered
waiting
disconnected
reconnected
eliminated
winner
```

Only use states relevant to the specific game.

---

# 10. SCORING SYSTEM

Every competitive game should have a common scoring system.

Create a reusable scoring utility/service.

Default ranking-based scoring:

```text
1st place  → 100 points
2nd place  → 80 points
3rd place  → 60 points
4th place  → 40 points
5th place  → 20 points
6th+       → 10 points
```

However, games can override the scoring strategy when necessary.

For example:

### Fastest-answer games

```text
1st correct → 100
2nd correct → 80
3rd correct → 60
```

### Voting games

Points may be based on:

- Correct prediction
- Majority choice
- Most votes
- Winning answer
- Participation

### Elimination games

Points can depend on:

- Survival
- Position
- Final ranking

The scoring system should be centralized and configurable.

---

# 11. TIE HANDLING

Define a consistent tie strategy.

For example:

```text
If two players finish in the same position:

Both receive the same points.

The next rank is skipped.
```

Example:

```text
Vishal  100
Rahul   80
Amit    80
Priya   40
```

Or use the game's specific scoring rules where appropriate.

Do not silently assign arbitrary rankings.

---

# 12. TOTAL SCORE

Maintain:

```text
Current Round Score
+
Total Game Score
```

Example:

```text
ROUND 3

🥇 Vishal +100
🥈 Rahul  +80
🥉 Amit   +60

TOTAL

Vishal  280
Rahul   240
Amit    180
```

---

# 13. LEADERBOARD

Create a reusable:

```text
<Leaderboard />
```

component.

It should support:

- Current round
- Total score
- Ranking
- Player avatar/initials
- Medal
- Score
- Score change animation

Example:

```text
🏆 LEADERBOARD

🥇 Vishal      420 pts
🥈 Rahul       360 pts
🥉 Priya       300 pts
4️⃣ Amit        240 pts
5️⃣ Neha        180 pts
```

---

# 14. MEDALS

Use:

### 🥇 Gold

For first place.

### 🥈 Silver

For second place.

### 🥉 Bronze

For third place.

Do not use "brown" for third place.

Use a proper bronze medal representation.

The top three should receive visually distinct treatment.

---

# 15. WINNER CELEBRATION

After each game/session ends, show a celebration modal.

Example:

```text
┌──────────────────────────────────┐
│                                  │
│             🎉                   │
│                                  │
│        GAME COMPLETE!            │
│                                  │
│            🥇                    │
│                                  │
│          VISHAL                  │
│                                  │
│       420 POINTS                 │
│                                  │
│   🥈 Rahul       360             │
│   🥉 Priya       300             │
│                                  │
│      [ Play Again ]              │
│      [ Back to Games ]           │
│                                  │
└──────────────────────────────────┘
```

---

# 16. CELEBRATION ANIMATIONS

Create a reusable celebration system.

Possible effects:

- Confetti
- Medal animation
- Winner entrance
- Score counter animation
- Ranking transition
- Subtle particle effects
- Trophy animation
- Card flip
- Scale/bounce

Keep animations performant.

Do NOT use excessive animations.

Respect:

```text
prefers-reduced-motion
```

---

# 17. WINNER MODAL

Create a reusable:

```text
<WinnerModal />
```

Props/configuration should support:

```text
winner
ranking
scores
gameName
totalRounds
```

The modal should be reusable across all games.

---

# 18. ROUND RESULTS

After every round, show:

```text
ROUND RESULTS

🥇 Vishal       +100
🥈 Rahul         +80
🥉 Priya         +60

--------------------

TOTAL SCORES

Vishal          300
Rahul           240
Priya           180
```

Allow:

```text
[ Next Round ]
```

Only the host should control starting the next round where appropriate.

---

# 19. SCORE ANIMATION

When a player receives points:

Animate:

```text
+100
```

near their score.

Then update:

```text
300 → 400
```

with a smooth counter animation.

Do not use jarring animations.

---

# 20. GAME END

Every game should have a clear end state.

Example:

```text
🎉 GAME OVER

Final Leaderboard

🥇 Vishal       520
🥈 Rahul        460
🥉 Priya        380
```

Then:

```text
[ Play Again ]
[ Back to Games ]
```

Host can restart the game.

---

# 21. PLAY AGAIN

When the host selects:

```text
Play Again
```

reset:

- Round
- Answers
- Temporary game state
- Eliminations
- Current round data

But decide whether total score should:

### Option A

Reset completely.

or

### Option B

Keep session leaderboard.

Default to:

> Keep total session score.

This allows teams to play multiple games and determine an overall champion.

---

# 22. GAME NIGHT SESSION

Prepare the architecture for a future:

```text
Game Night
```

concept.

A session could eventually contain:

```text
Planning Poker
↓
Most Likely To
↓
Trivia
↓
Emoji Guess
↓
Fastest Finger
```

And maintain:

```text
OVERALL SCORE

🥇 Vishal      820
🥈 Rahul       740
🥉 Priya       650
```

Do not necessarily build the full Game Night feature now.

But do not architect individual games in a way that prevents it.

---

# 23. GAME-SPECIFIC UI

Every game should have its own identity.

Do not simply copy Planning Poker's UI.

Reuse:

- Navigation
- Buttons
- Cards
- Modal
- Leaderboard
- Player list
- Room components
- Animations

But design the central game experience specifically for each game.

---

# 24. GAME PAGE STRUCTURE

Where applicable:

```text
HEADER
   Game name
   Round
   Player count
   Score

GAME AREA
   Question / challenge

PLAYER AREA
   Participants

ACTION AREA
   Answer / vote / submit

RESULTS
   Round ranking

LEADERBOARD
   Total points
```

---

# 25. HOST CONTROLS

Where applicable, host should have:

```text
Start Game
Start Round
Next Round
Reveal
End Game
Restart
```

Controls should be clearly separated from player controls.

Do not expose host-only controls to regular participants.

---

# 26. PLAYER EXPERIENCE

Regular players should see:

```text
Current game
Current question
Their answer controls
Other players' status where appropriate
Their score
Leaderboard when allowed
```

Do not expose hidden information.

For example, in anonymous guessing games, don't reveal the author before the reveal phase.

---

# 27. REALTIME SYNCHRONIZATION

Use the application's existing realtime technology.

Do not introduce another realtime backend unless absolutely necessary.

All participants should see state changes in realtime:

- Player joined
- Player disconnected
- Host started
- Round started
- Answer submitted
- Timer started
- Round ended
- Results revealed
- Scores updated
- Winner announced

---

# 28. RECONNECTION

If a player temporarily disconnects:

```text
Disconnected
```

When they reconnect:

```text
Reconnected
```

Restore their temporary session where possible.

Do not allow duplicate players after reconnecting.

---

# 29. SECURITY / SERVER AUTHORITY

Do not trust client-side scores.

Important:

```text
Client submits answer
        ↓
Server validates
        ↓
Server calculates result
        ↓
Server awards points
        ↓
Server broadcasts updated score
```

Players must not be able to manipulate:

```text
score
rank
winner
answer correctness
game state
```

Use server-authoritative validation wherever the current backend supports it.

---

# 30. GAME-SPECIFIC RULES

Each game implementation must document:

```text
Objective
Players
Game setup
Round flow
Answer flow
Scoring
Tie handling
Winner calculation
Game end
Restart behavior
```

Do not force identical gameplay rules onto every game.

The common engine should provide infrastructure, not dictate the game's rules.

---

# 31. IMPLEMENTATION PROCESS FOR EACH GAME

For every game, follow exactly this process:

## Step 1 — Read tracker

Open:

```text
games.md
```

Find the first:

```text
⬜
```

game.

---

## Step 2 — Understand the game

Before coding, define:

```text
Objective
Players
Host responsibilities
Player responsibilities
Game states
Round states
Scoring
Tie handling
End condition
```

---

## Step 3 — Design the game state

Define the minimum state required.

Example:

```js
{
  (roomId, gameId, round, phase, players, question, answers, results, scores);
}
```

Do not add unnecessary state.

---

## Step 4 — Implement

Build the complete game.

It must not be a mockup.

It must be playable by multiple people in the same room.

---

## Step 5 — Add scoring

Implement the appropriate scoring strategy.

---

## Step 6 — Add leaderboard

Show current and total scores.

---

## Step 7 — Add winner celebration

Add:

- Winner modal
- Gold/silver/bronze medals
- Confetti
- Score animation
- Ranking animation

---

## Step 8 — Add replay

Allow host to start another round/game.

---

## Step 9 — Test

Add:

### Unit tests

Test:

- Game rules
- Scoring
- Ranking
- Tie handling
- State transitions
- Winner calculation

### Component tests

Test:

- Game UI
- Player interaction
- Results
- Leaderboard
- Winner modal

### Playwright E2E

Test at least:

```text
Host creates room
↓
Player 1 joins
↓
Player 2 joins
↓
Host starts game
↓
Players play
↓
Results generated
↓
Scores calculated
↓
Leaderboard displayed
↓
Winner displayed
↓
Play Again works
```

For multiplayer E2E, use multiple browser contexts where necessary.

---

# 32. UPDATE DOCUMENTATION

After completing each game, update relevant documentation.

At minimum:

```text
games.md
```

must be updated.

If the architecture changed significantly:

```text
ARCHITECTURE.md
TRD.md
```

should also be updated.

Do not create unnecessary documentation files for every game.

---

# 33. UPDATE GAME REGISTRY

When implementing a game, change its registry status:

```js
status: "coming-soon";
```

to:

```js
status: "live";
```

The homepage should automatically show:

```text
LIVE
```

instead of:

```text
COMING SOON
```

---

# 34. ROUTING

The game should use its already-created route.

Do not create duplicate routes.

Example:

```text
/games/most-likely-to
```

If the route currently points to a Coming Soon page, replace that page with the actual game.

---

# 35. DO NOT BREAK EXISTING GAMES

Before modifying shared infrastructure:

Run the existing tests.

After implementation:

Run all tests again.

Especially verify:

```text
Planning Poker
```

still works.

---

# 36. TEST COMMANDS

Use the project's existing scripts.

At minimum:

```bash
npm run lint
npm test
npm run test:e2e
npm run build
```

If the project uses different scripts, inspect `package.json` and use the correct commands.

Fix all errors before marking a game complete.

---

# 37. PERFORMANCE

The website must remain fast.

Avoid:

- Unnecessary rerenders
- Large client-side state objects
- Excessive effects
- Unnecessary realtime subscriptions
- Memory leaks
- Heavy animation libraries unless already present
- Loading all game assets unnecessarily

Lazy-load game-specific resources where appropriate.

---

# 38. MOBILE

Every game must work on:

```text
Desktop
Tablet
Mobile
```

Players may join from their phone while the host shares their desktop screen.

This is especially important.

---

# 39. ACCESSIBILITY

Every game should support:

- Keyboard navigation
- Focus states
- Accessible buttons
- Accessible form controls
- Screen-reader-friendly labels
- Sufficient contrast
- Reduced motion

Do not rely only on color to communicate state.

---

# 40. GAME DEVELOPMENT ORDER

Use the order already defined in `games.md`.

Do not randomly select games.

The first implementation after this architecture setup should be:

```text
Most Likely To
```

Then:

```text
Would You Rather
```

Then:

```text
This or That
```

and continue in the exact order of `games.md`.

---

# 41. IMPORTANT — DO NOT IMPLEMENT THE NEXT GAME

After completing one game:

STOP.

Do not automatically implement another game.

Update:

```text
games.md
```

Then report:

```text
Game completed:
Most Likely To

Status:
✅ Complete

Tests:
✅ Unit
✅ Component
✅ E2E
✅ Build

Next game:
Would You Rather
```

Wait for my next instruction.

---

# 42. FIRST TASK

For this request, do NOT implement all games.

First:

1. Inspect the existing application.
2. Inspect Planning Poker architecture.
3. Create `games.md`.
4. Add all 110 games with their existing categories.
5. Build/refactor only the reusable game infrastructure required for future games.
6. Create reusable scoring utilities.
7. Create reusable leaderboard.
8. Create reusable medals/ranking UI.
9. Create reusable winner celebration modal.
10. Create reusable score animation.
11. Create reusable game lifecycle/state abstractions where appropriate.
12. Ensure Planning Poker continues working.
13. Add tests for the shared infrastructure.
14. Do NOT implement "Most Likely To" in this first infrastructure task unless the existing architecture already makes the implementation trivial and isolated.

After the infrastructure is complete, stop.

The next explicit request will begin implementing the first game.

---

# 43. QUALITY BAR

The final product should feel like a polished commercial product, not a collection of demo games.

Prioritize:

```text
Simple
Fast
Fun
Realtime
Reliable
Responsive
Accessible
Beautiful
```

The most important user experience is:

> **Enter name → Join → Play → Earn points → See your rank → Celebrate winner.**

Every game should feel like it belongs to the same platform while still having its own personality.
