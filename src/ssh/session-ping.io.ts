// Active connection probe using SSH exec. Returns true if connection is alive.
import type { Client } from 'ssh2';

const DEFAULT_PING_TIMEOUT_MS = 5000;

export function ping(client: Client, timeoutMs = DEFAULT_PING_TIMEOUT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    let resolved = false;
    const done = (success: boolean) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      resolve(success);
    };
    const timer = setTimeout(() => done(false), timeoutMs);

    client.exec('true', (err, stream) => {
      if (err) return done(false);
      stream.on('exit', () => done(true));
      stream.on('close', () => done(true));
      stream.on('error', () => done(false));
    });
  });
}
