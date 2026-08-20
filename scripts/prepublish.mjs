import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

function shAvailable(cmd) {
  try {
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

// Use bun when available (dev machines), plain npm scripts otherwise (CI)
const runner = existsSync('bun.lock') && shAvailable('bun --version') ? 'bun run' : 'npm run';

run(`${runner} build`);
run(`${runner} test`);
