import * as os from 'node:os';

const HOME_DIR = os.homedir();

export function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  
  return message
    .replace(new RegExp(HOME_DIR, 'g'), '~')
    .replace(/password[=:]\s*['"]?[^'"\s]+['"]?/gi, 'password=***')
    .replace(/privateKey[=:]\s*['"]?[^'"\s]+['"]?/gi, 'privateKey=***')
    .replace(/passphrase[=:]\s*['"]?[^'"\s]+['"]?/gi, 'passphrase=***')
    .replace(/-----BEGIN[^-]+PRIVATE KEY-----[\s\S]*?-----END[^-]+PRIVATE KEY-----/g, '[REDACTED_KEY]');
}

export function sanitizePath(path: string): string {
  return path.replace(new RegExp(HOME_DIR, 'g'), '~');
}
