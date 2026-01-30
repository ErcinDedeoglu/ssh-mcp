import 'vitest';

export interface TestPorts {
  server1: number;
  server2: number;
  serverKey: number;
}

declare module 'vitest' {
  export interface ProvidedContext {
    shardIndex: number;
    portBase: number;
    ports: TestPorts;
  }
}
