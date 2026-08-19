import { Command } from 'commander';
import { registerExecCommand } from './commands/exec.js';
import { registerJobCommand } from './commands/job.js';
import { registerTransferCommands } from './commands/transfer.js';
import { registerConnectionCommands } from './commands/connection.js';
import { registerForwardCommands } from './commands/forward.js';
import { runJob } from './job-runner.js';

const VERSION = '1.0.0';

export async function runCli(argv: string[]): Promise<number> {
  const program = new Command();

  program
    .name('ssh-mcp')
    .description('SSH automation CLI - execute commands, transfer files, forward ports')
    .version(VERSION)
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
    .action(
      async (
        jobId: string,
        serverId: string,
        commandParts: string[],
        options: { timeout?: string; stallTimeout?: string },
      ) => {
        process.exitCode = await runJob(jobId, serverId, commandParts.join(' '), {
          timeout: options.timeout !== undefined ? Number(options.timeout) : undefined,
          stallTimeout:
            options.stallTimeout !== undefined ? Number(options.stallTimeout) : undefined,
        });
      },
    );

  await program.parseAsync(argv, { from: 'user' });
  return Number(process.exitCode ?? 0);
}
