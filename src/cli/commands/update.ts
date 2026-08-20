import type { Command } from 'commander';
import { checkForUpdate, selfUpdate } from '../updater.js';

export function registerUpdateCommand(program: Command): void {
  const update = program
    .command('update')
    .description('Update ssh-mcp-cli to the latest version from npm');

  update.action(async () => {
    const json = update.optsWithGlobals().json as boolean;

    try {
      const result = await selfUpdate();
      if (json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      const verb = result.reinstalled ? 'Reinstalled' : 'Updated';
      console.log(
        `${verb} ssh-mcp-cli ${result.fromVersion} -> ${result.toVersion} via ${result.packageManager}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (json) {
        console.log(JSON.stringify({ error: message }, null, 2));
      } else {
        console.error(`Update failed: ${message}`);
      }
      process.exitCode = 1;
    }
  });
}

/** Non-blocking banner: nudges when a newer version exists. Never throws. */
export async function notifyUpdate(program: Command): Promise<void> {
  try {
    const check = await checkForUpdate();
    if (!check.updateAvailable) return;
    const json = program.opts().json as boolean | undefined;
    if (json) return;
    console.error(
      `ssh-mcp ${check.latestVersion} is available (you have ${check.currentVersion}). Run 'ssh-mcp update'.`,
    );
  } catch {
    // Offline or registry unreachable - stay silent
  }
}
