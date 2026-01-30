import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { Config } from './config/types.js';
import { ConnectionPool } from './ssh/pool.js';
import { ForwardRegistry } from './ssh/forward-registry.js';
import { RemoteForwardRegistry } from './ssh/remote-forward-registry.js';
import { ShellRegistry } from './ssh/shell-registry.js';
import { JobRegistry } from './ssh/job-registry.js';
import { registerAllTools } from './tools/index.js';

const SERVER_NAME = 'ssh-mcp';
const SERVER_VERSION = '0.1.0';

export class SSHMCPServer {
  private readonly server: McpServer;
  private readonly pool: ConnectionPool;
  private readonly forwardRegistry: ForwardRegistry;
  private readonly remoteForwardRegistry: RemoteForwardRegistry;
  private readonly shellRegistry: ShellRegistry;
  private readonly jobRegistry: JobRegistry;
  private readonly config: Config;
  private transport: StdioServerTransport | null = null;

  constructor(config: Config) {
    this.config = config;
    this.pool = new ConnectionPool();
    this.forwardRegistry = new ForwardRegistry();
    this.remoteForwardRegistry = new RemoteForwardRegistry();
    this.shellRegistry = new ShellRegistry();
    this.jobRegistry = new JobRegistry();
    this.server = new McpServer(
      {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    registerAllTools(
      this.server,
      this.config,
      this.pool,
      this.forwardRegistry,
      this.remoteForwardRegistry,
      this.shellRegistry,
      this.jobRegistry,
    );
  }

  async run(): Promise<void> {
    this.transport = new StdioServerTransport();
    await this.server.connect(this.transport);
  }

  async shutdown(): Promise<void> {
    this.jobRegistry.clear();
    this.shellRegistry.clear();
    this.remoteForwardRegistry.clear();
    this.forwardRegistry.clear();
    this.pool.clear();
    await this.server.close();
  }

  getPool(): ConnectionPool {
    return this.pool;
  }

  getForwardRegistry(): ForwardRegistry {
    return this.forwardRegistry;
  }

  getRemoteForwardRegistry(): RemoteForwardRegistry {
    return this.remoteForwardRegistry;
  }

  getJobRegistry(): JobRegistry {
    return this.jobRegistry;
  }
}
