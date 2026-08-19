import { FileTransfer } from '../ssh/sftp.js';
import { sanitizePath } from '../utils/sanitize.js';
import { ensureConnected, connectionFailure } from './ensure-connected.js';
import { failureFrom, type ActionDeps, type ActionOutcome } from './types.js';

export interface UploadInput {
  serverId: string;
  localPath: string;
  remotePath: string;
}

export interface UploadResult {
  status: string;
  serverId: string;
  localPath: string;
  remotePath: string;
}

export async function uploadFile(
  input: UploadInput,
  deps: ActionDeps,
): Promise<ActionOutcome<UploadResult>> {
  try {
    const { serverId, localPath, remotePath } = input;

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
    await fileTransfer.upload(localPath, remotePath);
    session.touch();

    return {
      ok: true,
      data: {
        status: 'uploaded',
        serverId,
        localPath: sanitizePath(localPath),
        remotePath,
      },
    };
  } catch (error) {
    return failureFrom(error);
  }
}
