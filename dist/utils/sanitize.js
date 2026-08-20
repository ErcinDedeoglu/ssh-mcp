import * as os from 'node:os';
const HOME_DIR = os.homedir();
export function sanitizeError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return message
        .replace(new RegExp(HOME_DIR, 'g'), '~')
        .replace(/password[=:]\s*['"]?[^'"\s]+['"]?/gi, 'password=***')
        .replace(/privateKey[=:]\s*['"]?[^'"\s]+['"]?/gi, 'privateKey=***')
        .replace(/passphrase[=:]\s*['"]?[^'"\s]+['"]?/gi, 'passphrase=***')
        .replace(/-----BEGIN[^-]+PRIVATE KEY-----[\s\S]*?-----END[^-]+PRIVATE KEY-----/g, '[REDACTED_KEY]');
}
export function sanitizePath(path) {
    return path.replace(new RegExp(HOME_DIR, 'g'), '~');
}
export const DEFAULT_MAX_OUTPUT_LENGTH = 10000;
export function truncateOutput(output, maxLength) {
    if (output.length <= maxLength) {
        return { text: output, truncated: false, originalLength: output.length };
    }
    const truncated = output.slice(0, maxLength);
    const notice = `\n\n[OUTPUT TRUNCATED: showing ${maxLength.toLocaleString()} of ${output.length.toLocaleString()} chars]`;
    return {
        text: truncated + notice,
        truncated: true,
        originalLength: output.length,
    };
}
//# sourceMappingURL=sanitize.js.map