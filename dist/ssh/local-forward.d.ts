import type { Client } from 'ssh2';
import { ForwardRegistry } from './forward-registry.js';
export interface LocalForwardConfig {
    client: Client;
    serverId: string;
    localHost: string;
    localPort: number;
    remoteHost: string;
    remotePort: number;
}
export interface LocalForwardResult {
    localHost: string;
    localPort: number;
}
export declare function createLocalForward(config: LocalForwardConfig, registry: ForwardRegistry): Promise<LocalForwardResult>;
//# sourceMappingURL=local-forward.d.ts.map