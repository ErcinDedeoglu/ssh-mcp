import { ShellSession } from './shell-session.js';

export class ShellRegistry {
  private readonly shells = new Map<string, ShellSession>();

  get(serverId: string): ShellSession | undefined {
    return this.shells.get(serverId);
  }

  set(serverId: string, shell: ShellSession): void {
    this.shells.set(serverId, shell);
  }

  has(serverId: string): boolean {
    return this.shells.has(serverId);
  }

  remove(serverId: string): boolean {
    const shell = this.shells.get(serverId);
    if (!shell) return false;
    shell.destroy();
    this.shells.delete(serverId);
    return true;
  }

  clear(): void {
    for (const shell of this.shells.values()) {
      shell.destroy();
    }
    this.shells.clear();
  }

  get size(): number {
    return this.shells.size;
  }
}
