# Production-Ready Planning Poker + Configurable Games — Master Development Prompt

> **IMPORTANT:** This prompt is intended to be used by an AI coding agent after it has access to the complete existing project repository.
>
> Do not blindly rewrite the application. First understand the existing implementation, architecture, dependencies, data model, and conventions. Reuse and improve existing code wherever practical.

---

# 1. Mission

Transform the existing project into a **production-ready real-time collaborative application** with two development phases.

## Phase 1 — Planning Poker

The first priority is a complete, reliable, end-to-end **Planning Poker experience**.

Phase 1 must be fully functional before Phase 2 is started.

The application should allow users to create/join a session, participate as players or observers, vote on estimation cards, reveal votes, discuss/revote, and progress through estimation rounds according to the capabilities already present in the repository.

The exact existing terminology, routes, APIs, database structure, and UI should be inspected first and preserved where appropriate.

## Phase 2 — Configurable Games

After Phase 1 is stable, introduce a reusable game system that allows the application owner to provide game data such as:

* Questions
* Options
* Correct answers where applicable
* Explanations
* Scores
* Timers
* Game title
* Game description
* Categories
* Difficulty
* Rules/configuration
* Round configuration

Users should then be able to enter a game and play it interactively.

The architecture must make it possible to add additional game types later without rewriting the Planning Poker system.

---

# 2. NON-NEGOTIABLE FIRST STEP — ANALYZE THE REPOSITORY

Before changing code, perform a complete repository audit.

Inspect:

* Every relevant directory
* Every source file
* Package/dependency configuration
* Environment configuration
* Frontend
* Backend
* APIs
* Database
* ORM/query layer
* Authentication
* Authorization
* Realtime/WebSocket layer
* State management
* Routing
* UI components
* Styling
* Assets
* Tests
* Build scripts
* Deployment configuration
* Docker configuration if present
* CI/CD configuration if present
* Documentation
* Existing migrations
* Seed data
* Existing error handling
* Logging
* Existing TODOs
* Existing technical debt

Do not assume the architecture.

Determine:

1. What technologies are currently being used?
2. What is the application entry point?
3. How does the frontend communicate with the backend?
4. How is realtime communication implemented?
5. Where is application state stored?
6. Where is persistent state stored?
7. How are users identified?
8. How are sessions/rooms represented?
9. How does Planning Poker currently work?
10. Which parts are incomplete or broken?
11. Which parts should be preserved?
12. Which parts should be refactored?
13. Which parts should be replaced?
14. What prevents the application from being production-ready?

Create an internal implementation plan based on the actual repository.

Do not invent files, APIs, tables, components, or technologies that don't fit the existing project.

---

# 3. DEVELOPMENT RULES

Follow these rules throughout the entire implementation.

## Rule 1 — Don't rewrite unnecessarily

Do not rewrite the entire project simply because a different architecture would be cleaner.

Prefer:

1. Fix
2. Refactor
3. Extend
4. Replace only when justified

Preserve working functionality.

## Rule 2 — Inspect before modifying

Before modifying a subsystem, understand how it currently works.

## Rule 3 — Keep Phase 1 stable

Do not introduce Phase 2 changes that can break Planning Poker.

Planning Poker must remain independently functional.

## Rule 4 — Production quality

Code must be suitable for production, not merely a prototype.

Avoid:

* Temporary hacks
* Hardcoded application logic
* Duplicate business logic
* Silent failures
* Unvalidated user input
* Race-condition-prone state updates
* Fragile realtime synchronization
* Client-only security
* Secrets in source code

## Rule 5 — Test real user flows

Do not consider a feature complete merely because the code compiles.

Test actual user journeys.

---

# 4. PHASE 1 — PLANNING POKER

## Goal

Make Planning Poker work completely from start to finish.

The complete flow should be reliable for multiple simultaneous users.

At minimum, verify the actual existing application's equivalent of:

