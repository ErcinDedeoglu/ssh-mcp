import { persistShellType } from '../config/writer.js';
import { ShellSession } from '../ssh/shell-session.js';
const DEFAULT_COMMAND_TIMEOUT_SECONDS = 60;
const MS_PER_SECOND = 1000;
export async function getOrCreateShell(serverId, client, registry, options = {}) {
    const requestedAgentForward = options.agentForward ?? false;
    let shell = registry.get(serverId);
    let recreated = false;
    // If shell exists but agentForward mismatch (requested true, has false), recreate
    if (shell?.isReady && requestedAgentForward && !shell.hasAgentForward) {
        registry.remove(serverId);
        shell = undefined;
        recreated = true;
    }
    if (shell?.isReady)
        return { shell, recreated };
    const wasAuto = !options.shellType || options.shellType === 'auto';
    shell = new ShellSession({ agentForward: requestedAgentForward, shellType: options.shellType });
    await shell.initialize(client);
    registry.set(serverId, shell);
    if (wasAuto && shell.shellType !== 'auto') {
        const detected = shell.shellType;
        if (options.serverConfig)
            options.serverConfig.shell = detected;
        persistShellType(serverId, detected);
    }
    return { shell, recreated };
}
export function resolveTimeoutMs(timeout, serverConfig, config) {
    return ((timeout ??
        serverConfig?.timeouts?.command ??
        config.defaults?.timeouts?.command ??
        DEFAULT_COMMAND_TIMEOUT_SECONDS) * MS_PER_SECOND);
}
export function resolveStallTimeoutMs(stallTimeout) {
    if (stallTimeout === null || stallTimeout === 0)
        return null;
    if (stallTimeout === undefined)
        return undefined;
    return stallTimeout * MS_PER_SECOND;
}
//# sourceMappingURL=shell-helpers.js.map