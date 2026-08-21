import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { registerExecCommand } from './commands/exec.js';
import { registerJobCommand } from './commands/job.js';
import { registerTransferCommands } from './commands/transfer.js';
import { registerConnectionCommands } from './commands/connection.js';
import { registerForwardCommands } from './commands/forward.js';
import { registerUpdateCommand, notifyUpdate } from './commands/update.js';
import { registerSkillCommand } from './commands/skill.js';
import { maybeAutoUpdate, shouldSkipAutoUpdate } from './auto-update.js';
import { runJob } from './job-runner.js';
import { packagePath } from '../utils/pkg-root.js';

function resolveVersion(): string {
  try {
    return JSON.parse(readFileSync(packagePath('package.json'), 'utf-8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export async function runCli(argv: string[]): Promise<number> {
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
  registerUpdateCommand(program);
  registerSkillCommand(program);

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

  // Forced background auto-update (throttled to 1x/24h, never for
  // mcp/run-job/update/--json, opt-out via SSH_MCP_AUTO_UPDATE=0)
  if (!shouldSkipAutoUpdate(argv, process.env)) {
    await maybeAutoUpdate().catch(() => undefined);
  }

  await program.parseAsync(argv, { from: 'user' });

  // Update nudge only for non-output invocations (--help, unknown command)
  const command = program.commands.find((c) => c.name() === program.args[0]);
  if (argv.includes('--help') || argv.includes('-h') || (program.args.length > 0 && !command)) {
    await notifyUpdate(program);
  }

  return Number(process.exitCode ?? 0);
}
