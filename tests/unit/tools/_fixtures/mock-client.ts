// Shared types for mock SSH2 Client
import { EventEmitter } from 'node:events';
import { vi } from 'vitest';

export type MockClientType = EventEmitter & {
  connect: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  exec: ReturnType<typeof vi.fn>;
  sftp: ReturnType<typeof vi.fn>;
};

export function getMockClient(instances: EventEmitter[], index = 0): MockClientType {
  return instances[index] as MockClientType;
}

export function clearInstances(instances: EventEmitter[]): void {
  instances.length = 0;
}
