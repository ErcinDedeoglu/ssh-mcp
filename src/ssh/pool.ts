import type { SessionKeeper } from './session.js';

export class ConnectionPool {
  private readonly connections = new Map<string, SessionKeeper>();

  add(connection: SessionKeeper): void {
    const serverId = connection.id;
    this.connections.set(serverId, connection);
    
    // Only remove from pool when max retries reached (permanent disconnection)
    // Don't remove during reconnection attempts
    connection.on('max-retries-reached', () => {
      this.connections.delete(serverId);
    });
  }

  get(serverId: string): SessionKeeper | undefined {
    return this.connections.get(serverId);
  }

  has(serverId: string): boolean {
    return this.connections.has(serverId);
  }

  remove(serverId: string): void {
    const connection = this.connections.get(serverId);
    if (connection) {
      connection.disconnect();
      this.connections.delete(serverId);
    }
  }

  clear(): void {
    for (const connection of this.connections.values()) {
      connection.disconnect();
    }
    this.connections.clear();
  }

  get size(): number {
    return this.connections.size;
  }
}
