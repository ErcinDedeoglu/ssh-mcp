import type { Client, ClientChannel } from 'ssh2';
export interface ActiveRemoteForward {
    serverId: string;
    client: Client;
    remoteHost: string;
    remotePort: number;
    boundPort: number;
    localHost: string;
    localPort: number;
    activeChannels: Set<ClientChannel>;
    createdAt: number;
}
export type RemoteForwardKey = `${string}:${string}:${number}`;
export declare function makeRemoteForwardKey(serverId: string, remoteHost: string, remotePort: number): RemoteForwardKey;
export declare class RemoteForwardRegistry {
    private readonly forwards;
    add(forward: ActiveRemoteForward): void;
    get(serverId: string, remoteHost: string, remotePort: number): ActiveRemoteForward | undefined;
    has(serverId: string, remoteHost: string, remotePort: number): boolean;
    remove(serverId: string, remoteHost: string, remotePort: number): ActiveRemoteForward | undefined;
    listByServer(serverId: string): ActiveRemoteForward[];
    listAll(): ActiveRemoteForward[];
    removeByServer(serverId: string): number;
    clear(): void;
    get size(): number;
    private closeForward;
}
//# sourceMappingURL=remote-forward-registry.d.ts.map