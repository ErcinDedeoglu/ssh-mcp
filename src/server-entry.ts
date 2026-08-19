import { loadConfig } from './config/loader.js';
import { SSHMCPServer } from './server.js';

let server: SSHMCPServer | null = null;

async function shutdown(): Promise<void> {
  if (server) {
    await server.shutdown();
  }
  process.exit(0);
}

/** Starts the MCP stdio server (used for both no-arg and `ssh-mcp mcp` invocations). */
export async function runMcpServer(): Promise<void> {
  const config = loadConfig();
  server = new SSHMCPServer(config);

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  await server.run();
}
