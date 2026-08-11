// ---------------------------------------------------------------------------
// Most Likely To prompt bank — the host curates from here (and can add their
// own) when creating a room at /games/most-likely-to. The selected prompts are
// sent to the server at creation and stored in the room; this library is only
// the picker's menu, not the source of truth at play time.
// ---------------------------------------------------------------------------

export const MAX_MLT_PROMPTS = 12;

export const MLT_PROMPTS: string[] = [
  'Forget their laptop at home on the day of the big demo',
  'Reply-all to the entire company by accident',
  'Show up to the meeting 10 minutes late, every single time',
  'Name every file final_v2_FINAL(1).docx',
  'Spend an hour debugging a typo they introduced',
  'Push straight to main on a Friday afternoon',
  'Say “it works on my machine” completely unironically',
  'Turn a 5-minute question into a 45-minute monologue',
  'Break production just before the long weekend',
  'Write a status update that says absolutely nothing',
  'Take the last coffee without refilling the pot',
  'Book a meeting without an agenda',
  'Mute themselves and keep talking for 2 minutes',
  'Send a message to the wrong Slack channel',
  'Leave their camera off for the entire quarter',
  'Overengineer a solution to a problem nobody had',
  'Say “quick question” and then talk for 20 minutes',
  'Accidentally cc the CEO on a complaint email',
  'Rebase main on their feature branch “just to see”',
  'Forget to pull before pushing and cause a merge mess',
  'Use 47 nested ternaries in one line of code',
  'Lose their password for the third time this week',
  'Turn every estimate into a power-of-two fib number',
  'Propose a sync for something that could have been an email',
];

/** A curated starting selection (first 8) the host can adjust. */
export const DEFAULT_MLT_SELECTION: string[] = MLT_PROMPTS.slice(0, 8);
