/**
 * Mock MCP server factory for tool registration testing.
 */
import { vi } from 'vitest';
import type { ToolHandler } from './types.js';

/** Mock server interface matching McpServer tool registration */
export interface MockServer {
  tool: ReturnType<typeof vi.fn>;
  getToolHandler: (name: string) => ToolHandler | undefined;
  getToolConfig: (name: string) => object | undefined;
}

/**
 * Creates a mock MCP server that tracks registered tools.
 * Use getToolHandler() to retrieve and invoke registered handlers.
 */
export function createMockServer(): MockServer {
  const registeredTools = new Map<string, { config: object; handler: ToolHandler }>();

  return {
    tool: vi.fn((...args: unknown[]) => {
      const name = args[0] as string;
      const handler = args[args.length - 1] as ToolHandler;
      let config: object;
      if (args.length === 3) {
        config = typeof args[1] === 'string' ? { description: args[1] } : (args[1] as object);
      } else if (args.length === 4) {
        config = { description: args[1], schema: args[2] };
      } else {
        config = {};
      }
      registeredTools.set(name, { config, handler });
    }),
    getToolHandler: (name: string) => registeredTools.get(name)?.handler,
    getToolConfig: (name: string) => registeredTools.get(name)?.config,
  };
}
