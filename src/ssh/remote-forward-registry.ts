// RemoteForwardRegistry: tracks active remote port forwards across SSH connections.
import type { Client, ClientChannel } from 'ssh2';

export interface ActiveRemoteForward {
  serverId: string;
  client: Client;
  remoteHost: string;
  remotePort: number;
  boundPort: number;
  localHost: string;
  localPort: number;
  activeChannels: Set<ClientChannel>;
  createdAt: number;
}

export type RemoteForwardKey = `${string}:${string}:${number}`;

export function makeRemoteForwardKey(
  serverId: string,
  remoteHost: string,
  remotePort: number,
): RemoteForwardKey {
  return `${serverId}:${remoteHost}:${remotePort}`;
}

export class RemoteForwardRegistry {
  private readonly forwards = new Map<RemoteForwardKey, ActiveRemoteForward>();

  add(forward: ActiveRemoteForward): void {
    const key = makeRemoteForwardKey(forward.serverId, forward.remoteHost, forward.remotePort);
    this.forwards.set(key, forward);
  }

  get(serverId: string, remoteHost: string, remotePort: number): ActiveRemoteForward | undefined {
    const key = makeRemoteForwardKey(serverId, remoteHost, remotePort);
    return this.forwards.get(key);
  }

  has(serverId: string, remoteHost: string, remotePort: number): boolean {
    const key = makeRemoteForwardKey(serverId, remoteHost, remotePort);
    return this.forwards.has(key);
  }

  remove(
    serverId: string,
    remoteHost: string,
    remotePort: number,
  ): ActiveRemoteForward | undefined {
    const key = makeRemoteForwardKey(serverId, remoteHost, remotePort);
    const forward = this.forwards.get(key);
    if (forward) {
      this.closeForward(forward);
      this.forwards.delete(key);
    }
    return forward;
  }

  listByServer(serverId: string): ActiveRemoteForward[] {
    const result: ActiveRemoteForward[] = [];
    for (const forward of this.forwards.values()) {
      if (forward.serverId === serverId) {
        result.push(forward);
      }
    }
    return result;
  }

  listAll(): ActiveRemoteForward[] {
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

  private closeForward(forward: ActiveRemoteForward): void {
    for (const channel of forward.activeChannels) {
      channel.close();
    }
    forward.activeChannels.clear();
  }
}
