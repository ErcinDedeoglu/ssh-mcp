import { type ActionDeps, type ActionOutcome } from './types.js';
export interface ForwardRemotePortInput {
    serverId: string;
    localHost: string;
    localPort: number;
    remoteHost?: string;
    remotePort?: number;
}
export interface ForwardRemotePortResult {
    status: string;
    serverId: string;
    remoteHost: string;
    remotePort: number;
    localHost: string;
    localPort: number;
    connectionString: string;
}
export declare function forwardRemotePort(input: ForwardRemotePortInput, deps: ActionDeps): Promise<ActionOutcome<ForwardRemotePortResult>>;
//# sourceMappingURL=forward-remote-port.d.ts.map