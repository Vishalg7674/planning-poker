import type { Metadata } from 'next';
import styles from './docs.module.scss';

export const metadata: Metadata = {
  title: 'Project Docs — Reveal',
  description:
    'The complete internal documentation for Reveal: architecture, tech stack choices, the Planning Poker workflow, realtime protocol, games module, testing and deployment.',
};

const NAV = [
  { id: 'overview', label: 'Overview' },
  { id: 'tech-stack', label: 'Tech stack & why' },
  { id: 'structure', label: 'Project structure' },
  { id: 'architecture', label: 'Architecture & data flow' },
  { id: 'realtime', label: 'Realtime protocol' },
  { id: 'flow', label: 'Planning Poker flow' },
  { id: 'phases', label: 'Phase rules' },
  { id: 'voting', label: 'Voting & privacy' },
  { id: 'stats', label: 'Statistics & consensus' },
  { id: 'decks', label: 'Decks & validation' },
  { id: 'result-modal', label: 'Round-result modal' },
  { id: 'identity', label: 'Identity & reconnect' },
  { id: 'host', label: 'Host controls' },
  { id: 'timer', label: 'Timer system' },
  { id: 'games', label: 'Games module' },
  { id: 'a11y', label: 'Accessibility & UX' },
  { id: 'testing', label: 'Testing' },
  { id: 'deployment', label: 'Deployment' },
  { id: 'commands', label: 'Commands' },
  { id: 'roadmap', label: 'Roadmap' },
] as const;

