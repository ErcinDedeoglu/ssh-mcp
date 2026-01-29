import type { Client } from 'ssh2';
import {
  DEFAULT_SHELL_TIMEOUT_MS,
  DEFAULT_STALL_TIMEOUT_MS,
  MAX_OUTPUT_SIZE,
  MAX_HISTORY_ENTRIES,
  generateMarker,
  buildShellInitCommands,
  wrapCommand,
  parseMarkedOutput,
  createHistoryEntry,
  type ShellExecuteResult,
  type PendingCommand,
  type ShellSessionOptions,
  type ResolvedShellOptions,
  type ShellStream,
  type HistoryEntry,
} from './shell-session.types.js';
import { createShellStream, waitForInitialPrompt, waitForMcpPrompt } from './shell-session.io.js';
export type { ShellExecuteResult, HistoryEntry } from './shell-session.types.js';

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
  private history: HistoryEntry[] = [];
  private commandStartTime = 0;

  constructor(opts: ShellSessionOptions = {}) {
    this.options = {
      timeoutMs: opts.timeoutMs ?? DEFAULT_SHELL_TIMEOUT_MS,
      stallTimeoutMs: opts.stallTimeoutMs ?? DEFAULT_STALL_TIMEOUT_MS,
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

  async execute(command: string, timeoutMs?: number): Promise<ShellExecuteResult> {
    if (!this.isReady) {
      throw new Error('Shell session not initialized');
    }

    return new Promise((resolve, reject) => {
      const pending: PendingCommand = {
        command,
        marker: generateMarker(),
        timeoutMs: timeoutMs ?? this.options.timeoutMs,
        resolve,
        reject,
      };

      this.commandQueue.push(pending);
      if (this.commandQueue.length === 1) {
        this.processNextCommand();
      }
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
    this.history = [];
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

  private handleError(err: Error): void {
    if (this.currentCommand) {
      this.currentCommand.reject(err);
      this.currentCommand = null;
    }
    this.clearTimers();
    this.processNextCommand();
  }

  private processNextCommand(): void {
    if (this.currentCommand || this.commandQueue.length === 0 || !this.stream) return;

    this.currentCommand = this.commandQueue.shift()!;
    this.outputSize = 0;
    this.buffer = '';
    this.commandStartTime = Date.now();

    this.startTimeoutTimer();
    this.startStallTimer();

    const wrapped = wrapCommand(this.currentCommand.command, this.currentCommand.marker);
    this.stream.write(wrapped);
  }

  private completeCurrentCommand(output: string, exitCode: number): void {
    if (!this.currentCommand) return;

    this.clearTimers();
    this.recordHistory(this.currentCommand.command, output, exitCode);
    this.currentCommand.resolve({ stdout: output, stderr: '', exitCode });
    this.currentCommand = null;
    this.processNextCommand();
  }

  private recordHistory(command: string, stdout: string, exitCode: number): void {
    this.history.push(
      createHistoryEntry(command, stdout, exitCode, Date.now() - this.commandStartTime),
    );
    if (this.history.length > MAX_HISTORY_ENTRIES) this.history.shift();
  }

  getHistory(limit?: number): HistoryEntry[] {
    return limit === 0 ? [] : this.history.slice(-(limit ?? this.history.length));
  }

  private startTimeoutTimer(): void {
    if (!this.currentCommand) return;
    this.timeoutTimer = setTimeout(() => {
      this.handleError(new Error(`Command timed out after ${this.currentCommand?.timeoutMs}ms`));
    }, this.currentCommand.timeoutMs);
  }

  private startStallTimer(): void {
    const msg = `Command stalled - no output for ${this.options.stallTimeoutMs}ms`;
    this.stallTimer = setTimeout(
      () => this.handleError(new Error(msg)),
      this.options.stallTimeoutMs,
    );
  }

  private resetStallTimer(): void {
    if (!this.stallTimer) return;
    clearTimeout(this.stallTimer);
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
