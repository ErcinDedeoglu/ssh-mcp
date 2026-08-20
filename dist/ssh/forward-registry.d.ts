import type { Server as NetServer, Socket } from 'node:net';
export interface ActiveForward {
    serverId: string;
    localHost: string;
    localPort: number;
    remoteHost: string;
    remotePort: number;
    server: NetServer;
    activeSockets: Set<Socket>;
    createdAt: number;
}
export type ForwardKey = `${string}:${number}`;
export declare function makeForwardKey(localHost: string, localPort: number): ForwardKey;
export declare class ForwardRegistry {
    private readonly forwards;
    add(forward: ActiveForward): void;
    get(localHost: string, localPort: number): ActiveForward | undefined;
    has(localHost: string, localPort: number): boolean;
    remove(localHost: string, localPort: number): boolean;
    listByServer(serverId: string): ActiveForward[];
    listAll(): ActiveForward[];
    removeByServer(serverId: string): number;
    clear(): void;
    get size(): number;
    private closeForward;
}
//# sourceMappingURL=forward-registry.d.ts.map