1. User opens application
2. User creates a Planning Poker session
3. Session receives a unique identifier/shareable access mechanism
4. Other users join
5. Users appear in the room
6. Player/observer roles work correctly
7. Players select estimation cards
8. Selected cards synchronize correctly
9. Other participants see the correct participation state without leaking votes prematurely
10. Host/facilitator can reveal votes
11. Votes are revealed to everyone at the appropriate time
12. Results/statistics are displayed correctly
13. Users can discuss/revote/reset according to the existing product design
14. A new estimation round can begin
15. Users can leave
16. Users can reconnect
17. Refreshing the browser does not corrupt the session
18. Multiple users can interact concurrently
19. Invalid requests are rejected safely
20. Session state eventually remains consistent across clients

Use the existing project behavior where already implemented, but fix missing or broken behavior.

---

# 5. PLANNING POKER STATE MODEL

Clearly separate:

* Session state
* Participant state
* Player role
* Current round
* Selected card
* Hidden vote
* Revealed vote
* Round result
* Host/facilitator permissions
* Session lifecycle
* Connection state

Do not expose hidden information before the reveal operation.

A participant's selected vote must not accidentally become visible to other participants through:

* API responses
* WebSocket events
* React/client state
* Browser storage
* Debug payloads
* Logs
* Other indirect mechanisms

---

# 6. REALTIME REQUIREMENTS

Realtime behavior is critical.

Inspect the existing realtime architecture and improve it rather than introducing a second competing realtime mechanism unless necessary.

Handle:

* Connection
* Disconnection
* Reconnection
* Duplicate connections
* Stale connections
* Multiple browser tabs
* Simultaneous updates
* Out-of-order messages
* Server-authoritative state
* Invalid realtime events
* Room cleanup
* Session expiration where appropriate

The server should be authoritative for important shared state.

Clients should not be trusted to determine:

* Who is allowed to reveal votes
* Who is allowed to modify session configuration
* Which user belongs to which session
* Whether a vote is valid
* Whether a round is active
* Whether a game action is permitted

---

# 7. PLANNING POKER UX

Make the interface clear and usable.

The UI should communicate:

* Current session
* Participants
* Participant roles
* Voting status
* Current user's selected card
* Whether votes are hidden/revealed
* Current round
* Results
* Available actions
* Connection status
* Errors
* Loading states
* Empty states

Avoid unnecessary UI complexity.

Ensure the interface works on:

* Desktop
* Tablet
* Mobile

Do not sacrifice functional reliability for visual effects.

---

# 8. VALIDATION AND ERROR HANDLING

Validate all user-controlled input on the server.

Handle:

* Invalid session IDs
* Invalid participant IDs
* Unauthorized actions
* Expired sessions
* Invalid votes
* Duplicate actions
* Invalid game state transitions
* Missing data
* Malformed requests
* Realtime errors
* Database errors
* Network failures

Errors should be:

* Safe
* Useful
* User-friendly
* Logged appropriately on the server
* Free from sensitive information

---

# 9. SECURITY

Audit the application for common production security problems.

Check:

* Authentication
* Authorization
* Session access
* ID enumeration
* Input validation
* Injection vulnerabilities
* XSS
* CSRF where applicable
* WebSocket authorization
* Rate limiting where appropriate
* Sensitive data exposure
* Secrets
* Environment variables
* Logging of sensitive information
* Insecure client-side trust
* Unsafe database queries
* Dependency vulnerabilities

Never expose secrets to the frontend.

Never rely solely on frontend checks for authorization.

---

# 10. DATA CONSISTENCY

Identify all shared mutable state.

For every state transition, determine:

* Who can perform it?
* What is the valid previous state?
* What is the new state?
* What happens if two clients perform it simultaneously?
* What happens if the client disconnects?
* What happens if the request is repeated?
* What happens after refresh?
* What happens after reconnect?

Where necessary, implement idempotency or server-side state validation.

---

# 11. TESTING PHASE 1

Create or improve tests according to the project's existing testing conventions.

At minimum cover:

## Unit tests

* Vote validation
* Permission checks
* Session state transitions
* Round state
* Game/session configuration
* Result calculation

## Integration tests

* Create session
* Join session
* Leave session
* Submit vote
* Reveal votes
* Reset/new round
* Unauthorized operations
* Invalid input

## Realtime tests

Test multiple participants where the technology stack allows it.

Verify:

