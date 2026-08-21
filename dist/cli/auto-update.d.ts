export interface AutoUpdateState {
    lastCheckAt: number;
    lastSpawnedVersion?: string;
    lastError?: string;
}
export type AutoUpdateAction = 'spawned' | 'skipped:throttled' | 'skipped:disabled' | 'skipped:current' | 'skipped:error';
export declare function stateFilePath(configPath?: string): string;
export declare function readAutoUpdateState(file: string): AutoUpdateState | undefined;
export declare function writeAutoUpdateState(file: string, state: AutoUpdateState): void;
export declare function isThrottled(state: AutoUpdateState | undefined, now?: number): boolean;
/**
 * Loop-prevention + mode gating. Auto-update never runs for:
 * - `mcp` (long-lived server), `run-job` (detached runner), `update` itself
 * - `--json` invocations (machine consumers)
 * - SSH_MCP_AUTO_UPDATE=0|false|no|off
 */
export declare function shouldSkipAutoUpdate(argv: string[], env: NodeJS.ProcessEnv): boolean;
/**
 * Forced background auto-update: at most once per interval, checks the
 * registry and spawns a detached `ssh-mcp update --auto` when a newer
 * version exists. The running process is unaffected; the next invocation
 * uses the new version. Never throws.
 */
export declare function maybeAutoUpdate(): Promise<AutoUpdateAction>;
//# sourceMappingURL=auto-update.d.ts.map