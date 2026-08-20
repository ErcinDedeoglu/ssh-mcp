import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import { readSkillFile, skillFilePath } from '../../../../src/cli/commands/skill.js';
import { Command as CommandCtor } from 'commander';

describe('skill command', () => {
  it('skill file ships in the package tree', () => {
    expect(fs.existsSync(skillFilePath())).toBe(true);
    const content = readSkillFile();
    expect(content).toContain('ssh-mcp CLI Usage Guide');
    expect(content).toContain('Version Guard');
  });

  it('injects the actual package version into the frontmatter', () => {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8')) as { version: string };
    const printed = readSkillFile();
    const versionLine = printed.match(/^version:\s*(\S+)$/m);
    expect(versionLine?.[1]).toBe(pkg.version);
  });

  it('prints the skill to stdout when the command runs', async () => {
    const { registerSkillCommand } = await import('../../../../src/cli/commands/skill.js');
    const program = new CommandCtor();
    registerSkillCommand(program);

    const chunks: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString());
      return true;
    }) as typeof process.stdout.write;
    try {
      await program.parseAsync(['skill'], { from: 'user' });
    } finally {
      process.stdout.write = original;
    }
    expect(chunks.join('')).toContain('ssh-mcp CLI Usage Guide');
  });
});
