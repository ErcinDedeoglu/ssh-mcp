export function makeRemoteForwardKey(serverId, remoteHost, remotePort) {
    return `${serverId}:${remoteHost}:${remotePort}`;
}
export class RemoteForwardRegistry {
    forwards = new Map();
    add(forward) {
        const key = makeRemoteForwardKey(forward.serverId, forward.remoteHost, forward.remotePort);
        this.forwards.set(key, forward);
    }
    get(serverId, remoteHost, remotePort) {
        const key = makeRemoteForwardKey(serverId, remoteHost, remotePort);
        return this.forwards.get(key);
    }
    has(serverId, remoteHost, remotePort) {
        const key = makeRemoteForwardKey(serverId, remoteHost, remotePort);
        return this.forwards.has(key);
    }
    remove(serverId, remoteHost, remotePort) {
        const key = makeRemoteForwardKey(serverId, remoteHost, remotePort);
        const forward = this.forwards.get(key);
        if (forward) {
            this.closeForward(forward);
            this.forwards.delete(key);
        }
        return forward;
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
        for (const channel of forward.activeChannels) {
            channel.close();
        }
        forward.activeChannels.clear();
    }
}
//# sourceMappingURL=remote-forward-registry.js.map