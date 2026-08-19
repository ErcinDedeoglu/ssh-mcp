import { failureFrom, type ActionDeps, type ActionOutcome } from './types.js';

export interface GetConsoleHistoryInput {
  serverId: string;
  limit?: number;
}

export interface GetConsoleHistoryResult {
  serverId: string;
  count: number;
  history: unknown[];
}

export async function getConsoleHistory(
  input: GetConsoleHistoryInput,
  deps: ActionDeps,
): Promise<ActionOutcome<GetConsoleHistoryResult>> {
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
  } catch (error) {
    return failureFrom(error);
  }
}
