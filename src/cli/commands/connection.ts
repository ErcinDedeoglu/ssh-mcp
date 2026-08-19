import type { Command } from 'commander';
import { listServers } from '../../actions/list-servers.js';
import { connectionStatus } from '../../actions/connection-status.js';
import { jumpConnect } from '../../actions/jump-connect.js';
import { executeCommand } from '../../actions/execute.js';
import { buildCliDeps, cleanupCli } from '../context.js';
import { report } from '../output.js';

export function registerConnectionCommands(program: Command): void {
  const servers = program
    .command('servers')
    .description('List configured SSH servers with connection status');
  servers.action(async () => {
    const deps = buildCliDeps();
    try {
      const json = servers.optsWithGlobals().json as boolean;
      const outcome = await listServers(deps);
      process.exitCode = report(outcome, json, (data) => {
        for (const s of data as Array<{
          id: string;
          host: string;
          port: number;
          username: string;
          connected: boolean;
        }>) {
          const state = s.connected ? 'connected' : '-';
          console.log(`${s.id.padEnd(20)} ${s.username}@${s.host}:${s.port}  [${state}]`);
        }
      });
    } finally {
      cleanupCli(deps);
    }
  });

  const status = program
    .command('status')
    .description('Check connection health for a server (auto-connects)')
    .argument('<serverId>', 'server ID from config');
  status.action(async (serverId: string) => {
    const deps = buildCliDeps();
    try {
      const json = status.optsWithGlobals().json as boolean;
      const outcome = await connectionStatus({ serverId }, deps);
      process.exitCode = report(outcome, json, (d) => {
        const s = d as {
          serverId: string;
          connected: boolean;
          idle: boolean;
          lastActivityAgo: string;
        };
        console.log(
          `${s.serverId}: ${s.connected ? 'connected' : 'disconnected'}, ` +
            `idle=${s.idle}, lastActivity=${s.lastActivityAgo} ago`,
        );
      });
    } finally {
      cleanupCli(deps);
    }
  });

  const jump = program
    .command('jump')
    .description('Connect through a jump host (bastion); optionally run a command')
    .argument('<jumpServerId>', 'jump host server ID')
    .argument('<targetServerId>', 'target server ID')
    .argument('[command...]', 'command to run on the target through the tunnel');
  jump.action(async (jumpServerId: string, targetServerId: string, commandParts: string[]) => {
    const deps = buildCliDeps();
    try {
      const json = jump.optsWithGlobals().json as boolean;
      const outcome = await jumpConnect({ jumpServerId, targetServerId }, deps);
      if (!outcome.ok) {
        process.exitCode = report(outcome, json);
        return;
      }

      if (commandParts.length === 0) {
        process.exitCode = report(outcome, json, (d) => {
          const j = d as { status: string; targetServerId: string; host?: string; port?: number };
          console.log(`${j.status}: ${j.targetServerId} (${j.host}:${j.port}) via ${jumpServerId}`);
        });
        return;
      }

      const execOutcome = await executeCommand(
        {
          serverId: targetServerId,
          command: commandParts.join(' '),
          maxOutputLength: Number.MAX_SAFE_INTEGER,
        },
        deps,
      );
      if (execOutcome.ok && !json) {
        const d = execOutcome.data;
        if (d.stderr) process.stderr.write(d.stderr);
        if (d.stdout) process.stdout.write(d.stdout.endsWith('\n') ? d.stdout : `${d.stdout}\n`);
        process.exitCode = d.exitCode ?? 1;
        return;
      }
      process.exitCode = report(execOutcome, json);
    } finally {
      cleanupCli(deps);
    }
  });
}
