# Product Requirements Document — Reveal

## Product vision

A **real-time multiplayer games platform for teams** — "Break the ice. Play
together. No login required." The full catalog is live: **112 games across
10 categories** (agile, icebreakers, speed, guessing, estimation, funny,
developer, creative, word, competitive), including the featured **Planning
Poker** game, two hosted agile ceremonies (**Team Health Check**, **Live
Poll**) and every engine-backed game rendered through the shared `GameRoom`.

Whatever the game, the core product philosophy stays identical: create a
room, share a link (or a QR code), everyone plays together in real time — no
accounts, no database, no history. Rooms exist in memory and vanish when
they empty.

## Problem statement

Teams waste the first ten minutes of every meeting on setup: signups, links,
accounts and tool sprawl. Estimating sessions in particular are interrupted
by stories, dashboards and histories — and the temptation to change votes
after seeing others'. Reveal removes everything except the round: one room,
one vote each, private until the reveal, final the moment it lands — with
just enough configuration (deck, timer, accent) to feel like *your* table.
The broader platform extends the same "zero friction" promise to other
realtime team games.

## Target users

- **Host** — runs a sprint/estimation session, invites the team with a link,
  starts the round and controls the reveal.
- **Participant** — opens the link, types a name, votes once, waits, sees the
  results.
- **Projector / big screen** — a read-only view of the table for the room,
  either the `/r/<CODE>/screen` projection or the host's in-room
  **presentation mode**.

## User personas

### Host — e.g. a team lead running estimation
Wants to set up the table in seconds (team name, deck, accent), see *who* has
voted without influencing anyone, keep the round on a timer if useful, and
reveal only when it's fair. Values speed and clarity over configuration.

### Participant — e.g. a developer
Wants to join without an account, vote without being influenced, and never
worry that their estimate can be changed or "corrected" afterwards.

## User journey

```
Host:  Create Room (name, team, title, deck, accent) → Share link / QR
       → Wait for People → Pick timer + reveal mode (optional) → Start Voting
       → See who voted / who's thinking → Everyone voted (or time's up)
       → Reveal → See results, statistics & consensus → + New Story (same room)
       → Enter the next story → Start Voting → … repeat for every story → End room
Participant: Open link → Enter name → Join → See the team → Wait for host
       → Voting starts → Pick one card → Vote locked → Wait → Reveal → See results
       → Next story starts automatically in the same tab (votes reset)
```

## Functional requirements

### Homepage & game catalog
- The homepage presents the platform: hero ("Break the ice. Play together."
  + Create a Game / Explore Games CTAs), a **featured Planning Poker** card,
  a "why teams love it" strip, the full **game catalog**, a visual
  **Play. Score. Compete.** roadmap teaser (non-functional), a how-it-works
  list, and a closing CTA.
- The catalog renders from a single registry (`src/lib/games.ts`): **112
  games in 10 categories**, each with icon, name, description, player count,
  duration, status and route. The counter ("112 games · 0 logins") is
  derived from the registry, never hard-coded.
- **Search** filters cards instantly (name + description + category);
  **category filter chips** (All + 10) narrow the catalog; empty results show
  "No games found.".
- Every game has a route. Planning Poker links to the real
  implementation (`/create`); the rest open a shared **Coming Soon**
  placeholder at `/games/<id>` with a Back to Games button. `/games` is a
  full catalog page, and `?cat=<id>` preselects a category.
- Card grid is responsive: 3–4 per row on desktop, 2 on tablet, 1 on mobile,
  with hover lift and keyboard focus — no horizontal page overflow.

### Room creation & lobby customization
- The host enters their name (required) plus an optional **team name** and
  **room title**; the server creates a unique room (`/r/<CODE>`).
- The host picks the **deck** (Fibonacci, Modified Fibonacci, Sequential,
  T-Shirt, Powers of 2) and an **accent color** (gold / purple / blue /
  green) that re-skins the whole table.
- The host is seated immediately as the room's **host**.
- The waiting room shows the room code, a **QR code** of the invite URL, a
  **Copy Invite** button (friendly message + link), a native **Share Room**
  button where the Web Share API is available, the participant list, the
  table configuration summary, and the timer/reveal-mode pickers (host only).

