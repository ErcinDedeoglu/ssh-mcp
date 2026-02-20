// Mock SFTP wrapper and SSH2 client types for SFTP unit tests.
import { EventEmitter } from 'node:events';
import { vi } from 'vitest';

export const mockSftpInstances: EventEmitter[] = [];

export class MockSFTPWrapper extends EventEmitter {
  fastPut = vi.fn();
  fastGet = vi.fn();
  mkdir = vi.fn();
  stat = vi.fn();
  realpath = vi.fn();

  constructor() {
    super();
    mockSftpInstances.push(this);
  }
}

export type MockClientType = EventEmitter & {
  connect: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  sftp: ReturnType<typeof vi.fn>;
};

export function getMockSftp(index = 0): MockSFTPWrapper {
  return mockSftpInstances[index] as MockSFTPWrapper;
}

export function getMockClient(instances: EventEmitter[], index = 0): MockClientType {
  return instances[index] as MockClientType;
}

export function clearMockInstances(clientInstances: EventEmitter[]): void {
  clientInstances.length = 0;
  mockSftpInstances.length = 0;
}
