import * as fs from 'node:fs';
import * as path from 'node:path';
import { getConfigPath } from '../config/path.js';

/**
 * Tracks CLI-owned foreground forwards (local + remote) so other
 * invocations can list them and signal their owner processes.
 * Entries die with their owner process (pid liveness check on read).
 */
export interface ForwardEntry {
  kind: 'local' | 'remote';
  serverId: string;
  localHost?: string;
  localPort?: number;
  remoteHost?: string;
  remotePort?: number;
  pid: number;
  createdAt: number;
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export class ForwardStore {
  private readonly file: string;

  constructor(file?: string) {
    this.file = file ?? path.join(path.dirname(getConfigPath()), 'forwards.json');
  }

  add(entry: ForwardEntry): void {
    const entries = this.read();
    entries.push(entry);
    this.write(entries);
  }

  removeByPid(pid: number): void {
    this.write(this.read().filter((e) => e.pid !== pid));
  }

  /** Live entries only; entries of dead processes are pruned from disk. */
  list(): ForwardEntry[] {
    const entries = this.read();
    const live = entries.filter((e) => isPidAlive(e.pid));
    if (live.length !== entries.length) {
      this.write(live);
    }
    return live;
  }

  private read(): ForwardEntry[] {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf-8')) as ForwardEntry[];
    } catch {
      return [];
    }
  }

  private write(entries: ForwardEntry[]): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(entries, null, 2));
    fs.renameSync(tmp, this.file);
  }
}
