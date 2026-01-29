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
  readSshBannerFromPort,
} from './port-forward.setup.js';

describe.skipIf(!isDockerRunning())('E2E Port Forwarding - SSH Disconnect', () => {
  const { getCtx, getRegistry, setup, teardown, cleanupAfterEach } = createPortForwardTestSetup();

  beforeAll(setup);
  afterAll(teardown);
  afterEach(cleanupAfterEach);

  it('cleans up forward when SSH disconnects unexpectedly', async () => {
    const ctx = getCtx();
    const forwardRegistry = getRegistry();
    const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
    await session.connect();

    const result = await createLocalForward(
      {
        client: session.client,
        serverId: session.id,
        localHost: '127.0.0.1',
        localPort: 0,
        remoteHost: 'localhost',
        remotePort: 2222,
      },
      forwardRegistry,
    );
    expect(forwardRegistry.has(result.localHost, result.localPort)).toBe(true);

    const banner = await readSshBannerFromPort(result.localHost, result.localPort);
    expect(banner).toContain('SSH-2.0');

    const cleanupPromise = new Promise<void>((resolve) => {
      session.on('disconnected', () => {
        forwardRegistry.removeByServer(session.id);
        resolve();
      });
    });

    session.client.destroy();
    await cleanupPromise;

    expect(forwardRegistry.has(result.localHost, result.localPort)).toBe(false);
  }, 10000);

  it('destroys active tunnel connections when SSH drops', async () => {
    const ctx = getCtx();
    const forwardRegistry = getRegistry();
    const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
    await session.connect();

    const result = await createLocalForward(
      {
        client: session.client,
        serverId: session.id,
        localHost: '127.0.0.1',
        localPort: 0,
        remoteHost: 'localhost',
        remotePort: 2222,
      },
      forwardRegistry,
    );

    const socket = await new Promise<net.Socket>((resolve, reject) => {
      const s = net.createConnection({ host: result.localHost, port: result.localPort }, () =>
        resolve(s),
      );
      s.on('error', reject);
      s.setTimeout(5000, () => {
        s.destroy();
        reject(new Error('Connection timeout'));
      });
    });

    await new Promise<void>((resolve) => {
      socket.once('data', () => resolve());
    });

    const forward = forwardRegistry.get(result.localHost, result.localPort);
    expect(forward?.activeSockets.size).toBeGreaterThan(0);

    const socketClosed = new Promise<boolean>((resolve) => {
      socket.on('close', () => resolve(true));
      socket.on('error', () => resolve(true));
      setTimeout(() => resolve(false), 3000);
    });

    session.client.destroy();
    forwardRegistry.removeByServer(session.id);

    const closed = await socketClosed;
    expect(closed).toBe(true);
  }, 15000);

  it('new tunnel connections fail after SSH disconnect (zombie forward)', async () => {
    const ctx = getCtx();
    const forwardRegistry = getRegistry();
    const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
    await session.connect();

    const result = await createLocalForward(
      {
        client: session.client,
        serverId: session.id,
        localHost: '127.0.0.1',
        localPort: 0,
        remoteHost: 'localhost',
        remotePort: 2222,
      },
      forwardRegistry,
    );

    const banner = await readSshBannerFromPort(result.localHost, result.localPort);
    expect(banner).toContain('SSH-2.0');

    session.client.destroy();
    await new Promise((resolve) => setTimeout(resolve, 200));

    const connectionResult = await new Promise<string>((resolve) => {
      const socket = net.createConnection(
        { host: result.localHost, port: result.localPort },
        () => {
          socket.on('close', () => resolve('closed'));
          socket.on('error', () => resolve('error'));
          socket.on('data', () => resolve('data'));
        },
      );
      socket.on('error', () => resolve('connect_error'));
      socket.setTimeout(3000, () => {
        socket.destroy();
        resolve('timeout');
      });
    });

    expect(['closed', 'error', 'connect_error', 'timeout']).toContain(connectionResult);
    forwardRegistry.removeByServer(session.id);
  }, 15000);

  it('handles disconnect during data transfer', async () => {
    const ctx = getCtx();
    const forwardRegistry = getRegistry();
    const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
    await session.connect();

    const result = await createLocalForward(
      {
        client: session.client,
        serverId: session.id,
        localHost: '127.0.0.1',
        localPort: 0,
        remoteHost: 'localhost',
        remotePort: 2222,
      },
      forwardRegistry,
    );

    const transferResult = await new Promise<{ dataReceived: boolean; endedCleanly: boolean }>(
      (resolve) => {
        let dataReceived = false;
        const socket = net.createConnection(
          { host: result.localHost, port: result.localPort },
          () => {
            socket.on('data', () => {
              dataReceived = true;
              session.client.destroy();
            });
            socket.on('close', () => resolve({ dataReceived, endedCleanly: true }));
            socket.on('error', () => resolve({ dataReceived, endedCleanly: false }));
          },
        );
        socket.on('error', () => resolve({ dataReceived, endedCleanly: false }));
        socket.setTimeout(5000, () => {
          socket.destroy();
          resolve({ dataReceived, endedCleanly: false });
        });
      },
    );

    expect(transferResult.dataReceived).toBe(true);
    forwardRegistry.removeByServer(session.id);
  }, 15000);
});
