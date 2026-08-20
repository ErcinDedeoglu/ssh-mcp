import { type ActionDeps, type ActionOutcome } from './types.js';
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
export declare function uploadFile(input: UploadInput, deps: ActionDeps): Promise<ActionOutcome<UploadResult>>;
//# sourceMappingURL=upload.d.ts.map