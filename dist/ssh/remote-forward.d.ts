import type { Client } from 'ssh2';
import { RemoteForwardRegistry } from './remote-forward-registry.js';
export interface RemoteForwardConfig {
    client: Client;
    serverId: string;
    remoteHost: string;
    remotePort: number;
    localHost: string;
    localPort: number;
}
export interface RemoteForwardResult {
    remoteHost: string;
    remotePort: number;
    boundPort: number;
}
export declare function createRemoteForward(config: RemoteForwardConfig, registry: RemoteForwardRegistry): Promise<RemoteForwardResult>;
export declare function closeRemoteForward(client: Client, remoteHost: string, boundPort: number): Promise<void>;
//# sourceMappingURL=remote-forward.d.ts.map