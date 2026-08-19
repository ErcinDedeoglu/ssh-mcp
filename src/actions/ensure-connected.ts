import type { Config, ServerConfig } from '../config/types.js';
import { loadConfig } from '../config/loader.js';
import { ConnectionPool } from '../ssh/pool.js';
import { ForwardRegistry } from '../ssh/forward-registry.js';
import { RemoteForwardRegistry } from '../ssh/remote-forward-registry.js';
import { SessionKeeper } from '../ssh/session.js';
import { sanitizeError } from '../utils/sanitize.js';
import type { ActionOutcome } from './types.js';

export interface ConnectionErrorInfo {
  error: 'server_not_found' | 'connection_failed';
  serverId: string;
  host?: string;
  port?: number;
  username?: string;
  reason?: string;
}

export interface EnsureConnectedSuccess {
  success: true;
  session: SessionKeeper;
  serverConfig: ServerConfig;
}

export interface EnsureConnectedFailure {
  success: false;
  errorInfo: ConnectionErrorInfo;
}

export type EnsureConnectedResult = EnsureConnectedSuccess | EnsureConnectedFailure;

export interface EnsureConnectedDeps {
  config: Config;
  pool: ConnectionPool;
  forwardRegistry: ForwardRegistry;
  remoteForwardRegistry?: RemoteForwardRegistry;
}

export function refreshConfig(config: Config): void {
  const fresh = loadConfig();
  // Clone servers array before clearing - handles case where config === fresh (e.g., in tests)
  const freshServers = [...fresh.servers];
  config.servers.length = 0;
  config.servers.push(...freshServers);
  if (fresh.keys) config.keys = fresh.keys;
  if (fresh.defaults) config.defaults = fresh.defaults;
}

export async function ensureConnected(
  serverId: string,
  deps: EnsureConnectedDeps,
): Promise<EnsureConnectedResult> {
  const { config, pool, forwardRegistry, remoteForwardRegistry } = deps;

  refreshConfig(config);

  const serverConfig = config.servers.find((s) => s.id === serverId);
  if (!serverConfig) {
    return {
      success: false,
      errorInfo: {
        error: 'server_not_found',
        serverId,
        reason: `Server '${serverId}' not found in configuration`,
      },
    };
  }

  const existingSession = pool.get(serverId);
  if (existingSession) {
    if (existingSession.isConnected) {
      return { success: true, session: existingSession, serverConfig };
    }
    const health = existingSession.healthCheck();
    if (!health.connected && !health.reconnecting) {
      return {
        success: false,
        errorInfo: {
          error: 'connection_failed',
          serverId,
          host: serverConfig.host,
          port: serverConfig.port,
          username: serverConfig.username,
          reason: 'Session disconnected and not reconnecting',
        },
      };
    }
    // Session is reconnecting - return it so caller can check reconnect status
    return { success: true, session: existingSession, serverConfig };
  }

  try {
    const sessionOptions = {
      idleTimeoutMs: (serverConfig.timeouts?.idle ?? config.defaults?.timeouts?.idle ?? 900) * 1000,
      keys: config.keys,
    };

    const session = new SessionKeeper(serverConfig, sessionOptions);
    session.on('disconnected', () => {
      forwardRegistry.removeByServer(serverId);
      remoteForwardRegistry?.removeByServer(serverId);
    });

    await session.connect();
    pool.add(session);

    return { success: true, session, serverConfig };
  } catch (error) {
    return {
      success: false,
      errorInfo: {
        error: 'connection_failed',
        serverId,
        host: serverConfig.host,
        port: serverConfig.port,
        username: serverConfig.username,
        reason: sanitizeError(error),
      },
    };
  }
}

/** Maps a connection failure to the structured ActionOutcome used by both frontends. */
export function connectionFailure(errorInfo: ConnectionErrorInfo): ActionOutcome<never> {
  return { ok: false, message: errorInfo.reason ?? 'Connection failed', json: { ...errorInfo } };
}
