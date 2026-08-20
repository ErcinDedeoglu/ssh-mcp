import type { ConcreteShellType } from './types.js';
/**
 * Persist a detected shell type for a server back to the config file.
 * Reads the raw JSON, finds the server by id, sets `shell`, writes back.
 * Preserves existing formatting (2-space indent) and file permissions (0600).
 *
 * This is a best-effort operation — errors are silently ignored because
 * config persistence is an optimization, not a critical path.
 */
export declare function persistShellType(serverId: string, shellType: ConcreteShellType): void;
//# sourceMappingURL=writer.d.ts.map