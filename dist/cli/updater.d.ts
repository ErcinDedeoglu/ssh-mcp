export declare const NPM_PACKAGE = "ssh-mcp-cli";
export interface UpdateCheckResult {
    currentVersion: string;
    latestVersion: string;
    updateAvailable: boolean;
}
export interface UpdateResult {
    fromVersion: string;
    toVersion: string;
    packageManager: 'npm' | 'bun';
    reinstalled: boolean;
}
/** Compares the running install against the npm registry latest. */
export declare function checkForUpdate(): Promise<UpdateCheckResult>;
/**
 * Detects which package manager owns the global install.
 * bun if the running binary sits under bun's global dir, else npm.
 */
export declare function detectPackageManager(): 'npm' | 'bun';
/**
 * Self-update: installs the latest version with the detected package
 * manager. Reinstalls (no-op upgrade) when already current, so callers
 * can use it as `ssh-mcp update` unconditionally.
 */
export declare function selfUpdate(): Promise<UpdateResult>;
//# sourceMappingURL=updater.d.ts.map