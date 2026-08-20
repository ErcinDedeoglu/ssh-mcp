import type { SessionKeeper } from './session.js';
export declare class ConnectionPool {
    private readonly connections;
    add(connection: SessionKeeper): void;
    get(serverId: string): SessionKeeper | undefined;
    has(serverId: string): boolean;
    remove(serverId: string): void;
    clear(): void;
    get size(): number;
}
//# sourceMappingURL=pool.d.ts.map