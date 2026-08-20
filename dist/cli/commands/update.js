import { Option } from 'commander';
import { checkForUpdate, selfUpdate } from '../updater.js';
import { stateFilePath, writeAutoUpdateState } from '../auto-update.js';
export function registerUpdateCommand(program) {
    const update = program
        .command('update')
        .description('Update ssh-mcp-cli to the latest version from npm')
        .addOption(new Option('--auto', 'internal: silent background auto-update').hideHelp());
    update.action(async (options) => {
        if (options.auto) {
            // Detached child of maybeAutoUpdate(): fully silent, records errors to state
            try {
                await selfUpdate();
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                writeAutoUpdateState(stateFilePath(), {
                    lastCheckAt: Date.now(),
                    lastError: message,
                });
                process.exitCode = 1;
            }
            return;
        }
        const json = update.optsWithGlobals().json;
        try {
            const result = await selfUpdate();
            if (json) {
                console.log(JSON.stringify(result, null, 2));
                return;
            }
            const verb = result.reinstalled ? 'Reinstalled' : 'Updated';
            console.log(`${verb} ssh-mcp-cli ${result.fromVersion} -> ${result.toVersion} via ${result.packageManager}`);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (json) {
                console.log(JSON.stringify({ error: message }, null, 2));
            }
            else {
                console.error(`Update failed: ${message}`);
            }
            process.exitCode = 1;
        }
    });
}
/** Non-blocking banner: nudges when a newer version exists. Never throws. */
export async function notifyUpdate(program) {
    try {
        const check = await checkForUpdate();
        if (!check.updateAvailable)
            return;
        const json = program.opts().json;
        if (json)
            return;
        console.error(`ssh-mcp ${check.latestVersion} is available (you have ${check.currentVersion}). Run 'ssh-mcp update'.`);
    }
    catch {
        // Offline or registry unreachable - stay silent
    }
}
//# sourceMappingURL=update.js.map