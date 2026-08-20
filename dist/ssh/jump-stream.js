const DEFAULT_SRC_HOST = '127.0.0.1';
const DEFAULT_SRC_PORT = 0;
export function createJumpStream(jumpSession, targetHost, targetPort, options = {}) {
    return new Promise((resolve, reject) => {
        if (!jumpSession.isConnected) {
            reject(new Error(`Jump host '${jumpSession.id}' is not connected`));
            return;
        }
        const srcHost = options.srcHost ?? DEFAULT_SRC_HOST;
        const srcPort = options.srcPort ?? DEFAULT_SRC_PORT;
        jumpSession.client.forwardOut(srcHost, srcPort, targetHost, targetPort, (err, stream) => {
            if (err) {
                reject(new Error(`Failed to create tunnel through '${jumpSession.id}': ${err.message}`));
                return;
            }
            resolve(stream);
        });
    });
}
//# sourceMappingURL=jump-stream.js.map