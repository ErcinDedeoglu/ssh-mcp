import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export const PROJECT_CONFIG_FILENAME = '.ssh-mcp.json';

export function expandHome(filePath: string): string {
  if (filePath.startsWith('~')) {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return filePath;
}

/** True when --config flag or SSH_MCP_CONFIG env pin the config explicitly. */
export function hasExplicitConfigOverride(): boolean {
  const cliIndex = process.argv.indexOf('--config');
  if (cliIndex !== -1 && process.argv[cliIndex + 1]) {
    return true;
  }
  return Boolean(process.env.SSH_MCP_CONFIG);
}

/**
 * Nearest .ssh-mcp.json walking up from startDir (git-style).
 * Returns undefined when no project config exists on the path to root.
 */
export function findProjectConfig(startDir: string = process.cwd()): string | undefined {
  let dir = path.resolve(startDir);
  for (;;) {
    const candidate = path.join(dir, PROJECT_CONFIG_FILENAME);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

export function getConfigPath(): string {
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
