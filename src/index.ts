#!/usr/bin/env node

/**
 * ssh-mcp entry point.
 * - No arguments (or `mcp`): MCP stdio server (backwards compatible).
 * - Any other arguments: CLI mode (see `ssh-mcp --help`).
 */

import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runCli } from './cli/main.js';

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return fs.realpathSync(entry) === fileURLToPath(import.meta.url);
  } catch {
    return entry === fileURLToPath(import.meta.url);
  }
}

export async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || (args.length === 1 && args[0] === 'mcp')) {
    const { runMcpServer } = await import('./server-entry.js');
    await runMcpServer();
    return;
  }

  const exitCode = await runCli(args);
  if (exitCode !== 0) {
    process.exitCode = exitCode;
  }
}

if (isMainModule()) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
