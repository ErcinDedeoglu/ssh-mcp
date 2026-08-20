import { failureFrom } from './types.js';
export async function getConsoleHistory(input, deps) {
    try {
        const { serverId, limit } = input;
        const shell = deps.shellRegistry.get(serverId);
        if (!shell) {
            return {
                ok: false,
                message: `No shell session for server '${serverId}'. Execute a command first.`,
            };
        }
        const history = shell.getHistory(limit);
        return { ok: true, data: { serverId, count: history.length, history } };
    }
    catch (error) {
        return failureFrom(error);
    }
}
//# sourceMappingURL=get-console-history.js.map