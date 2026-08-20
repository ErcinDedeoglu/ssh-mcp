import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

// Build dist/ - required when installed from git (no dist/ in the repo)
run('npm run build');

// Git hooks only make sense in a dev checkout; skip for dependency installs
if (existsSync('.git')) {
  try {
    run('npx husky');
  } catch {
    // Non-fatal: hooks are a dev convenience only
  }
}
