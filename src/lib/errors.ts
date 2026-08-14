/**
 * Human-readable messages for the server's error codes. The server speaks
 * terse codes (not_host, bad_value, ...) — this map is the single place that
 * translates them so users never see raw protocol strings.
 */
const MESSAGES: Record<string, string> = {
  not_host: 'Only the host can do that.',
  not_all_voted: 'Not everyone has voted yet — reveal unlocks when they do.',
  already_revealed: 'The votes were already revealed.',
  not_started: 'Voting hasn’t started yet.',
  in_progress: 'Voting is already in progress.',
  already_voted: 'Your vote is already locked in.',
  not_voting: 'Voting isn’t open right now.',
  no_value: 'Pick a card first.',
  bad_value: 'That card isn’t on the table.',
  revealed: 'This round is already closed.',
  bad_timer: 'That timer option isn’t available.',
  bad_reveal_mode: 'That reveal mode isn’t available.',
  room_locked: 'This room is locked by the host.',
  not_found: 'The room could not be found.',
  no_participant: 'That participant is no longer here.',
  cannot_remove: 'The host cannot be removed.',
  rate_limited: 'You’re moving a little fast — take a breath and try again in a moment.',
  too_long: 'That answer is too long — keep it under 240 characters.',
  room_full: 'This room is full — the host can remove someone or you can start your own game.',
};

/** Translate a server error code; unknown codes fall back to `fallback`. */
export function friendlyError(code: string | undefined, fallback: string): string {
  if (code && MESSAGES[code]) return MESSAGES[code];
  return fallback;
}
