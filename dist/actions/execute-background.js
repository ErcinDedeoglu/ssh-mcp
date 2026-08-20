import { ensureConnected, connectionFailure } from './ensure-connected.js';
import { getOrCreateShell, resolveTimeoutMs, resolveStallTimeoutMs } from './shell-helpers.js';
import { failureFrom } from './types.js';
import { sanitizeError } from '../utils/sanitize.js';
export async function executeBackground(input, deps) {
    try {
        const { serverId, command, timeout, stallTimeout } = input;
        const connectionResult = await ensureConnected(serverId, {
            config: deps.config,
            pool: deps.pool,
            forwardRegistry: deps.forwardRegistry,
        });
        if (!connectionResult.success) {
            return connectionFailure(connectionResult.errorInfo);
        }
        const { session, serverConfig } = connectionResult;
        const { shell } = await getOrCreateShell(serverId, session.client, deps.shellRegistry, {
            shellType: serverConfig.shell,
            serverConfig,
        });
        const job = deps.jobRegistry.create(serverId, command);
        deps.jobRegistry.updateStatus(job.id, 'running');
        const timeoutMs = resolveTimeoutMs(timeout, serverConfig, deps.config);
        const stallTimeoutMs = resolveStallTimeoutMs(stallTimeout);
        executeJobAsync(shell, job.id, command, { timeoutMs, stallTimeoutMs }, deps, session);
        return {
            ok: true,
            data: {
                jobId: job.id,
                serverId,
                command,
                status: 'running',
                message: 'Job started. Use check_job to poll for status.',
            },
        };
    }
    catch (error) {
        return failureFrom(error);
    }
}
function executeJobAsync(shell, jobId, command, options, deps, session) {
    const onOutput = (chunk) => deps.jobRegistry.appendOutput(jobId, chunk);
    shell
        .execute(command, { ...options, onOutput })
        .then((result) => {
        deps.jobRegistry.setResult(jobId, result);
        session.touch();
    })
        .catch((error) => {
        deps.jobRegistry.setError(jobId, sanitizeError(error));
    });
}
//# sourceMappingURL=execute-background.js.map