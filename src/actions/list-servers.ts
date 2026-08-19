import type { ActionDeps, ActionOutcome } from './types.js';
import { refreshConfig } from './ensure-connected.js';
import { failureFrom } from './types.js';

export interface ServerInfo {
  id: string;
  host: string;
  port: number;
  username: string;
  description?: string;
  connected: boolean;
}

export async function listServers(deps: ActionDeps): Promise<ActionOutcome<ServerInfo[]>> {
  try {
    refreshConfig(deps.config);
    const servers: ServerInfo[] = deps.config.servers.map((serverConfig) => ({
      id: serverConfig.id,
      host: serverConfig.host,
      port: serverConfig.port,
      username: serverConfig.username,
      description: serverConfig.description,
      connected: deps.pool.get(serverConfig.id)?.isConnected ?? false,
    }));
    return { ok: true, data: servers, pretty: true };
  } catch (error) {
    return failureFrom(error);
  }
}
