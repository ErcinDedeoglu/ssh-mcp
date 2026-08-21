// Builds ssh2 ConnectConfig from server configuration. Reads private key files from disk.
import * as fs from 'node:fs';
import type { Duplex } from 'node:stream';
import type { ConnectConfig } from 'ssh2';
import type { ServerConfig } from '../config/types.js';
import { isPasswordAuth, isPrivateKeyAuth, isAgentAuth } from '../config/types.js';
import { expandHome } from '../config/path.js';
import {
  DEFAULT_CONNECTION_TIMEOUT_SECONDS,
  MS_PER_SECOND,
  type SessionKeeperOptions,
} from './session.types.js';

type OptionsWithJumpStream = Omit<Required<SessionKeeperOptions>, 'jumpStream' | 'keys'> & {
  jumpStream?: Duplex;
  keys?: Record<string, string>;
};

function resolvePrivateKey(keyValue: string, keys?: Record<string, string>): string {
  if (keyValue.startsWith('-----BEGIN')) {
    return keyValue;
  }
  if (keys && keyValue in keys) {
    return resolvePrivateKey(keys[keyValue], keys);
  }
  return fs.readFileSync(expandHome(keyValue), 'utf-8');
}

export function buildSshConnectConfig(
  serverConfig: ServerConfig,
  options: OptionsWithJumpStream,
): ConnectConfig {
  const timeoutSeconds = serverConfig.timeouts?.connection ?? DEFAULT_CONNECTION_TIMEOUT_SECONDS;

  const agentSocketPath = process.env.SSH_AUTH_SOCK;
  const configAllowsAgent = serverConfig.agentForward ?? true;
  const agentAvailable = configAllowsAgent && !!agentSocketPath;

  const baseConfig: ConnectConfig = {
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

  if (isAgentAuth(serverConfig.auth)) {
    if (!agentSocketPath) {
      throw new Error(
        `SSH agent authentication configured for '${serverConfig.id}' but SSH_AUTH_SOCK is not set. ` +
          'Start an agent (ssh-agent, 1Password, macOS Keychain) or switch this server to key/password auth.',
      );
    }
    // Agent already attached in baseConfig; ssh2 offers the agent's loaded keys
    return { ...baseConfig, agent: agentSocketPath, agentForward: false };
  }

  throw new Error('Invalid authentication configuration');
}
