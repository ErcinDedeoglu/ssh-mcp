#!/usr/bin/env node

/**
 * SSH MCP Server
 * Entry point for the MCP server providing SSH connection management
 */

import { loadConfig } from './config/loader.js';
import { SSHMCPServer } from './server.js';

let server: SSHMCPServer | null = null;

async function shutdown(): Promise<void> {
  if (server) {
    await server.shutdown();
  }
  process.exit(0);
}

export async function main(): Promise<void> {
  const config = loadConfig();
  server = new SSHMCPServer(config);

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await server.run();
}

// Run if executed directly
main().catch(() => {
  process.exit(1);
});
