import type { ActionOutcome, ActionData } from '../actions/types.js';

export type McpToolResponse =
  | { content: Array<{ type: 'text'; text: string }> }
  | { isError: true; content: Array<{ type: 'text'; text: string }> };

/** Maps the shared ActionOutcome contract to the MCP tool response format. */
export function toMcpResponse<T extends ActionData>(outcome: ActionOutcome<T>): McpToolResponse {
  if (outcome.ok) {
    const text = outcome.pretty
      ? JSON.stringify(outcome.data, null, 2)
      : JSON.stringify(outcome.data);
    return { content: [{ type: 'text' as const, text }] };
  }
  const text = outcome.json ? JSON.stringify(outcome.json) : outcome.message;
  return { isError: true, content: [{ type: 'text' as const, text }] };
}
