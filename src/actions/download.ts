import { FileTransfer } from '../ssh/sftp.js';
import { sanitizePath } from '../utils/sanitize.js';
import { ensureConnected, connectionFailure } from './ensure-connected.js';
import { failureFrom, type ActionDeps, type ActionOutcome } from './types.js';

export interface DownloadInput {
  serverId: string;
  remotePath: string;
  localPath: string;
}

export interface DownloadResult {
  status: string;
  serverId: string;
  remotePath: string;
  localPath: string;
}

export async function downloadFile(
  input: DownloadInput,
  deps: ActionDeps,
): Promise<ActionOutcome<DownloadResult>> {
  try {
    const { serverId, remotePath, localPath } = input;

    const connectionResult = await ensureConnected(serverId, {
      config: deps.config,
      pool: deps.pool,
      forwardRegistry: deps.forwardRegistry,
    });
    if (!connectionResult.success) {
      return connectionFailure(connectionResult.errorInfo);
    }

    const { session } = connectionResult;

    const fileTransfer = new FileTransfer(session);
    await fileTransfer.download(remotePath, localPath);
    session.touch();

    return {
      ok: true,
      data: {
        status: 'downloaded',
        serverId,
        remotePath,
        localPath: sanitizePath(localPath),
      },
    };
  } catch (error) {
    return failureFrom(error);
  }
}