* State synchronization
* Hidden votes
* Reveal
* Reconnect
* Duplicate events
* Concurrent actions

## End-to-end tests

Test the most important user journey from beginning to end.

---

# 12. PHASE 1 ACCEPTANCE CRITERIA

Do not move to Phase 2 until all applicable criteria are satisfied.

* [ ] Planning Poker can be started successfully
* [ ] Multiple users can join the same session
* [ ] Participants are synchronized
* [ ] Roles/permissions are enforced
* [ ] Players can vote
* [ ] Votes remain private before reveal
* [ ] Reveal works correctly
* [ ] Results are synchronized
* [ ] A new round works
* [ ] Invalid actions are rejected
* [ ] Refresh/reconnect behavior is reliable
* [ ] No major console errors
* [ ] No major server errors
* [ ] Database state remains consistent
* [ ] Realtime state remains consistent
* [ ] Mobile UI is usable
* [ ] Automated tests pass
* [ ] Production build succeeds
* [ ] No critical security issue remains

---

# 13. PHASE 2 — CONFIGURABLE GAME PLATFORM

Only begin Phase 2 after Phase 1 has been verified.

The goal is NOT to create one hardcoded quiz.

The goal is to create a reusable game architecture.

The system should allow game content to be supplied as data.

For example, conceptually:

```text
Game
 ├── metadata
 ├── configuration
 ├── rounds
 │    ├── question
 │    ├── options
 │    ├── correct answer
 │    ├── explanation
 │    ├── score
 │    └── timing
 └── rules
```

The exact implementation must follow the existing project's technology and conventions.

---

# 14. GAME DATA MODEL

Design a flexible domain model that can represent:

## Game

Potential properties:

* id
* title
* slug
* description
* type
* status
* configuration
* createdBy
* createdAt
* updatedAt

## Question

Potential properties:

* id
* question
* type
* order
* explanation
* timeLimit
* metadata

## Options

Potential properties:

* id
* label/text
* value
* order
* metadata

## Answer

Potential properties:

* correct option/value
* accepted answers if the game type requires them
* scoring configuration

Do not add fields simply because they are listed here.

Determine the appropriate normalized or structured representation based on the existing database.

---

# 15. GAME ENGINE ARCHITECTURE

Separate game-independent infrastructure from game-specific rules.

The architecture should make it possible to support multiple games.

For example:

```text
Game Platform
│
├── Game Session
│
├── Players
│
├── Questions
│
├── Game State
│
├── Scoring
│
├── Timers
│
└── Game Rules
```

Planning Poker should remain its own feature/domain.

Do not force Planning Poker into a generic abstraction if doing so makes the code worse.

Instead, extract genuinely reusable infrastructure where appropriate.

---

# 16. GAME SESSION LIFECYCLE

A configurable game should have a clear lifecycle.

Potential states:

```text
CREATED
  ↓
LOBBY
  ↓
STARTED
  ↓
QUESTION_ACTIVE
  ↓
QUESTION_COMPLETED
  ↓
NEXT_QUESTION
  ↓
FINISHED
```

Use the actual product requirements and existing architecture to determine the final state machine.

Prevent invalid state transitions.

For example:

* Cannot answer a question before the game starts
* Cannot answer a closed question
* Cannot modify immutable game content during an active round unless explicitly supported
* Cannot finish a game twice
* Cannot submit an answer after the timer expires unless the rules allow it

---

# 17. QUESTION/OPTION INPUT

The system must make it easy for the application owner/backend/admin/API to provide game data.

Support a clean data contract.

The input should conceptually support:

```json
{
  "title": "Example Game",
  "description": "Example description",
  "questions": [
    {
      "question": "Example question?",
      "options": [
        {
          "label": "Option A",
          "value": "a"
        },
        {
          "label": "Option B",
          "value": "b"
        }
      ],
      "correctAnswer": "a",
      "explanation": "Explanation",
      "timeLimit": 30
    }
  ]
}
```

This is an example only.

Adapt the actual schema to the repository's architecture.

Validate all incoming game content.

---

# 18. SCORING

Create a scoring layer that is configurable rather than hardcoded into UI components.

Consider:

