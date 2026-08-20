export { ensureConnected, refreshConfig, } from '../actions/ensure-connected.js';
/** MCP-shaped connection error response (kept for tool-layer + test compatibility). */
export function formatConnectionError(errorInfo) {
    return {
        isError: true,
        content: [
            {
                type: 'text',
                text: JSON.stringify(errorInfo),
            },
        ],
    };
}
//# sourceMappingURL=ensure-connected.js.map