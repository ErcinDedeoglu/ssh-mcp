import type { Config } from './types.js';
/** Path of the config file owning a server (project or primary). */
export declare function getServerConfigPath(serverId: string): string | undefined;
export declare function loadConfig(options?: {
    startDir?: string;
}): Config;
//# sourceMappingURL=loader.d.ts.map