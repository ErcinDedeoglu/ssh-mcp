export const MCP_PROMPT = '__MCP_PROMPT__';
export const MCP_PROMPT_CONTINUATION = '__MCP_PROMPT2__';
export const DEFAULT_SHELL_TIMEOUT_MS = 30000;
export const DEFAULT_STALL_TIMEOUT_MS = 10000;
export const MAX_OUTPUT_SIZE = 10 * 1024 * 1024;
export const MAX_HISTORY_ENTRIES = 100;
export const MAX_HISTORY_OUTPUT_LENGTH = 50 * 1024;
export const STDIN_DELIVERY_DELAY_MS = 100;
export function generateMarker() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `__MCP_END_${timestamp}_${random}__`;
}
export function stripControlSequences(str) {
    return str
        .replace(/\x1B\[[0-9;]*[Hf]/g, '\n') // Cursor position (H/f) → newline (implies visual line break)
        .replace(/\x1B\[[0-9;?]*[a-zA-Z]/g, '') // Other ANSI escape sequences
        .replace(/\x1B][^\x07]*\x07/g, '') // OSC sequences
        .replace(/\r(?!\n)/g, ''); // Carriage returns not followed by newline
}
function findStandaloneMarker(buffer, marker) {
    // Allow optional trailing whitespace (Windows conhost may pad with spaces)
    const markerLinePattern = new RegExp(`(^|\\n)${marker}\\s*(\\r?\\n|$)`);
    const match = buffer.match(markerLinePattern);
    if (!match || match.index === undefined)
        return -1;
    return match.index + (match[1] === '\n' ? 1 : 0);
}
export function parseMarkedOutput(buffer, marker, adapter, command) {
    // Clean escape sequences first so markers aren't broken by injected OSC/cursor sequences
    const cleaned = stripControlSequences(buffer);
    const markerIndex = findStandaloneMarker(cleaned, marker);
    if (markerIndex === -1)
        return null;
    const beforeMarker = cleaned.substring(0, markerIndex);
    const afterMarker = cleaned.substring(markerIndex + marker.length);
    const exitCodeMatch = afterMarker.match(/^[\s\r\n]*(\d+)/);
    if (!exitCodeMatch)
        return null;
    const exitCode = parseInt(exitCodeMatch[1], 10);
    const remaining = afterMarker.replace(/^[\s\r\n]*\d+[\s\r\n]*/, '');
    const lines = beforeMarker.split('\n');
    const outputLines = lines.filter((line) => !adapter.isEchoedCommandLine(line, marker, command) && line.trim() !== MCP_PROMPT);
    let output = outputLines.join('\n').trim();
    if (output.startsWith(MCP_PROMPT)) {
        output = output.substring(MCP_PROMPT.length).trim();
    }
    return {
        output,
        exitCode,
        remaining: remaining.replace(new RegExp(`^${MCP_PROMPT}`, 'g'), ''),
    };
}
export function createHistoryEntry(command, stdout, exitCode, durationMs) {
    const truncatedOutput = stdout.length > MAX_HISTORY_OUTPUT_LENGTH
        ? stdout.slice(0, MAX_HISTORY_OUTPUT_LENGTH) + '\n... (truncated)'
        : stdout;
    return {
        timestamp: new Date().toISOString(),
        command,
        stdout: truncatedOutput,
        exitCode,
        durationMs,
    };
}
//# sourceMappingURL=shell-session.types.js.map