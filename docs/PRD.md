# Product Requirements Document — Reveal

## Product vision

A frictionless planning-poker room that takes less than ten seconds to
understand: create a room, share a link, everyone votes in secret with cards
that **lock permanently**, the host reveals, and everyone sees the estimates
and the statistics together. No accounts, no database, no history — rooms
exist in memory and vanish when they empty.

## Problem statement

Estimating sessions are interrupted by setup: signups, stories, dashboards,
histories, and the temptation to change votes after seeing others'. Teams
want a table, not a tool. Reveal removes everything except the round: one
room, one vote each, private until the reveal, final the moment it lands.

## Target users

- **Host** — runs a sprint/estimation session, invites the team with a link,
  starts the round and controls the reveal.
- **Participant** — opens the link, types a name, votes once, waits, sees the
  results.
- **Projector / big screen** — a read-only view of the table for the room.

## User personas

### Host — e.g. a team lead running estimation
Wants to see *who* has voted without influencing anyone, keep the round on a
timer if useful, and reveal only when it's fair. Values speed and clarity over
configuration.

### Participant — e.g. a developer
Wants to join without an account, vote without being influenced, and never
worry that their estimate can be changed or "corrected" afterwards.

## User journey

```
Host:  Create Room → Copy Invite Link → Wait for People → Pick timer (optional)
       → Start Voting → See who voted / who's thinking → Everyone voted (or time's up)
       → Reveal → See results & statistics
Participant: Open link → Enter name → Join → Wait for host → Voting starts
       → Pick one card → Vote locked → Wait → Reveal → See results
```

## Functional requirements

### Room creation
- Host enters only a name; the server creates a unique room (`/r/<CODE>`).
- The host is seated immediately as the room's **host**.
- The waiting room shows the room code, a **Copy Invite Link** button, the
  participant list, and the timer picker.

### Room joining
- Participants open the shared link and enter only a name — no login, no
  email, no account.
- The participant list updates live for everyone.

### Waiting room
- Cards are visible but disabled until voting starts.
- Participants see *"Waiting for the host…"*; only the host sees Start
  Voting and the timer picker.

### Voting
- The host starts the round; everyone's cards unlock simultaneously.
- Each participant can vote **exactly once**.
- The vote is permanent: no change, no cancel, no revote.
- The selected card visually locks with a checkmark; all other cards disable.

### Vote lock
- Enforced **server-side**: a second `vote:cast` from the same participant is
  rejected (`already_voted`).
- A refresh or reconnect preserves the locked vote.

### Host dashboard
- During voting the host sees a live `N / M voted` counter and per-participant
  *Voted / Thinking* status — never the values.

### Optional timer
- Default **Off**: voting stays open until everyone has voted.
- The host may pick **10 s, 15 s, or 30 s** (only these).
- With a timer, the server ends the round at zero; no further votes accepted;
  the timer never reveals automatically — the host still presses Reveal.

### Reveal
- Host-only. Unlocks when **everyone has voted**, or when the timer ended the
  round (even if some participants didn't vote).
- Before reveal, nobody — including the host — can see vote values.
- The reveal is synchronized: every client flips the cards together.

### Statistics
- Computed from submitted votes only: **Average**, **Median**, **Most
  selected**, **Votes (N / M)**, and a **vote distribution** bar chart.
- Participants who didn't vote are shown as *Didn't vote* and are never
  included in the math.

### Realtime updates
- All participants, statuses, the timer, the reveal, and the results update
  in real time over Socket.io. A projector mode (`/r/<CODE>/screen`) mirrors
  the table read-only.

## Non-functional requirements

- **Performance** — full-room snapshots are small (tens of participants);
  the server sweeps the timer every 500 ms.
- **Responsiveness** — the UI is a responsive table layout (deck + side
  participant panel), with a dedicated big-screen projection page.
- **Reliability** — the socket client auto-reconnects and re-joins the room,
  preserving votes; actions are acknowledged so the UI never guesses.
- **Accessibility** — cards and controls are real buttons with
  `aria-label`s, status regions use `aria-live`, dialogs are `role="dialog"`.
- **Security** — all host actions and the vote lock are validated
  server-side; vote values are never broadcast before the reveal.
- **Realtime synchronization** — the countdown is derived from a shared
  `endsAt`; the server, not the browser, ends the round.

## User stories

- As a **host**, I want to create a room with one link so my team can join
  instantly.
- As a **participant**, I want to join with only my name so nothing stands
  between me and voting.
- As a **participant**, I want my vote to lock immediately so my estimate
  cannot be changed or cancelled.
- As a **host**, I want to see who has voted without seeing their values so
  nobody is influenced.
- As a **host**, I want an optional short timer so the round can move along,
  while still choosing when to reveal.
- As a **host**, I want to reveal only when everyone has voted (or time is
  up) so the reveal is fair.
- As a **participant**, I want to see the average, median and distribution so
  we can discuss the estimates meaningfully.
- As a **host**, I want the room to vanish from memory when we're done so no
  session history lingers.

## Acceptance criteria

- Host creates a room and gets a shareable `/r/<CODE>` link.
- Multiple participants join from separate tabs/devices with just a name and
  appear live for everyone.
- Only the host can start, change the timer, remove participants, end the
  session, and reveal.
- A participant votes exactly once; duplicates are rejected by the server.
- No participant (including the host) sees vote values before the reveal.
- With the timer off, reveal unlocks exactly when everyone has voted; with a
  timer, reveal unlocks when it expires (or earlier if everyone voted).
- The reveal shows every vote, marks non-voters as *Didn't vote*, and shows
  correct average/median/mode/distribution/count.
- Rooms are in-memory only: no database, no login, no stories, no revote, no
  history.

## Out of scope

- Login / signup / accounts / email.
- Database persistence or session history of any kind.
- Stories, story queues, next/previous story, story titles or URLs.
- Revote, vote editing, vote cancellation or reset.
- Consensus workflows, discussion threads, reactions.
- Anonymous voting, spectator modes (beyond the read-only projector screen).
- Multiple voting rounds per room (one round per room by design).
- Analytics dashboards or export of results.