### Room joining
- Participants open the shared link and enter only a name — no login, no
  email, no account.
- The participant list updates live for everyone; every participant gets an
  auto-generated initials **avatar** and the host is marked with a **Host**
  badge.
- If the host **locked** the room, brand-new joiners see *"This room is
  locked."*; people already seated stay and can rejoin.

### Waiting room
- Cards are visible but disabled until voting starts.
- Participants see *"Waiting for the host…"* and the room configuration;
  only the host sees Start Voting, the timer picker, the reveal-mode picker,
  the lock/unlock control, and presentation mode.

### Voting
- The host starts the round; everyone's cards unlock simultaneously.
- Each participant can vote **exactly once** per round.
- The vote is permanent within a round: no change, no cancel, no revote.
- The selected card visually locks with a checkmark; all other cards disable.
- The host sees a live `N / M voted` counter and per-participant
  *Voted / Thinking* presence (with animated thinking dots) — never values.

### New story (multiple rounds per room)
- After a round is **finalized** (revealed) — or abandoned after the timer
  ended it — the host can press **+ New Story** to begin the next story in the
  **same room**: same URL, same room code, same participants, same settings.
- A confirmation dialog warns that votes/results reset for everyone.
- The room returns to the waiting room, where the host may enter the next
  story (optional **Story ID**, **Story Title**, **Description**) before
  pressing Start Voting. Skipping the story labels the round `Round N`.
- Everyone in the room is transitioned in real time via the shared snapshot —
  no refresh, no new link, no rejoining.
- Each round gets a sequential `roundId`; votes belong to
  `roomId + roundId + participantId`, so no vote ever leaks into the next
  story. Double-clicks / racing tabs cannot open two rounds (server-enforced).

### Presence
- Per-participant presence: **Joined** (waiting), **Thinking** (voting),
  **Voted** (locked), **Disconnected** (tab closed), with a subtle
  **Reconnected** toast after a reconnect.
- Disconnecting and reconnecting must **not** bypass the vote lock — server
  state is authoritative.

### Host controls
- **Remove participant** (with a confirmation dialog) — the removed person
  loses access to the room and everyone sees the updated list.
- **Lock / Unlock room** — while locked, new people cannot join; existing
  members are unaffected.
- **End room** (with confirmation) — everyone is disconnected and the room is
  deleted from memory.
- All controls are validated server-side: a participant can never remove
  someone, lock a room, or reveal.

### Optional timer
- Default **Off**: voting stays open until everyone has voted.
- The host may pick **10 s, 15 s, or 30 s** (only these).
- With a timer, the server ends the round at zero; no further votes accepted;
  the timer never reveals automatically — the host still presses Reveal.

