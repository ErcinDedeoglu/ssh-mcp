import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

// No-op when the prebuilt dist/ ships with the install (release tags)
if (existsSync('dist/index.js')) {
  process.exit(0);
}

// Build dist/ - required when installed from a branch/commit without dist/
run('npm run build');

// Git hooks only make sense in a dev checkout; skip for dependency installs
if (existsSync('.git')) {
  try {
    run('npx husky');
  } catch {
    // Non-fatal: hooks are a dev convenience only
  }
}
