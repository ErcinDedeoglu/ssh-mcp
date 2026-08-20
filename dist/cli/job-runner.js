import { buildCliDeps, cleanupCli } from './context.js';
import { ensureConnected } from '../actions/ensure-connected.js';
import { getOrCreateShell, resolveTimeoutMs, resolveStallTimeoutMs, } from '../actions/shell-helpers.js';
import { sanitizeError } from '../utils/sanitize.js';
/**
 * Detached child entry point: executes one command, streams output to the
 * JobStore, records the terminal state, and exits. Owned by `exec --bg`.
 */
export async function runJob(jobId, serverId, command, options = {}) {
    const deps = buildCliDeps();
    const store = deps.jobStore;
    const meta = {
        id: jobId,
        serverId,
        command,
        status: 'running',
        startedAt: Date.now(),
        pid: process.pid,
    };
    store.save(meta);
    let cancelled = false;
    const onSignal = () => {
        cancelled = true;
        const shell = deps.shellRegistry.get(serverId);
        if (shell?.hasRunningCommand)
            shell.cancelCurrentCommand();
        store.save({
            ...meta,
            status: 'cancelled',
            error: 'Job cancelled by user',
            completedAt: Date.now(),
        });
        cleanupCli(deps);
        process.exit(0);
    };
    process.on('SIGTERM', onSignal);
    process.on('SIGINT', onSignal);
    try {
        const connection = await ensureConnected(serverId, {
            config: deps.config,
            pool: deps.pool,
            forwardRegistry: deps.forwardRegistry,
        });
        if (!connection.success) {
            store.save({
                ...meta,
                status: 'failed',
                error: connection.errorInfo.reason ?? 'Connection failed',
                completedAt: Date.now(),
            });
            return 1;
        }
        const { shell } = await getOrCreateShell(serverId, connection.session.client, deps.shellRegistry, { shellType: connection.serverConfig.shell, serverConfig: connection.serverConfig });
        const result = await shell.execute(command, {
            timeoutMs: resolveTimeoutMs(options.timeout, connection.serverConfig, deps.config),
            stallTimeoutMs: options.stallTimeout === undefined
                ? undefined
                : resolveStallTimeoutMs(options.stallTimeout),
            onOutput: (chunk) => store.appendOutput(jobId, chunk),
        });
        connection.session.touch();
        if (cancelled)
            return 0;
        store.save({ ...meta, status: 'completed', result, completedAt: Date.now() });
        return 0;
    }
    catch (error) {
        store.save({ ...meta, status: 'failed', error: sanitizeError(error), completedAt: Date.now() });
        return 1;
    }
    finally {
        cleanupCli(deps);
    }
}
//# sourceMappingURL=job-runner.js.map