/**
 * Shared type definitions for MCP tool tests.
 */
import type { EventEmitter } from 'node:events';

/** Result returned by MCP tool handlers */
export interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/** MCP tool handler function signature */
export type ToolHandler = (...args: unknown[]) => Promise<ToolResult>;

/** Callback for SSH error handling */
export type ErrorCallback = (err: Error | null, result?: unknown) => void;

/** Callback for SSH exec command */
export type ExecCallback = (
  err: Error | null,
  stream?: EventEmitter & { stderr: EventEmitter },
) => void;
