export function makeForwardKey(localHost, localPort) {
    return `${localHost}:${localPort}`;
}
export class ForwardRegistry {
    forwards = new Map();
    add(forward) {
        const key = makeForwardKey(forward.localHost, forward.localPort);
        this.forwards.set(key, forward);
    }
    get(localHost, localPort) {
        const key = makeForwardKey(localHost, localPort);
        return this.forwards.get(key);
    }
    has(localHost, localPort) {
        const key = makeForwardKey(localHost, localPort);
        return this.forwards.has(key);
    }
    remove(localHost, localPort) {
        const key = makeForwardKey(localHost, localPort);
        const forward = this.forwards.get(key);
        if (!forward) {
            return false;
        }
        this.closeForward(forward);
        this.forwards.delete(key);
        return true;
    }
    listByServer(serverId) {
        const result = [];
        for (const forward of this.forwards.values()) {
            if (forward.serverId === serverId) {
                result.push(forward);
            }
        }
        return result;
    }
    listAll() {
        return Array.from(this.forwards.values());
    }
    removeByServer(serverId) {
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
    clear() {
        for (const forward of this.forwards.values()) {
            this.closeForward(forward);
        }
        this.forwards.clear();
    }
    get size() {
        return this.forwards.size;
    }
    closeForward(forward) {
        // Close local server (stop accepting new connections)
        forward.server.close();
        // Destroy all active socket connections
        for (const socket of forward.activeSockets) {
            socket.destroy();
        }
        forward.activeSockets.clear();
    }
}
//# sourceMappingURL=forward-registry.js.map