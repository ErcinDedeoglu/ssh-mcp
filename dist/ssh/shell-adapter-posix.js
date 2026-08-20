import { MCP_PROMPT, MCP_PROMPT_CONTINUATION } from './shell-session.types.js';
export class PosixShellAdapter {
    shellType = 'posix';
    eofChar = '\x04';
    lineEnding = '\n';
    exitCommand = 'exit';
    buildInitCommands() {
        return [
            `export PS1="${MCP_PROMPT}"`,
            `export PS2="${MCP_PROMPT_CONTINUATION}"`,
            'export TERM=dumb',
            'export DEBIAN_FRONTEND=noninteractive',
            'unset HISTFILE',
            'stty -echo 2>/dev/null || true',
        ].join('; ');
    }
    wrapCommand(command, marker) {
        return `${command}; __MCP_EXIT=$?; echo ""; echo "${marker}"; echo $__MCP_EXIT\n`;
    }
    isEchoedCommandLine(line, marker) {
        const hasExitCapture = line.includes('__MCP_EXIT') || line.includes('$__MCP_EXIT');
        const hasMarkerEcho = line.includes(`echo "${marker}"`) || line.includes(`"${marker}"`);
        const hasEchoPattern = line.includes('echo ""') && hasExitCapture;
        return hasExitCapture || hasMarkerEcho || hasEchoPattern;
    }
}
//# sourceMappingURL=shell-adapter-posix.js.map