// ForwardRegistry: tracks active port forwards across SSH connections.
import type { Server as NetServer, Socket } from 'node:net';

export interface ActiveForward {
  serverId: string;
  localHost: string;
  localPort: number;
  remoteHost: string;
  remotePort: number;
  server: NetServer;
  activeSockets: Set<Socket>;
  createdAt: number;
}

export type ForwardKey = `${string}:${number}`;

export function makeForwardKey(localHost: string, localPort: number): ForwardKey {
  return `${localHost}:${localPort}`;
}

export class ForwardRegistry {
  private readonly forwards = new Map<ForwardKey, ActiveForward>();

  add(forward: ActiveForward): void {
    const key = makeForwardKey(forward.localHost, forward.localPort);
    this.forwards.set(key, forward);
  }

  get(localHost: string, localPort: number): ActiveForward | undefined {
    const key = makeForwardKey(localHost, localPort);
    return this.forwards.get(key);
  }

  has(localHost: string, localPort: number): boolean {
    const key = makeForwardKey(localHost, localPort);
    return this.forwards.has(key);
  }

  remove(localHost: string, localPort: number): boolean {
    const key = makeForwardKey(localHost, localPort);
    const forward = this.forwards.get(key);
    if (!forward) {
      return false;
    }
    this.closeForward(forward);
    this.forwards.delete(key);
    return true;
  }

  listByServer(serverId: string): ActiveForward[] {
    const result: ActiveForward[] = [];
    for (const forward of this.forwards.values()) {
      if (forward.serverId === serverId) {
        result.push(forward);
      }
    }
    return result;
  }

  listAll(): ActiveForward[] {
    return Array.from(this.forwards.values());
  }

  removeByServer(serverId: string): number {
    let removed = 0;
    for (const [key, forward] of this.forwards.entries()) {
      if (forward.serverId === serverId) {
        this.closeForward(forward);
        this.forwards.delete(key);
        removed++;
      }
    }
    return removed;
  }

  clear(): void {
    for (const forward of this.forwards.values()) {
      this.closeForward(forward);
    }
    this.forwards.clear();
  }

  get size(): number {
    return this.forwards.size;
  }

  private closeForward(forward: ActiveForward): void {
    // Close local server (stop accepting new connections)
    forward.server.close();

    // Destroy all active socket connections
    for (const socket of forward.activeSockets) {
      socket.destroy();
    }
    forward.activeSockets.clear();
  }
}
