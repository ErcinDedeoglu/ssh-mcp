import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Config } from './config/types.js';
import { ConnectionPool } from './ssh/pool.js';
import { registerAllTools } from './tools/index.js';

const SERVER_NAME = 'ssh-mcp';
const SERVER_VERSION = '0.1.0';

export class SSHMCPServer {
  private readonly server: McpServer;
  private readonly pool: ConnectionPool;
  private readonly config: Config;
  private transport: StdioServerTransport | null = null;

  constructor(config: Config) {
    this.config = config;
    this.pool = new ConnectionPool();
    this.server = new McpServer(
      {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    registerAllTools(this.server, this.config, this.pool);
  }

  async run(): Promise<void> {
    this.transport = new StdioServerTransport();
    await this.server.connect(this.transport);
  }

  async shutdown(): Promise<void> {
    this.pool.clear();
    await this.server.close();
  }

  getPool(): ConnectionPool {
    return this.pool;
  }
}