### Reveal
- Host-only. Unlocks when **everyone has voted**, or when the timer ended the
  round (even if some participants didn't vote).
- Before reveal, nobody — including the host — can see vote values.
- The reveal is synchronized: every client flips the cards together, using the
  host-chosen animation mode (**Normal / Staggered / Dramatic**; Staggered is
  the default). Full consensus triggers a tasteful celebration.

### Smart results & statistics
- Computed from submitted votes only: **Average**, **Median**, **Most
  selected**, **Highest**, **Lowest**, **Range**, a **vote distribution** bar
  chart, and a **Votes (N / M)** count.
- Numeric decks get the full set; **T-Shirt** rounds show mode, distinct
  cards and distribution instead of a meaningless numeric average.
- Participants who didn't vote are shown as *Didn't vote* and are never
  included in the math.
- A deterministic **consensus verdict** is shown after reveal: 🎉 Full, 🟢
  Strong, 🟡 Moderate, ⚡ Large. Large disagreements get a *"Worth
  discussing?"* prompt (a visual suggestion only — no discussion workflow).
- The **lowest and highest** votes are highlighted with the voters' names.

### Presentation mode
- The host can enter an in-room **presentation mode** (TV / projector /
  screen share): a simplified, large-font layout showing the live vote
  counter, presence avatars, the deck, the countdown, and — after reveal —
  the votes, key statistics and the consensus verdict. Host controls are
  hidden; an *Exit Presentation* button returns to the normal room.

### Realtime updates
- All participants, statuses, the timer, the reveal, and the results update
  in real time over Socket.io. A projector mode (`/r/<CODE>/screen`) mirrors
  the table read-only.

## Non-functional requirements

- **Performance** — full-room snapshots are small (tens of participants);
  the server sweeps the timer every 500 ms; timer ticks are isolated to the
  timer badge so the participant list doesn't re-render every second.
- **Responsiveness** — responsive table layout; large decks scroll
  horizontally on mobile with big tap targets; presentation mode scales to
  big screens. No horizontal page overflow.
- **Reliability** — the socket client auto-reconnects and re-joins the room,
  preserving votes; actions are acknowledged so the UI never guesses.
- **Accessibility** — cards and controls are real buttons with
  `aria-label`s; presence is text + icon, not color alone; status regions use
  `aria-live`; dialogs are `role="dialog"`; animations respect
  `prefers-reduced-motion`.
- **Security** — all host actions and the vote lock are validated
  server-side; vote values are never broadcast before the reveal; QR codes
  are generated locally with no external service.
- **Realtime synchronization** — the countdown is derived from a shared
  `endsAt`; the server, not the browser, ends the round.

## User stories

- As a **host**, I want to create a room with one link so my team can join
  instantly.
- As a **host**, I want to name my team and the room so the session feels
  like ours.
- As a **host**, I want to pick the deck and accent so the table fits how we
  estimate.
- As a **participant**, I want to join with only my name so nothing stands
  between me and voting.
- As a **participant**, I want my vote to lock immediately so my estimate
  cannot be changed or cancelled.
- As a **host**, I want to see who has voted without seeing their values so
  nobody is influenced.
- As a **host**, I want an optional short timer so the round can move along,
  while still choosing when to reveal.
- As a **host**, I want to remove a participant or lock the room so a stray
  link can't derail the session.
- As a **host**, I want a big presentation view so the team can watch the
  table on a projector.
- As a **participant**, I want to see the average, median, range and
  consensus so we can discuss the estimates meaningfully.
- As a **host**, I want to start the next story in the same room so a whole
  sprint's stories are estimated with one link and no re-invites.
- As a **participant**, I want the next story to begin automatically (votes
  reset) so I never have to rejoin or refresh between stories.
- As a **host**, I want the room to vanish from memory when we're done so no
  session history lingers.

## Acceptance criteria

- Host creates a customized room and gets a shareable `/r/<CODE>` link and QR
  code.
- Multiple participants join from separate tabs/devices with just a name and
  appear live for everyone with initials avatars and a host badge.
- Only the host can start, change settings, remove participants, lock/unlock,
  end the session, and reveal.
- A participant votes exactly once; duplicates are rejected by the server.
- No participant (including the host) sees vote values before the reveal.
- With the timer off, reveal unlocks exactly when everyone has voted; with a
  timer, reveal unlocks when it expires (or earlier if everyone voted).
- The reveal shows every vote, marks non-voters as *Didn't vote*, and shows
  correct average/median/mode/highest/lowest/range/distribution/count plus a
  consensus verdict (T-Shirt rounds omit numeric stats).
- A locked room refuses new joiners; the host can unlock it.
- Rooms are in-memory only: no database, no login, no accounts, no history.

## Out of scope

- Login / signup / accounts / email.
- Database persistence or session history of any kind.
- Story queues, next/previous story navigation, or persisted backlog history
  (each round carries only an optional story id/title/description).
- Revote, vote editing, vote cancellation or reset within a round.
- Discussion/chat features, consensus workflows, reactions.
- Anonymous voting, spectator modes (beyond the read-only projector screen).
- Custom deck editors, arbitrary timer values, custom accent themes.
- Analytics dashboards or export of results.
- Horizontal scaling / shared server state (see [DEPLOYMENT.md](DEPLOYMENT.md)).
- Per-game scoring, lives and leaderboards beyond the current round-by-round
  reveal flow (the homepage's podium remains a roadmap teaser).
