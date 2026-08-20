import { MCP_PROMPT, stripControlSequences } from './shell-session.types.js';
export function createShellStream(client, options = {}) {
    return new Promise((resolve, reject) => {
        // ssh2 supports agentForward in shell options but types are incomplete
        const shellOptions = { agentForward: options.agentForward ?? false };
        client.shell({ term: 'dumb' }, shellOptions, (err, stream) => {
            if (err)
                reject(err);
            else
                resolve(stream);
        });
    });
}
export function waitForPattern(stream, pattern, timeoutMs) {
    return new Promise((resolve, reject) => {
        let buffer = '';
        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error('Timeout waiting for shell prompt'));
        }, timeoutMs);
        const onData = (data) => {
            buffer += data.toString();
            if (pattern.test(stripControlSequences(buffer))) {
                cleanup();
                resolve(stripControlSequences(buffer));
            }
        };
        const cleanup = () => {
            clearTimeout(timeout);
            stream.removeListener('data', onData);
        };
        stream.on('data', onData);
    });
}
export function waitForInitialPrompt(stream, timeoutMs) {
    return waitForPattern(stream, /[$#>%]\s*$/, timeoutMs);
}
export function waitForMcpPrompt(stream, timeoutMs) {
    return waitForPattern(stream, new RegExp(`${MCP_PROMPT}\\s*$`), timeoutMs);
}
//# sourceMappingURL=shell-session.io.js.map