export class ShellRegistry {
    shells = new Map();
    get(serverId) {
        return this.shells.get(serverId);
    }
    set(serverId, shell) {
        this.shells.set(serverId, shell);
    }
    has(serverId) {
        return this.shells.has(serverId);
    }
    remove(serverId) {
        const shell = this.shells.get(serverId);
        if (!shell)
            return false;
        shell.destroy();
        this.shells.delete(serverId);
        return true;
    }
    clear() {
        for (const shell of this.shells.values()) {
            shell.destroy();
        }
        this.shells.clear();
    }
    get size() {
        return this.shells.size;
    }
}
//# sourceMappingURL=shell-registry.js.map