import { type ActionDeps, type ActionOutcome } from './types.js';
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
export declare function downloadFile(input: DownloadInput, deps: ActionDeps): Promise<ActionOutcome<DownloadResult>>;
//# sourceMappingURL=download.d.ts.map