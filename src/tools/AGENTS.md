# src/tools/AGENTS.md

<!-- See root AGENTS.md for project overview -->

## Overview

13 MCP tools. Each file exports `registerXxxTool()`, called from `index.ts`. Most tools auto-connect when needed via `ensureConnected()`.

| Tool                   | File                    | Parameters                                               | Auto-Connect |
| ---------------------- | ----------------------- | -------------------------------------------------------- | ------------ |
| `list_servers`         | list-servers.ts         | none                                                     | No           |
| `disconnect`           | disconnect.ts           | serverId                                                 | No           |
| `execute`              | execute.ts              | serverId, command, timeout?                              | Yes          |
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

Note: `ensure-connected.ts` is a **helper**, not a registered tool.

## Adding a New Tool

1. Create `src/tools/your-tool.ts`:

```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ConnectionPool } from '../ssh/pool.js';
import { sanitizeError } from './utils.js';

export function registerYourTool(server: McpServer, pool: ConnectionPool): void {
  // REQUIRED: `as any` cast - SDK types don't match runtime API
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server.tool as any)(
    'your_tool_name',
    'Tool description for LLM',
    { param1: z.string().describe('Description') },
    async ({ param1 }: { param1: string }) => {
      try {
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (error) {
        return { isError: true, content: [{ type: 'text' as const, text: sanitizeError(error) }] };
      }
    },
  );
}
```

2. Register in `index.ts`: import, call in `registerAllTools()`, add to exports.

## Response Format

- **Success**: `{ content: [{ type: 'text', text: JSON.stringify(data) }] }`
- **Error**: `{ isError: true, content: [{ type: 'text', text: sanitizeError(error) }] }`

## Conventions

- Zod schemas for ALL validation
- `type: 'text' as const` required for TypeScript
- Use `ensureConnected()` for tools that need a connection (auto-connects if needed)
- Call `session.touch()` after operations to prevent idle timeout
- Always `sanitizeError()` - redacts credentials

## The `as any` Cast

**INTENTIONAL**. MCP SDK types don't match runtime. Do NOT remove or "fix".
