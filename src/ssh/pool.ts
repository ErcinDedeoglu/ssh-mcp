import type { SSHConnection } from './connection.js';

export class ConnectionPool {
  private readonly connections = new Map<string, SSHConnection>();

  add(connection: SSHConnection): void {
    const serverId = connection.id;
    this.connections.set(serverId, connection);
    
    connection.on('disconnected', () => {
      this.connections.delete(serverId);
    });
  }

  get(serverId: string): SSHConnection | undefined {
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
