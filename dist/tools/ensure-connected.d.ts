import type { ConnectionErrorInfo } from '../actions/ensure-connected.js';
export { ensureConnected, refreshConfig, type ConnectionErrorInfo, type EnsureConnectedResult, type EnsureConnectedSuccess, type EnsureConnectedFailure, type EnsureConnectedDeps, } from '../actions/ensure-connected.js';
/** MCP-shaped connection error response (kept for tool-layer + test compatibility). */
export declare function formatConnectionError(errorInfo: ConnectionErrorInfo): {
    isError: true;
    content: Array<{
        type: 'text';
        text: string;
    }>;
};
//# sourceMappingURL=ensure-connected.d.ts.map