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
  type LocalForwardConfig,
} from './port-forward.setup.js';

describe.skipIf(!isDockerRunning())('E2E Port Forwarding - Connection Tracking', () => {
  const { getCtx, getRegistry, setup, teardown, cleanupAfterEach } = createPortForwardTestSetup();

  beforeAll(setup);
  afterAll(teardown);
  afterEach(cleanupAfterEach);

  it('tracks active connections', async () => {
    const ctx = getCtx();
    const forwardRegistry = getRegistry();
    const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
    await session.connect();

    const config: LocalForwardConfig = {
      client: session.client,
      serverId: 'server-1',
      localHost: '127.0.0.1',
      localPort: 0,
      remoteHost: 'localhost',
      remotePort: 2222,
    };

    const result = await createLocalForward(config, forwardRegistry);
    const forward = forwardRegistry.get(result.localHost, result.localPort);
    expect(forward?.activeSockets.size).toBe(0);

    const socket = net.createConnection({ host: result.localHost, port: result.localPort });
    await new Promise<void>((resolve) => socket.on('connect', resolve));

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(forward?.activeSockets.size).toBe(1);

    socket.destroy();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(forward?.activeSockets.size).toBe(0);

    session.disconnect();
  });

  it('supports multiple concurrent connections', async () => {
    const ctx = getCtx();
    const forwardRegistry = getRegistry();
    const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
    await session.connect();

    const config: LocalForwardConfig = {
      client: session.client,
      serverId: 'server-1',
      localHost: '127.0.0.1',
      localPort: 0,
      remoteHost: 'localhost',
      remotePort: 2222,
    };

    const result = await createLocalForward(config, forwardRegistry);

    const sockets = await Promise.all(
      Array.from(
        { length: 5 },
        () =>
          new Promise<net.Socket>((resolve) => {
            const socket = net.createConnection({
              host: result.localHost,
              port: result.localPort,
            });
            socket.on('connect', () => resolve(socket));
          }),
      ),
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    const forward = forwardRegistry.get(result.localHost, result.localPort);
    expect(forward?.activeSockets.size).toBe(5);

    sockets.forEach((socket) => socket.destroy());
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(forward?.activeSockets.size).toBe(0);

    session.disconnect();
  });
});