export default function DocsPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div>
            <p className={styles.kicker}>Project documentation · v1.0</p>
            <h1 className={styles.title}>Reveal — Under the Hood</h1>
            <p className={styles.subtitle}>
              Everything about how this project is built and why: the realtime architecture, the Planning Poker
              workflow, the games catalog, and how to run, test and deploy it.
            </p>
          </div>
          <div className={styles.headerChips} aria-label="At a glance">
            <span className={styles.chip}>Next.js 15 + React 19</span>
            <span className={styles.chip}>Socket.io realtime</span>
            <span className={styles.chip}>No database</span>
            <span className={styles.chip}>110 games · 9 categories</span>
          </div>
        </div>
      </header>

      <div className={styles.layout}>
        <nav className={styles.toc} aria-label="On this page">
          <p className={styles.tocTitle}>On this page</p>
          <ol className={styles.tocList}>
            {NAV.map((n) => (
              <li key={n.id}>
                <a href={`#${n.id}`}>{n.label}</a>
              </li>
            ))}
          </ol>
        </nav>

        <main className={styles.main}>
          {/* ------------------------------------------------------- Overview */}
          <section id="overview" className={styles.section}>
            <SectionHead n="01" title="Overview" />
            <p>
              <strong>Reveal</strong> is a real-time multiplayer games platform for teams, retrospectives and
              icebreakers. One game is live today — <strong>Planning Poker</strong> — with a catalog of{' '}
              <strong>110 games across 9 categories</strong> queued up behind it. Every game follows the same
              philosophy:
            </p>
            <ul className={styles.list}>
              <li>
                <strong>No signup, ever.</strong> Your identity is just a name in a browser tab (sessionStorage). No
                email, no accounts, no history.
              </li>
              <li>
                <strong>One link to play.</strong> The host creates a room and shares a single URL (plus a QR code).
                Everyone joins by typing their name.
              </li>
              <li>
                <strong>Rooms live only in server memory.</strong> There is deliberately no database. When the last
                person leaves (or the server restarts), the room vanishes — nothing is stored anywhere.
              </li>
              <li>
                <strong>Server-authoritative realtime.</strong> Socket.io pushes full room snapshots to every client
                after each mutation; the server owns every rule that matters (who may act, when a vote is accepted,
                when values may be revealed).
              </li>
            </ul>
            <div className={styles.callout}>
              <strong>Core flow in one line:</strong> create a room → share the link → everyone joins with a name →
              host starts voting → votes lock the instant they land → reveal unlocks when everyone has voted (or the
              timer ends the round) → everyone sees the votes, statistics and a consensus verdict.
            </div>
          </section>

          {/* ----------------------------------------------------- Tech stack */}
          <section id="tech-stack" className={styles.section}>
            <SectionHead n="02" title="Tech stack & why" />
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Layer</th>
                  <th>Technology</th>
                  <th>Why this choice</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Framework</td>
                  <td>
                    <Code>Next.js 15 (App Router)</Code>
                  </td>
                  <td>
                    One framework for the whole product — marketing pages, dynamic room pages and API-free SSR. App
                    Router gives file-based routes (<Code>/</Code>, <Code>/create</Code>, <Code>/r/[code]</Code>), per
                    page metadata, and static generation for the docs/catalog pages.
                  </td>
                </tr>
                <tr>
                  <td>UI runtime</td>
                  <td>
                    <Code>React 19</Code>
                  </td>
                  <td>
                    The component model fits a realtime UI perfectly: the Redux store holds the room state and React
                    just renders it, so live updates are a re-render, not a mutation.
                  </td>
                </tr>
                <tr>
                  <td>Language</td>
                  <td>
                    <Code>TypeScript (strict)</Code>
                  </td>
                  <td>
                    The client and server share one contract (room snapshots, participant shapes, deck ids). Types make
                    refactors safe and keep the snapshot protocol honest.
                  </td>
                </tr>
                <tr>
                  <td>Client state</td>
                  <td>
                    <Code>Redux Toolkit + react-redux</Code>
                  </td>
                  <td>
                    Realtime rooms are inherently global state shared by many components. RTK slices mirror the server
                    snapshot one-to-one (room / participants / voting / timer / ui), with DevTools and testable pure
                    reducers. The socket layer is isolated behind a small bridge.
                  </td>
                </tr>
                <tr>
                  <td>Realtime</td>
                  <td>
                    <Code>Socket.io 4</Code>
                  </td>
                  <td>
                    Bidirectional realtime with <strong>rooms/channels</strong> (one Socket.io room per game room),
                    <strong> automatic reconnection</strong>, <strong>acknowledgement callbacks</strong> (request →
                    response over a socket, perfect for “create room → give me the code”), and a polling fallback when
                    WebSockets are blocked.
                  </td>
                </tr>
                <tr>
                  <td>Forms</td>
                  <td>
                    <Code>react-hook-form + yup</Code>
                  </td>
                  <td>
                    Minimal re-renders, uncontrolled inputs, and schema-based validation shared by the create and join
                    forms.
                  </td>
                </tr>
                <tr>
                  <td>Styling</td>
                  <td>
                    <Code>SCSS modules + CSS variables</Code>
                  </td>
                  <td>
                    Scoped styles per component, a token layer in <Code>styles/_variables.scss</Code>, and CSS custom
                    properties so <strong>light / dark / system</strong> theming and the four room accents are a token
                    swap, not a rewrite.
                  </td>
                </tr>
                <tr>
                  <td>QR codes</td>
                  <td>
                    <Code>qrcode.react</Code>
                  </td>
                  <td>Invite QR is generated locally as SVG — no external service, works offline and privately.</td>
                </tr>
                <tr>
                  <td>Unit / component tests</td>
                  <td>
                    <Code>Vitest + Testing Library</Code>
                  </td>
                  <td>
                    Fast jsdom tests for pure room logic, Redux slices, and components asserted via roles/text rather
                    than class names.
                  </td>
                </tr>
                <tr>
                  <td>E2E tests</td>
                  <td>
                    <Code>Playwright</Code>
                  </td>
                  <td>
                    Real multi-user browser testing: each user gets an isolated browser context, exactly like separate
                    machines — the only way to prove realtime sync works.
                  </td>
                </tr>
              </tbody>
            </table>

            <h3 className={styles.h3}>Why no database?</h3>
            <p>
              That is the product, not a shortcut. Rooms are ephemeral by design — “no trace kept anywhere” is a
              privacy feature. It also means <strong>zero setup</strong>: <Code>npm run dev</Code> starts everything,
              there is no schema to migrate and nothing to back up. The trade-off is documented: one server instance,
              in-memory state, rooms expire 10 minutes after the last person leaves.
            </p>
          </section>

          {/* ------------------------------------------------------- Structure */}
          <section id="structure" className={styles.section}>
            <SectionHead n="03" title="Project structure" />
            <pre className={styles.codeBlock}>{`├── src/
│   ├── app/                  # Next.js routes
│   │   ├── page.tsx          #   Home: hero, join-by-code, catalog
│   │   ├── create/           #   Create-room form (host onboarding)
│   │   ├── games/            #   /games catalog + /games/[id] placeholders
│   │   ├── docs/             #   This page
│   │   └── r/[roomCode]/     #   Room, presentation view, /screen projection
│   ├── components/
│   │   ├── room/             # Deck, StartPanel, RevealBar, EndedPanel,
│   │   │                     #   ResultsPanel, ParticipantsPanel, TimerBadge,
│   │   │                     #   PresentationView, JoinForm, HostToolbar…
│   │   ├── modals/           # EndSessionModal, RemoveParticipantModal, RoundResultModal
│   │   ├── games/            # GameCatalog, GameCard, ComingSoonGame
│   │   ├── providers.tsx     # Redux Provider + theme sync
│   │   └── RealtimeBridge.tsx# the ONLY socket consumer → dispatches Redux actions
│   ├── lib/                  # decks, games registry, identity, socket, theme, cx, errors
│   ├── store/                # RTK store + 5 slices + realtime actions
│   └── styles/               # tokens, mixins, animations, global theme
├── server/
│   ├── index.mjs             # Socket.io wiring, countdown, room expiry
│   └── room.mjs              # pure, unit-tested room-state functions
├── scripts/e2e.mjs           # socket-level E2E suite (122 checks)
├── tests/                    # unit, components, e2e, helpers
└── docs/                     # ARCHITECTURE, PRD, TRD, API, REALTIME, …`}</pre>
          </section>

          {/* ----------------------------------------------------- Architecture */}
          <section id="architecture" className={styles.section}>
            <SectionHead n="04" title="Architecture & data flow" />
            <p>
              The app is two processes: the <strong>Next.js web app</strong> (UI + forms) and a small{' '}
              <strong>Node + Socket.io realtime server</strong> that owns every room in memory. They talk over
              WebSocket.
            </p>
            <Flow
              steps={[
                'Browser UI (Next.js)',
                'emitAck(event, payload)',
                'Socket.io server (server/index.mjs)',
                'pure rules (server/room.mjs)',
                'snapshot broadcast',
                'RealtimeBridge → Redux',
                'React re-renders',
              ]}
            />
            <h3 className={styles.h3}>The snapshot protocol</h3>
            <p>
              After every mutation the server broadcasts a <strong>full room snapshot</strong> to everyone in the room.
              Each slice of the Redux store hydrates from it — there is no incremental event replay and no drift. This
              is the entire realtime contract:
            </p>
            <pre className={styles.codeBlock}>{`{
  code,            // room code (5 chars, unambiguous alphabet)
  roundId,         // increments on every startVoting — stable per-round identity
  hostId,          // facilitator id (promoted if the host vanishes)
  teamName, roomTitle,
  createdAt,
  settings: { deckId, timerSec, accent, revealMode },
  locked,          // host may refuse brand-new joiners
  participants,    // [{ id, name, role, status, hasVoted, joinedAt, hue }]
  status,          // waiting | voting | ended | revealed
  votedIds,        // who voted — values stay private pre-reveal
  everyoneHasVoted,
  votes,           // {} UNTIL revealed — then { participantId: value }
  stats,           // null UNTIL revealed — then computed statistics
  timer,           // { durationSec, endsAt } or null
}`}</pre>
            <div className={styles.callout} data-tone="warn">
              <strong>Privacy rule:</strong> vote <em>values</em> never leave the server before the reveal. The
              snapshot exposes only <Code>votedIds</Code>, so not even the host can peek at values — the UI can only
              show “Voted / Thinking”.
            </div>
            <h3 className={styles.h3}>Server authority</h3>
            <p>
              All the rules that matter are enforced in <Code>server/room.mjs</Code> — a pure, unit-tested module with
              no sockets or timers. The client can never bypass a lock by editing state or dispatching events, because
              the server simply rejects illegal actions with an error code.
            </p>
          </section>

          {/* -------------------------------------------------------- Realtime */}
          <section id="realtime" className={styles.section}>
            <SectionHead n="05" title="Realtime protocol" />
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Direction</th>
                  <th>Who</th>
                  <th>What it does</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <Code>room:create</Code>
                  </td>
                  <td>client → ack</td>
                  <td>anyone</td>
                  <td>Creates a room, seats the creator as host, returns the code.</td>
                </tr>
                <tr>
                  <td>
                    <Code>room:join</Code>
                  </td>
                  <td>client → ack</td>
                  <td>anyone</td>
                  <td>Seats a participant (or reconnects an existing id). <Code>{`role: 'screen'`}</Code> joins a projector without taking a seat.</td>
                </tr>
                <tr>
                  <td>
                    <Code>room:rejoin</Code>
                  </td>
                  <td>client → ack</td>
                  <td>existing id</td>
                  <td>Refresh/reconnect path — restores identity and vote status.</td>
                </tr>
                <tr>
                  <td>
                    <Code>voting:start</Code>
                  </td>
                  <td>client → ack</td>
                  <td>host only</td>
                  <td>WAITING → VOTING. Clears the previous round, arms the optional timer.</td>
                </tr>
                <tr>
                  <td>
                    <Code>vote:cast</Code>
                  </td>
                  <td>client → ack</td>
                  <td>any participant</td>
                  <td>Locks a vote permanently (rejected if already voted / round closed / card not on deck).</td>
                </tr>
                <tr>
                  <td>
                    <Code>votes:reveal</Code>
                  </td>
                  <td>client → ack</td>
                  <td>host only</td>
                  <td>Publishes values + stats to everyone (only legal once everyone voted, or after the timer ended).</td>
                </tr>
                <tr>
                  <td>
                    <Code>room:settings</Code>
                  </td>
                  <td>client → ack</td>
                  <td>host only</td>
                  <td>Timer preset (Off/10/15/30) or reveal mode (normal/staggered/dramatic), waiting room only.</td>
                </tr>
                <tr>
                  <td>
                    <Code>room:lock</Code> / <Code>room:unlock</Code>
                  </td>
                  <td>client → ack</td>
                  <td>host only</td>
                  <td>Refuse brand-new joiners (existing participants still rejoin).</td>
                </tr>
                <tr>
                  <td>
                    <Code>participant:remove</Code>
                  </td>
                  <td>client → ack</td>
                  <td>host only</td>
                  <td>Removes a participant + their vote; the target’s tab shows “you were removed”.</td>
                </tr>
                <tr>
                  <td>
                    <Code>room:end</Code>
                  </td>
                  <td>client → ack</td>
                  <td>host only</td>
                  <td>Tears the room down; everyone is disconnected and state is cleared.</td>
                </tr>
                <tr>
                  <td>
                    <Code>snapshot</Code>
                  </td>
                  <td>server → all</td>
                  <td>—</td>
                  <td>Full room state after every mutation (see above).</td>
                </tr>
                <tr>
                  <td>
                    <Code>room:ended</Code> / <Code>you:removed</Code>
                  </td>
                  <td>server → target</td>
                  <td>—</td>
                  <td>Session ended / you were removed by the host.</td>
                </tr>
              </tbody>
            </table>
            <p>
              Client calls go through <Code>emitAck</Code>, a promise wrapper around Socket.io acknowledgements with an
              8-second timeout — a dead server can never hang the UI. Server error codes (<Code>not_host</Code>,{' '}
              <Code>already_voted</Code>, <Code>bad_value</Code>, …) are translated to human messages by{' '}
              <Code>src/lib/errors.ts</Code> before they reach a toast.
            </p>
          </section>

          {/* ------------------------------------------------------------ Flow */}
          <section id="flow" className={styles.section}>
            <SectionHead n="06" title="Planning Poker — the complete flow" />
            <Flow
              steps={[
                'Home → Create a room',
                'Configure: name, team, title, deck, accent',
                'Lobby: share link / QR · pick timer & reveal mode · lock room',
                'Participants join with just a name',
                'Host starts voting',
                'Everyone picks exactly one card (vote locks)',
                'Host sees who voted / who’s thinking',
                'Reveal unlocks (everyone voted, or timer ended)',
                'Cards flip — votes, stats & consensus for all',
                'Round-result modal for consensus / big disagreement',
                'Discuss → host ends the session → room vanishes',
              ]}
            />
            <p>
              The product deliberately runs <strong>one round per room</strong> — no story queues, no revote, no
              history. This keeps the state machine small enough to be provably correct, and matches the “privacy by
              design” story: when the room ends, there is nothing left to revisit.
            </p>
          </section>

          {/* ---------------------------------------------------------- Phases */}
          <section id="phases" className={styles.section}>
            <SectionHead n="07" title="Phase rules (the state machine)" />
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Phase</th>
                  <th>What happens</th>
                  <th>Allowed / blocked</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <PhaseTag tone="idle">WAITING</PhaseTag>
                  </td>
                  <td>Lobby. Host configures the table, shares the invite, locks if desired.</td>
                  <td>✓ join, settings, lock, start · ✗ vote, reveal</td>
                </tr>
                <tr>
                  <td>
                    <PhaseTag tone="active">VOTING</PhaseTag>
                  </td>
                  <td>Cards unlock. Everyone votes once. Reveal unlocks the moment everyone (connected) has voted.</td>
                  <td>✓ vote (once), reveal (when all voted) · ✗ change vote, settings</td>
                </tr>
                <tr>
                  <td>
                    <PhaseTag tone="active">ENDED</PhaseTag>
                  </td>
                  <td>The server-side timer hit zero. Voting is closed; values stay private.</td>
                  <td>✓ reveal (host) · ✗ vote</td>
                </tr>
                <tr>
                  <td>
                    <PhaseTag tone="done">REVEALED</PhaseTag>
                  </td>
                  <td>Everyone sees every vote + statistics + consensus. Round is closed for good.</td>
                  <td>✓ view, discuss, end session · ✗ vote, reveal again</td>
                </tr>
              </tbody>
            </table>
            <p>Invalid transitions are impossible by construction — the server rejects them:</p>
            <ul className={styles.list}>
              <li>reveal before voting starts → <Code>not_started</Code></li>
              <li>reveal while someone is still thinking (timer off) → <Code>not_all_voted</Code></li>
              <li>reveal twice → <Code>already_revealed</Code></li>
              <li>vote after reveal → <Code>revealed</Code> · vote before start → <Code>not_voting</Code></li>
              <li>second vote from the same participant → <Code>already_voted</Code> (the original vote is kept)</li>
              <li>non-host triggers any host action → <Code>not_host</Code></li>
            </ul>
          </section>

          {/* ---------------------------------------------------------- Voting */}
          <section id="voting" className={styles.section}>
            <SectionHead n="08" title="Voting, privacy & the vote lock" />
            <ul className={styles.list}>
              <li>
                <strong>Votes lock permanently.</strong> The server owns the lock: <Code>p.hasVoted</Code> is set the
                moment a vote lands, and a second <Code>vote:cast</Code> is rejected. The UI mirrors this with an
                optimistic lock (the card tucks in with a ✓) and disables every other card.
              </li>
              <li>
                <strong>Privacy until reveal.</strong> Nobody — including the host — sees values before the reveal. The
                participants panel shows <em>Voted / Thinking / Disconnected</em> only.
              </li>
              <li>
                <strong>Double-action protection.</strong> Voting, reveal and start all funnel through shared helpers (
                <Code>src/lib/roomActions.ts</Code>) that check live store state and in-flight flags, so double-clicks
                and keyboard presses can never double-send. The server remains the final authority.
              </li>
              <li>
                <strong>Keyboard shortcuts.</strong> <Code>Space</Code> reveals (host, when legal) and{' '}
                <Code>1–9</Code> vote by deck position — ignored while typing, when a modal is open, or when focus is
                on a button.
              </li>
              <li>
                <strong>Late/expired votes.</strong> A vote landing after the timer hit zero flips the room to ENDED
                and is rejected.
              </li>
              <li>
                <strong>Disconnected participants don’t deadlock.</strong> <Code>everyoneHasVoted</Code> counts only
                connected participants, and the live counters show active players only.
              </li>
            </ul>
          </section>

          {/* ----------------------------------------------------------- Stats */}
          <section id="stats" className={styles.section}>
            <SectionHead n="09" title="Statistics & consensus" />
            <p>
              On reveal the server computes statistics from the submitted votes only (non-voters are excluded from the
              math and shown as “Didn’t vote”). Numeric decks get the full set; T-Shirt rounds get mode + distribution
              because a numeric average over <em>XS…XL</em> would be meaningless.
            </p>
            <div className={styles.cardGrid}>
              <StatCard label="Average" body="Sum of numeric votes ÷ votes cast. The ½ card (Modified Fibonacci) counts as 0.5." />
              <StatCard label="Median" body="Middle value for odd counts; the average of the two middles for even counts." />
              <StatCard label="Mode" body="Most-selected value; ties resolve to the lowest value." />
              <StatCard label="Highest / Lowest / Range" body="Numeric extremes and the spread — the extremes get highlighted on the table." />
              <StatCard label="Vote distribution" body="Per-card counts rendered as bars, with the mode highlighted." />
              <StatCard label="Consensus verdict" body="A deterministic level from the distribution (below)." />
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Consensus</th>
                  <th>Rule</th>
                  <th>In the UI</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <PhaseTag tone="done">FULL</PhaseTag>
                  </td>
                  <td>Exactly one unique value — everyone picked the same card.</td>
                  <td>Confetti burst + the round-result modal (🎉).</td>
                </tr>
                <tr>
                  <td>
                    <PhaseTag tone="good">STRONG</PhaseTag>
                  </td>
                  <td>The dominant value holds ≥ 70% of the votes.</td>
                  <td>Green headline.</td>
                </tr>
                <tr>
                  <td>
                    <PhaseTag tone="warn">MODERATE</PhaseTag>
                  </td>
                  <td>Dominant value ≥ 45%, or ≤ 3 unique values.</td>
                  <td>Yellow headline.</td>
                </tr>
                <tr>
                  <td>
                    <PhaseTag tone="bad">LARGE</PhaseTag>
                  </td>
                  <td>Wide distribution with a weak dominant value (anything else).</td>
                  <td>Red headline, “worth discussing?” prompt + the round-result modal (⚡).</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* ----------------------------------------------------------- Decks */}
          <section id="decks" className={styles.section}>
            <SectionHead n="10" title="Decks & card validation" />
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Deck</th>
                  <th>Cards</th>
                  <th>Numeric stats</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Fibonacci (default)</td>
                  <td>
                    <Code>1 2 3 5 8 13 21</Code>
                  </td>
                  <td>✓</td>
                </tr>
                <tr>
                  <td>Modified Fibonacci</td>
                  <td>
                    <Code>0 ½ 1 2 3 5 8 13 21</Code>
                  </td>
                  <td>✓ (½ = 0.5)</td>
                </tr>
                <tr>
                  <td>Sequential</td>
                  <td>
                    <Code>1 2 3 4 5 6 7 8</Code>
                  </td>
                  <td>✓</td>
                </tr>
                <tr>
                  <td>T-Shirt</td>
                  <td>
                    <Code>XS S M L XL</Code>
                  </td>
                  <td>✗ (mode + distribution only)</td>
                </tr>
                <tr>
                  <td>Powers of 2</td>
                  <td>
                    <Code>1 2 4 8 16 32</Code>
                  </td>
                  <td>✓</td>
                </tr>
              </tbody>
            </table>
            <p>
              Card values are validated <strong>end to end</strong>: the voting UI renders only{' '}
              <Code>deckValues(settings)</Code>, and the server rejects any <Code>vote:cast</Code> whose value is not
              on the room’s deck (<Code>bad_value</Code>). The deck list lives in two mirrored places —{' '}
              <Code>src/lib/decks.ts</Code> (client) and <Code>DECK_VALUES</Code> in <Code>server/room.mjs</Code>{' '}
              (server) — covered by tests on both sides. Rooms also pick an <strong>accent</strong> (gold / purple /
              blue / green) that re-skins the whole table via CSS variables.
            </p>
          </section>

          {/* ----------------------------------------------------- Result modal */}
          <section id="result-modal" className={styles.section}>
            <SectionHead n="11" title="Round-result modal" />
            <p>
              Important results appear in a proper, dismissible modal instead of an un-dismissable message. When a
              round is revealed as <strong>full consensus</strong> (🎉 “Everyone voted 5” + average/median) or{' '}
              <strong>large disagreement</strong> (⚡ “Estimates range widely”), the modal opens once for every client —
              host and participants alike.
            </p>
            <ul className={styles.list}>
              <li>It opens <strong>exactly once per reveal</strong>, driven by Redux state — never by a timeout or a render.</li>
              <li>It is dismissible via the explicit <strong>Close</strong> button, the ✕, Escape, or a backdrop click.</li>
              <li>
                It <strong>never reappears</strong> for the same round — even after reconnects, late joiners, or any
                unrelated snapshot — because the dismissal is keyed by <Code>code:roundId</Code> and persisted in
                sessionStorage (so a page refresh can’t resurrect it either).
              </li>
              <li>A <strong>new room or a new round</strong> is always treated as a fresh event and opens it again.</li>
              <li>The results panel stays visible behind the modal, so closing never loses information.</li>
            </ul>
          </section>

          {/* -------------------------------------------------------- Identity */}
          <section id="identity" className={styles.section}>
            <SectionHead n="12" title="Identity, reconnect & presence" />
            <ul className={styles.list}>
              <li>
                <strong>Identity = a name in sessionStorage.</strong> On join, the client stores{' '}
                <Code>{'{ participantId, name, role }'}</Code> for that tab. No accounts, no cookies, no tracking.
              </li>
              <li>
                <strong>Refresh / cold load.</strong> The room page sees the stored identity and calls{' '}
                <Code>room:rejoin</Code> — the server restores the participant (including their vote status). A dedupe
                flag ensures only one rejoin is in flight between the page and the socket bridge.
              </li>
              <li>
                <strong>Reconnect.</strong> When the socket drops, the server marks the participant disconnected (and
                the UI shows <em>Reconnecting…</em>). On reconnect the bridge rejoins automatically and restores the
                seat — no duplicates, because identity is stable.
              </li>
              <li>
                <strong>Presence states.</strong> Joined → Thinking → Voted, plus Disconnected and a subtle
                “Reconnected” toast. A disconnected participant never blocks the reveal.
              </li>
              <li>
                <strong>Host loss.</strong> If the host’s connection vanishes, the longest-connected participant is
                promoted to host (server-side) and everyone’s UI updates via the snapshot.
              </li>
              <li>
                <strong>Room expiry.</strong> Empty rooms vanish after 10 minutes. The projector route (
                <Code>/r/[code]/screen</Code>) joins as a <Code>screen</Code> — it watches without taking a seat, so it
                never keeps a room alive by itself.
              </li>
            </ul>
          </section>

          {/* ------------------------------------------------------------ Host */}
          <section id="host" className={styles.section}>
            <SectionHead n="13" title="Host controls & permissions" />
            <p>Every host control is enforced server-side — a participant clicking around can’t do any of these:</p>
            <ul className={styles.list}>
              <li><strong>Start voting</strong> — only from the waiting room.</li>
              <li><strong>Reveal votes</strong> — only once everyone (connected) has voted, or after the timer ends the round.</li>
              <li><strong>Pick timer / reveal mode</strong> — waiting room only; timer presets are exactly Off / 10 / 15 / 30 seconds.</li>
              <li><strong>Lock / unlock the room</strong> — refuses brand-new joiners while locked.</li>
              <li><strong>Remove a participant</strong> — never the host themself; the removed tab shows a clear notice.</li>
              <li><strong>Presentation mode</strong> — a simplified big view of the same state (also reachable at <Code>/r/[code]/screen</Code>).</li>
              <li><strong>End the session</strong> — confirmed via a modal, then the room is deleted from memory.</li>
            </ul>
          </section>

          {/* ----------------------------------------------------------- Timer */}
          <section id="timer" className={styles.section}>
            <SectionHead n="14" title="Timer system" />
            <p>
              The timer is <strong>off by default</strong>; the host can pick 10, 15 or 30 seconds in the waiting room.
              The <strong>server owns the countdown</strong>: when it hits zero the server flips the room to ENDED for
              everyone. Each client renders a synced countdown ring derived from the shared{' '}
              <Code>endsAt</Code> timestamp, so every browser hits 0:00 together, and the “Time’s up!” toast fires
              exactly once per countdown. With the timer off, voting stays open until everyone has voted.
            </p>
          </section>

          {/* ----------------------------------------------------------- Games */}
          <section id="games" className={styles.section}>
            <SectionHead n="15" title="Games module" />
            <p>
              The entire game catalog is <strong>data, not JSX</strong>. <Code>src/lib/games.ts</Code> is a single
              registry of <strong>110 games across 9 categories</strong> (Icebreakers, Speed, Guessing, Estimation,
              Funny, Developer, Creative, Word, Competitive). Each game is a small entry: icon, name, description,
              category, players, duration, status (<Code>live</Code> / <Code>coming-soon</Code>) and a route.
            </p>
            <ul className={styles.list}>
              <li>
                <strong>Homepage & /games</strong> render from the same registry — the homepage shows the full catalog
                grouped into category sections, <Code>/games</Code> adds search + category filter chips and honors{' '}
                <Code>?cat=</Code> from the URL.
              </li>
              <li>
                <strong>Planning Poker</strong> is the only live game; its card links straight to the real
                implementation (<Code>/create</Code>).
              </li>
              <li>
                <strong>Every other game</strong> opens a shared <em>Coming Soon</em> placeholder at{' '}
                <Code>/games/[id]</Code>. Live games automatically redirect to their real route.
              </li>
              <li>
                <strong>Shipping a new game</strong> = implement it, flip <Code>{`status: 'coming-soon'`}</Code> →{' '}
                <Code>{`'live'`}</Code> and point <Code>route</Code> at its page. Nothing else changes.
              </li>
            </ul>
          </section>

          {/* ------------------------------------------------------------- A11y */}
          <section id="a11y" className={styles.section}>
            <SectionHead n="16" title="Accessibility & UX" />
            <ul className={styles.list}>
              <li><strong>Keyboard-first room:</strong> Space reveals (host), 1–9 vote; shortcuts never fire while typing or with a modal open, and Space never hijacks a focused button.</li>
              <li><strong>Modals</strong> move focus in on open, trap Tab, restore focus on close, close on Escape, and are <Code>{`role="dialog" aria-modal`}</Code> with labelled buttons.</li>
              <li><strong>Voting cards</strong> are real buttons with <Code>aria-pressed</Code>, <Code>{`aria-label="Vote 8"`}</Code>, and clear disabled states.</li>
              <li><strong>Live regions</strong> (<Code>{`role="status"`}</Code> / <Code>aria-live</Code>) announce vote counts, connection changes and “Time’s up” to screen readers.</li>
              <li><strong>Errors are human:</strong> server codes are translated, forms show inline alerts, and a room-level <strong>error boundary</strong> (“Your room is still safe — Try Again”) prevents any render bug from white-screening the app.</li>
              <li><strong>Reduced motion</strong> is respected via a global media-query override.</li>
              <li><strong>Responsive:</strong> the table and cards reflow down to small phones; the layout is tested at mobile widths in E2E.</li>
            </ul>
          </section>

          {/* --------------------------------------------------------- Testing */}
          <section id="testing" className={styles.section}>
            <SectionHead n="17" title="Testing strategy" />
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Layer</th>
                  <th>Tool</th>
                  <th>Covers</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Unit</td>
                  <td>Vitest</td>
                  <td>Pure room logic in <Code>server/room.mjs</Code> (state transitions, vote lock, stats, consensus, privacy-aware snapshots), Redux slices, deck/identity/theme utils, error mapping, room-action guards.</td>
                </tr>
                <tr>
                  <td>Component</td>
                  <td>Vitest + Testing Library</td>
                  <td>Home, Create, Join, Deck, RevealBar, EndedPanel, StartPanel, ResultsPanel, ParticipantsPanel, PresentationView, the round-result modal, modals, and the error boundary — asserted via roles/aria, not class names.</td>
                </tr>
                <tr>
                  <td>Socket-level E2E</td>
                  <td>
                    <Code>scripts/e2e.mjs</Code>
                  </td>
                  <td>122 protocol checks against a live realtime server: join flows, locks, reveal gating, privacy, screen role, disconnected non-voters, consensus.</td>
                </tr>
                <tr>
                  <td>Browser E2E</td>
                  <td>Playwright</td>
                  <td>Full multi-user flows with one browser context per user: create → join → vote → reveal → results → consensus modal, timers, locks, permissions, privacy, QR invite, presentation.</td>
                </tr>
              </tbody>
            </table>
            <p>
              Tests are fast by design: SCSS isn’t processed in Vitest (components are asserted via roles and text),
              and Playwright uses isolated ports (<Code>3100/3211</Code>) so it never collides with your dev servers.
            </p>
          </section>

          {/* ----------------------------------------------------- Deployment */}
          <section id="deployment" className={styles.section}>
            <SectionHead n="18" title="Deployment & environment" />
            <div className={styles.callout} data-tone="warn">
              <strong>Two processes, always.</strong> The web app and the realtime server are separate. In production
              you must run both (<Code>npm start</Code> + <Code>npm run rt</Code>) and point the client at the realtime
              server’s public URL. Room state is in-memory on one instance — it is not horizontally scalable by design.
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Variable</th>
                  <th>Used by</th>
                  <th>Default</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><Code>SOCKET_PORT</Code></td>
                  <td>realtime server</td>
                  <td>3001</td>
                </tr>
                <tr>
                  <td><Code>SOCKET_ORIGIN</Code></td>
                  <td>realtime server (CORS)</td>
                  <td>http://localhost:3000</td>
                </tr>
                <tr>
                  <td><Code>NEXT_PUBLIC_SOCKET_URL</Code></td>
                  <td>browser client</td>
                  <td>http://localhost:3001</td>
                </tr>
                <tr>
                  <td><Code>NEXT_DIST_DIR</Code></td>
                  <td>Next build output</td>
                  <td>.next</td>
                </tr>
                <tr>
                  <td><Code>PORT</Code></td>
                  <td>realtime server (Render/Railway)</td>
                  <td>injected by host</td>
                </tr>
              </tbody>
            </table>
            <p>
              For other devices on your LAN to join, set <Code>NEXT_PUBLIC_SOCKET_URL</Code> (and{' '}
              <Code>SOCKET_ORIGIN</Code>) to your machine’s LAN IP. On Render or Railway the realtime server also
              honors the injected <Code>PORT</Code> variable; <Code>SOCKET_PORT</Code> wins when both are set.{' '}
              <Code>npm run build</Code> lints, typechecks and builds; <Code>npm start</Code> serves it.
            </p>
          </section>

          {/* ------------------------------------------------------- Commands */}
          <section id="commands" className={styles.section}>
            <SectionHead n="19" title="Commands cheat-sheet" />
            <pre className={styles.codeBlock}>{`npm run dev            # Next.js :3000 + realtime :3001 together
npm run dev:next       # Next.js only
npm run dev:rt         # realtime server only
npm test               # unit + component tests (Vitest, jsdom)
npm run test:watch     # Vitest watch mode
npm run test:coverage  # Vitest with coverage
npm run test:realtime  # socket-level E2E suite (122 checks)
npm run test:e2e       # Playwright browser E2E (starts its own servers)
npm run lint           # ESLint
npm run build          # lint + typecheck + production build
npm start              # serve the production build
npm run rt             # realtime server for production`}</pre>
          </section>

          {/* -------------------------------------------------------- Roadmap */}
          <section id="roadmap" className={styles.section}>
            <SectionHead n="20" title="Roadmap" />
            <ul className={styles.list}>
              <li><strong>Scoring & leaderboards</strong> — the homepage’s podium previews points across games.</li>
              <li><strong>More live games</strong> — the 110-game catalog is designed to be flipped on one by one from the registry.</li>
              <li><strong>Discussion/chat</strong>, consensus workflows and reactions are future product directions (see <Code>docs/PRD.md</Code>).</li>
            </ul>
            <p className={styles.endNote}>
              Deep-dive docs live in the repo under <Code>docs/</Code> — ARCHITECTURE, PRD, TRD, API, REALTIME,
              STATE_MANAGEMENT, TESTING, DEPLOYMENT and CONTRIBUTING.
            </p>
            <a href="#overview" className={styles.backTop}>
              ↑ Back to top
            </a>
          </section>
        </main>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ helpers */

function SectionHead({ n, title }: { n: string; title: string }) {
  return (
    <div className={styles.sectionHead}>
      <span className={styles.sectionNum} aria-hidden="true">
        {n}
      </span>
      <h2 className={styles.h2}>{title}</h2>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className={styles.code}>{children}</code>;
}

function PhaseTag({ tone, children }: { tone: 'idle' | 'active' | 'done' | 'good' | 'warn' | 'bad'; children: React.ReactNode }) {
  return <span className={`${styles.phase} ${styles[`phase-${tone}`]}`}>{children}</span>;
}

function StatCard({ label, body }: { label: string; body: string }) {
  return (
    <div className={styles.statCard}>
      <p className={styles.statLabel}>{label}</p>
      <p className={styles.statBody}>{body}</p>
    </div>
  );
}

function Flow({ steps }: { steps: string[] }) {
  return (
    <div className={styles.flow} role="list">
      {steps.map((s, i) => (
        <div key={s} className={styles.flowItem} role="listitem">
          <span className={styles.flowStep}>{String(i + 1).padStart(2, '0')}</span>
          <span className={styles.flowText}>{s}</span>
        </div>
      ))}
    </div>
  );
}
