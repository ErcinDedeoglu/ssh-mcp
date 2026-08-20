import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
const SKILL_RELATIVE_PATH = '../../../skills/ssh-mcp-cli/SKILL.md';
const PACKAGE_RELATIVE_PATH = '../../../package.json';
export function skillFilePath() {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), SKILL_RELATIVE_PATH);
}
function resolvePackageVersion() {
    try {
        const pkg = JSON.parse(readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), PACKAGE_RELATIVE_PATH), 'utf-8'));
        return pkg.version ?? '0.0.0';
    }
    catch {
        return '0.0.0';
    }
}
export function readSkillFile() {
    const raw = readFileSync(skillFilePath(), 'utf-8');
    // Inject the actual installed version so the Version Guard always converges,
    // even if the checked-in frontmatter lags a release
    return raw.replace(/^(version:).*$/m, `$1 ${resolvePackageVersion()}`);
}
export function registerSkillCommand(program) {
    const skill = program
        .command('skill')
        .description('Print the current agent skill file (SKILL.md) for this version');
    skill.action(() => {
        process.stdout.write(readSkillFile());
    });
}
//# sourceMappingURL=skill.js.map