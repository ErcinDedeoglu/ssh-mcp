# src/tools/AGENTS.md

<!-- See root AGENTS.md for project overview -->

## Overview

7 MCP tools. Each file exports `registerXxxTool()`, called from `index.ts`.

| Tool                | File                 | Parameters                      |
| ------------------- | -------------------- | ------------------------------- |
| `list_servers`      | list-servers.ts      | none                            |
| `connect`           | connect.ts           | serverId                        |
| `disconnect`        | disconnect.ts        | serverId                        |
| `execute`           | execute.ts           | serverId, command, timeout?     |
| `upload`            | upload.ts            | serverId, localPath, remotePath |
| `download`          | download.ts          | serverId, remotePath, localPath |
| `connection_status` | connection-status.ts | serverId                        |

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
- `pool.get()` before operations, `session.touch()` after
- Always `sanitizeError()` - redacts credentials

## The `as any` Cast

**INTENTIONAL**. MCP SDK types don't match runtime. Do NOT remove or "fix".
