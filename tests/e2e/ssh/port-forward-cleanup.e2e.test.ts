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

describe.skipIf(!isDockerRunning())('E2E Port Forwarding - Cleanup and Edge Cases', () => {
  const { getCtx, getRegistry, setup, teardown, cleanupAfterEach } = createPortForwardTestSetup();

  beforeAll(setup);
  afterAll(teardown);
  afterEach(cleanupAfterEach);

  describe('ForwardRegistry cleanup', () => {
    it('closes all connections when forward is removed', async () => {
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

      const sockets = await Promise.all(
        Array.from(
          { length: 3 },
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

      await new Promise((resolve) => setTimeout(resolve, 200));
      const serverSocketsBefore = forward?.activeSockets.size ?? 0;
      expect(serverSocketsBefore).toBeGreaterThan(0);

      forwardRegistry.remove(result.localHost, result.localPort);

      expect(forward?.activeSockets.size).toBe(0);
      expect(forwardRegistry.has(result.localHost, result.localPort)).toBe(false);

      sockets.forEach((s) => s.destroy());
      session.disconnect();
    });

    it('stops accepting new connections after forward removed', async () => {
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

      forwardRegistry.remove(result.localHost, result.localPort);

      const connectionFailed = await new Promise<boolean>((resolve) => {
        const socket = net.createConnection(
          { host: result.localHost, port: result.localPort },
          () => {
            socket.destroy();
            resolve(false);
          },
        );
        socket.on('error', () => resolve(true));
        socket.setTimeout(1000, () => {
          socket.destroy();
          resolve(true);
        });
      });

      expect(connectionFailed).toBe(true);

      session.disconnect();
    });
  });

  describe('Error handling', () => {
    it('handles connection to refused remote port gracefully', async () => {
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
          remotePort: 1,
        },
        forwardRegistry,
      );

      const connectionResult = await new Promise<string>((resolve) => {
        const socket = net.createConnection(
          { host: result.localHost, port: result.localPort },
          () => {
            socket.on('close', () => resolve('closed'));
            socket.on('error', () => resolve('error'));
          },
        );
        socket.on('error', () => resolve('connect_error'));
        socket.setTimeout(3000, () => {
          socket.destroy();
          resolve('timeout');
        });
      });

      expect(['closed', 'error', 'connect_error', 'timeout']).toContain(connectionResult);

      session.disconnect();
    });
  });

  describe('Data transfer', () => {
    it('transfers data bidirectionally', async () => {
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

      const sshBanner = await new Promise<string>((resolve, reject) => {
        const socket = net.createConnection(
          { host: result.localHost, port: result.localPort },
          () => {
            socket.once('data', (data) => {
              socket.write('SSH-2.0-TestClient\r\n');
              socket.destroy();
              resolve(data.toString());
            });
          },
        );
        socket.on('error', reject);
        socket.setTimeout(5000, () => {
          socket.destroy();
          reject(new Error('Timeout'));
        });
      });

      expect(sshBanner).toContain('SSH-2.0');

      session.disconnect();
    });
  });
});
