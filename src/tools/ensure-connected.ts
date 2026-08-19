import type { ConnectionErrorInfo } from '../actions/ensure-connected.js';

export {
  ensureConnected,
  refreshConfig,
  type ConnectionErrorInfo,
  type EnsureConnectedResult,
  type EnsureConnectedSuccess,
  type EnsureConnectedFailure,
  type EnsureConnectedDeps,
} from '../actions/ensure-connected.js';

/** MCP-shaped connection error response (kept for tool-layer + test compatibility). */
export function formatConnectionError(errorInfo: ConnectionErrorInfo): {
  isError: true;
  content: Array<{ type: 'text'; text: string }>;
} {
  return {
    isError: true,
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(errorInfo),
      },
    ],
  };
}
