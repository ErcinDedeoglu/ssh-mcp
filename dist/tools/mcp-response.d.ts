import type { ActionOutcome, ActionData } from '../actions/types.js';
export type McpToolResponse = {
    content: Array<{
        type: 'text';
        text: string;
    }>;
} | {
    isError: true;
    content: Array<{
        type: 'text';
        text: string;
    }>;
};
/** Maps the shared ActionOutcome contract to the MCP tool response format. */
export declare function toMcpResponse<T extends ActionData>(outcome: ActionOutcome<T>): McpToolResponse;
//# sourceMappingURL=mcp-response.d.ts.map