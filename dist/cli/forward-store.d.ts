/**
 * Tracks CLI-owned foreground forwards (local + remote) so other
 * invocations can list them and signal their owner processes.
 * Entries die with their owner process (pid liveness check on read).
 */
export interface ForwardEntry {
    kind: 'local' | 'remote';
    serverId: string;
    localHost?: string;
    localPort?: number;
    remoteHost?: string;
    remotePort?: number;
    pid: number;
    createdAt: number;
}
export declare class ForwardStore {
    private readonly file;
    constructor(file?: string);
    add(entry: ForwardEntry): void;
    removeByPid(pid: number): void;
    /** Live entries only; entries of dead processes are pruned from disk. */
    list(): ForwardEntry[];
    private read;
    private write;
}
//# sourceMappingURL=forward-store.d.ts.map