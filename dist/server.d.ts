import type { Config } from './config/types.js';
import { ConnectionPool } from './ssh/pool.js';
import { ForwardRegistry } from './ssh/forward-registry.js';
import { RemoteForwardRegistry } from './ssh/remote-forward-registry.js';
import { JobRegistry } from './ssh/job-registry.js';
export declare class SSHMCPServer {
    private readonly server;
    private readonly pool;
    private readonly forwardRegistry;
    private readonly remoteForwardRegistry;
    private readonly shellRegistry;
    private readonly jobRegistry;
    private readonly config;
    private transport;
    constructor(config: Config);
    run(): Promise<void>;
    shutdown(): Promise<void>;
    getPool(): ConnectionPool;
    getForwardRegistry(): ForwardRegistry;
    getRemoteForwardRegistry(): RemoteForwardRegistry;
    getJobRegistry(): JobRegistry;
}
//# sourceMappingURL=server.d.ts.map