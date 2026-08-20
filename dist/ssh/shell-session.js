import { DEFAULT_SHELL_TIMEOUT_MS, DEFAULT_STALL_TIMEOUT_MS, MAX_OUTPUT_SIZE, generateMarker, parseMarkedOutput, } from './shell-session.types.js';
import { createShellStream, waitForInitialPrompt, waitForMcpPrompt } from './shell-session.io.js';
import { ShellHistory } from './shell-session-history.js';
import { createTimerState, startTimeoutTimer, startStallTimer, resetStallTimer, clearTimers, } from './shell-session-timers.js';
import { createShellAdapter, detectShellType } from './shell-adapter.js';
import { writeCommand } from './shell-session-writer.js';
export class ShellSession {
    stream = null;
    ready = false;
    buffer = '';
    currentCommand = null;
    commandQueue = [];
    options;
    agentForward;
    adapter = null;
    timers = createTimerState();
    outputSize = 0;
    historyTracker = new ShellHistory();
    constructor(opts = {}) {
        this.options = {
            timeoutMs: opts.timeoutMs ?? DEFAULT_SHELL_TIMEOUT_MS,
            stallTimeoutMs: opts.stallTimeoutMs === undefined ? DEFAULT_STALL_TIMEOUT_MS : opts.stallTimeoutMs,
        };
        this.agentForward = opts.agentForward ?? false;
        const shell = opts.shellType ?? 'auto';
        if (shell !== 'auto')
            this.adapter = createShellAdapter(shell);
    }
    get isReady() {
        return this.ready && this.stream !== null;
    }
    get hasAgentForward() {
        return this.agentForward;
    }
    get shellType() {
        return this.adapter?.shellType ?? 'auto';
    }
    get hasRunningCommand() {
        return this.currentCommand !== null;
    }
    async initialize(client) {
        if (this.stream)
            return;
        this.stream = await createShellStream(client, { agentForward: this.agentForward });
        this.setupStreamHandlers();
        const promptText = await waitForInitialPrompt(this.stream, this.options.timeoutMs);
        if (!this.adapter) {
            this.adapter = createShellAdapter(detectShellType(promptText));
        }
        this.stream.write(this.adapter.buildInitCommands() + this.adapter.lineEnding);
        await waitForMcpPrompt(this.stream, this.options.timeoutMs);
        this.ready = true;
    }
    async execute(cmd, options) {
        if (!this.isReady)
            throw new Error('Shell session not initialized');
        const opts = typeof options === 'number' ? { timeoutMs: options } : (options ?? {});
        return new Promise((resolve, reject) => {
            const pending = {
                command: cmd,
                marker: generateMarker(),
                timeoutMs: opts.timeoutMs ?? this.options.timeoutMs,
                stallTimeoutMs: opts.stallTimeoutMs === undefined ? this.options.stallTimeoutMs : opts.stallTimeoutMs,
                stdin: opts.stdin,
                onOutput: opts.onOutput,
                resolve,
                reject,
            };
            this.commandQueue.push(pending);
            if (this.commandQueue.length === 1)
                this.processNextCommand();
        });
    }
    destroy() {
        clearTimers(this.timers);
        this.rejectPendingCommands(new Error('Shell session destroyed'));
        this.stream?.end((this.adapter?.exitCommand ?? 'exit') + (this.adapter?.lineEnding ?? '\n'));
        this.stream = null;
        this.ready = false;
        this.buffer = '';
        this.historyTracker.clear();
    }
    setupStreamHandlers() {
        if (!this.stream)
            return;
        this.stream.on('data', (d) => this.handleData(d.toString()));
        this.stream.on('close', () => this.handleClose());
        this.stream.on('error', (e) => this.handleError(e));
    }
    handleData(data) {
        this.outputSize += data.length;
        if (this.outputSize > MAX_OUTPUT_SIZE) {
            this.handleError(new Error(`Output exceeded ${MAX_OUTPUT_SIZE} bytes limit`));
            return;
        }
        this.buffer += data;
        this.resetStallTimer();
        if (!this.currentCommand)
            return;
        try {
            this.currentCommand.onOutput?.(data);
        }
        catch {
            // Callback errors ignored to avoid breaking command execution
        }
        const cmd = this.currentCommand;
        const parsed = parseMarkedOutput(this.buffer, cmd.marker, this.adapter, cmd.command);
        if (parsed) {
            this.completeCurrentCommand(parsed.output, parsed.exitCode);
            this.buffer = parsed.remaining;
        }
    }
    handleClose() {
        this.ready = false;
        this.stream = null;
        this.rejectPendingCommands(new Error('Shell session closed unexpectedly'));
    }
    handleError(err, sendInterrupt = true) {
        if (sendInterrupt)
            this.stream?.write('\x03');
        if (this.currentCommand) {
            this.currentCommand.reject(err);
            this.currentCommand = null;
        }
        clearTimers(this.timers);
        this.processNextCommand();
    }
    cancelCurrentCommand() {
        if (!this.currentCommand)
            return false;
        this.handleError(new Error('Command cancelled'), true);
        return true;
    }
    processNextCommand() {
        if (this.currentCommand || this.commandQueue.length === 0 || !this.stream)
            return;
        this.currentCommand = this.commandQueue.shift();
        this.outputSize = 0;
        this.buffer = '';
        this.historyTracker.startCommand();
        const cmd = this.currentCommand;
        startTimeoutTimer(this.timers, cmd.timeoutMs, () => this.handleError(new Error(`Command timed out after ${cmd.timeoutMs}ms`)));
        startStallTimer(this.timers, cmd.stallTimeoutMs, () => this.handleError(new Error(`Command stalled - no output for ${cmd.stallTimeoutMs}ms`)));
        writeCommand({
            stream: this.stream,
            adapter: this.adapter,
            command: cmd.command,
            marker: cmd.marker,
            stdin: cmd.stdin,
            isAlive: () => this.stream !== null && this.currentCommand !== null,
        });
    }
    resetStallTimer() {
        if (!this.currentCommand)
            return;
        const ms = this.currentCommand.stallTimeoutMs;
        resetStallTimer(this.timers, ms, () => this.handleError(new Error(`Command stalled - no output for ${ms}ms`)));
    }
    completeCurrentCommand(output, exitCode) {
        if (!this.currentCommand)
            return;
        clearTimers(this.timers);
        this.historyTracker.record(this.currentCommand.command, output, exitCode);
        this.currentCommand.resolve({ stdout: output, stderr: '', exitCode });
        this.currentCommand = null;
        this.processNextCommand();
    }
    getHistory(limit) {
        return this.historyTracker.get(limit);
    }
    rejectPendingCommands(error) {
        this.currentCommand?.reject(error);
        this.currentCommand = null;
        this.commandQueue.forEach((p) => p.reject(error));
        this.commandQueue = [];
        clearTimers(this.timers);
    }
}
//# sourceMappingURL=shell-session.js.map