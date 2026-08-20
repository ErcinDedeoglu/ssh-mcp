import type { Config, ShellType, ServerConfig } from '../config/types.js';
import { ShellSession } from '../ssh/shell-session.js';
import type { ShellRegistry } from '../ssh/shell-registry.js';
export interface GetOrCreateShellOptions {
    agentForward?: boolean;
    shellType?: ShellType;
    serverConfig?: ServerConfig;
}
export declare function getOrCreateShell(serverId: string, client: Parameters<ShellSession['initialize']>[0], registry: ShellRegistry, options?: GetOrCreateShellOptions): Promise<{
    shell: ShellSession;
    recreated: boolean;
}>;
export declare function resolveTimeoutMs(timeout: number | undefined, serverConfig: {
    timeouts?: {
        command?: number;
    };
} | undefined, config: Config): number;
export declare function resolveStallTimeoutMs(stallTimeout: number | null | undefined): number | null;
//# sourceMappingURL=shell-helpers.d.ts.map