import {
  net,
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  isDockerRunning,
  createPortForwardTestSetup,
  SessionKeeper,
  createLocalForward,
} from './port-forward.setup.js';

describe.skipIf(!isDockerRunning())('E2E Port Forwarding - Multiple Forwards', () => {
  const { getCtx, getRegistry, setup, teardown, cleanupAfterEach } = createPortForwardTestSetup();

  beforeAll(setup);
  afterAll(teardown);
  afterEach(cleanupAfterEach);

  it('creates multiple forwards on same SSH connection', async () => {
    const ctx = getCtx();
    const forwardRegistry = getRegistry();
    const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
    await session.connect();

    const forward1 = await createLocalForward(
      {
        client: session.client,
        serverId: 'server-1',
        localHost: '127.0.0.1',
        localPort: 0,
        remoteHost: 'localhost',
        remotePort: 2222,
      },
      forwardRegistry,
    );

    const forward2 = await createLocalForward(
      {
        client: session.client,
        serverId: 'server-1',
        localHost: '127.0.0.1',
        localPort: 0,
        remoteHost: 'localhost',
        remotePort: 2222,
      },
      forwardRegistry,
    );

    expect(forwardRegistry.size).toBe(2);
    expect(forward1.localPort).not.toBe(forward2.localPort);

    const socket1Connected = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection(
        { host: forward1.localHost, port: forward1.localPort },
        () => {
          socket.destroy();
          resolve(true);
        },
      );
      socket.on('error', () => resolve(false));
    });

    const socket2Connected = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection(
        { host: forward2.localHost, port: forward2.localPort },
        () => {
          socket.destroy();
          resolve(true);
        },
      );
      socket.on('error', () => resolve(false));
    });

    expect(socket1Connected).toBe(true);
    expect(socket2Connected).toBe(true);

    session.disconnect();
  });

  it('creates forwards on different SSH connections', async () => {
    const ctx = getCtx();
    const forwardRegistry = getRegistry();
    const session1 = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
    const session2 = new SessionKeeper(ctx.server2Config, { maxReconnectAttempts: 0 });
    await session1.connect();
    await session2.connect();

    const forward1 = await createLocalForward(
      {
        client: session1.client,
        serverId: 'server-1',
        localHost: '127.0.0.1',
        localPort: 0,
        remoteHost: 'localhost',
        remotePort: 2222,
      },
      forwardRegistry,
    );

    const forward2 = await createLocalForward(
      {
        client: session2.client,
        serverId: 'server-2',
        localHost: '127.0.0.1',
        localPort: 0,
        remoteHost: 'localhost',
        remotePort: 2222,
      },
      forwardRegistry,
    );

    expect(forwardRegistry.listByServer('server-1')).toHaveLength(1);
    expect(forwardRegistry.listByServer('server-2')).toHaveLength(1);

    const banner1 = await new Promise<string>((resolve, reject) => {
      const socket = net.createConnection(
        { host: forward1.localHost, port: forward1.localPort },
        () => {
          socket.once('data', (data) => {
            socket.destroy();
            resolve(data.toString());
          });
        },
      );
      socket.on('error', reject);
    });

    const banner2 = await new Promise<string>((resolve, reject) => {
      const socket = net.createConnection(
        { host: forward2.localHost, port: forward2.localPort },
        () => {
          socket.once('data', (data) => {
            socket.destroy();
            resolve(data.toString());
          });
        },
      );
      socket.on('error', reject);
    });

    expect(banner1).toContain('SSH');
    expect(banner2).toContain('SSH');

    session1.disconnect();
    session2.disconnect();
  });

  it('removes all forwards for a server with removeByServer', async () => {
    const ctx = getCtx();
    const forwardRegistry = getRegistry();
    const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
    await session.connect();

    await createLocalForward(
      {
        client: session.client,
        serverId: 'server-1',
        localHost: '127.0.0.1',
        localPort: 0,
        remoteHost: 'localhost',
        remotePort: 2222,
      },
      forwardRegistry,
    );

    await createLocalForward(
      {
        client: session.client,
        serverId: 'server-1',
        localHost: '127.0.0.1',
        localPort: 0,
        remoteHost: 'localhost',
        remotePort: 2222,
      },
      forwardRegistry,
    );

    expect(forwardRegistry.listByServer('server-1')).toHaveLength(2);

    const removed = forwardRegistry.removeByServer('server-1');
    expect(removed).toBe(2);
    expect(forwardRegistry.listByServer('server-1')).toHaveLength(0);

    session.disconnect();
  });
});
