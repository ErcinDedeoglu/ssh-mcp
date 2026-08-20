import { type ActionDeps, type ActionOutcome } from './types.js';
export interface ForwardPortInput {
    serverId: string;
    remoteHost: string;
    remotePort: number;
    localHost?: string;
    localPort?: number;
}
export interface ForwardPortResult {
    status: string;
    serverId: string;
    localHost: string;
    localPort: number;
    remoteHost: string;
    remotePort: number;
    connectionString: string;
}
export declare function forwardPort(input: ForwardPortInput, deps: ActionDeps): Promise<ActionOutcome<ForwardPortResult>>;
//# sourceMappingURL=forward-port.d.ts.map