import { EventEmitter } from 'node:events';
import { Client } from 'ssh2';
import type { ServerConfig } from '../config/types.js';
import { type SessionKeeperOptions, type HealthStatus } from './session.types.js';
export type { SessionKeeperOptions, HealthStatus, SessionKeeperEvents } from './session.types.js';
export declare class SessionKeeper extends EventEmitter {
    private readonly config;
    private readonly options;
    private sshClient;
    private connected;
    private intentionalDisconnect;
    private reconnecting;
    private reconnectAttempt;
    private _lastActivity;
    private reconnectTimer;
    constructor(config: ServerConfig, options?: SessionKeeperOptions);
    get id(): string;
    get isConnected(): boolean;
    get client(): Client;
    get username(): string;
    get lastActivity(): number;
    get isJumpConnection(): boolean;
    get isIdle(): boolean;
    touch(): void;
    healthCheck(): HealthStatus;
    connect(): Promise<void>;
    disconnect(): void;
    private setupEventHandlers;
    private startReconnection;
    private attemptReconnect;
    private setupReconnectEventHandlers;
}
//# sourceMappingURL=session.d.ts.map