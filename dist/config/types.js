/**
 * TypeScript type definitions for SSH MCP configuration.
 * These types match the JSON Schema defined in config.schema.json.
 */
/**
 * Type guard to check if auth is password-based
 */
export function isPasswordAuth(auth) {
    return 'password' in auth;
}
/**
 * Type guard to check if auth is private key-based
 */
export function isPrivateKeyAuth(auth) {
    return 'privateKey' in auth;
}
//# sourceMappingURL=types.js.map