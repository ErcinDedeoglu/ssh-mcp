export class ConnectionPool {
    connections = new Map();
    add(connection) {
        const serverId = connection.id;
        this.connections.set(serverId, connection);
        // Only remove from pool when max retries reached (permanent disconnection)
        // Don't remove during reconnection attempts
        connection.on('max-retries-reached', () => {
            this.connections.delete(serverId);
        });
    }
    get(serverId) {
        return this.connections.get(serverId);
    }
    has(serverId) {
        return this.connections.has(serverId);
    }
    remove(serverId) {
        const connection = this.connections.get(serverId);
        if (connection) {
            connection.disconnect();
            this.connections.delete(serverId);
        }
    }
    clear() {
        for (const connection of this.connections.values()) {
            connection.disconnect();
        }
        this.connections.clear();
    }
    get size() {
        return this.connections.size;
    }
}
//# sourceMappingURL=pool.js.map