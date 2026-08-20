import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { registerExecCommand } from './commands/exec.js';
import { registerJobCommand } from './commands/job.js';
import { registerTransferCommands } from './commands/transfer.js';
import { registerConnectionCommands } from './commands/connection.js';
import { registerForwardCommands } from './commands/forward.js';
import { runJob } from './job-runner.js';
function resolveVersion() {
    try {
        const pkgPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../package.json');
        return JSON.parse(readFileSync(pkgPath, 'utf-8')).version ?? '0.0.0';
    }
    catch {
        return '0.0.0';
    }
}
export async function runCli(argv) {
    const program = new Command();
    program
        .name('ssh-mcp')
        .description('SSH automation CLI - execute commands, transfer files, forward ports')
        .version(resolveVersion())
        .option('--json', 'machine-readable JSON output');
    registerConnectionCommands(program);
    registerExecCommand(program);
    registerTransferCommands(program);
    registerForwardCommands(program);
    registerJobCommand(program);
    program
        .command('mcp', { hidden: true })
        .description('Run as an MCP stdio server')
        .action(async () => {
        const { runMcpServer } = await import('../server-entry.js');
        await runMcpServer();
    });
    program
        .command('run-job', { hidden: true })
        .description('Internal: detached background job runner')
        .argument('<jobId>', 'job ID')
        .argument('<serverId>', 'server ID')
        .argument('<command...>', 'command to execute (pass after --)')
        .option('--timeout <seconds>', 'command timeout in seconds')
        .option('--stall-timeout <seconds>', 'max seconds without output (0 disables)')
        .option('--config <path>', 'config file path')
        .action(async (jobId, serverId, commandParts, options) => {
        process.exitCode = await runJob(jobId, serverId, commandParts.join(' '), {
            timeout: options.timeout !== undefined ? Number(options.timeout) : undefined,
            stallTimeout: options.stallTimeout !== undefined ? Number(options.stallTimeout) : undefined,
        });
    });
    await program.parseAsync(argv, { from: 'user' });
    return Number(process.exitCode ?? 0);
}
//# sourceMappingURL=main.js.map