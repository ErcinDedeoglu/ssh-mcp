import type { ActionOutcome } from '../actions/types.js';

/** Prints an ActionOutcome for humans or machines. Returns process exit code. */
export function report(
  outcome: ActionOutcome,
  json: boolean,
  human?: (data: object) => void,
): number {
  if (outcome.ok) {
    if (json) {
      console.log(JSON.stringify(outcome.data, null, 2));
    } else if (human) {
      human(outcome.data);
    } else {
      console.log(JSON.stringify(outcome.data, null, 2));
    }
    return 0;
  }

  const text = outcome.json ? JSON.stringify(outcome.json, null, 2) : outcome.message;
  console.error(text);
  return 1;
}
