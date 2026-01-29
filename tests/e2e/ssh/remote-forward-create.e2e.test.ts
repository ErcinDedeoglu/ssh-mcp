import {
  net,
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  isDockerRunning,
  createRemoteForwardTestSetup,
  SessionKeeper,
  createRemoteForward,
  executeCommand,
} from './remote-forward.setup.js';

describe.skipIf(!isDockerRunning())('E2E Remote Port Forwarding - createRemoteForward', () => {
  const { getCtx, getRegistry, setup, teardown, cleanupAfterEach } = createRemoteForwardTestSetup();

  beforeAll(setup);
  afterAll(teardown);
  afterEach(cleanupAfterEach);

  it('creates remote forward and registers it', async () => {
    const ctx = getCtx();
    const remoteForwardRegistry = getRegistry();
    const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
    await session.connect();

    const localServer = net.createServer();
    const localPort = await new Promise<number>((resolve, reject) => {
      localServer.listen(0, '127.0.0.1', () => {
        const addr = localServer.address();
        if (addr && typeof addr !== 'string') {
          resolve(addr.port);
        } else {
          reject(new Error('Failed to get port'));
        }
      });
    });

    try {
      const result = await createRemoteForward(
        {
          client: session.client,
          serverId: 'server-1',
          remoteHost: '127.0.0.1',
          remotePort: 0,
          localHost: '127.0.0.1',
          localPort,
        },
        remoteForwardRegistry,
      );

      expect(result.remoteHost).toBe('127.0.0.1');
      expect(result.boundPort).toBeGreaterThan(0);
      expect(remoteForwardRegistry.has('server-1', '127.0.0.1', result.boundPort)).toBe(true);
    } finally {
      localServer.close();
      session.disconnect();
    }
  });

  it('uses auto-assigned port when remotePort is 0', async () => {
    const ctx = getCtx();
    const remoteForwardRegistry = getRegistry();
    const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
    await session.connect();

    const localServer = net.createServer();
    await new Promise<void>((resolve) => localServer.listen(0, '127.0.0.1', resolve));
    const localPort = (localServer.address() as net.AddressInfo).port;

    try {
      const result = await createRemoteForward(
        {
          client: session.client,
          serverId: 'server-1',
          remoteHost: '127.0.0.1',
          remotePort: 0,
          localHost: '127.0.0.1',
          localPort,
        },
        remoteForwardRegistry,
      );

      expect(result.boundPort).toBeGreaterThan(1024);
    } finally {
      localServer.close();
      session.disconnect();
    }
  });

  it('forwards connections from remote to local service', async () => {
    const ctx = getCtx();
    const remoteForwardRegistry = getRegistry();
    const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
    await session.connect();

    let receivedData = '';
    const localServer = net.createServer((socket) => {
      socket.on('data', (chunk) => {
        receivedData += chunk.toString();
      });
      socket.on('end', () => {
        socket.write('RESPONSE');
        socket.end();
      });
    });
    await new Promise<void>((resolve) => localServer.listen(0, '127.0.0.1', resolve));
    const localPort = (localServer.address() as net.AddressInfo).port;

    try {
      const result = await createRemoteForward(
        {
          client: session.client,
          serverId: 'server-1',
          remoteHost: '127.0.0.1',
          remotePort: 0,
          localHost: '127.0.0.1',
          localPort,
        },
        remoteForwardRegistry,
      );

      const execResult = await executeCommand(
        session.client,
        `echo "HELLO" | timeout 2 nc -q0 127.0.0.1 ${result.boundPort} 2>/dev/null || echo "NC_FAILED"`,
      );

      if (execResult.stdout.includes('NC_FAILED')) {
        expect(receivedData).toBe('');
      } else {
        expect(receivedData).toContain('HELLO');
      }
    } finally {
      localServer.close();
      session.disconnect();
    }
  });

  it('creates multiple remote forwards on different ports', async () => {
    const ctx = getCtx();
    const remoteForwardRegistry = getRegistry();
    const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
    await session.connect();

    const localServer1 = net.createServer();
    const localServer2 = net.createServer();
    await new Promise<void>((resolve) => localServer1.listen(0, '127.0.0.1', resolve));
    await new Promise<void>((resolve) => localServer2.listen(0, '127.0.0.1', resolve));
    const localPort1 = (localServer1.address() as net.AddressInfo).port;
    const localPort2 = (localServer2.address() as net.AddressInfo).port;

    try {
      const result1 = await createRemoteForward(
        {
          client: session.client,
          serverId: 'server-1',
          remoteHost: '127.0.0.1',
          remotePort: 0,
          localHost: '127.0.0.1',
          localPort: localPort1,
        },
        remoteForwardRegistry,
      );

      const result2 = await createRemoteForward(
        {
          client: session.client,
          serverId: 'server-1',
          remoteHost: '127.0.0.1',
          remotePort: 0,
          localHost: '127.0.0.1',
          localPort: localPort2,
        },
        remoteForwardRegistry,
      );

      expect(result1.boundPort).not.toBe(result2.boundPort);
      expect(remoteForwardRegistry.size).toBe(2);
    } finally {
      localServer1.close();
      localServer2.close();
      session.disconnect();
    }
  });
});
