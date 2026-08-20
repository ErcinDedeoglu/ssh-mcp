import { ConnectionPool } from '../ssh/pool.js';
import { ForwardRegistry } from '../ssh/forward-registry.js';
import { RemoteForwardRegistry } from '../ssh/remote-forward-registry.js';
import { ShellRegistry } from '../ssh/shell-registry.js';
import { JobRegistry } from '../ssh/job-registry.js';
/**
 * Builds an ActionDeps bundle from what a tool wrapper receives.
 * Fields not provided default to empty instances - safe because each tool's
 * action only touches the registries that tool historically received.
 */
export function partialDeps(partial) {
    return {
        config: partial.config ?? { servers: [] },
        pool: partial.pool ?? new ConnectionPool(),
        forwardRegistry: partial.forwardRegistry ?? new ForwardRegistry(),
        remoteForwardRegistry: partial.remoteForwardRegistry ?? new RemoteForwardRegistry(),
        shellRegistry: partial.shellRegistry ?? new ShellRegistry(),
        jobRegistry: partial.jobRegistry ?? new JobRegistry(),
        jobStore: partial.jobStore,
    };
}
//# sourceMappingURL=deps.js.map