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

describe.skipIf(!isDockerRunning())('E2E Port Forwarding - createLocalForward', () => {
  const { getCtx, getRegistry, setup, teardown, cleanupAfterEach } = createPortForwardTestSetup();

  beforeAll(setup);
  afterAll(teardown);
  afterEach(cleanupAfterEach);

  it('creates local forward to SSH port', async () => {
    const ctx = getCtx();
    const forwardRegistry = getRegistry();
    const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
    await session.connect();

    const result = await createLocalForward(
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

    expect(result.localHost).toBe('127.0.0.1');
    expect(result.localPort).toBeGreaterThan(0);
    expect(forwardRegistry.has(result.localHost, result.localPort)).toBe(true);
    session.disconnect();
  });

  it('allows connection through forwarded port', async () => {
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

    const connectionSuccess = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection(
        { host: result.localHost, port: result.localPort },
        () => {
          socket.destroy();
          resolve(true);
        },
      );
      socket.on('error', () => resolve(false));
      socket.setTimeout(5000, () => {
        socket.destroy();
        resolve(false);
      });
    });

    expect(connectionSuccess).toBe(true);

    session.disconnect();
  });

  it('receives SSH banner through forwarded port', async () => {
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

    const banner = await new Promise<string>((resolve, reject) => {
      const socket = net.createConnection(
        { host: result.localHost, port: result.localPort },
        () => {
          let data = '';
          socket.on('data', (chunk) => {
            data += chunk.toString();
            if (data.includes('\n')) {
              socket.destroy();
              resolve(data.trim());
            }
          });
        },
      );
      socket.on('error', reject);
      socket.setTimeout(5000, () => {
        socket.destroy();
        reject(new Error('Timeout'));
      });
    });

    expect(banner).toContain('SSH');

    session.disconnect();
  });

  it('rejects with EADDRINUSE when port is already bound by another process', async () => {
    const ctx = getCtx();
    const forwardRegistry = getRegistry();
    const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
    await session.connect();

    const blockerServer = net.createServer();
    const blockedPort = await new Promise<number>((resolve, reject) => {
      blockerServer.listen(0, '127.0.0.1', () => {
        const addr = blockerServer.address();
        if (addr && typeof addr !== 'string') {
          resolve(addr.port);
        } else {
          reject(new Error('Failed to get port'));
        }
      });
    });

    try {
      await createLocalForward(
        {
          client: session.client,
          serverId: 'server-1',
          localHost: '127.0.0.1',
          localPort: blockedPort,
          remoteHost: 'localhost',
          remotePort: 2222,
        },
        forwardRegistry,
      );
      expect.fail('Should have thrown EADDRINUSE');
    } catch (error) {
      expect((error as NodeJS.ErrnoException).code).toBe('EADDRINUSE');
    } finally {
      blockerServer.close();
      session.disconnect();
    }
  });
});
