# src/tools/AGENTS.md

<!-- See root AGENTS.md for project overview -->

## Overview

16 MCP tools. Each file is a **thin wrapper**: zod schema + `registerXxxTool()` that calls a shared action in `src/actions/` and maps the result via `toMcpResponse()`. Business logic lives in actions, NOT here. Most tools auto-connect when needed via `ensureConnected()`.

| Tool                   | File                    | Parameters                                               | Auto-Connect |
| ---------------------- | ----------------------- | -------------------------------------------------------- | ------------ |
| `list_servers`         | list-servers.ts         | none                                                     | No           |
| `disconnect`           | disconnect.ts           | serverId                                                 | No           |
| `execute`              | execute.ts              | serverId, command, timeout?                              | Yes          |
| `execute_background`   | execute-background.ts   | serverId, command, timeout?, stallTimeout?               | Yes          |
| `check_job`            | check-job.ts            | jobId, maxOutputLength?                                  | No           |
| `cancel_job`           | cancel-job.ts           | jobId                                                    | No           |
| `get_console_history`  | get-console-history.ts  | serverId, limit?                                         | No           |
| `upload`               | upload.ts               | serverId, localPath, remotePath                          | Yes          |
| `download`             | download.ts             | serverId, remotePath, localPath                          | Yes          |
| `connection_status`    | connection-status.ts    | serverId                                                 | Yes          |
| `jump_connect`         | jump-connect.ts         | jumpServerId, targetServerId                             | Yes (jump)   |
| `forward_port`         | forward-port.ts         | serverId, remoteHost, remotePort, localHost?, localPort? | Yes          |
| `forward_remote_port`  | forward-remote-port.ts  | serverId, localHost, localPort, remoteHost?, remotePort? | Yes          |
| `close_forward`        | close-forward.ts        | localPort, localHost?                                    | No           |
| `close_remote_forward` | close-remote-forward.ts | serverId, remotePort, remoteHost?                        | No           |
| `list_forwards`        | list-forwards.ts        | serverId?                                                | No           |

Note: `ensure-connected.ts` and `utils.ts` are **re-export shims** (logic lives in `src/actions/` and `src/utils/`), `deps.ts` provides `partialDeps()`, `mcp-response.ts` provides `toMcpResponse()`.

## Adding a New Tool

1. Create the action in `src/actions/your-action.ts` (see `src/actions/AGENTS.md`) - typed input, `ActionOutcome` output, catch via `failureFrom()`.

2. Create `src/tools/your-tool.ts`:

```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { yourAction } from '../actions/your-action.js';
import { partialDeps } from './deps.js';
import { toMcpResponse } from './mcp-response.js';

export function registerYourTool(server: McpServer, pool: ConnectionPool): void {
  // REQUIRED: `as any` cast - SDK types don't match runtime API
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.tool as any)(
    'your_tool_name',
    'Tool description for LLM',
    { param1: z.string().describe('Description') },
    async (input: { param1: string }) => {
      return toMcpResponse(await yourAction(input, partialDeps({ pool })));
    },
  );
}
```

3. Register in `index.ts`: import, call in `registerAllTools()`, add to exports.

## Response Format

Mapped automatically by `toMcpResponse()` from the action outcome:

- **Success**: `{ content: [{ type: 'text', text: JSON.stringify(data) }] }`
- **Error**: `{ isError: true, content: [{ type: 'text', text: message-or-json }] }`

## Conventions

- Zod schemas for ALL validation (stays in the tool wrapper)
- `type: 'text' as const` handled by `mcp-response.ts`
- Actions call `ensureConnected()` / `session.touch()` internally - wrappers never touch SSH directly
- Errors sanitized inside actions via `failureFrom()`

## The `as any` Cast

**INTENTIONAL**. MCP SDK types don't match runtime. Do NOT remove or "fix".
