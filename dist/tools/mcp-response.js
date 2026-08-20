/** Maps the shared ActionOutcome contract to the MCP tool response format. */
export function toMcpResponse(outcome) {
    if (outcome.ok) {
        const text = outcome.pretty
            ? JSON.stringify(outcome.data, null, 2)
            : JSON.stringify(outcome.data);
        return { content: [{ type: 'text', text }] };
    }
    const text = outcome.json ? JSON.stringify(outcome.json) : outcome.message;
    return { isError: true, content: [{ type: 'text', text }] };
}
//# sourceMappingURL=mcp-response.js.map