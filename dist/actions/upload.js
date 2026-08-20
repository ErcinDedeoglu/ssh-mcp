import { FileTransfer } from '../ssh/sftp.js';
import { sanitizePath } from '../utils/sanitize.js';
import { ensureConnected, connectionFailure } from './ensure-connected.js';
import { failureFrom } from './types.js';
export async function uploadFile(input, deps) {
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
    }
    catch (error) {
        return failureFrom(error);
    }
}
//# sourceMappingURL=upload.js.map