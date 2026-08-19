import type { Command } from 'commander';
import { uploadFile } from '../../actions/upload.js';
import { downloadFile } from '../../actions/download.js';
import { buildCliDeps, cleanupCli } from '../context.js';
import { report } from '../output.js';

export function registerTransferCommands(program: Command): void {
  const upload = program
    .command('upload')
    .description('Upload a local file to a remote server via SFTP')
    .argument('<serverId>', 'server ID from config')
    .argument('<localPath>', 'local file path')
    .argument('<remotePath>', 'remote destination path');
  upload.action(async (serverId: string, localPath: string, remotePath: string) => {
    const deps = buildCliDeps();
    try {
      const json = upload.optsWithGlobals().json as boolean;
      const outcome = await uploadFile({ serverId, localPath, remotePath }, deps);
      process.exitCode = report(outcome, json, () =>
        console.log(`Uploaded ${localPath} -> ${serverId}:${remotePath}`),
      );
    } finally {
      cleanupCli(deps);
    }
  });

  const download = program
    .command('download')
    .description('Download a remote file via SFTP')
    .argument('<serverId>', 'server ID from config')
    .argument('<remotePath>', 'remote file path')
    .argument('<localPath>', 'local destination path');
  download.action(async (serverId: string, remotePath: string, localPath: string) => {
    const deps = buildCliDeps();
    try {
      const json = download.optsWithGlobals().json as boolean;
      const outcome = await downloadFile({ serverId, remotePath, localPath }, deps);
      process.exitCode = report(outcome, json, () =>
        console.log(`Downloaded ${serverId}:${remotePath} -> ${localPath}`),
      );
    } finally {
      cleanupCli(deps);
    }
  });
}
