// Builds ssh2 ConnectConfig from server configuration. Reads private key files from disk.
import * as fs from 'node:fs';
import type { Duplex } from 'node:stream';
import type { ConnectConfig } from 'ssh2';
import type { ServerConfig } from '../config/types.js';
import { isPasswordAuth, isPrivateKeyAuth } from '../config/types.js';
import {
  DEFAULT_CONNECTION_TIMEOUT_SECONDS,
  MS_PER_SECOND,
  type SessionKeeperOptions,
} from './session.types.js';

type OptionsWithJumpStream = Omit<Required<SessionKeeperOptions>, 'jumpStream'> & {
  jumpStream?: Duplex;
};

export function buildSshConnectConfig(
  serverConfig: ServerConfig,
  options: OptionsWithJumpStream,
): ConnectConfig {
  const timeoutSeconds = serverConfig.timeouts?.connection ?? DEFAULT_CONNECTION_TIMEOUT_SECONDS;

  const baseConfig: ConnectConfig = {
    host: serverConfig.host,
    port: serverConfig.port,
    username: serverConfig.username,
    readyTimeout: timeoutSeconds * MS_PER_SECOND,
    keepaliveInterval: options.keepaliveIntervalMs,
    keepaliveCountMax: options.keepaliveCountMax,
    sock: options.jumpStream,
  };

  if (isPasswordAuth(serverConfig.auth)) {
    return {
      ...baseConfig,
      password: serverConfig.auth.password,
    };
  }

  if (isPrivateKeyAuth(serverConfig.auth)) {
    const privateKeyContent = fs.readFileSync(serverConfig.auth.privateKey, 'utf-8');
    return {
      ...baseConfig,
      privateKey: privateKeyContent,
      passphrase: serverConfig.auth.passphrase,
    };
  }

  throw new Error('Invalid authentication configuration');
}
