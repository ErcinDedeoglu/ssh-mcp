// Test helpers for SFTP tests: server config factory and connection setup.
import { EventEmitter } from 'node:events';
import type { ServerConfig, PasswordAuth } from '../../../../src/config/types.js';
import { SessionKeeper } from '../../../../src/ssh/session.js';
import { MockSFTPWrapper, getMockSftp, type MockClientType } from './sftp-test.mocks.js';

export function createSftpServerConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    id: 'test-server',
    host: '192.168.1.100',
    port: 22,
    username: 'testuser',
    auth: { password: 'secret123' } as PasswordAuth,
    ...overrides,
  };
}

export interface ConnectedClientResult {
  connection: SessionKeeper;
  mockClient: MockClientType;
  mockSftp: MockSFTPWrapper;
}

export async function setupConnectedClient(
  serverConfig: ServerConfig,
  mockClientInstances: EventEmitter[],
  getMockClientFn: (instances: EventEmitter[], index?: number) => MockClientType,
): Promise<ConnectedClientResult> {
  const connection = new SessionKeeper(serverConfig);
  const mockClient = getMockClientFn(mockClientInstances);

  mockClient.sftp.mockImplementation(
    (callback: (err: Error | null, sftp: MockSFTPWrapper) => void) => {
      const sftpWrapper = new MockSFTPWrapper();
      setImmediate(() => callback(null, sftpWrapper));
    },
  );

  const connectPromise = connection.connect();
  setImmediate(() => mockClient.emit('ready'));
  await connectPromise;

  return { connection, mockClient, mockSftp: getMockSftp() };
}
