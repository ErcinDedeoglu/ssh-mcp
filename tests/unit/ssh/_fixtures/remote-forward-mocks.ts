// Shared mocks for remote-forward tests
import { vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Client, ClientChannel } from 'ssh2';

export const mockSocketInstances: EventEmitter[] = [];

export type ForwardInCallback = (err: Error | undefined, boundPort: number) => void;
export type UnforwardInCallback = (err?: Error | null) => void;

export type MockClientType = Client & {
  forwardIn: ReturnType<typeof vi.fn>;
  unforwardIn: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
};

export function createMockClient(): MockClientType {
  return {
    forwardIn: vi.fn(),
    unforwardIn: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as MockClientType;
}

export function createMockChannel(): ClientChannel & EventEmitter {
  const channel = new EventEmitter() as ClientChannel &
    EventEmitter & {
      pipe: ReturnType<typeof vi.fn>;
      close: ReturnType<typeof vi.fn>;
    };
  channel.pipe = vi.fn().mockReturnValue(channel);
  channel.close = vi.fn();
  return channel;
}

export function clearSocketInstances(): void {
  mockSocketInstances.length = 0;
}
