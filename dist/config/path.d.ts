export declare const PROJECT_CONFIG_FILENAME = ".ssh-mcp.json";
export declare function expandHome(filePath: string): string;
/** True when --config flag or SSH_MCP_CONFIG env pin the config explicitly. */
export declare function hasExplicitConfigOverride(): boolean;
/**
 * Nearest .ssh-mcp.json walking up from startDir (git-style).
 * Returns undefined when no project config exists on the path to root.
 */
export declare function findProjectConfig(startDir?: string): string | undefined;
export declare function getConfigPath(): string;
//# sourceMappingURL=path.d.ts.map