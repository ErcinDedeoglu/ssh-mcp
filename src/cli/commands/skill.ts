import type { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { packagePath } from '../../utils/pkg-root.js';

export function skillFilePath(): string {
  return packagePath('skills', 'ssh-mcp-cli', 'SKILL.md');
}

function resolvePackageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(packagePath('package.json'), 'utf-8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function readSkillFile(): string {
  const raw = readFileSync(skillFilePath(), 'utf-8');
  // Inject the actual installed version so the Version Guard always converges,
  // even if the checked-in frontmatter lags a release
  return raw.replace(/^(version:).*$/m, `$1 ${resolvePackageVersion()}`);
}

export function registerSkillCommand(program: Command): void {
  const skill = program
    .command('skill')
    .description('Print the current agent skill file (SKILL.md) for this version');

  skill.action(() => {
    process.stdout.write(readSkillFile());
  });
}
