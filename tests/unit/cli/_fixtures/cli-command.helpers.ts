/**
 * Shared helpers for CLI command handler unit tests.
 * Mocks actions + context, captures console output, runs commander programs.
 */
import { vi } from 'vitest';
import { Command } from 'commander';
import type { ActionOutcome } from '../../../../src/actions/types.js';

export interface ConsoleCapture {
  stdout: string;
  stderr: string;
  logs: string[];
  errors: string[];
  restore: () => void;
}

export function captureConsole(): ConsoleCapture {
  const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  return {
    get stdout() {
      return stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
    },
    get stderr() {
      return stderrSpy.mock.calls.map((c) => String(c[0])).join('');
    },
    get logs() {
      return logSpy.mock.calls.map((c) => c.join(' '));
    },
    get errors() {
      return errorSpy.mock.calls.map((c) => c.join(' '));
    },
    restore: () => {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
      logSpy.mockRestore();
      errorSpy.mockRestore();
    },
  };
}

/** Runs a register function against a fresh program (mirrors main.ts wiring). */
export async function runProgram(
  register: (program: Command) => void,
  args: string[],
): Promise<void> {
  const program = new Command();
  program.name('ssh-mcp').option('--json', 'machine-readable JSON output');
  register(program);
  await program.parseAsync(args, { from: 'user' });
}

export function ok<T extends object>(data: T): ActionOutcome<T> {
  return { ok: true, data };
}

export function fail(message: string, json?: Record<string, unknown>): ActionOutcome<never> {
  return { ok: false, message, json };
}

/** Resets exitCode after capturing it for one program run. */
export async function runCapturingExit(
  register: (program: Command) => void,
  args: string[],
): Promise<number | undefined> {
  const previous = process.exitCode;
  process.exitCode = undefined;
  try {
    await runProgram(register, args);
    return process.exitCode;
  } finally {
    process.exitCode = previous;
  }
}
