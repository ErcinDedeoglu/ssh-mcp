import { loadConfig } from '../config/loader.js';
import { ConnectionPool } from '../ssh/pool.js';
import { ForwardRegistry } from '../ssh/forward-registry.js';
import { RemoteForwardRegistry } from '../ssh/remote-forward-registry.js';
import { ShellRegistry } from '../ssh/shell-registry.js';
import { JobRegistry } from '../ssh/job-registry.js';
import { JobStore } from '../ssh/job-store.js';
/** Builds a one-shot ActionDeps bundle for a CLI invocation. */
export function buildCliDeps() {
    const config = loadConfig();
    return {
        config,
        pool: new ConnectionPool(),
        forwardRegistry: new ForwardRegistry(),
        remoteForwardRegistry: new RemoteForwardRegistry(),
        shellRegistry: new ShellRegistry(),
        jobRegistry: new JobRegistry(),
        jobStore: new JobStore(),
    };
}
/** Gracefully closes all SSH sessions opened by this invocation. */
export function cleanupCli(deps) {
    deps.jobRegistry.clear();
    deps.shellRegistry.clear();
    deps.remoteForwardRegistry.clear();
    deps.forwardRegistry.clear();
    deps.pool.clear();
}
//# sourceMappingURL=context.js.map