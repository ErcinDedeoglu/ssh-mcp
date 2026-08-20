import * as os from 'node:os';
import * as path from 'node:path';
export function expandHome(filePath) {
    if (filePath.startsWith('~')) {
        return path.join(os.homedir(), filePath.slice(1));
    }
    return filePath;
}
export function getConfigPath() {
    // Priority: CLI arg > env var > default
    const cliIndex = process.argv.indexOf('--config');
    if (cliIndex !== -1 && process.argv[cliIndex + 1]) {
        return expandHome(process.argv[cliIndex + 1]);
    }
    if (process.env.SSH_MCP_CONFIG) {
        return expandHome(process.env.SSH_MCP_CONFIG);
    }
    return path.join(os.homedir(), '.ssh-mcp', 'config.json');
}
//# sourceMappingURL=path.js.map