* Correct answer points
* Incorrect answer
* No answer
* Speed bonus
* Streaks
* Multipliers
* Per-question scoring
* Final score

Only implement scoring rules that are actually required.

The important architectural requirement is that scoring logic should not be tightly coupled to presentation.

---

# 19. GAME UI

Create a reusable game interface.

The UI should support:

* Lobby
* Player list
* Game information
* Current question
* Options
* Selection state
* Timer
* Submit/lock state
* Result state
* Score
* Progress
* Final results

Make the question renderer extensible so future question types can be introduced.

Potential future types could include:

* Multiple choice
* Single choice
* True/false
* Text answer
* Numeric answer
* Image-based question

Do not implement all future types unless required.

Design the architecture so adding them is straightforward.

---

# 20. GAME REALTIME SYNCHRONIZATION

If the game is multiplayer, use the existing realtime infrastructure where appropriate.

Synchronize:

* Players
* Game start
* Current question
* Timer state
* Answers
* Question completion
* Scores
* Game completion

Never trust clients for final scoring or game-state authority.

The server should determine authoritative:

* Game state
* Question state
* Valid answers
* Scores
* Permissions
* Timing where necessary

---

# 21. PHASE 2 ACCEPTANCE CRITERIA

* [ ] A game can be created/configured
* [ ] Questions can be supplied as data
* [ ] Options can be supplied as data
* [ ] Questions render dynamically
* [ ] Users can select answers
* [ ] Answer validation works
* [ ] Scoring works
* [ ] Game progression works
* [ ] Timer behavior works if enabled
* [ ] Results work
* [ ] Multiplayer synchronization works if required
* [ ] Invalid actions are rejected
* [ ] Game data is validated
* [ ] Game logic is separated from presentation
* [ ] New game types can be added without rewriting the core
* [ ] Planning Poker still works independently
* [ ] Tests cover the new game functionality
* [ ] Production build succeeds

---

# 22. DATABASE AND MIGRATIONS

If database changes are required:

1. Inspect the existing schema first.
2. Follow the project's migration conventions.
3. Create safe migrations.
4. Avoid destructive migrations unless explicitly required.
5. Preserve existing production data.
6. Add indexes where justified.
7. Add appropriate foreign keys/constraints.
8. Consider transaction boundaries.
9. Test migrations against realistic data.

Never modify the database schema manually without corresponding migration support if the project uses migrations.

---

# 23. API DESIGN

Audit existing APIs before creating new ones.

Prefer consistency with the current API architecture.

For every new endpoint/action define:

* Purpose
* Request validation
* Authentication requirement
* Authorization
* Response structure
* Error behavior
* Idempotency requirements
* Realtime side effects
* Database effects

Do not create duplicate endpoints that perform the same business operation.

Keep business logic out of controllers/routes where the existing architecture supports service/domain layers.

---

# 24. FRONTEND ARCHITECTURE

Avoid putting all logic into UI components.

Separate where appropriate:

* API communication
* Realtime communication
* Domain state
* UI state
* Validation
* Game logic
* Planning Poker logic
* Shared components

Avoid duplicated state that can become inconsistent.

Use the project's existing state-management strategy unless there is a strong reason to change it.

---

# 25. OBSERVABILITY

Make the application diagnosable in production.

Inspect and improve:

* Server logging
* Error logging
* Realtime errors
* API errors
* Important state transitions
* Database failures

Do not log:

* Passwords
* Tokens
* Secrets
* Private user data unnecessarily
* Hidden answers/votes where that could leak game state

Use structured logging where appropriate for the existing stack.

---

# 26. PERFORMANCE

Identify unnecessary:

* Database queries
* API requests
* Realtime broadcasts
* React/component renders
* Large payloads
* Duplicate state updates

Do not prematurely optimize.

Optimize measurable bottlenecks while preserving correctness.

---

# 27. PRODUCTION READINESS

Before declaring the project complete, verify:

## Application

* [ ] Production build succeeds
* [ ] Environment configuration is documented
* [ ] Secrets are externalized
* [ ] Error handling is robust
* [ ] Loading states exist
* [ ] Empty states exist
* [ ] Error states exist

## Security

