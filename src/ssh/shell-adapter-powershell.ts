// PowerShell shell adapter for Windows SSH targets.
import type { ShellAdapter } from './shell-adapter.js';
import type { ConcreteShellType } from '../config/types.js';
import { MCP_PROMPT } from './shell-session.types.js';

export class PowerShellAdapter implements ShellAdapter {
  readonly shellType: ConcreteShellType = 'powershell';
  readonly eofChar = '\x1A';
  readonly lineEnding = '\r\n';
  readonly exitCommand = 'exit';

  buildInitCommands(): string {
    // Set a minimal prompt function, disable PSReadLine features that interfere,
    // and suppress progress/verbose output that can corrupt marker parsing.
    return [
      `function prompt { '${MCP_PROMPT}' }`,
      '$OutputEncoding = [System.Text.Encoding]::UTF8',
      'Set-StrictMode -Off',
      // Disable PSReadLine if present (interactive features break marker detection)
      'if (Get-Module PSReadLine -ErrorAction SilentlyContinue) { Remove-Module PSReadLine -ErrorAction SilentlyContinue }',
      '$ProgressPreference = "SilentlyContinue"',
    ].join('; ');
  }

  wrapCommand(command: string, marker: string): string {
    // PowerShell: use $LASTEXITCODE for native commands (null if no native cmd ran).
    // Fall back to $? (boolean) converted to 0/1 when $LASTEXITCODE is null.
    return (
      `${command}; ` +
      `$__MCP_EXIT = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } elseif ($?) { 0 } else { 1 }; ` +
      `Write-Host ""; Write-Host "${marker}"; Write-Host $__MCP_EXIT\r\n`
    );
  }

  isEchoedCommandLine(line: string, marker: string): boolean {
    const hasExitCapture = line.includes('$__MCP_EXIT') || line.includes('$LASTEXITCODE');
    const hasMarkerEcho = line.includes(`Write-Host "${marker}"`) || line.includes(`"${marker}"`);
    const hasWriteHost = line.includes('Write-Host ""') && hasExitCapture;
    return hasExitCapture || hasMarkerEcho || hasWriteHost;
  }
}
