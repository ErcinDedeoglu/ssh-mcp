import { EventEmitter } from 'node:events';
import { Client } from 'ssh2';
import type { ServerConfig } from '../config/types.js';
export interface SSHConnectionEvents {
    connected: (serverId: string) => void;
    disconnected: (serverId: string) => void;
    error: (error: Error) => void;
}
export declare class SSHConnection extends EventEmitter {
    private readonly config;
    private readonly sshClient;
    private connected;
    constructor(config: ServerConfig);
    get id(): string;
    get isConnected(): boolean;
    get client(): Client;
    get username(): string;
    private setupEventHandlers;
    private safeEmitError;
    private buildConnectConfig;
    connect(): Promise<void>;
    disconnect(): void;
}
//# sourceMappingURL=connection.d.ts.map