* [ ] Authorization is server-side
* [ ] User input is validated
* [ ] Sensitive information isn't exposed
* [ ] Realtime connections are authorized
* [ ] Dependencies are reviewed

## Reliability

* [ ] Reconnection works
* [ ] Concurrent users work
* [ ] Invalid state transitions are prevented
* [ ] Database operations are safe
* [ ] Important operations are atomic where required

## Testing

* [ ] Unit tests pass
* [ ] Integration tests pass
* [ ] E2E tests pass where configured
* [ ] Realtime flows are tested where possible

## Deployment

* [ ] Production build succeeds
* [ ] Required environment variables are documented
* [ ] Database migration process is documented
* [ ] Deployment process is documented
* [ ] Health checks exist where appropriate

---

# 28. DEVELOPMENT WORKFLOW

Follow this workflow strictly.

## Step 1 — Audit

Analyze the repository completely.

Do not modify code yet.

Identify:

* Architecture
* Existing features
* Broken features
* Missing features
* Risks
* Technical debt

## Step 2 — Plan

Create an implementation plan based on the actual repository.

Group work into:

* Phase 1 fixes
* Phase 1 implementation
* Phase 1 testing
* Phase 2 architecture
* Phase 2 implementation
* Phase 2 testing
* Production hardening

## Step 3 — Implement Phase 1

Fix Planning Poker first.

Do not start Phase 2 until Phase 1 acceptance criteria pass.

## Step 4 — Verify Phase 1

Run:

* Tests
* Lint
* Type checks if applicable
* Build
* E2E tests if available
* Realtime/manual multi-user testing

Fix every important issue found.

## Step 5 — Design Phase 2

Before coding Phase 2, inspect Phase 1 architecture and identify reusable infrastructure.

Do not unnecessarily couple the two domains.

## Step 6 — Implement Phase 2

Implement the configurable game system incrementally.

After each major feature:

1. Run tests
2. Run type checks
3. Run lint
4. Build
5. Verify affected user flows

## Step 7 — Regression testing

Run the complete Phase 1 test suite again.

Planning Poker must continue working after Phase 2.

## Step 8 — Production audit

Perform a final audit for:

* Security
* Reliability
* Performance
* Error handling
* Database consistency
* Realtime consistency
* UX
* Mobile behavior
* Deployment

---

# 29. DO NOT DECLARE SUCCESS PREMATURELY

Never say the project is complete merely because:

* Files were created
* Code compiles
* A page renders
* An API responds
* A single happy-path test passes

The feature is complete only when the complete user flow works and the relevant acceptance criteria have been verified.

If something cannot be verified, explicitly identify it.

Do not pretend tests were executed if they were not.

---

# 30. FINAL DELIVERABLE

At the end of implementation, provide a concise engineering summary containing:

## Architecture

What was changed and why.

## Phase 1

What was implemented/fixed.

## Phase 2

What was implemented.

## Database

Migrations/schema changes.

## API

New or modified APIs.

## Realtime

Realtime changes and synchronization behavior.

## Testing

Tests executed and their results.

## Production

Remaining production risks, if any.

## Deployment

Required environment variables, migrations, build and deployment instructions.

---

# 31. IMPORTANT ENGINEERING PRINCIPLE

The final application should not become a collection of hardcoded screens.

Build a stable foundation:

```text
                    APPLICATION
                         │
          ┌──────────────┴──────────────┐
          │                             │
    PLANNING POKER                GAME PLATFORM
          │                             │
     Poker Rules                  Game Sessions
     Poker State                  Questions
     Poker Voting                 Options
     Poker Results                Answers
                                  Scoring
                                  Timers
                                  Results
```

Keep the domains independent where appropriate.

Extract shared infrastructure only when it genuinely improves maintainability.

The final system should be easy to extend with additional game experiences without destabilizing Planning Poker.

---

# 32. START NOW

Begin by analyzing the entire repository.

Do NOT start by generating new code.

First understand what already exists.

Then produce the implementation plan.

Then execute the plan incrementally.

Prioritize:

**Correctness → Reliability → Security → Testability → Maintainability → UX → Performance**

The ultimate goal is a **production-ready application**, not merely a working prototype.
