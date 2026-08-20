import { forwardPort } from '../../actions/forward-port.js';
import { forwardRemotePort } from '../../actions/forward-remote-port.js';
import { jumpConnect } from '../../actions/jump-connect.js';
import { buildCliDeps, cleanupCli } from '../context.js';
import { ForwardStore } from '../forward-store.js';
import { report } from '../output.js';
export function registerForwardCommands(program) {
    const forward = program
        .command('forward')
        .description('Forward a local port to a remote host:port through the SSH server (runs in foreground)')
        .argument('<serverId>', 'server ID from config')
        .argument('<remoteHost>', 'remote host to forward to')
        .argument('<remotePort>', 'remote port to forward to', Number)
        .option('--local-host <host>', 'local interface to bind (default 127.0.0.1)')
        .option('--local-port <port>', 'local port to listen on (default auto-assign)', Number)
        .option('--via <jumpServerId>', 'connect through a jump host first');
    forward.action(async (serverId, remoteHost, remotePort, options) => {
        await runForegroundForward(forward, {
            kind: 'local',
            serverId,
            via: options.via,
            action: (deps) => forwardPort({
                serverId,
                remoteHost,
                remotePort,
                localHost: options.localHost,
                localPort: options.localPort,
            }, deps),
        });
    });
    const rforward = program
        .command('rforward')
        .description('Expose a local service on the SSH server (remote forward, runs in foreground)')
        .argument('<serverId>', 'server ID from config')
        .argument('<localHost>', 'local host to forward to')
        .argument('<localPort>', 'local port to forward to', Number)
        .option('--remote-host <host>', 'remote interface to bind (default 127.0.0.1)')
        .option('--remote-port <port>', 'remote port to listen on (default auto-assign)', Number)
        .option('--via <jumpServerId>', 'connect through a jump host first');
    rforward.action(async (serverId, localHost, localPort, options) => {
        await runForegroundForward(rforward, {
            kind: 'remote',
            serverId,
            via: options.via,
            action: (deps) => forwardRemotePort({
                serverId,
                localHost,
                localPort,
                remoteHost: options.remoteHost,
                remotePort: options.remotePort,
            }, deps),
        });
    });
    const forwards = program.command('forwards').description('List active CLI-managed forwards');
    forwards.action(() => {
        const entries = new ForwardStore().list();
        const json = forwards.optsWithGlobals().json;
        if (json) {
            console.log(JSON.stringify(entries, null, 2));
            return;
        }
        if (entries.length === 0) {
            console.log('No active forwards.');
            return;
        }
        for (const e of entries) {
            const route = e.kind === 'local'
                ? `${e.localHost}:${e.localPort} -> ${e.remoteHost}:${e.remotePort}`
                : `${e.remoteHost}:${e.remotePort} -> ${e.localHost}:${e.localPort}`;
            console.log(`${e.kind.padEnd(6)} ${e.serverId.padEnd(20)} ${route}  (pid ${e.pid})`);
        }
    });
    program
        .command('forward-close')
        .description('Close a CLI forward by signaling its owner process')
        .argument('<localPort>', 'local port of the forward', Number)
        .option('--local-host <host>', 'local interface (default 127.0.0.1)')
        .action((localPort, options) => {
        signalOwner(new ForwardStore()
            .list()
            .filter((e) => e.localPort === localPort &&
            (e.localHost ?? '127.0.0.1') === (options.localHost ?? '127.0.0.1')));
    });
    program
        .command('rforward-close')
        .description('Close a CLI remote forward by signaling its owner process')
        .argument('<serverId>', 'server ID of the forward')
        .argument('<remotePort>', 'remote port of the forward', Number)
        .option('--remote-host <host>', 'remote interface (default 127.0.0.1)')
        .action((serverId, remotePort, options) => {
        signalOwner(new ForwardStore()
            .list()
            .filter((e) => e.serverId === serverId &&
            e.remotePort === remotePort &&
            (e.remoteHost ?? '127.0.0.1') === (options.remoteHost ?? '127.0.0.1')));
    });
}
async function runForegroundForward(cmd, spec) {
    const json = cmd.optsWithGlobals().json;
    const deps = buildCliDeps();
    const store = new ForwardStore();
    let registered = false;
    if (spec.via) {
        const jump = await jumpConnect({ jumpServerId: spec.via, targetServerId: spec.serverId }, deps);
        if (!jump.ok) {
            process.exitCode = report(jump, json);
            return;
        }
    }
    const outcome = await spec.action(deps);
    if (!outcome.ok) {
        process.exitCode = report(outcome, json);
        return;
    }
    const d = outcome.data;
    store.add({
        kind: spec.kind,
        serverId: spec.serverId,
        localHost: d.localHost,
        localPort: d.localPort,
        remoteHost: d.remoteHost,
        remotePort: d.remotePort,
        pid: process.pid,
        createdAt: Date.now(),
    });
    registered = true;
    console.error(`${d.connectionString}  (Ctrl-C to stop)`);
    await new Promise((resolve) => {
        const stop = () => resolve();
        process.on('SIGINT', stop);
        process.on('SIGTERM', stop);
    });
    if (registered)
        store.removeByPid(process.pid);
    cleanupCli(deps);
}
function signalOwner(entries) {
    if (entries.length === 0) {
        console.error('No matching active forward found.');
        process.exitCode = 1;
        return;
    }
    for (const entry of entries) {
        process.kill(entry.pid, 'SIGINT');
        console.log(`Signaled owner process ${entry.pid} of ${entry.serverId} forward.`);
    }
}
//# sourceMappingURL=forward.js.map