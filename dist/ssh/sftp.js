import * as fs from 'node:fs';
import * as path from 'node:path';
export const MAX_FILE_SIZE = 100 * 1024 * 1024;
export const DEFAULT_TRANSFER_TIMEOUT_MS = 5 * 60 * 1000;
export class FileTransfer {
    connection;
    timeoutMs;
    constructor(connection, options = {}) {
        this.connection = connection;
        this.timeoutMs = options.timeoutMs ?? DEFAULT_TRANSFER_TIMEOUT_MS;
    }
    withTimeout(promise, operation) {
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                reject(new Error(`${operation} timed out after ${this.timeoutMs}ms`));
            }, this.timeoutMs);
        });
        return Promise.race([promise, timeoutPromise]).finally(() => {
            clearTimeout(timeoutId);
        });
    }
    async expandRemotePath(remotePath, sftp) {
        if (remotePath !== '~' && !remotePath.startsWith('~/'))
            return remotePath;
        const suffix = remotePath === '~' ? '' : remotePath.slice(2);
        const homeDir = await this.resolveHomeDir(sftp);
        return suffix ? `${homeDir}/${suffix}` : homeDir;
    }
    resolveHomeDir(sftp) {
        return new Promise((resolve) => {
            sftp.realpath('.', (err, absPath) => {
                if (err || !absPath) {
                    resolve(`/home/${this.connection.username}`);
                    return;
                }
                resolve(absPath);
            });
        });
    }
    getSftp() {
        const sftpPromise = new Promise((resolve, reject) => {
            this.connection.client.sftp((err, sftp) => {
                if (err) {
                    reject(new Error(`SFTP subsystem error: ${err.message}`));
                    return;
                }
                resolve(sftp);
            });
        });
        return this.withTimeout(sftpPromise, 'SFTP initialization');
    }
    isNoSuchFileError(err) {
        return err.code === 2 || err.code === 'ENOENT';
    }
    formatError(err, operation) {
        if (this.isNoSuchFileError(err)) {
            return new Error(`File not found: ${err.message}`);
        }
        if (err.code === 3 || err.code === 'EACCES') {
            return new Error(`Permission denied: ${err.message}`);
        }
        return new Error(`${operation} failed: ${err.message}`);
    }
    async mkdirRecursive(sftp, dirPath) {
        const parts = dirPath.split('/').filter(Boolean);
        let currentPath = '';
        for (const part of parts) {
            currentPath += '/' + part;
            const exists = await new Promise((resolve) => {
                sftp.stat(currentPath, (err) => {
                    resolve(!err);
                });
            });
            if (!exists) {
                await new Promise((resolve, reject) => {
                    sftp.mkdir(currentPath, (err) => {
                        if (err && err.code !== 'EEXIST') {
                            reject(err);
                            return;
                        }
                        resolve();
                    });
                });
            }
        }
    }
    async upload(localPath, remotePath) {
        if (!fs.existsSync(localPath)) {
            throw new Error(`Local file not found: ${localPath}`);
        }
        const stats = fs.statSync(localPath);
        if (stats.size > MAX_FILE_SIZE) {
            throw new Error(`File too large: ${stats.size} bytes exceeds ${MAX_FILE_SIZE} byte limit`);
        }
        const sftp = await this.getSftp();
        const expandedRemotePath = await this.expandRemotePath(remotePath, sftp);
        const doUpload = () => {
            return new Promise((resolve, reject) => {
                sftp.fastPut(localPath, expandedRemotePath, (err) => {
                    if (err) {
                        const sftpErr = err;
                        if (this.isNoSuchFileError(sftpErr)) {
                            const remoteDir = path.dirname(expandedRemotePath);
                            this.mkdirRecursive(sftp, remoteDir)
                                .then(() => {
                                sftp.fastPut(localPath, expandedRemotePath, (retryErr) => {
                                    if (retryErr) {
                                        reject(this.formatError(retryErr, 'Upload'));
                                        return;
                                    }
                                    resolve();
                                });
                            })
                                .catch(() => {
                                reject(this.formatError(sftpErr, 'Upload'));
                            });
                            return;
                        }
                        reject(this.formatError(sftpErr, 'Upload'));
                        return;
                    }
                    resolve();
                });
            });
        };
        return this.withTimeout(doUpload(), 'Upload');
    }
    async download(remotePath, localPath) {
        const sftp = await this.getSftp();
        const expandedRemotePath = await this.expandRemotePath(remotePath, sftp);
        const remoteStats = await new Promise((resolve, reject) => {
            sftp.stat(expandedRemotePath, (err, stats) => {
                if (err) {
                    const sftpErr = err;
                    if (this.isNoSuchFileError(sftpErr)) {
                        reject(new Error(`Remote file not found: ${expandedRemotePath}`));
                        return;
                    }
                    reject(this.formatError(sftpErr, 'Stat'));
                    return;
                }
                resolve(stats);
            });
        });
        if (remoteStats.size > MAX_FILE_SIZE) {
            throw new Error(`File too large: ${remoteStats.size} bytes exceeds ${MAX_FILE_SIZE} byte limit`);
        }
        const doDownload = () => {
            return new Promise((resolve, reject) => {
                sftp.fastGet(expandedRemotePath, localPath, (err) => {
                    if (err) {
                        reject(this.formatError(err, 'Download'));
                        return;
                    }
                    resolve();
                });
            });
        };
        return this.withTimeout(doDownload(), 'Download');
    }
}
//# sourceMappingURL=sftp.js.map