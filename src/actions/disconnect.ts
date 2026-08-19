import { failureFrom, type ActionDeps, type ActionOutcome } from './types.js';

export interface DisconnectInput {
  serverId: string;
}

export interface DisconnectResult {
  status: string;
  serverId: string;
  message: string;
  shellHistoryCleared: boolean;
}

export async function disconnectServer(
  input: DisconnectInput,
  deps: ActionDeps,
): Promise<ActionOutcome<DisconnectResult>> {
  try {
    const { serverId } = input;

    if (!deps.pool.has(serverId)) {
      return { ok: false, message: `No active connection to server '${serverId}'` };
    }

    const hadShell = deps.shellRegistry.has(serverId);
    deps.shellRegistry.remove(serverId);
    deps.pool.remove(serverId);

    return {
      ok: true,
      data: {
        status: 'disconnected',
        serverId,
        message: `Disconnected from ${serverId}`,
        shellHistoryCleared: hadShell,
      },
    };
  } catch (error) {
    return failureFrom(error);
  }
}
