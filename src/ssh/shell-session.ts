import type { Client } from 'ssh2';
import {
  DEFAULT_SHELL_TIMEOUT_MS,
  DEFAULT_STALL_TIMEOUT_MS,
  MAX_OUTPUT_SIZE,
  generateMarker,
  buildShellInitCommands,
  wrapCommand,
  parseMarkedOutput,
  type ShellExecuteResult,
  type PendingCommand,
  type ShellSessionOptions,
  type ResolvedShellOptions,
  type ShellStream,
  type HistoryEntry,
  type ExecuteOptions,
} from './shell-session.types.js';
import { createShellStream, waitForInitialPrompt, waitForMcpPrompt } from './shell-session.io.js';
import { ShellHistory } from './shell-session-history.js';
export type { ShellExecuteResult, HistoryEntry, ExecuteOptions } from './shell-session.types.js';

export class ShellSession {
  private stream: ShellStream | null = null;
  private ready = false;
  private buffer = '';
  private currentCommand: PendingCommand | null = null;
  private commandQueue: PendingCommand[] = [];
  private readonly options: ResolvedShellOptions;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private outputSize = 0;
  private readonly historyTracker = new ShellHistory();

  constructor(opts: ShellSessionOptions = {}) {
    this.options = {
      timeoutMs: opts.timeoutMs ?? DEFAULT_SHELL_TIMEOUT_MS,
      stallTimeoutMs:
        opts.stallTimeoutMs === undefined ? DEFAULT_STALL_TIMEOUT_MS : opts.stallTimeoutMs,
    };
  }
  get isReady(): boolean {
    return this.ready && this.stream !== null;
  }
  async initialize(client: Client): Promise<void> {
    if (this.stream) return;
    this.stream = await createShellStream(client);
    this.setupStreamHandlers();
    await waitForInitialPrompt(this.stream, this.options.timeoutMs);
    this.stream.write(buildShellInitCommands() + '\n');
    await waitForMcpPrompt(this.stream, this.options.timeoutMs);
    this.ready = true;
  }
  async execute(command: string, options?: ExecuteOptions | number): Promise<ShellExecuteResult> {
    if (!this.isReady) throw new Error('Shell session not initialized');
    const opts = typeof options === 'number' ? { timeoutMs: options } : (options ?? {});
    return new Promise((resolve, reject) => {
      const pending: PendingCommand = {
        command,
        marker: generateMarker(),
        timeoutMs: opts.timeoutMs ?? this.options.timeoutMs,
        stallTimeoutMs:
          opts.stallTimeoutMs === undefined ? this.options.stallTimeoutMs : opts.stallTimeoutMs,
        resolve,
        reject,
      };
      this.commandQueue.push(pending);
      if (this.commandQueue.length === 1) this.processNextCommand();
    });
  }
  destroy(): void {
    this.clearTimers();
    this.rejectPendingCommands(new Error('Shell session destroyed'));
    if (this.stream) {
      this.stream.end('exit\n');
      this.stream = null;
    }
    this.ready = false;
    this.buffer = '';
    this.historyTracker.clear();
  }

  private setupStreamHandlers(): void {
    if (!this.stream) return;
    this.stream.on('data', (d: Buffer) => this.handleData(d.toString()));
    this.stream.on('close', () => this.handleClose());
    this.stream.on('error', (e: Error) => this.handleError(e));
  }

  private handleData(data: string): void {
    this.outputSize += data.length;
    if (this.outputSize > MAX_OUTPUT_SIZE) {
      this.handleError(new Error(`Output exceeded ${MAX_OUTPUT_SIZE} bytes limit`));
      return;
    }
    this.buffer += data;
    this.resetStallTimer();
    if (!this.currentCommand) return;
    const parsed = parseMarkedOutput(this.buffer, this.currentCommand.marker);
    if (parsed) {
      this.completeCurrentCommand(parsed.output, parsed.exitCode);
      this.buffer = parsed.remaining;
    }
  }

  private handleClose(): void {
    this.ready = false;
    this.stream = null;
    this.rejectPendingCommands(new Error('Shell session closed unexpectedly'));
  }

  private handleError(err: Error, sendInterrupt = true): void {
    if (sendInterrupt) {
      this.sendInterrupt();
    }
    if (this.currentCommand) {
      this.currentCommand.reject(err);
      this.currentCommand = null;
    }
    this.clearTimers();
    this.processNextCommand();
  }

  private sendInterrupt(): void {
    if (!this.stream) return;
    this.stream.write('\x03');
  }

  cancelCurrentCommand(): boolean {
    if (!this.currentCommand) return false;
    this.handleError(new Error('Command cancelled'), true);
    return true;
  }

  get hasRunningCommand(): boolean {
    return this.currentCommand !== null;
  }
  private processNextCommand(): void {
    if (this.currentCommand || this.commandQueue.length === 0 || !this.stream) return;
    this.currentCommand = this.commandQueue.shift()!;
    this.outputSize = 0;
    this.buffer = '';
    this.historyTracker.startCommand();
    this.startTimeoutTimer();
    this.startStallTimer();
    const wrapped = wrapCommand(this.currentCommand.command, this.currentCommand.marker);
    this.stream.write(wrapped);
  }

  private completeCurrentCommand(output: string, exitCode: number): void {
    if (!this.currentCommand) return;
    this.clearTimers();
    this.historyTracker.record(this.currentCommand.command, output, exitCode);
    this.currentCommand.resolve({ stdout: output, stderr: '', exitCode });
    this.currentCommand = null;
    this.processNextCommand();
  }

  getHistory(limit?: number): HistoryEntry[] {
    return this.historyTracker.get(limit);
  }

  private startTimeoutTimer(): void {
    if (!this.currentCommand) return;
    this.timeoutTimer = setTimeout(() => {
      this.handleError(new Error(`Command timed out after ${this.currentCommand?.timeoutMs}ms`));
    }, this.currentCommand.timeoutMs);
  }

  private startStallTimer(): void {
    if (!this.currentCommand) return;
    const stallMs = this.currentCommand.stallTimeoutMs;
    if (stallMs === null || stallMs === 0) return;
    const msg = `Command stalled - no output for ${stallMs}ms`;
    this.stallTimer = setTimeout(() => this.handleError(new Error(msg)), stallMs);
  }

  private resetStallTimer(): void {
    if (!this.stallTimer) return;
    clearTimeout(this.stallTimer);
    this.stallTimer = null;
    this.startStallTimer();
  }

  private clearTimers(): void {
    if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.timeoutTimer = this.stallTimer = null;
  }

  private rejectPendingCommands(error: Error): void {
    if (this.currentCommand) {
      this.currentCommand.reject(error);
      this.currentCommand = null;
    }
    this.commandQueue.forEach((p) => p.reject(error));
    this.commandQueue = [];
    this.clearTimers();
  }
}
