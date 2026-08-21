import { MCP_PROMPT } from './shell-session.types.js';
// cmd.exe commands that consume the entire line (& chains become part of comment).
const LINE_EATING_CMD = /^\s*(rem|::|goto)\b/i;
export class CmdShellAdapter {
    shellType = 'cmd';
    eofChar = '\x1A';
    lineEnding = '\r\n';
    exitCommand = 'exit';
    lastWrapped = '';
    buildInitCommands() {
        return `prompt ${MCP_PROMPT}$_`;
    }
    wrapCommand(command, marker) {
        // Two-line wrapper:
        //   Line 1: `@call <command>` — `call` forces cmd.exe to update %ERRORLEVEL%
        //     even for built-ins (echo, set, cd, dir) that otherwise leave it stale.
        //   Line 2: `@echo. & echo MARKER & echo %ERRORLEVEL%` — separate parse
        //     context, so %ERRORLEVEL% is expanded at line-2 parse time (after
        //     line 1 completes), capturing the real exit code.
        if (LINE_EATING_CMD.test(command)) {
            // rem/goto/:: eat the rest of the line; no-ops → hardcoded exit code 0.
            this.lastWrapped = `@${command}\r\n` + `@echo. & echo ${marker} & echo 0\r\n`;
        }
        else {
            this.lastWrapped = `@call ${command}\r\n` + `@echo. & echo ${marker} & echo %ERRORLEVEL%\r\n`;
        }
        return this.lastWrapped;
    }
    isEchoedCommandLine(line, marker, command) {
        const trimmed = line.trim();
        if (!trimmed)
            return false;
        // Filter wrapper infrastructure lines echoed by conhost
        if (trimmed.includes(`echo ${marker}`))
            return true;
        if (!command)
            return false;
        // Exact match for the @call or @-prefixed echoed command (rem/goto use @)
        if (trimmed === `@call ${command}` || trimmed === `@${command}`)
            return true;
        // Conhost line-wraps long echoed commands at ~80 cols, producing fragments.
        // Filter these by checking if the fragment is a substring of the wrapped
        // text AND either (a) contains cmd operators, or (b) is a partial word
        // (not bounded by whitespace/start/end in the wrapped text).
        if (this.lastWrapped && trimmed.length >= 2) {
            const flat = this.lastWrapped.replace(/\r?\n/g, ' ');
            if (flat.includes(trimmed)) {
                if (/[&|><]/.test(trimmed))
                    return true;
                // Partial-word fragment: not a standalone word in the wrapped text
                const idx = flat.indexOf(trimmed);
                const before = idx > 0 ? flat[idx - 1] : ' ';
                const after = idx + trimmed.length < flat.length ? flat[idx + trimmed.length] : ' ';
                if (before !== ' ' || after !== ' ')
                    return true;
            }
        }
        return false;
    }
}
//# sourceMappingURL=shell-adapter-cmd.js.map