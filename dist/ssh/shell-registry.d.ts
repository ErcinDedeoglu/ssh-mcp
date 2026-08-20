import { ShellSession } from './shell-session.js';
export declare class ShellRegistry {
    private readonly shells;
    get(serverId: string): ShellSession | undefined;
    set(serverId: string, shell: ShellSession): void;
    has(serverId: string): boolean;
    remove(serverId: string): boolean;
    clear(): void;
    get size(): number;
}
//# sourceMappingURL=shell-registry.d.ts.map