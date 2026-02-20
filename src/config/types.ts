/**
 * TypeScript type definitions for SSH MCP configuration.
 * These types match the JSON Schema defined in config.schema.json.
 */

/**
 * Timeout configurations in seconds
 */
export interface Timeouts {
  /** Maximum time to establish SSH connection (1-300 seconds, default: 10) */
  connection?: number;
  /** Maximum time for command execution (1-3600 seconds, default: 60) */
  command?: number;
  /** Maximum idle time before closing connection (60-7200 seconds, default: 900) */
  idle?: number;
}

/**
 * Connection pooling settings for reusing SSH connections
 */
export interface ConnectionPool {
  /** Maximum number of concurrent connections per server (1-10, default: 3) */
  maxConnections?: number;
  /** Whether to reuse existing connections for multiple commands (default: true) */
  reuseConnections?: boolean;
}

/**
 * Password-based authentication
 */
export interface PasswordAuth {
  /** SSH password. Config file must have 0600 permissions. */
  password: string;
}

/**
 * Private key-based authentication
 */
export interface PrivateKeyAuth {
  /** Path to SSH private key file OR inline PEM content (auto-detected) */
  privateKey: string;
  /** Optional passphrase for encrypted private key */
  passphrase?: string;
}

/**
 * Authentication method: either password or private key (mutually exclusive)
 */
export type Auth = PasswordAuth | PrivateKeyAuth;

/**
 * Remote shell type for prompt detection and command wrapping.
 * - "auto": auto-detect from initial prompt (default)
 * - "posix": bash/sh/zsh
 * - "powershell": Windows PowerShell or PowerShell Core
 * - "cmd": Windows cmd.exe
 */
export type ShellType = 'auto' | 'posix' | 'powershell' | 'cmd';

/** Concrete shell types after auto-detection has resolved. */
export type ConcreteShellType = 'posix' | 'powershell' | 'cmd';

/**
 * SSH server connection configuration
 */
export interface ServerConfig {
  /** Unique identifier for this server (alphanumeric, underscore, hyphen; 1-64 chars) */
  id: string;
  /** Hostname or IP address of the SSH server */
  host: string;
  /** SSH port number (1-65535, default: 22) */
  port: number;
  /** SSH username for authentication */
  username: string;
  /** Authentication method */
  auth: Auth;
  /** Remote shell type: "auto" (default, auto-detect), "posix", "powershell", or "cmd" */
  shell?: ShellType;
  /** Server-specific timeout settings */
  timeouts?: Timeouts;
  /** Server-specific connection pool settings */
  connectionPool?: ConnectionPool;
  /** Optional human-readable description of this server */
  description?: string;
  /** Enable SSH agent forwarding for git operations using local keys (default: false) */
  agentForward?: boolean;
}

/**
 * Default settings applied to all servers unless overridden
 */
export interface Defaults {
  timeouts?: Timeouts;
  connectionPool?: ConnectionPool;
}

/**
 * Main configuration structure for SSH MCP server
 */
export interface Config {
  /** List of SSH server configurations */
  servers: ServerConfig[];
  /** Named SSH private keys that can be referenced by alias in server auth */
  keys?: Record<string, string>;
  /** Default settings applied to all servers */
  defaults?: Defaults;
}

/**
 * Type guard to check if auth is password-based
 */
export function isPasswordAuth(auth: Auth): auth is PasswordAuth {
  return 'password' in auth;
}

/**
 * Type guard to check if auth is private key-based
 */
export function isPrivateKeyAuth(auth: Auth): auth is PrivateKeyAuth {
  return 'privateKey' in auth;
}
