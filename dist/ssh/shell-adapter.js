import { PosixShellAdapter } from './shell-adapter-posix.js';
import { PowerShellAdapter } from './shell-adapter-powershell.js';
import { CmdShellAdapter } from './shell-adapter-cmd.js';
export function createShellAdapter(shellType) {
    switch (shellType) {
        case 'posix':
            return new PosixShellAdapter();
        case 'powershell':
            return new PowerShellAdapter();
        case 'cmd':
            return new CmdShellAdapter();
    }
}
/**
 * Detect shell type from the initial prompt text received after SSH connection.
 * Only the last non-empty line is analyzed (everything before is MOTD/banner).
 * - PowerShell prompts: "PS C:\Users\foo>" or "PS /home/foo>"
 * - cmd.exe prompts: "C:\Users\foo>" (drive letter path ending with >)
 * - Everything else is assumed to be POSIX (bash/sh/zsh)
 */
export function detectShellType(promptText) {
    const lines = promptText.split(/\r?\n/).filter((l) => l.trim());
    const lastLine = (lines[lines.length - 1] ?? '').trim();
    // PowerShell: word-bounded "PS" followed by space and path ending with >
    if (/\bPS\s+.+>/.test(lastLine))
        return 'powershell';
    // cmd.exe: drive letter path ending with > (e.g., "C:\Users\foo>" or "user@HOST C:\Users\foo>")
    if (/[A-Z]:\\[^>]*>\s*$/i.test(lastLine))
        return 'cmd';
    return 'posix';
}
//# sourceMappingURL=shell-adapter.js.map