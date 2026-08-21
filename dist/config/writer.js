/**
 * Config persistence: writes detected shell types back to the config file
 * so subsequent connections skip auto-detection.
 */
import * as fs from 'node:fs';
import { getConfigPath } from './path.js';
import { getServerConfigPath } from './loader.js';
/**
 * Persist a detected shell type for a server back to the config file.
 * Reads the raw JSON, finds the server by id, sets `shell`, writes back.
 * Preserves existing formatting (2-space indent) and file permissions (0600).
 *
 * This is a best-effort operation — errors are silently ignored because
 * config persistence is an optimization, not a critical path.
 */
export function persistShellType(serverId, shellType) {
    try {
        // Write back to whichever file defines this server (project or primary)
        const configPath = getServerConfigPath(serverId) ?? getConfigPath();
        const content = fs.readFileSync(configPath, 'utf-8');
        const raw = JSON.parse(content);
        const server = raw.servers?.find((s) => s.id === serverId);
        if (!server)
            return;
        // Only persist if currently unset or 'auto'
        if (server.shell !== undefined && server.shell !== 'auto')
            return;
        server.shell = shellType;
        fs.writeFileSync(configPath, JSON.stringify(raw, null, 2) + '\n', { mode: 0o600 });
    }
    catch {
        // Best-effort: config write failure should never break tool execution
    }
}
//# sourceMappingURL=writer.js.map