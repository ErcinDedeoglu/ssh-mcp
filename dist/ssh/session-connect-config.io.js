// Builds ssh2 ConnectConfig from server configuration. Reads private key files from disk.
import * as fs from 'node:fs';
import { isPasswordAuth, isPrivateKeyAuth } from '../config/types.js';
import { DEFAULT_CONNECTION_TIMEOUT_SECONDS, MS_PER_SECOND, } from './session.types.js';
function resolvePrivateKey(keyValue, keys) {
    if (keyValue.startsWith('-----BEGIN')) {
        return keyValue;
    }
    if (keys && keyValue in keys) {
        return resolvePrivateKey(keys[keyValue], keys);
    }
    return fs.readFileSync(keyValue, 'utf-8');
}
export function buildSshConnectConfig(serverConfig, options) {
    const timeoutSeconds = serverConfig.timeouts?.connection ?? DEFAULT_CONNECTION_TIMEOUT_SECONDS;
    const agentSocketPath = process.env.SSH_AUTH_SOCK;
    const configAllowsAgent = serverConfig.agentForward ?? true;
    const agentAvailable = configAllowsAgent && !!agentSocketPath;
    const baseConfig = {
        host: serverConfig.host,
        port: serverConfig.port,
        username: serverConfig.username,
        readyTimeout: timeoutSeconds * MS_PER_SECOND,
        keepaliveInterval: options.keepaliveIntervalMs,
        keepaliveCountMax: options.keepaliveCountMax,
        sock: options.jumpStream,
        agent: agentAvailable ? agentSocketPath : undefined,
        agentForward: agentAvailable,
    };
    if (isPasswordAuth(serverConfig.auth)) {
        return {
            ...baseConfig,
            password: serverConfig.auth.password,
        };
    }
    if (isPrivateKeyAuth(serverConfig.auth)) {
        const privateKeyContent = resolvePrivateKey(serverConfig.auth.privateKey, options.keys);
        return {
            ...baseConfig,
            privateKey: privateKeyContent,
            passphrase: serverConfig.auth.passphrase,
        };
    }
    throw new Error('Invalid authentication configuration');
}
//# sourceMappingURL=session-connect-config.io.js.map