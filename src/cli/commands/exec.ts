import type { Command } from 'commander';
import { executeCommand } from '../../actions/execute.js';
import { buildCliDeps, cleanupCli } from '../context.js';
import { launchBackgroundJob } from '../job-launch.js';
import { report } from '../output.js';

const UNLIMITED = Number.MAX_SAFE_INTEGER;

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

export function registerExecCommand(program: Command): void {
  const cmd = program
    .command('exec')
    .description('Execute a shell command on a remote server')
    .argument('<serverId>', 'server ID from config')
    .argument(
      '<command...>',
      'command to execute (quote as one string for shell operators, like ssh)',
    )
    .option('--timeout <seconds>', 'command timeout in seconds')
    .option('--stall-timeout <seconds>', 'max seconds without output (0 disables)')
    .option('--max-output <chars>', 'truncate output to N chars')
    .option('--stdin', 'read local stdin and send to the command')
    .option('--agent-forward', 'enable SSH agent forwarding')
    .option('--bg', 'run as a background job (detach; poll with `job check`)');

  cmd.action(async (serverId: string, commandParts: string[], options) => {
    const command = commandParts.join(' ');
    const json = cmd.optsWithGlobals().json as boolean;
    const timeout = options.timeout !== undefined ? Number(options.timeout) : undefined;
    const stallTimeout =
      options.stallTimeout !== undefined ? Number(options.stallTimeout) : undefined;

    if (options.bg) {
      const { jobId } = launchBackgroundJob(serverId, command, { timeout, stallTimeout });
      if (json) {
        console.log(JSON.stringify({ jobId, serverId, command, status: 'running' }, null, 2));
      } else {
        console.log(`Job started: ${jobId}`);
        console.error(`Poll with: ssh-mcp job check ${jobId}`);
      }
      return;
    }

    const deps = buildCliDeps();
    try {
      const stdin = options.stdin ? await readStdin() : undefined;
      const outcome = await executeCommand(
        {
          serverId,
          command,
          stdin,
          timeout,
          stallTimeout,
          maxOutputLength: options.maxOutput ? Number(options.maxOutput) : UNLIMITED,
          agentForward: options.agentForward,
        },
        deps,
      );

      if (outcome.ok) {
        if (json) {
          console.log(JSON.stringify(outcome.data, null, 2));
          return;
        }
        const data = outcome.data;
        if (data.stderr) process.stderr.write(data.stderr);
        if (data.stdout)
          process.stdout.write(data.stdout.endsWith('\n') ? data.stdout : `${data.stdout}\n`);
        process.exitCode = data.exitCode ?? 1;
        return;
      }
      process.exitCode = report(outcome, json);
    } finally {
      cleanupCli(deps);
    }
  });
}
