import type { Config } from '../config/types.js';
import type { ConnectionPool } from '../ssh/pool.js';
import type { ForwardRegistry } from '../ssh/forward-registry.js';
import type { RemoteForwardRegistry } from '../ssh/remote-forward-registry.js';
import type { ShellRegistry } from '../ssh/shell-registry.js';
import type { JobRegistry } from '../ssh/job-registry.js';
import type { JobStore } from '../ssh/job-store.js';
/** Shared dependencies injected into every action. Built once per process. */
export interface ActionDeps {
    config: Config;
    pool: ConnectionPool;
    forwardRegistry: ForwardRegistry;
    remoteForwardRegistry: RemoteForwardRegistry;
    shellRegistry: ShellRegistry;
    jobRegistry: JobRegistry;
    /** Disk-backed job store. Present in CLI mode; MCP mode is registry-only. */
    jobStore?: JobStore;
}
export type ActionData = object;
/**
 * Result contract shared by MCP tools and CLI commands.
 * - Success: `data` is serialized to JSON by the MCP layer, printed by the CLI.
 * - Failure: `json` (when set) is serialized instead of `message` - preserves
 *   the structured error payloads some MCP tools historically returned.
 */
export type ActionOutcome<T extends ActionData = ActionData> = {
    ok: true;
    data: T;
    pretty?: boolean;
} | {
    ok: false;
    message: string;
    json?: Record<string, unknown>;
};
export declare function failureFrom(error: unknown): ActionOutcome<never>;
//# sourceMappingURL=types.d.ts.map