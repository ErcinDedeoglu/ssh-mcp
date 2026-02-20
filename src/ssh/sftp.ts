import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SFTPWrapper } from 'ssh2';
import type { SessionKeeper } from './session.js';

export const MAX_FILE_SIZE = 100 * 1024 * 1024;
export const DEFAULT_TRANSFER_TIMEOUT_MS = 5 * 60 * 1000;

export interface FileTransferOptions {
  timeoutMs?: number;
}

export class FileTransfer {
  private readonly connection: SessionKeeper;
  private readonly timeoutMs: number;

  constructor(connection: SessionKeeper, options: FileTransferOptions = {}) {
    this.connection = connection;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TRANSFER_TIMEOUT_MS;
  }

  private withTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${operation} timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
      clearTimeout(timeoutId);
    });
  }

  private async expandRemotePath(remotePath: string, sftp: SFTPWrapper): Promise<string> {
    if (remotePath !== '~' && !remotePath.startsWith('~/')) return remotePath;
    const suffix = remotePath === '~' ? '' : remotePath.slice(2);
    const homeDir = await this.resolveHomeDir(sftp);
    return suffix ? `${homeDir}/${suffix}` : homeDir;
  }

  private resolveHomeDir(sftp: SFTPWrapper): Promise<string> {
    return new Promise<string>((resolve) => {
      sftp.realpath('.', (err, absPath) => {
        if (err || !absPath) {
          resolve(`/home/${this.connection.username}`);
          return;
        }
        resolve(absPath);
      });
    });
  }

  private getSftp(): Promise<SFTPWrapper> {
    const sftpPromise = new Promise<SFTPWrapper>((resolve, reject) => {
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

  private isNoSuchFileError(err: Error & { code?: number | string }): boolean {
    return err.code === 2 || err.code === 'ENOENT';
  }

  private formatError(err: Error & { code?: number | string }, operation: string): Error {
    if (this.isNoSuchFileError(err)) {
      return new Error(`File not found: ${err.message}`);
    }
    if (err.code === 3 || err.code === 'EACCES') {
      return new Error(`Permission denied: ${err.message}`);
    }
    return new Error(`${operation} failed: ${err.message}`);
  }

  private async mkdirRecursive(sftp: SFTPWrapper, dirPath: string): Promise<void> {
    const parts = dirPath.split('/').filter(Boolean);
    let currentPath = '';

    for (const part of parts) {
      currentPath += '/' + part;

      const exists = await new Promise<boolean>((resolve) => {
        sftp.stat(currentPath, (err) => {
          resolve(!err);
        });
      });

      if (!exists) {
        await new Promise<void>((resolve, reject) => {
          sftp.mkdir(currentPath, (err) => {
            if (err && (err as NodeJS.ErrnoException).code !== 'EEXIST') {
              reject(err);
              return;
            }
            resolve();
          });
        });
      }
    }
  }

  async upload(localPath: string, remotePath: string): Promise<void> {
    if (!fs.existsSync(localPath)) {
      throw new Error(`Local file not found: ${localPath}`);
    }

    const stats = fs.statSync(localPath);
    if (stats.size > MAX_FILE_SIZE) {
      throw new Error(`File too large: ${stats.size} bytes exceeds ${MAX_FILE_SIZE} byte limit`);
    }

    const sftp = await this.getSftp();
    const expandedRemotePath = await this.expandRemotePath(remotePath, sftp);

    const doUpload = (): Promise<void> => {
      return new Promise((resolve, reject) => {
        sftp.fastPut(localPath, expandedRemotePath, (err) => {
          if (err) {
            const sftpErr = err as Error & { code?: number | string };

            if (this.isNoSuchFileError(sftpErr)) {
              const remoteDir = path.dirname(expandedRemotePath);
              this.mkdirRecursive(sftp, remoteDir)
                .then(() => {
                  sftp.fastPut(localPath, expandedRemotePath, (retryErr) => {
                    if (retryErr) {
                      reject(
                        this.formatError(retryErr as Error & { code?: number | string }, 'Upload'),
                      );
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

  async download(remotePath: string, localPath: string): Promise<void> {
    const sftp = await this.getSftp();
    const expandedRemotePath = await this.expandRemotePath(remotePath, sftp);

    const remoteStats = await new Promise<{ size: number }>((resolve, reject) => {
      sftp.stat(expandedRemotePath, (err, stats) => {
        if (err) {
          const sftpErr = err as Error & { code?: number | string };
          if (this.isNoSuchFileError(sftpErr)) {
            reject(new Error(`Remote file not found: ${expandedRemotePath}`));
            return;
          }
          reject(this.formatError(sftpErr, 'Stat'));
          return;
        }
        resolve(stats as { size: number });
      });
    });

    if (remoteStats.size > MAX_FILE_SIZE) {
      throw new Error(
        `File too large: ${remoteStats.size} bytes exceeds ${MAX_FILE_SIZE} byte limit`,
      );
    }

    const doDownload = (): Promise<void> => {
      return new Promise((resolve, reject) => {
        sftp.fastGet(expandedRemotePath, localPath, (err) => {
          if (err) {
            reject(this.formatError(err as Error & { code?: number | string }, 'Download'));
            return;
          }
          resolve();
        });
      });
    };

    return this.withTimeout(doDownload(), 'Download');
  }
}
