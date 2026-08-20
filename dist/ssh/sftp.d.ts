import type { SessionKeeper } from './session.js';
export declare const MAX_FILE_SIZE: number;
export declare const DEFAULT_TRANSFER_TIMEOUT_MS: number;
export interface FileTransferOptions {
    timeoutMs?: number;
}
export declare class FileTransfer {
    private readonly connection;
    private readonly timeoutMs;
    constructor(connection: SessionKeeper, options?: FileTransferOptions);
    private withTimeout;
    private expandRemotePath;
    private resolveHomeDir;
    private getSftp;
    private isNoSuchFileError;
    private formatError;
    private mkdirRecursive;
    upload(localPath: string, remotePath: string): Promise<void>;
    download(remotePath: string, localPath: string): Promise<void>;
}
//# sourceMappingURL=sftp.d.ts.map