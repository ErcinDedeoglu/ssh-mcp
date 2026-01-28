import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SFTPWrapper } from 'ssh2';
import type { SessionKeeper } from './session.js';

export const MAX_FILE_SIZE = 100 * 1024 * 1024;

export class FileTransfer {
  private readonly connection: SessionKeeper;

  constructor(connection: SessionKeeper) {
    this.connection = connection;
  }

  private expandRemotePath(remotePath: string): string {
    if (remotePath.startsWith('~/')) {
      return `/home/${this.connection.username}/${remotePath.slice(2)}`;
    }
    if (remotePath === '~') {
      return `/home/${this.connection.username}`;
    }
    return remotePath;
  }

  private getSftp(): Promise<SFTPWrapper> {
    return new Promise((resolve, reject) => {
      this.connection.client.sftp((err, sftp) => {
        if (err) {
          reject(new Error(`SFTP subsystem error: ${err.message}`));
          return;
        }
        resolve(sftp);
      });
    });
  }

  private formatError(err: Error & { code?: string }, operation: string): Error {
    if (err.code === 'ENOENT') {
      return new Error(`File not found: ${err.message}`);
    }
    if (err.code === 'EACCES') {
      return new Error(`Permission denied: ${err.message}`);
    }
    return new Error(`${operation} failed: ${err.message}`);
  }

  private mkdirRecursive(sftp: SFTPWrapper, dirPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      sftp.mkdir(dirPath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  async upload(localPath: string, remotePath: string): Promise<void> {
    if (!fs.existsSync(localPath)) {
      throw new Error(`Local file not found: ${localPath}`);
    }

    const stats = fs.statSync(localPath);
    if (stats.size > MAX_FILE_SIZE) {
      throw new Error(`File too large: ${stats.size} bytes exceeds ${MAX_FILE_SIZE} byte limit`);
    }

    const expandedRemotePath = this.expandRemotePath(remotePath);
    const sftp = await this.getSftp();

    return new Promise((resolve, reject) => {
      sftp.fastPut(localPath, expandedRemotePath, async (err) => {
        if (err) {
          const sftpErr = err as Error & { code?: string };

          if (sftpErr.code === 'ENOENT') {
            const remoteDir = path.dirname(expandedRemotePath);
            try {
              await this.mkdirRecursive(sftp, remoteDir);
              sftp.fastPut(localPath, expandedRemotePath, (retryErr) => {
                if (retryErr) {
                  reject(this.formatError(retryErr as Error & { code?: string }, 'Upload'));
                  return;
                }
                resolve();
              });
            } catch (mkdirErr) {
              reject(this.formatError(sftpErr, 'Upload'));
            }
            return;
          }

          reject(this.formatError(sftpErr, 'Upload'));
          return;
        }
        resolve();
      });
    });
  }

  async download(remotePath: string, localPath: string): Promise<void> {
    const expandedRemotePath = this.expandRemotePath(remotePath);
    const sftp = await this.getSftp();

    const remoteStats = await new Promise<{ size: number }>((resolve, reject) => {
      sftp.stat(expandedRemotePath, (err, stats) => {
        if (err) {
          const sftpErr = err as Error & { code?: string };
          if (sftpErr.code === 'ENOENT') {
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
      throw new Error(`File too large: ${remoteStats.size} bytes exceeds ${MAX_FILE_SIZE} byte limit`);
    }

    return new Promise((resolve, reject) => {
      sftp.fastGet(expandedRemotePath, localPath, (err) => {
        if (err) {
          reject(this.formatError(err as Error & { code?: string }, 'Download'));
          return;
        }
        resolve();
      });
    });
  }
}
