import {
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

describe.skipIf(!isDockerRunning())('E2E Port Forwarding - Disconnect Recovery', () => {
  const { getCtx, getRegistry, setup, teardown, cleanupAfterEach } = createPortForwardTestSetup();

  beforeAll(setup);
  afterAll(teardown);
  afterEach(cleanupAfterEach);

  it('cleans up ALL forwards for a server on disconnect', async () => {
    const ctx = getCtx();
    const forwardRegistry = getRegistry();
    const session = new SessionKeeper(ctx.server1Config, { maxReconnectAttempts: 0 });
    await session.connect();

    const forward1 = await createLocalForward(
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

    const forward2 = await createLocalForward(
      {
        client: session.client,
        serverId: session.id,
        localHost: '127.0.0.1',
        localPort: 0,
        remoteHost: 'localhost',
        remotePort: 2223,
      },
      forwardRegistry,
    );

    expect(forwardRegistry.size).toBe(2);

    const cleanupPromise = new Promise<void>((resolve) => {
      session.on('disconnected', () => {
        forwardRegistry.removeByServer(session.id);
        resolve();
      });
    });

    session.client.destroy();
    await cleanupPromise;

    expect(forwardRegistry.has(forward1.localHost, forward1.localPort)).toBe(false);
    expect(forwardRegistry.has(forward2.localHost, forward2.localPort)).toBe(false);
    expect(forwardRegistry.size).toBe(0);
  }, 10000);

  it('can re-create forward after SSH reconnects', async () => {
    const ctx = getCtx();
    const forwardRegistry = getRegistry();
    const session = new SessionKeeper(ctx.server1Config, {
      maxReconnectAttempts: 5,
      baseReconnectDelayMs: 100,
    });
    await session.connect();

    // Wait for SSH session to fully stabilize before creating forwards
    await new Promise((resolve) => setTimeout(resolve, 200));

    const result1 = await createLocalForward(
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

    // Allow tunnel to stabilize before reading banner
    await new Promise((resolve) => setTimeout(resolve, 100));

    const banner1 = await readSshBannerFromPort(result1.localHost, result1.localPort);
    expect(banner1).toContain('SSH-2.0');

    forwardRegistry.removeByServer(session.id);
    session.client.destroy();

    await new Promise<void>((resolve) => {
      session.once('reconnected', () => resolve());
    });

    expect(session.isConnected).toBe(true);

    const result2 = await createLocalForward(
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

    // Allow tunnel to stabilize before reading banner
    await new Promise((resolve) => setTimeout(resolve, 100));

    const banner2 = await readSshBannerFromPort(result2.localHost, result2.localPort);
    expect(banner2).toContain('SSH-2.0');

    forwardRegistry.removeByServer(session.id);
    session.disconnect();
  }, 15000);
});
